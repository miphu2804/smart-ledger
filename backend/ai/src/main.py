import logging
import sys
from contextlib import asynccontextmanager

import pydantic_ai
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic_ai import Embedder

from src.agent.errors import ConversationNotFoundError, GuardrailError
from src.agent.guardrails import GuardrailLimits
from src.agent.repository import AgentConversationRepository
from src.agent.router import router as agent_router
from src.agent.service import AgentService
from src.app_config import app_config
from src.calculation.service import CalculationLimits, CalculationService
from src.infra.postgre_db_client import PostgreDBClient
from src.infra.redis_db_client import RedisDBClient
from src.log_formatter import LevelColorFormatter
from src.memory.repository import EMBEDDING_DIMENSIONS, AgentMemoryRepository
from src.memory.service import AgentMemoryService
from src.memory.workers_ai_embedding import WorkersAIEmbeddingModel
from src.observability import configure_tracing
from src.providers.llm_factory import LLMFactory
from src.restock.service import RestockService
from src.sandbox.wrapper import Sandbox, SandboxLimits
from src.security import require_internal_token
from src.sql.repository import ShopDataRepository

# Log viewers mark every stderr line as an error, so records below ERROR go to stdout
# and only ERROR and above go to stderr.
stdout_handler = logging.StreamHandler(sys.stdout)
stdout_handler.addFilter(lambda record: record.levelno < logging.ERROR)
stderr_handler = logging.StreamHandler(sys.stderr)
stderr_handler.setLevel(logging.ERROR)
for handler in (stdout_handler, stderr_handler):
    handler.setFormatter(LevelColorFormatter())
logging.basicConfig(
    level=getattr(logging, app_config.LOG_LEVEL.upper(), logging.INFO),
    handlers=[stdout_handler, stderr_handler],
)
logger = logging.getLogger(__name__)
# stdout is the log contract, so Pydantic AI's one-off observability promo stays out.
pydantic_ai.BANNER_ENABLED = False
# Before any agent runs, so every run is traced when a Logfire token is set.
configure_tracing(app_config)


def build_shop_data(reader: PostgreDBClient) -> ShopDataRepository | None:
    url = app_config.AI_SQL_READER_URL
    if url is None or not url.strip():
        logger.info("sql reader unconfigured; shop-data tool off")
        return None
    return ShopDataRepository(
        reader,
        timeout_ms=app_config.SQL_TIMEOUT_MS,
        row_limit=app_config.SQL_ROW_LIMIT,
    )


def build_calculation() -> CalculationService | None:
    if not app_config.CALC_ENABLED:
        return None
    return CalculationService(
        CalculationLimits(
            max_operations=app_config.CALC_MAX_OPERATIONS,
            max_operand=app_config.CALC_MAX_OPERAND_VALUE,
        )
    )


# Tools the sandbox folds in, by name. A folded tool leaves the model-facing list, so
# every call to it starts Monty. The data tools are read-only (one SELECT on the shop's
# own views, a restock read), so folding them sent every safe data question through the
# sandbox; they stay native and only model-written code runs in Monty.
SANDBOX_TOOLS: tuple[str, ...] = ()

# Pure in-process tools that stay callable past the per-turn tool-call guardrail:
# the calculation prompt sends every sum through calculate, so sharing the data
# tools' budget would cut off ordinary answers. Nothing here does I/O.
TOOL_CALL_EXEMPT = frozenset({"calculate"})


def build_sandbox() -> Sandbox | None:
    if not app_config.SANDBOX_ENABLED:
        return None
    try:
        return Sandbox(
            SandboxLimits(
                tools=SANDBOX_TOOLS,
                max_memory_bytes=app_config.SANDBOX_MAX_MEMORY_BYTES,
                max_duration_secs=app_config.SANDBOX_MAX_DURATION_SECS,
                # Kept at the per-turn tool-call guardrail: nested data calls do not
                # count against ToolCallLimit, so a larger budget would multiply the
                # DB load the guardrail bounds. Raise it together with the guardrail.
                max_tool_calls=app_config.SANDBOX_MAX_TOOL_CALLS,
                max_suspensions=app_config.SANDBOX_MAX_SUSPENSIONS,
            )
        )
    except RuntimeError as error:
        # A missing codemode extra turns the option off instead of failing the service.
        logger.error("%s; sandbox off", error)
        return None


def build_memory_service(
    chat_model, postgres: PostgreDBClient
) -> AgentMemoryService | None:
    if not app_config.AGENT_MEMORY_ENABLED:
        return None
    if chat_model is None or postgres.sessions is None:
        logger.warning("memory enabled without a chat model or postgres; memory off")
        return None
    embedder = build_memory_embedder()
    if embedder is None:
        return None
    return AgentMemoryService(
        chat_model,
        AgentMemoryRepository(postgres),
        embedder,
        allowed_types=frozenset(
            item.strip()
            for item in app_config.AGENT_MEMORY_TYPES.split(",")
            if item.strip()
        ),
    )


