from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ModelAlias(BaseModel):
    """The API a model speaks and the model id sent to the gateway."""

    protocol: str
    model: str


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
    # most connections the shop-data pool opens; it shares the Supabase client limit
    # with the chat-history pool and Core
    SQL_POOL_MAX_SIZE: int = Field(default=2, gt=0)
    SQL_TIMEOUT_MS: int = Field(default=3000, gt=0)
    SQL_ROW_LIMIT: int = Field(default=100, gt=0)

    # redis
    REDIS_URL: str | None = None

    # qdrant, litellm and langfuse: kept for planned integrations, no feature reads
    # them yet
    QDRANT_URL: str | None = None
    LITELLM_URL: str | None = None
    LANGFUSE_PUBLIC_KEY: str | None = None
    LANGFUSE_SECRET_KEY: str | None = None
    LANGFUSE_HOST: str | None = None

    # logfire: Pydantic AI traces without message content (src/observability.py);
    # an unset token sends nothing
    LOGFIRE_TOKEN: str | None = None
    # staging or production, so one Logfire project can hold both
    LOGFIRE_ENVIRONMENT: str | None = None

    # models the application asks for by alias, as a JSON object; protocol is the API
    # the model speaks: openai_responses, openai_chat or anthropic_messages
    MODEL_ALIASES: dict[str, ModelAlias] = {
        "chat": ModelAlias(protocol="anthropic_messages", model="claude-haiku-5-5")
    }
    # models tried in order when the previous one fails, as a JSON list of
    # "protocol:model", e.g. ["openai_chat:deepseek-v4.1-flash"]; through Bifrost,
    # fallbacks belong in its routing rules instead
    MODEL_FALLBACKS: list[str] = []
    MODEL_TIMEOUT_SECONDS: float = 20.0
    # reasoning effort for the chat model: none, low, medium or high
    MODEL_REASONING_EFFORT: str = "medium"

    # agent guardrails (src/agent/guardrails/), per chat turn
    AGENT_MAX_INPUT_CHARS: int = Field(default=2000, gt=0)
    AGENT_MODEL_CALL_LIMIT: int = Field(default=4, gt=0)
    AGENT_TOOL_CALL_LIMIT: int = Field(default=3, gt=0)
    # input plus output tokens across every model request of one turn
    AGENT_TURN_TOKEN_LIMIT: int = Field(default=200_000, gt=0)
    # below Core's 40 s read timeout for AI calls, so a turn Core gave up on is not
    # stored
    AGENT_TURN_TIMEOUT_SECONDS: float = Field(default=35.0, gt=0)

    # most recent owner/assistant exchanges sent to the model with each turn; 30 at
    # the 2000-char input cap keeps one request well inside a 100k-token window
    AGENT_HISTORY_TURNS: int = Field(default=30, gt=0)

    # arithmetic capability (src/calculation/), per chat turn. The calculate tool
    # runs the closed op set in-process; defaults are provisional, awaiting PO sign-off.
    CALC_ENABLED: bool = True
    # steps per calculate call; a longer chain is refused as TOO_MANY_OPERATIONS
    CALC_MAX_OPERATIONS: int = Field(default=20, gt=0)
    # |value| bound for every operand and result; 1e15 stays inside float's exact
    # integer range (2**53 ~ 9e15), so VND totals keep full precision
    CALC_MAX_OPERAND_VALUE: float = Field(default=1e15, gt=0)

    # Code Mode sandbox (src/sandbox/wrapper.py): an agent option on its own, not
    # tied to the calculation service. The model reaches it only by writing a
    # run_code snippet, so a turn without one never starts a sandbox. The memory
    # value is the Monty heap limit (a MemoryError becomes a model retry), not a
    # process RAM limit; the OS or container limit stays the last bound.
    SANDBOX_ENABLED: bool = True
    SANDBOX_MAX_MEMORY_BYTES: int = Field(default=64 * 1024 * 1024, gt=0)
    SANDBOX_MAX_DURATION_SECS: float = Field(default=5.0, gt=0)
    # Nested data calls per run_code snippet, kept at the per-turn tool-call
    # guardrail: nested calls do not count against AGENT_TOOL_CALL_LIMIT, so a
    # larger budget would multiply the DB load the guardrail bounds. Raise it
    # together with the guardrail if a snippet legitimately needs more calls.
    SANDBOX_MAX_TOOL_CALLS: int = Field(default=3, gt=0)
    SANDBOX_MAX_SUSPENSIONS: int = Field(default=1000, gt=0)

    # long-term memory across conversations (ADR-0002); off until the PO approves it.
    # Needs the `memory` dependency group and the agent_memories migration, whose
    # vector size must match the embedding model.
    AGENT_MEMORY_ENABLED: bool = False
    # comma-separated memory types the model may write on its own; the rest stay
    # unwritten until the PO approves them
    AGENT_MEMORY_TYPES: str = "preference,procedural,semantic"
    # where memory embeddings come from: sentence-transformers runs the model in this
    # process (the `memory` dependency group); cloudflare calls Workers AI and needs
    # the CLOUDFLARE_* settings below
    AGENT_MEMORY_EMBEDDING_PROVIDER: str = "sentence-transformers"
    # a Hugging Face model for sentence-transformers, a Workers AI model such as
    # @cf/google/embeddinggemma-300m for cloudflare
    AGENT_MEMORY_EMBEDDING_MODEL: str = (
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    )

    # cloudflare workers ai: account that runs the embeddings, and an API token with
    # the Workers AI Read permission
    CLOUDFLARE_ACCOUNT_ID: str | None = None
    CLOUDFLARE_API_TOKEN: str | None = None

    # model gateway: OpenAI, an OpenAI-compatible gateway such as OpenCode Go
    # (https://opencode.ai/inference/go/v1), or Bifrost on the VPS. The key is the
    # gateway credential; through Bifrost it is the virtual key, because Bifrost
    # holds the provider key.
    OPENAI_API_KEY: str | None = None
    # base of the OpenAI dialect, which appends /chat/completions or /responses
    OPENAI_BASE_URL: str | None = None
    # base of the Anthropic dialect, which appends /v1/messages; Bifrost serves it at
    # /anthropic. Unset drops the /v1 suffix from OPENAI_BASE_URL instead, which is
    # what a gateway with one prefix for both APIs (OpenCode Go) needs.
    ANTHROPIC_BASE_URL: str | None = None


app_config = AppConfig()
