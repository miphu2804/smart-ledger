import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.agent.guardrails import GuardrailLimits
from src.agent.repository import (
    AgentConversationRepository,
    ConversationNotFoundError,
)
from src.agent.router import agent_failure_handler, conversation_not_found_handler
from src.agent.router import router as agent_router
from src.agent.service import AgentService
from src.agent.sql_executor import ReadOnlySqlExecutor
from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient
from src.infra.redis_db_client import RedisDBClient
from src.providers.factory import build_chat_model

logging.basicConfig(
    level=getattr(logging, app_config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)


def build_sql_executor() -> ReadOnlySqlExecutor | None:
    url = app_config.AI_SQL_READER_URL
    if url is None or not url.strip():
        logging.getLogger(__name__).info("sql reader unconfigured; shop-data tool off")
        return None
    return ReadOnlySqlExecutor(
        url,
        timeout_ms=app_config.SQL_TIMEOUT_MS,
        row_limit=app_config.SQL_ROW_LIMIT,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    postgres = PostgreDBClient(app_config.POSTGRES_URL)
    redis = RedisDBClient(app_config.REDIS_URL)
    postgres.connect()
    redis.connect()
    app.state.postgres = postgres
    app.state.redis = redis
    chat_model = build_chat_model(app_config)
    conversations = AgentConversationRepository(postgres)
    app.state.conversations = conversations
    app.state.agent = AgentService(
        chat_model,
        conversations,
        guardrail_limits=GuardrailLimits(
            max_input_chars=app_config.AGENT_MAX_INPUT_CHARS,
            model_call_limit=app_config.AGENT_MODEL_CALL_LIMIT,
            tool_call_limit=app_config.AGENT_TOOL_CALL_LIMIT,
        ),
        sql_executor=build_sql_executor(),
    )
    yield
    postgres.close()
    redis.close()


app = FastAPI(title=app_config.APP_TITLE, version="0.1.0", lifespan=lifespan)
app.include_router(agent_router)
app.add_exception_handler(ConversationNotFoundError, conversation_not_found_handler)
app.add_exception_handler(Exception, agent_failure_handler)


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=app_config.SERVER_HOST,
        port=app_config.SERVER_PORT,
    )
