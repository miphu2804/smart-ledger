from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    APP_TITLE: str = "SmartLedger AI"
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8001
    LOG_LEVEL: str = "INFO"

    # postgres
    POSTGRES_URL: str | None = None

    # redis
    REDIS_URL: str | None = None

    # qdrant
    QDRANT_URL: str | None = None

    # litellm
    LITELLM_URL: str | None = None

    # model provider
    MODEL_PROVIDER: str = "openai"
    MODEL_NAME: str = "gpt-4o-mini"
    MODEL_TIMEOUT_SECONDS: float = 20.0

    # openai
    OPENAI_API_KEY: str | None = None
    OPENAI_BASE_URL: str | None = None

    # langfuse
    LANGFUSE_PUBLIC_KEY: str | None = None
    LANGFUSE_SECRET_KEY: str | None = None
    LANGFUSE_HOST: str | None = None


app_config = AppConfig()
