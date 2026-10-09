import logging
from contextlib import asynccontextmanager

import pydantic_ai
from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from src.agent.guardrails import GuardrailError, GuardrailLimits
from src.agent.repository import AgentConversationRepository, ConversationNotFoundError
from src.agent.router import router as agent_router
from src.agent.service import AgentService
from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient
from src.infra.redis_db_client import RedisDBClient
from src.providers.factory import build_chat_model
from src.restock.service import RestockService
from src.security import require_internal_token
from src.sql.executor import ReadOnlySqlExecutor

logging.basicConfig(
    level=getattr(logging, app_config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
# stdout is the log contract, so Pydantic AI's one-off observability promo stays out.
pydantic_ai.BANNER_ENABLED = False


def build_sql_executor() -> ReadOnlySqlExecutor | None:
    url = app_config.AI_SQL_READER_URL
    if url is None or not url.strip():
        logger.info("sql reader unconfigured; shop-data tool off")
        return None
    return ReadOnlySqlExecutor(
        url,
        timeout_ms=app_config.SQL_TIMEOUT_MS,
        row_limit=app_config.SQL_ROW_LIMIT,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    postgres = PostgreDBClient(
        app_config.POSTGRES_URL, pool_size=app_config.POSTGRES_POOL_MAX_SIZE
    )
    redis = RedisDBClient(app_config.REDIS_URL)
    redis.connect()
    app.state.redis = redis
    chat_model = build_chat_model(app_config)
    conversations = AgentConversationRepository(postgres)
    app.state.conversations = conversations
    executor = build_sql_executor()
    app.state.agent = AgentService(
        chat_model,
        conversations,
        guardrail_limits=GuardrailLimits(
            max_input_chars=app_config.AGENT_MAX_INPUT_CHARS,
            model_call_limit=app_config.AGENT_MODEL_CALL_LIMIT,
            tool_call_limit=app_config.AGENT_TOOL_CALL_LIMIT,
            turn_token_limit=app_config.AGENT_TURN_TOKEN_LIMIT,
            turn_timeout_seconds=app_config.AGENT_TURN_TIMEOUT_SECONDS,
        ),
        sql_executor=executor,
        restock=RestockService(executor) if executor else None,
        history_turns=app_config.AGENT_HISTORY_TURNS,
    )
    try:
        yield
    finally:
        postgres.close()
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
    )
