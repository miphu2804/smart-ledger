import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient
from src.infra.redis_db_client import RedisDBClient

logging.basicConfig(
    level=getattr(logging, app_config.log.level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Attach data-store clients at startup and close them at shutdown."""
    postgres = PostgreDBClient(app_config.postgres.url)
    redis = RedisDBClient(app_config.redis.url)
    postgres.connect()
    redis.connect()
    app.state.postgres = postgres
    app.state.redis = redis
    yield
    postgres.close()
    redis.close()


app = FastAPI(title=app_config.app_title, version="0.1.0", lifespan=lifespan)


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=app_config.server.host,
        port=app_config.server.port,
    )
