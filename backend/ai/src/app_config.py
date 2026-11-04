from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ModelAlias(BaseModel):
    """The API a model speaks, the model id sent to the gateway and its effort."""

    protocol: str
    model: str
    # reasoning effort of this model; unset uses MODEL_REASONING_EFFORT. The accepted
    # values differ by model: OpenAI takes none to max, Mercury takes instant to high.
    effort: str | None = None


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

    # qdrant and litellm: kept for planned integrations, no feature reads them yet
    QDRANT_URL: str | None = None
    LITELLM_URL: str | None = None

    # honeyhive: Pydantic AI traces with the redacted message content
    # (src/observability.py); an unset key or a source other than production sends
    # nothing
    HH_API_KEY: str | None = None
    # Data plane URL; unset uses HoneyHive's multi-tenant default
    HH_API_URL: str | None = None
    # Traces go out only when this is production, so staging and local leave the free
    # plan's monthly events to production; the value also tags the sessions
    HH_SOURCE: str = "local"
    # Share of chat turns traced, from 0 to 1; the free plan caps events per month and
    # a turn sends about a dozen
    HH_SAMPLE_RATE: float = Field(default=1.0, ge=0, le=1)
    # Read only by sync-dashboards.sh through the HoneyHive CLI, not by the service:
    # fine-grained keys for charts (data plane) and alerts (control plane), and the
    # control plane URL; HH_API_URL above is the data plane URL for both
    HH_DATA_PLANE_API_KEY: str | None = None
    HH_CONTROL_PLANE_API_KEY: str | None = None
    HH_CONTROL_PLANE_URL: str | None = None
    # Commit the image was built from, set by the deploy workflow; tags each session
    GIT_SHA: str | None = None

    # models the application asks for by alias, as a JSON object; protocol is the API
    # the model speaks: openai_responses or openai_chat
    MODEL_ALIASES: dict[str, ModelAlias] = {
        "chat": ModelAlias(
            protocol="openai_responses", model="gpt-6-luna", effort="high"
        )
    }
    # models tried in order when the previous one fails, as a JSON list of
    # "protocol:model", e.g. ["openai_chat:deepseek-v4.1-flash"]; through Bifrost,
    # fallbacks belong in its routing rules instead
    MODEL_FALLBACKS: list[str] = []
    MODEL_TIMEOUT_SECONDS: float = 20.0
    # reasoning effort of an alias that sets no `effort` of its own
    MODEL_REASONING_EFFORT: str = "medium"
    # per-turn model tiers (src/llm_router/): a decision model rates
    # each request SIMPLE, MEDIUM or COMPLEX through Bifrost and the turn runs on the
    # chat-simple, chat-medium or chat-complex alias of MODEL_ALIASES. Off, or with
    # any of those aliases or the URL missing, every turn runs on `chat`.
    MODEL_TIERING_ENABLED: bool = False
    # Bifrost's unified decisions route, e.g. http://bifrost:8080/v1/decisions
    TIER_CLASSIFIER_URL: str | None = None
    TIER_CLASSIFIER_MODEL: str = "typesafe/jev-latest"
    # the classification waits on the request path; past this the turn runs COMPLEX
    TIER_CLASSIFIER_TIMEOUT_SECONDS: float = Field(default=1.5, gt=0)

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

    # model gateway: OpenAI, or Bifrost on the VPS. The key is the gateway credential;
    # through Bifrost it is the virtual key, because Bifrost holds the provider keys.
    OPENAI_API_KEY: str | None = None
    # base of the OpenAI dialect, which appends /chat/completions or /responses
    OPENAI_BASE_URL: str | None = None


app_config = AppConfig()
