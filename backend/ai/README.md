# SmartLedger AI

Internal AI API called only by Core, which proxies its public `/api/v1/agent/*` routes here. The service exposes `/health`, `POST /internal/v1/agent/chat`, `POST /internal/v1/agent/chat/stream` (not yet proxied by Core, see [Streaming chat](#streaming-chat)), and list/detail/rename/delete routes under `/internal/v1/agent/conversations`. The agent can read the current shop's profile, categories, products and confirmed sales through read-only SQL tools. Chat history is stored in PostgreSQL. PostgreSQL connects lazily on the first request that needs it, and the Redis client connects at process start; an unreachable or unreadable database URL is logged, does not stop the service, and makes database routes answer `503 ai_unavailable`. Every `/internal/v1` route requires the shared `X-Internal-Token` header. There are no invoice or expense endpoints.

Frontend must not call this service.

## Chat history schema

The AI schema (chat history, the `vector` extension and the `ai_read` views) lives in the Supabase CLI migrations at [`supabase/migrations/`](../../supabase/migrations/); the first file is a baseline that folds the earlier AI migrations together. It reads Core's tables, so run Core's Flyway migrations first. On the shared dev/staging database, push only after the pull request merges (see [Database migrations](../../README.md#database-migrations)). From the repository root:

```bash
set -a && . ./.env.staging && set +a
npx supabase@2.119.0 db push --db-url "$POSTGRES_URL"
```

`db push` applies only the files not yet recorded in `supabase_migrations.schema_migrations`. Every baseline statement is safe to re-run, so it also applies over a database that already had the old `backend/ai/migrations` files. Add a change as a new file (`npx supabase@2.119.0 migration new <name>`); never edit a file that has been pushed.

The AI service does not create or migrate tables at startup. `ai_request_id` remains nullable; its foreign key is deferred until the `ai_requests` table is installed. The baseline only enables the `vector` extension ([ADR-0001](../../docs/architecture/adr/0001-vector-store-pgvector.md)); no table uses embeddings yet.

## Chat context

Each chat turn sends the static system prompt, then the conversation's latest `AGENT_HISTORY_TURNS` owner and assistant exchanges verbatim (default 100 turns, that is 200 messages, oldest first), then the new owner message. Older messages do not reach the model. Nothing is summarized: there is no summary model, no background fold after a turn and no history search tool. Owners chat little, and the chat model handles a 100-turn window comfortably.

`AgentConversationRepository.recent_messages(conversation_id, user_id, shop_id, limit)` reads the history. It first checks that the conversation belongs to that user and shop; otherwise the request fails with `404 conversation_not_found`.

`chat_conversations.summary` and `summary_through_message_id` still exist, because the AI baseline migration created them. The code neither reads nor writes them. They are kept so the previous release can roll back, and a later migration drops them after this deploy.

The agent runs on [Pydantic AI](https://ai.pydantic.dev/). `build_chat_model` in `src/providers/factory.py` returns an `OpenAIResponsesModel`, because reasoning models reject function tools on `/v1/chat/completions`. An `OPENAI_BASE_URL` proxy must therefore serve `/v1/responses`; a blank `OPENAI_BASE_URL` means the OpenAI default. `MODEL_REASONING_EFFORT` (default `high`) sets the reasoning effort for the chat model.

## Shop data tool (read-only SQL)

When `AI_SQL_READER_URL` is set, the agent gets a `query_shop_data` tool that runs one model-written `SELECT` against the current shop's profile, categories, products, sales and sale items. Without it the agent still chats, only without that tool. There is no SQL HTTP endpoint.

Five layers keep the query inside the current shop and read-only:

1. **Role.** The baseline creates the `NOLOGIN` group role `ai_sql_reader`, which has only `USAGE` on schema `ai_read` and `SELECT` on its five views, and no grant on Core's tables.
2. **Views.** `ai_read.v_shop_profile`, `v_categories` and `v_products` filter on the transaction setting `smartledger.shop_id` and do not expose `shop_id`; an unset setting returns no rows. They are `security_barrier` views, so a failing filter cannot quote another shop's row in its error. `v_sales` and `v_sale_items` follow the same rule and deliberately leave out customer snapshots (PII) and the free-text `void_reason`.
3. **Guard.** `SqlGuard` in `src/sql/guard.py` parses the SQL with `sqlglot` and accepts exactly one `SELECT` (with `WITH` and `UNION`) over those views. Functions and cast types come from an allowlist, so `set_config`, `current_setting`, `pg_*` and `dblink` are rejected along with `information_schema`, `pg_catalog`, base tables, `FOR UPDATE`, `SELECT INTO`, DML, DDL, `SET` and `COPY`. The statement that runs is the guard's own rendering, wrapped as `SELECT * FROM (...) q LIMIT n`.
4. **Execution.** `ReadOnlySqlExecutor` in `src/sql/executor.py` opens a separate connection per query, starts a `READ ONLY` transaction, sets `smartledger.shop_id` from the authenticated request as a bound parameter, applies `SQL_TIMEOUT_MS` (default 3000) and `SQL_ROW_LIMIT` (default 100), cuts text cells at 200 characters and always rolls back. The tool reads the shop from the Pydantic AI run context (`RunContext[AgentContext]`, filled from the run's `deps`); the model only passes `sql`, and a call with any other argument is sent back for a retry without running.
5. **Output.** Results reach the model as data with a header saying so. The guard and the executor raise `ValueError("CODE: reason")` for a query the guard or the database rejects, and the tool returns it as `Error[CODE]: reason` (for example `Error[UNSAFE_FUNCTION]`, `Error[QUERY_TIMEOUT]`, `Error[SQL_ERROR]`) so the model can rewrite it. Any other failure, such as an unreachable reader database (`psycopg.OperationalError`), propagates and fails the turn with `503 ai_unavailable`.

All prompt text lives in `src/prompt_templates/` (`shop_agent.py`, `sql_agent.py`, `restock.py`, `draft_parse.py`). It is English and static; the agent always answers the owner in Vietnamese.

### Agent guardrails

`AgentService` calls one `AgentGuardrails` object (`src/agent/guardrails/agent_guardrails.py`), which holds the limits and applies one guardrail module per check around each Pydantic AI run, in order: an input-length check on the owner's latest message (`AGENT_MAX_INPUT_CHARS`, default 2000) stops the turn before any model call; `redact_input` (`input_redaction.py`) masks card numbers that pass the Luhn check and redacts API keys, bearer tokens and JWTs in the owner's message before the model sees it (the redacted text is what gets stored); per-turn limits on model requests and tokens (`UsageLimits`: `AGENT_MODEL_CALL_LIMIT` 4, and `AGENT_TURN_TOKEN_LIMIT` 200000 input plus output tokens across the turn's requests), a turn time limit (`AGENT_TURN_TIMEOUT_SECONDS` 35, below Core's 40 s read timeout so a turn Core gave up on is not stored) and tool calls (the `ToolCallLimit` capability in `tool_call_limit.py`, `AGENT_TOOL_CALL_LIMIT` 3), where a call over the limit is refused and the tools are hidden so the model answers from what it already has; and `screen_answer` (`answer_screen.py`), registered as the agent's output validator, which sends an empty answer, or one that leaks view names, scope settings, error codes or SQL, back to the model with `ModelRetry` so it answers again. Each retry is a model request, so the request limit bounds the retries.

A guardrail that stops the turn raises `GuardrailError`, which the service maps to `422 {"detail": "<code>"}` and for which nothing is stored: `input_too_long` for an over-long message, `answer_unavailable` when the run reaches the request or token limit or the screen still rejects the answer after its retries, `answer_timeout` when it passes the time limit. Each answered turn logs its token usage so the token limit can be sized from real traffic; the defaults are provisional until the PO approves them. The service holds no owner-facing text; the app maps each code to its own copy. Core currently turns every non-404 AI error into `503 ai_unavailable`, so the codes reach the app only once Core forwards them. All checks are deterministic: there is no model-based safety check, human approval step or LLM query checker, because each adds a model call and the guard plus the read-only role already bound what a query can do.

Push the baseline as a user with `CREATEROLE` (first run only) and the `search_path` that holds Core's tables, then create the login the service uses. Keep the password in the environment's secrets, never in Git:

```sql
CREATE ROLE smartledger_ai_reader LOGIN PASSWORD '<secret>' IN ROLE ai_sql_reader;
ALTER ROLE smartledger_ai_reader SET default_transaction_read_only = on;
```

```bash
AI_SQL_READER_URL=postgresql://smartledger_ai_reader:<secret>@<host>:5432/<db>
```

Phase 1 covers the shop profile, categories, products and sales (`CONFIRMED` and `VOIDED`). Expenses, debts and customers are not exposed yet.

## Streaming chat

`POST /internal/v1/agent/chat/stream` runs the same turn as `POST /internal/v1/agent/chat` and answers with `text/event-stream`. The request, pre-stream status codes, events and `done` body are defined in the [API contracts](../../docs/contracts/api-contracts.md#stream-trả-lời-chat); this section covers how the service produces them.

- `AgentService.stream_chat` runs the history read and the input check before it yields anything, so a pre-stream failure raises before any byte is sent. The turn then runs through `agent.iter()`, and each model response is read with `stream_text(delta=True)`. `run_stream` is not used: it stops at the first final-looking output and skips later tool calls and the retry loop.
- Output validators do not see delta text. `AgentGuardrails.screened_prefix` therefore releases only the prefix that no continuation can turn into a `LEAK_PATTERN` match. It holds back a short tail, and anything after a `select` that could still start a `select … from` match, until that match is ruled out or 400 characters have passed. `screen_answer` still runs as the output validator on every complete answer, so a rejected answer is retried.
- The service sends `reset` when shown text must be discarded: a model response followed by a tool call, or an answer the screen rejected and the model retried. Before `done`, it releases the rest of the final answer; if the text already shown is not a prefix of that answer, it sends `reset` and then the whole answer. The text after the last `reset` therefore equals the stored answer.
- Nothing is saved unless the run completes. A guardrail stop raises `GuardrailError` from the iterator, with the same codes, timeout and limits as the JSON route. Closing the stream early, for example when the caller disconnects, cancels the run; a disconnect that lands while the exchange is already being written cannot stop that write.
- Core does not proxy this route yet, so FE cannot reach it.

## Restock suggestions

When the read-only executor is configured, the agent also gets a `suggest_restock` tool. It takes one argument, `period`, and returns the tracked ACTIVE products whose stock is below the cover the policy aims for, most urgent first: each item carries a suggested quantity and a short Vietnamese reason. It changes nothing.

- Only confirmed sales count: the service sums `v_sale_items.quantity` for rows whose `sale_status = 'CONFIRMED'` fall in the requested window, joins them to `v_products` and keeps tracked ACTIVE products. Voided sales are excluded.
- A product is suggested only when `ceil(sold_qty / days * COVER_DAYS - max(stock_qty, 0))` is positive, where `days` is the length of the requested period; stock below zero counts as zero. A shop whose stock already covers the period gets no suggestions.
- `COVER_DAYS` in `src/restock/policy.py` is the only tunable. It currently defaults to 7 days, and the periods `last_7_days` (the default when the owner names no period) and `last_30_days` are likewise provisional: all three await product-owner sign-off and are not yet agreed product behaviour.
- The service runs one fixed `SELECT` through the same guard and read-only executor as `query_shop_data`, so the shop scope, statement timeout and row cap apply unchanged. The candidate list is capped at the fastest-selling rows the row cap returns, and the result flags when that cap was hit so the agent can say the list is partial.
- `RestockSuggestion.reason` is a fixed Vietnamese sentence built from the period's sales and the current stock; the agent copies `suggested_qty`, `unit` and `reason` verbatim rather than recomputing them.

## Text drafts

The async `DraftService.parse(shop_id, mode, text)` in `src/drafts/service.py` turns an owner's text or STT transcript into a `DraftView` without `request_id`, which the endpoint assigns. It changes nothing: no sale, expense or stock is written. The endpoint `/internal/v1/drafts/parse` and audio belong to #3; this module is the text step it calls.

- `SALE` loads the shop's ACTIVE catalog through `ProductCatalogRepository` (`src/drafts/catalog.py`), puts `id | name | unit` into the prompt, and the model returns lines with `product_id`, `qty`, `confidence` and an `ambiguous` flag through native structured output (`NativeOutput(DraftOutput)`).
- `src/drafts/matching.py` then decides, without I/O: an id outside the shop catalog, an ambiguous line, no match, or `confidence` below `MIN_MATCH_CONFIDENCE` (0.7, a provisional default) leaves `product_id`, `unit` and `unit_price` as `null` and adds a Vietnamese warning. A kept line takes name, unit and price from the catalog row; a price the owner says is ignored.
- `EXPENSE` skips the catalog. Each expense is one line with `qty = 1`, the description in `name` and the amount in `unit_price`; a missing amount stays `null` with a warning.
- Every model failure, invalid model output, missing model or catalog failure raises `DraftUnavailableError`, which the endpoint maps to `503 ai_unavailable` so Core falls back to manual entry.
- The Vietnamese text set (typos, no diacritics, abbreviations, ambiguous and unknown items) runs against the configured real model only when asked: `RUN_LIVE_MODEL_TESTS=1 uv run pytest tests/integration_tests/test_draft_parse_live.py`.

## Internal authentication

`INTERNAL_API_TOKEN` is the credential shared with Core. Callers send it in the `X-Internal-Token` header; a missing or wrong value returns `401 unauthorized`. An unset or blank token fails closed, so every `/internal/v1` route returns `401` while `/health` keeps answering. Core sends the header from its own `INTERNAL_API_TOKEN`, so both services must hold the same value. Keep the staging and production values in those environments' secrets.

## Routes and database access

`src/main.py` is the composition root. It builds one `APIRouter` with prefix `/internal/v1` and the `X-Internal-Token` dependency, includes each flow's router under it, and mounts it on the app. Today the only flow router is `src/agent/router.py` (prefix `/agent`) for chat and conversation CRUD. Every `/internal/v1` route inherits the token check. A new flow adds one include line there; the planned `/internal/v1/drafts/parse` is not implemented yet.

`main.py` maps `ConversationNotFoundError` to `404 conversation_not_found` and any other exception to `503 ai_unavailable`, logging the cause. The chat route is async: the agent awaits the model on the event loop, while the blocking database calls and the sync tools run in worker threads, so a slow model call holds no thread. `GET /health` is async too.

The application database (`POSTGRES_URL`: chat history and the catalog) is reached through a SQLAlchemy 2 engine (`src/infra/postgre_db_client.py`, psycopg 3 driver) whose pool holds at most `POSTGRES_POOL_MAX_SIZE` connections (default 2, min 1) with no overflow. `POSTGRES_URL` must be a `postgresql://` or `postgres://` URL; a libpq keyword string (`host=... dbname=...`) is not accepted. The default is kept low because the Supabase session pooler (port 5432) allows 15 clients in total, and Core sets no Hikari pool size, so Spring's default lets it open up to 10. The pool checks a connection before lending it (`pool_pre_ping`) and replaces broken ones, so requests do not queue on a single connection and a dropped connection recovers without a restart. Repositories map only the columns they use as declarative ORM classes (`ChatConversation`, `ChatMessage`, read-only `Product`); Core's Flyway and the Supabase migrations own the schema, so the service never creates a table. The read-only shop-data reader (`AI_SQL_READER_URL`) stays on plain psycopg with its own short connection per query, because it runs model-written SQL that `SqlGuard` has checked, not ORM-built statements.

`main.py` also connects a Redis client from `REDIS_URL` and keeps it on `app.state.redis`; no feature reads it yet. `QDRANT_URL`, `LITELLM_URL` and `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`/`LANGFUSE_HOST` stay in `AppConfig` for planned integrations, but no code reads them; Langfuse and LiteLLM are deferred until after the first release.

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
