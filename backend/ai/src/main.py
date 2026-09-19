import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.agent.routers import router as agent_router
from src.agent.service import AgentService
from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient
from src.infra.redis_db_client import RedisDBClient
from src.providers.factory import build_chat_model

logging.basicConfig(
    level=getattr(logging, app_config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
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
    app.state.agent = AgentService(chat_model) if chat_model is not None else None
    yield
    postgres.close()
    redis.close()


app = FastAPI(title=app_config.APP_TITLE, version="0.1.0", lifespan=lifespan)
app.include_router(agent_router)


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
