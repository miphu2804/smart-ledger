from pydantic import Field
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

    # service credential shared with Core; unset rejects every /internal/v1 route
    INTERNAL_API_TOKEN: str | None = None

    # postgres
    POSTGRES_URL: str | None = None

    # read-only login granted ai_sql_reader (AI baseline migration); unset disables the
    # agent's shop-data tool while chat keeps working
    AI_SQL_READER_URL: str | None = None
    SQL_TIMEOUT_MS: int = Field(default=3000, gt=0)
    SQL_ROW_LIMIT: int = Field(default=100, gt=0)

    # redis
    REDIS_URL: str | None = None

    # qdrant
    QDRANT_URL: str | None = None

    # litellm
    LITELLM_URL: str | None = None

    # model provider
    MODEL_PROVIDER: str = "openai"
    MODEL_NAME: str = "gpt-5.6-luna"
    MODEL_TIMEOUT_SECONDS: float = 20.0
    # reasoning effort for the chat and summary models: none, low, medium or high
    MODEL_REASONING_EFFORT: str = "high"

    # background summarization model; unset falls back to MODEL_NAME
    SUMMARY_MODEL_NAME: str | None = None

    # agent guardrails (src/agent/guardrails.py), per chat turn
    AGENT_MAX_INPUT_CHARS: int = Field(default=2000, gt=0)
    AGENT_MODEL_CALL_LIMIT: int = Field(default=4, gt=0)
    AGENT_TOOL_CALL_LIMIT: int = Field(default=3, gt=0)

    # openai
    OPENAI_API_KEY: str | None = None
    OPENAI_BASE_URL: str | None = None

    # langfuse
    LANGFUSE_PUBLIC_KEY: str | None = None
    LANGFUSE_SECRET_KEY: str | None = None
    LANGFUSE_HOST: str | None = None


app_config = AppConfig()
