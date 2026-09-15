import logging

from fastapi import FastAPI

from src.app_config import app_config

logging.basicConfig(
    level=getattr(logging, app_config.log.level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)

app = FastAPI(title=app_config.app_title, version="0.1.0")


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