def build_memory_embedder() -> Embedder | None:
    provider = app_config.AGENT_MEMORY_EMBEDDING_PROVIDER
    model = app_config.AGENT_MEMORY_EMBEDDING_MODEL
    if provider == "cloudflare":
        account_id = app_config.CLOUDFLARE_ACCOUNT_ID
        api_token = app_config.CLOUDFLARE_API_TOKEN
        if not account_id or not api_token:
            logger.error("cloudflare embeddings need an account id and token")
            return None
        return Embedder(
            WorkersAIEmbeddingModel(
                model,
                account_id=account_id,
                api_token=api_token,
                dimensions=EMBEDDING_DIMENSIONS,
            )
        )
    if provider != "sentence-transformers":
        logger.error("unknown memory embedding provider %r; memory off", provider)
        return None
    try:
        # Resolved now, so a missing `memory` dependency group shows at startup rather
        # than on the first chat; the weights still load on first use.
        return Embedder(
            f"sentence-transformers:{model}",
            settings={
                "sentence_transformers_normalize_embeddings": True,
                "dimensions": EMBEDDING_DIMENSIONS,
            },
            defer_model_check=False,
        )
    except ImportError:
        logger.error("memory enabled but the memory dependency group is missing")
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    postgres = PostgreDBClient(
        app_config.POSTGRES_URL, pool_size=app_config.POSTGRES_POOL_MAX_SIZE
    )
    # Model-written SQL runs as the read-only login, so it gets its own pool.
    reader = PostgreDBClient(
        app_config.AI_SQL_READER_URL, pool_size=app_config.SQL_POOL_MAX_SIZE
    )
    redis = RedisDBClient(app_config.REDIS_URL)
    redis.connect()
    app.state.redis = redis
    chat_model = LLMFactory(app_config).create_model("chat")
    conversations = AgentConversationRepository(postgres)
    app.state.conversations = conversations
    shop_data = build_shop_data(reader)
    memory = build_memory_service(chat_model, postgres)
    app.state.memory = memory
    app.state.agent = AgentService(
        chat_model,
        conversations,
        guardrail_limits=GuardrailLimits(
            max_input_chars=app_config.AGENT_MAX_INPUT_CHARS,
            model_call_limit=app_config.AGENT_MODEL_CALL_LIMIT,
            tool_call_limit=app_config.AGENT_TOOL_CALL_LIMIT,
            tool_call_exempt=(
                TOOL_CALL_EXEMPT if app_config.CALC_ENABLED else frozenset()
            ),
            turn_token_limit=app_config.AGENT_TURN_TOKEN_LIMIT,
            turn_timeout_seconds=app_config.AGENT_TURN_TIMEOUT_SECONDS,
        ),
        shop_data=shop_data,
        restock=RestockService(shop_data) if shop_data else None,
        memory=memory,
        calculation=build_calculation(),
        sandbox=build_sandbox(),
        history_turns=app_config.AGENT_HISTORY_TURNS,
    )
    try:
        yield
    finally:
        postgres.close()
        reader.close()
        redis.close()


# The handlers do no I/O, so they are async and answer without a worker thread.
async def conversation_not_found(
    request: Request, exc: ConversationNotFoundError
) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "conversation_not_found"})


async def guardrail_blocked(request: Request, exc: GuardrailError) -> JSONResponse:
    # The code is the whole message: the app maps it to the owner's language.
    return JSONResponse(status_code=422, content={"detail": exc.code})


async def ai_unavailable(request: Request, exc: Exception) -> JSONResponse:
    # The client only sees ai_unavailable, so the cause has to reach the server log.
    logger.warning("internal request failed", exc_info=exc)
    return JSONResponse(status_code=503, content={"detail": "ai_unavailable"})


# Each flow's router is mounted here and inherits the internal-token check, so a new
# flow cannot reach Core's callers without it.
internal_router = APIRouter(
    prefix="/internal/v1", dependencies=[Depends(require_internal_token)]
)
internal_router.include_router(agent_router)

app = FastAPI(title=app_config.APP_TITLE, version="0.1.0", lifespan=lifespan)
app.include_router(internal_router)
app.add_exception_handler(ConversationNotFoundError, conversation_not_found)
app.add_exception_handler(GuardrailError, guardrail_blocked)
app.add_exception_handler(Exception, ai_unavailable)
# Request rate, status class and latency per route for Grafana (deploy/monitoring/),
# timed to the last streamed byte. /metrics skips the internal token: AI publishes no
# port, so only containers on its project network reach it. Health checks every 10 s
# would outnumber chat turns, so they are left out. The default buckets stop at 1 s,
# while a chat turn with tool calls takes tens of seconds.
Instrumentator(excluded_handlers=["/health", "/metrics"]).instrument(
    app,
    latency_lowr_buckets=(0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60, 120),
).expose(app, include_in_schema=False)


@app.get("/health", tags=["system"])
async def health() -> dict:
    # Async so it answers on the event loop: chat turns can hold every worker thread
    # for tens of seconds, and a queued health check would time out.
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=app_config.SERVER_HOST,
        port=app_config.SERVER_PORT,
        # Uvicorn's own config writes its INFO lines to stderr; without it, its
        # loggers propagate to the root handlers above.
        log_config=None,
    )
