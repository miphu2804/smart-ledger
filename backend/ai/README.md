# SmartLedger AI

Internal AI API intended for Core; Core does not call it yet. The service exposes `/health`, `POST /internal/v1/agent/chat`, and list/detail/rename/delete routes under `/internal/v1/agent/conversations`. The agent can read the current shop's profile, categories and products through a read-only SQL tool. Chat history is stored in PostgreSQL. Postgres and Redis clients connect at process start and log status. Every `/internal/v1` route requires the shared `X-Internal-Token` header. There are no invoice or expense endpoints.

Frontend must not call this service.

## Chat history schema

Run Core's Flyway migrations first so `users` and `shops` exist, then apply the versioned AI migrations in order:

```bash
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/001_create_chat_history.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/002_enable_pgvector.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/003_add_chat_summary.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/004_create_ai_read_views.sql
```

The AI service does not create or migrate tables at startup. `ai_request_id` remains nullable; its foreign key is deferred until the `ai_requests` table is installed. Version `002` is reserved for the pgvector work and is not part of this service yet.

## Chat context and rolling summary

Each turn sends the stored summary followed by every message not yet folded into it. A message therefore leaves the model context only after the summarizer has written it into the summary, and a fold that has not run yet never hides messages.

- The verbatim window keeps 50 messages and may grow to 60 before a fold happens, so most turns do not call the summarizer at all.
- A backlog longer than one batch (about 3000 estimated tokens, `len(text) // 4`) is folded in several passes, and each pass is persisted before the next one starts.
- Summarization runs as a FastAPI background task after the reply, so the current turn is never slowed down. It never raises: a model or database failure leaves the stored summary untouched and the next turn retries it.
- Concurrent folds cannot lose messages: a fold only advances `summary_through_message_id` from the value it read, so the later writer is dropped.
- `SUMMARY_MODEL_NAME` selects the summarization model and falls back to `MODEL_NAME`.

`summary` and `summary_through_message_id` live on `chat_conversations`, so deleting a conversation removes its summary with it.

Folded messages stay in `chat_messages`. When the summary lacks an exact figure, name, date or wording, the agent calls `search_chat_history`, which matches the query words against the folded messages of the current conversation, ignoring Vietnamese diacritics, and returns up to five hits with the message before and after each. The tool takes only the query; the conversation, user and shop come from the request context, so the model cannot read another shop's history.

The OpenAI client uses the Responses API because reasoning models reject function tools on `/v1/chat/completions`. An `OPENAI_BASE_URL` proxy must therefore serve `/v1/responses`. `MODEL_REASONING_EFFORT` (default `high`) sets the reasoning effort for both the chat and summary models.

## Shop data tool (read-only SQL)

When `AI_SQL_READER_URL` is set, the agent gets a `query_shop_data` tool that runs one model-written `SELECT` against the current shop's profile, categories and products. Without it the agent still chats, only without that tool. There is no SQL HTTP endpoint.

Five layers keep the query inside the current shop and read-only:

1. **Role.** Migration `004` creates the `NOLOGIN` group role `ai_sql_reader`, which has only `USAGE` on schema `ai_read` and `SELECT` on its three views, and no grant on Core's tables.
2. **Views.** `ai_read.v_shop_profile`, `v_categories` and `v_products` filter on the transaction setting `smartledger.shop_id` and do not expose `shop_id`; an unset setting returns no rows. They are `security_barrier` views, so a failing filter cannot quote another shop's row in its error.
3. **Guard.** `SqlGuard` in `src/sql/guard.py` parses the SQL with `sqlglot` and accepts exactly one `SELECT` (with `WITH` and `UNION`) over those views. Functions and cast types come from an allowlist, so `set_config`, `current_setting`, `pg_*` and `dblink` are rejected along with `information_schema`, `pg_catalog`, base tables, `FOR UPDATE`, `SELECT INTO`, DML, DDL, `SET` and `COPY`. The statement that runs is the guard's own rendering, wrapped as `SELECT * FROM (...) q LIMIT n`.
4. **Execution.** `ReadOnlySqlExecutor` in `src/sql/executor.py` opens a separate connection per query, starts a `READ ONLY` transaction, sets `smartledger.shop_id` from the authenticated request as a bound parameter, applies `SQL_TIMEOUT_MS` (default 3000) and `SQL_ROW_LIMIT` (default 100), cuts text cells at 200 characters and always rolls back. The tool reads the shop from the LangChain runtime context (`ToolRuntime[AgentContext]`); the model only passes `sql`.
5. **Output.** Results reach the model as data with a header saying so. The guard and the executor raise `ValueError("CODE: reason")` for a query the guard or the database rejects, and the tool returns it as `Error[CODE]: reason` (for example `Error[UNSAFE_FUNCTION]`, `Error[QUERY_TIMEOUT]`, `Error[SQL_ERROR]`) so the model can rewrite it. Any other failure, such as an unreachable reader database (`psycopg.OperationalError`), propagates and fails the turn with `503 ai_unavailable`.

