# SmartLedger AI

Internal AI API called only by Core, which proxies its public `/api/v1/agent/*` routes here. The service exposes `/health`, `POST /internal/v1/agent/chat`, and list/detail/rename/delete routes under `/internal/v1/agent/conversations`. The agent can read the current shop's profile, categories, products and confirmed sales through read-only SQL tools. Chat history is stored in PostgreSQL. Postgres and Redis clients connect at process start and log status. Every `/internal/v1` route requires the shared `X-Internal-Token` header. There are no invoice or expense endpoints.

Frontend must not call this service.

## Chat history schema

The AI schema (chat history, the `vector` extension and the `ai_read` views) lives in the Supabase CLI migrations at [`supabase/migrations/`](../../supabase/migrations/); the first file is a baseline that folds the earlier AI migrations together. It reads Core's tables, so run Core's Flyway migrations first. On the shared dev/staging database, push only after the pull request merges (see [Database migrations](../../README.md#database-migrations)). From the repository root:

```bash
set -a && . ./.env.staging && set +a
npx supabase@2.119.0 db push --db-url "$POSTGRES_URL"
```

`db push` applies only the files not yet recorded in `supabase_migrations.schema_migrations`. Every baseline statement is safe to re-run, so it also applies over a database that already had the old `backend/ai/migrations` files. Add a change as a new file (`npx supabase@2.119.0 migration new <name>`); never edit a file that has been pushed.

The AI service does not create or migrate tables at startup. `ai_request_id` remains nullable; its foreign key is deferred until the `ai_requests` table is installed. The baseline only enables the `vector` extension ([ADR-0001](../../docs/architecture/adr/0001-vector-store-pgvector.md)); no table uses embeddings yet.

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

When `AI_SQL_READER_URL` is set, the agent gets a `query_shop_data` tool that runs one model-written `SELECT` against the current shop's profile, categories, products, sales and sale items. Without it the agent still chats, only without that tool. There is no SQL HTTP endpoint.

Five layers keep the query inside the current shop and read-only:

1. **Role.** The baseline creates the `NOLOGIN` group role `ai_sql_reader`, which has only `USAGE` on schema `ai_read` and `SELECT` on its five views, and no grant on Core's tables.
2. **Views.** `ai_read.v_shop_profile`, `v_categories` and `v_products` filter on the transaction setting `smartledger.shop_id` and do not expose `shop_id`; an unset setting returns no rows. They are `security_barrier` views, so a failing filter cannot quote another shop's row in its error. `v_sales` and `v_sale_items` follow the same rule and deliberately leave out customer snapshots (PII) and the free-text `void_reason`.
3. **Guard.** `SqlGuard` in `src/sql/guard.py` parses the SQL with `sqlglot` and accepts exactly one `SELECT` (with `WITH` and `UNION`) over those views. Functions and cast types come from an allowlist, so `set_config`, `current_setting`, `pg_*` and `dblink` are rejected along with `information_schema`, `pg_catalog`, base tables, `FOR UPDATE`, `SELECT INTO`, DML, DDL, `SET` and `COPY`. The statement that runs is the guard's own rendering, wrapped as `SELECT * FROM (...) q LIMIT n`.
4. **Execution.** `ReadOnlySqlExecutor` in `src/sql/executor.py` opens a separate connection per query, starts a `READ ONLY` transaction, sets `smartledger.shop_id` from the authenticated request as a bound parameter, applies `SQL_TIMEOUT_MS` (default 3000) and `SQL_ROW_LIMIT` (default 100), cuts text cells at 200 characters and always rolls back. The tool reads the shop from the LangChain runtime context (`ToolRuntime[AgentContext]`); the model only passes `sql`.
5. **Output.** Results reach the model as data with a header saying so. The guard and the executor raise `ValueError("CODE: reason")` for a query the guard or the database rejects, and the tool returns it as `Error[CODE]: reason` (for example `Error[UNSAFE_FUNCTION]`, `Error[QUERY_TIMEOUT]`, `Error[SQL_ERROR]`) so the model can rewrite it. Any other failure, such as an unreachable reader database (`psycopg.OperationalError`), propagates and fails the turn with `503 ai_unavailable`.

All prompt text lives in `src/prompt_templates/` (`shop_agent.py`, `sql_agent.py`, `restock.py`, `chat_summary.py`). It is English and static; the agent always answers the owner in Vietnamese.

### Agent guardrails

`build_guardrails` in `src/agent/guardrails.py` builds the agent's LangChain middleware, in order: `AgentGuardrails`, one middleware with an input-length check on the owner's latest message (`AGENT_MAX_INPUT_CHARS`, default 2000) that ends the turn with a short Vietnamese reply before any model call; `PIIMiddleware` that masks card numbers and redacts API keys, bearer tokens and JWTs in the owner's message before the model sees it (the redacted text is what gets stored); model and tool call limits per turn (`AGENT_MODEL_CALL_LIMIT` 4, `AGENT_TOOL_CALL_LIMIT` 3); and the same `AgentGuardrails` output check after the run, which replaces an empty answer, or one that leaks view names, scope settings, error codes or SQL, with a safe Vietnamese reply. All checks are deterministic: there is no model-based safety check, human approval step or LLM query checker, because each adds a model call and the guard plus the read-only role already bound what a query can do.

Push the baseline as a user with `CREATEROLE` (first run only) and the `search_path` that holds Core's tables, then create the login the service uses. Keep the password in the environment's secrets, never in Git:

```sql
CREATE ROLE smartledger_ai_reader LOGIN PASSWORD '<secret>' IN ROLE ai_sql_reader;
ALTER ROLE smartledger_ai_reader SET default_transaction_read_only = on;
```

```bash
AI_SQL_READER_URL=postgresql://smartledger_ai_reader:<secret>@<host>:5432/<db>
```

Phase 1 covers the shop profile, categories, products and sales (`CONFIRMED` and `VOIDED`). Expenses, debts and customers are not exposed yet.

## Restock suggestions

When the read-only executor is configured, the agent also gets a `suggest_restock` tool. It takes one argument, `period`, and returns the tracked ACTIVE products whose stock is below the cover the policy aims for, most urgent first: each item carries a suggested quantity and a short Vietnamese reason. It changes nothing.

- Only confirmed sales count: the service sums `v_sale_items.quantity` for rows whose `sale_status = 'CONFIRMED'` fall in the requested window, joins them to `v_products` and keeps tracked ACTIVE products. Voided sales are excluded.
- A product is suggested only when `ceil(sold_qty / days * COVER_DAYS - max(stock_qty, 0))` is positive, where `days` is the length of the requested period; stock below zero counts as zero. A shop whose stock already covers the period gets no suggestions.
- `COVER_DAYS` in `src/restock/policy.py` is the only tunable. It currently defaults to 7 days, and the periods `last_7_days` (the default when the owner names no period) and `last_30_days` are likewise provisional: all three await product-owner sign-off and are not yet agreed product behaviour.
- The service runs one fixed `SELECT` through the same guard and read-only executor as `query_shop_data`, so the shop scope, statement timeout and row cap apply unchanged. The candidate list is capped at the fastest-selling rows the row cap returns, and the result flags when that cap was hit so the agent can say the list is partial.
- `RestockSuggestion.reason` is a fixed Vietnamese sentence built from the period's sales and the current stock; the agent copies `suggested_qty`, `unit` and `reason` verbatim rather than recomputing them.

## Text drafts

`DraftService.parse(shop_id, mode, text)` in `src/drafts/service.py` turns an owner's text or STT transcript into a `DraftView` without `request_id`, which the endpoint assigns. It changes nothing: no sale, expense or stock is written. The endpoint `/internal/v1/drafts/parse` and audio belong to #3; this module is the text step it calls.

- `SALE` loads the shop's ACTIVE catalog through `ProductCatalogRepository`, puts `id | name | unit` into the prompt, and the model returns lines with `product_id`, `qty`, `confidence` and an `ambiguous` flag through structured output.
- `src/drafts/matching.py` then decides, without I/O: an id outside the shop catalog, an ambiguous line, no match, or `confidence` below `MIN_MATCH_CONFIDENCE` (0.7, a provisional default) leaves `product_id`, `unit` and `unit_price` as `null` and adds a Vietnamese warning. A kept line takes name, unit and price from the catalog row; a price the owner says is ignored.
- `EXPENSE` skips the catalog. Each expense is one line with `qty = 1`, the description in `name` and the amount in `unit_price`; a missing amount stays `null` with a warning.
- Every model failure, invalid model output, missing model or catalog failure raises `DraftUnavailableError`, which the endpoint maps to `503 ai_unavailable` so Core falls back to manual entry.
- The Vietnamese text set (typos, no diacritics, abbreviations, ambiguous and unknown items) runs against the configured real model only when asked: `RUN_LIVE_MODEL_TESTS=1 uv run pytest tests/integration_tests/test_draft_parse_live.py`.

## Internal authentication

`INTERNAL_API_TOKEN` is the credential shared with Core. Callers send it in the `X-Internal-Token` header; a missing or wrong value returns `401 unauthorized`. An unset or blank token fails closed, so every `/internal/v1` route returns `401` while `/health` keeps answering. Core sends the header from its own `INTERNAL_API_TOKEN`, so both services must hold the same value. Keep the staging and production values in those environments' secrets.

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
