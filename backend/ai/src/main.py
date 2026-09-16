import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from src.app_config import app_config
from src.data_clients import check_target, ping_postgres, ping_redis

logging.basicConfig(
    level=getattr(logging, app_config.log.level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)

app = FastAPI(title=app_config.app_title, version="0.1.0")


@app.get("/health", tags=["system"])
def health() -> dict:
    return {"status": "ok"}


@app.get("/ready", tags=["system"])
def ready() -> JSONResponse:
    postgres = check_target("postgres", app_config.postgres.url, ping_postgres)
    redis_status = check_target("redis", app_config.redis.url, ping_redis)
    payload = {"postgres": postgres, "redis": redis_status}
    if postgres == "ok" and redis_status == "ok":
        return JSONResponse({"status": "ok", **payload}, status_code=200)
    return JSONResponse({"status": "not_ready", **payload}, status_code=503)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=app_config.server.host,
        port=app_config.server.port,
    )
