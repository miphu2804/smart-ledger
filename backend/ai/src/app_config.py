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
    # most connections the chat-history pool opens. Supabase's session pooler allows
    # 15 clients in all and Core's Hikari pool takes up to 10 by default, so keep this
    # small.
    POSTGRES_POOL_MAX_SIZE: int = Field(default=2, gt=0)

    # read-only login granted ai_sql_reader (AI baseline migration); unset disables the
    # agent's shop-data tool while chat keeps working
    AI_SQL_READER_URL: str | None = None
    SQL_TIMEOUT_MS: int = Field(default=3000, gt=0)
    SQL_ROW_LIMIT: int = Field(default=100, gt=0)

    # redis
    REDIS_URL: str | None = None

    # model provider
    MODEL_PROVIDER: str = "openai"
    MODEL_NAME: str = "gpt-5.6-luna"
    MODEL_TIMEOUT_SECONDS: float = 20.0
    # reasoning effort for the chat model: none, low, medium or high
    MODEL_REASONING_EFFORT: str = "high"

    # agent guardrails (src/agent/guardrails/), per chat turn
    AGENT_MAX_INPUT_CHARS: int = Field(default=2000, gt=0)
    AGENT_MODEL_CALL_LIMIT: int = Field(default=4, gt=0)
    AGENT_TOOL_CALL_LIMIT: int = Field(default=3, gt=0)
    # input plus output tokens across every model request of one turn
    AGENT_TURN_TOKEN_LIMIT: int = Field(default=200_000, gt=0)
    # below Core's 40 s read timeout for AI calls, so a turn Core gave up on is not
    # stored
    AGENT_TURN_TIMEOUT_SECONDS: float = Field(default=35.0, gt=0)

    # most recent owner/assistant exchanges sent to the model with each turn
    AGENT_HISTORY_TURNS: int = Field(default=100, gt=0)

    # openai
    OPENAI_API_KEY: str | None = None
    OPENAI_BASE_URL: str | None = None


app_config = AppConfig()