All prompt text lives in `src/prompt_templates/` (`shop_agent.py`, `sql_agent.py`, `chat_summary.py`). It is English and static; the agent always answers the owner in Vietnamese.

### Agent guardrails

`build_guardrails` in `src/agent/guardrails.py` builds the agent's LangChain middleware, in order: `AgentGuardrails`, one middleware with an input-length check on the owner's latest message (`AGENT_MAX_INPUT_CHARS`, default 2000) that ends the turn with a short Vietnamese reply before any model call; `PIIMiddleware` that masks card numbers and redacts API keys, bearer tokens and JWTs in the owner's message before the model sees it (the redacted text is what gets stored); model and tool call limits per turn (`AGENT_MODEL_CALL_LIMIT` 4, `AGENT_TOOL_CALL_LIMIT` 3); and the same `AgentGuardrails` output check after the run, which replaces an empty answer, or one that leaks view names, scope settings, error codes or SQL, with a safe Vietnamese reply. All checks are deterministic: there is no model-based safety check, human approval step or LLM query checker, because each adds a model call and the guard plus the read-only role already bound what a query can do.

Run migration `004` as a user with `CREATEROLE` (first run only) and the `search_path` that holds Core's tables, then create the login the service uses. Keep the password in the environment's secrets, never in Git:

```sql
CREATE ROLE smartledger_ai_reader LOGIN PASSWORD '<secret>' IN ROLE ai_sql_reader;
ALTER ROLE smartledger_ai_reader SET default_transaction_read_only = on;
```

```bash
AI_SQL_READER_URL=postgresql://smartledger_ai_reader:<secret>@<host>:5432/<db>
```

Phase 1 covers only the shop profile, categories and products. Sales, expenses, debts and customers are not exposed yet.

## Internal authentication

`INTERNAL_API_TOKEN` is the credential shared with Core. Callers send it in the `X-Internal-Token` header; a missing or wrong value returns `401 unauthorized`. An unset or blank token fails closed, so every `/internal/v1` route returns `401` while `/health` keeps answering. Keep the staging and production values in those environments' secrets, and remember that Core does not send the header yet.

## Setup

```bash
uv sync --group dev
cp .env.example .env
```

## Run

```bash
uv run python -m src.main
```

Host and port come from `SERVER_HOST` and `SERVER_PORT`.

`GET /health` returns `{"status": "ok"}` and does not check dependencies.

## Local Compose

From the repository root. Starts Core and this service against the shared staging Supabase and Redis Cloud databases; there are no local PostgreSQL or Redis containers. Langfuse is not part of the default stack. See the root [README](../../README.md#local-compose) for the env files.

```bash
docker compose --env-file .env.staging --env-file backend/core/.env up --build
```

- AI: `http://localhost:8001/health`
- Compose ports use the defaults in `compose.yaml` and can be overridden with shell environment variables.

To run this app on the host, export `POSTGRES_URL` and `REDIS_URL` from the repo-root `.env.staging` (dev shares the staging databases). `AppConfig` reads them from the process environment, which takes precedence over the local `.env`:

```bash
uv sync --group dev
cp .env.example .env
set -a && source ../../.env.staging && set +a
uv run python -m src.main
```

## Check

Ruff replaces isort (rule `I`) and Black (`ruff-format`). Auto-fix on commit:

```bash
uvx pre-commit install
```

```bash
uv run ruff check --fix
uv run ruff format
uv run pytest
```
