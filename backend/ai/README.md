# SmartLedger AI

Internal FastAPI service that runs the owner's Agent chat. Only Core calls it: Core proxies its public `/api/v1/agent/*` routes here. Frontends must not call this service.

| Need | Read |
|---|---|
| Request and response shapes | [API contracts §6](../../docs/contracts/api-contracts.md#6-core--ai-nội-bộ) |
| Implementation status | [Technical design §1](../../docs/architecture/technical-design.md#1-phạm-vi) |
| Code walkthrough with diagrams | [Service walkthrough §8](../../docs/architecture/service-walkthrough/README.md#8-ai-service) |
| Vector store and long-term memory decisions | [ADR-0001](../../docs/architecture/adr/0001-vector-store-pgvector.md), [ADR-0002](../../docs/architecture/adr/0002-agent-long-term-memory.md) |

## Routes

`src/main.py` is the composition root. Every `/internal/v1` route inherits the `X-Internal-Token` check; a new flow adds one `include_router` line there.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Returns `{"status": "ok"}`; no token, checks no dependency |
| `GET` | `/metrics` | Prometheus request metrics for Grafana; no token, reachable only on the container network |
| `POST` | `/internal/v1/agent/chat` | One chat turn, JSON answer |
| `POST` | `/internal/v1/agent/chat/stream` | Same turn as server-sent events; Core relays it as `/api/v1/agent/chat/stream` |
| `GET` | `/internal/v1/agent/conversations` | List the owner's conversations |
| `GET` `PATCH` `DELETE` | `/internal/v1/agent/conversations/{id}` | Read, rename or delete one conversation |
| `GET` `PUT` | `/internal/v1/agent/memory/settings` | Read or set the owner's long-term memory switch |
| `GET` | `/internal/v1/agent/memory/items` | List the owner's live memories |
| `DELETE` | `/internal/v1/agent/memory/items/{id}` | Forget one memory |

There are no invoice, expense or draft endpoints.

### Errors

| Status | `detail` | When |
|---|---|---|
| `401` | `unauthorized` | Missing or wrong `X-Internal-Token`; an unset token rejects every `/internal/v1` route |
| `404` | `conversation_not_found`, `memory_not_found` | The conversation or memory is not the caller's user and shop |
| `409` | `memory_unavailable` | Writing memory settings or items while long-term memory is not built |
| `422` | `input_too_long`, `answer_unavailable`, `answer_timeout` | A [guardrail](#guardrails) stopped the turn; nothing is stored |
| `503` | `ai_unavailable` | Any other failure, such as an unreachable database; the cause goes to the log |

Core forwards the `422` codes as its own `code` and turns every other non-404 AI error into `503 ai_unavailable`.

## Agent tools

The agent runs on [Pydantic AI](https://ai.pydantic.dev/). Prompts live in `src/prompt_templates/`, are English and static, and tell the agent to answer in Vietnamese.

| Tool | Available when | Does |
|---|---|---|
| `query_shop_data` | `AI_SQL_READER_URL` is set | Runs one model-written `SELECT` over the [read-only views](#read-only-shop-data) |
| `suggest_restock` | `AI_SQL_READER_URL` is set | Lists products whose stock is below the [restock cover](#restock-suggestions) |
| `calculate` | `CALC_ENABLED` (default on) | Runs ordered [arithmetic steps](#calculation-and-sandbox) instead of mental math |
| `run_code` | `SANDBOX_ENABLED` (default on) | Runs a small model-written Python program in the Monty sandbox; it calls no tool |
| `suggest_screen` | Always | Adds an [app screen button](#app-guide-and-screen-buttons) to the answer |

## How a chat turn runs

1. Reject an owner message longer than `AGENT_MAX_INPUT_CHARS`.
2. Redact secrets and personal data from the message; the redacted text is what gets stored.
3. Load the last `AGENT_HISTORY_TURNS` exchanges verbatim, without earlier ```` ```actions ```` blocks.
4. With long-term memory on, recall memories and place them before the message.
5. Run the model under the request, token, time and tool-call limits.
6. Screen the final answer and send a leaking or empty one back for a retry.
7. Append accepted screen buttons, then save the exchange.
8. With long-term memory on, extract new facts in the background.

## Chat history and context

- History is never summarized: older messages than `AGENT_HISTORY_TURNS` (default 30 exchanges) simply do not reach the model. 30 turns at the 2000-character cap fit a 100k-token window.
- The current shop time (`Asia/Ho_Chi_Minh`) follows the new message after a cache breakpoint and is never stored, so instructions and history stay a cacheable prefix.
- `AgentConversationRepository.recent_messages` checks the conversation belongs to the user and shop before reading it.
- `chat_conversations.summary` and `summary_through_message_id` are unused and kept only so the previous release can roll back.

## Model provider

`LLMFactory.create_model(alias)` in `src/providers/llm_factory.py` reads `MODEL_ALIASES`, a JSON object mapping each alias to a `protocol` and the `model` id. The application uses one alias, `chat`. The protocol picks the provider class:

| `protocol` | Provider | API |
|---|---|---|
| `anthropic_messages` (default) | `AnthropicMessagesProvider` | `/v1/messages` |
| `openai_responses` | `OpenAIResponsesProvider` | `/v1/responses` |
| `openai_chat` | `OpenAIChatProvider` | `/chat/completions` |

- Every model shares `OPENAI_API_KEY`, the gateway credential: the Bifrost virtual key when AI calls Bifrost, and the gateway's own key when it calls [OpenCode Go](https://opencode.ai/docs/go/) directly. The default `chat` alias is `claude-haiku-5-5` over `anthropic_messages`.
- `OPENAI_BASE_URL` is the base of the OpenAI APIs, and blank means the OpenAI default. `ANTHROPIC_BASE_URL` is the base of the Anthropic API, where Bifrost serves it at `/anthropic` next to `/openai`; when unset, the factory drops the `/v1` suffix from `OPENAI_BASE_URL`, and `anthropic_messages` needs one of the two.
- Through Bifrost the model id has no provider prefix: routing rules in `deploy/vps/bifrost.json` pick the upstream and the fallback, and only Bifrost holds the provider keys ([ADR-0008](../../docs/architecture/adr/0008-bifrost-owns-routing-and-fallback.md)).
- `MODEL_FALLBACKS` is a JSON list of `protocol:model` tried in order, for an environment that calls OpenCode Go directly; a fallback gets only what is left of the turn timeout, so it mainly covers fast failures.
- OpenCode Go needs an `x-opencode-session` header: `session_settings` sends `conversation-<id>` for each turn and one-off ids for drafts and memory calls. It also sends what Bifrost needs: `x-bf-session-id` groups a conversation's logs, `x-bf-lh-shop-id` adds the shop to log metadata, and `x-bf-eh-*` copies of the session and User-Agent reach the provider.
- `MODEL_REASONING_EFFORT` maps to `openai_reasoning_effort` or `anthropic_effort`.

## Read-only shop data

`query_shop_data` reads the shop profile, categories, products, sales, sale items, debts, payments and ACTIVE expenses. There is no SQL HTTP endpoint. Five layers keep a query read-only and inside the current shop:

| Layer | Where | Rule |
|---|---|---|
| Role | AI baseline migration | `NOLOGIN` role `ai_sql_reader` has `SELECT` on the eight `ai_read` views only |
| Views | `ai_read.v_*` | `security_barrier` views filter on `smartledger.shop_id`; an unset setting returns no rows; customer names, phones, free-text notes and transfer references are left out |
| Guard | `src/sql/guard.py` | Rejects SQL over 4000 characters, then `sqlglot` accepts exactly one `SELECT` over those views with allowlisted functions and casts and re-renders it under `LIMIT` |
| Execution | `src/sql/repository.py` | Own pool (`SQL_POOL_MAX_SIZE`), one `READ ONLY` transaction, shop id bound from the request, `SQL_TIMEOUT_MS`, `SQL_ROW_LIMIT`, text cells cut at 200 characters |
| Output | `src/agent/tools.py` | Rejected queries return `Error[CODE]: reason` for the model to fix; any other failure fails the turn with `503` |

The model passes only `sql`; the shop comes from the run context. Refunds, stock-in history and customer contacts are not exposed yet.

Create the login the service uses once, after pushing the baseline as a user with `CREATEROLE`. Keep the password in the environment's secrets:

```sql
CREATE ROLE smartledger_ai_reader LOGIN PASSWORD '<secret>' IN ROLE ai_sql_reader;
ALTER ROLE smartledger_ai_reader SET default_transaction_read_only = on;
```

## Guardrails

`GuardrailService` (`src/agent/guardrails/service.py`) applies the [Pydantic AI Harness guardrails](https://pydantic.dev/docs/ai/harness/guardrails/) around each run. All checks are deterministic; there is no model-based safety check.

| Check | Setting (default) | On failure |
|---|---|---|
| Message length | `AGENT_MAX_INPUT_CHARS` (2000) | `422 input_too_long` before any model call |
| Redaction (`input_redaction.py`) | — | Keys, tokens, JWTs, IBANs, Luhn-valid cards and emails become `[redacted:<name>]` |
| Model requests | `AGENT_MODEL_CALL_LIMIT` (4) | `422 answer_unavailable` |
| Tokens per turn | `AGENT_TURN_TOKEN_LIMIT` (200000) | `422 answer_unavailable` |
| Turn time | `AGENT_TURN_TIMEOUT_SECONDS` (35, below Core's 40 s) | `422 answer_timeout` |
| Tool calls (`tool_call_limit.py`) | `AGENT_TOOL_CALL_LIMIT` (3) | Further calls refused; the model answers with what it has |
| Answer screen (`answer_screen.py`) | — | An empty answer or one leaking views, settings, error codes or SQL is retried; still failing gives `422 answer_unavailable` |

Limits are provisional until the PO approves them; each answered turn logs its token usage to size them.

## Streaming

The [stream contract](../../docs/contracts/api-contracts.md#stream-trả-lời-chat) defines the events. How the service produces them:

- History and input checks run before the first byte, so a pre-stream failure is a normal JSON error; a later failure ends the stream with an `error` event carrying the same code.
- The run uses `agent.iter()` with `stream_text(delta=True)`; `run_stream` would stop at the first final-looking output and skip later tool calls.
- `AnswerScreen.screened_prefix` releases only text no continuation can turn into a leak, holding back a short tail (up to 400 characters after a `select`).
- `reset` discards shown text when a data tool call or a retry follows it. The text after the last `reset` always equals the stored answer.
- Nothing is saved unless the run completes; closing the stream cancels the run.

## Restock suggestions

`suggest_restock(period)` returns tracked ACTIVE products below cover, most urgent first, each with a suggested quantity and a fixed Vietnamese reason. It changes nothing.

- Only `CONFIRMED` sales in the period count.
- Suggested quantity is `ceil(sold_qty / days * COVER_DAYS - max(stock_qty, 0))`, shown only when positive.
- `COVER_DAYS` (7, in `src/restock/policy.py`) and the periods `last_7_days` and `last_30_days` are provisional.
- It runs one fixed `SELECT` through the same guard and pool as `query_shop_data` and flags a list cut by the row cap.

## Calculation and sandbox

**`calculate`** (`src/calculation/`, framework-free) runs up to `CALC_MAX_OPERATIONS` (20) steps of `add`, `subtract`, `multiply`, `divide`, `percentage`, `round`, `min` and `max`; a step may use `$` for the previous result. Operands and results stay within `CALC_MAX_OPERAND_VALUE` (1e15). A bad plan returns `Error[CODE]` for the model to fix. It stays callable past the tool-call limit because it does no I/O.

**`run_code`** (`src/sandbox/wrapper.py`) runs a model-written Python snippet in [Monty](https://github.com/pydantic/monty) through the Harness Code Mode capability. Monty starts only when a turn calls `run_code`. `RUN_CODE_PROMPT` keeps it for work that neither one SQL query nor `calculate` can express; the program gets its inputs from earlier tool results.

`SANDBOX_TOOLS` in `src/main.py` lists the tools folded into the sandbox and is empty: the read-only data tools stay direct, so a plain data question never starts Monty.

| Limit | Setting (default) |
|---|---|
| Execution time per snippet | `SANDBOX_MAX_DURATION_SECS` (5) |
| Monty heap | `SANDBOX_MAX_MEMORY_BYTES` (64 MiB); not a process limit |
| Nested tool calls per snippet | `SANDBOX_MAX_TOOL_CALLS` (3) |
| Host interactions per snippet | `SANDBOX_MAX_SUSPENSIONS` (1000) |

The tool-call guardrail counts one `run_code` as one call and does not see calls nested inside it. If a tool is ever folded in, keep `SANDBOX_MAX_TOOL_CALLS` equal to `AGENT_TOOL_CALL_LIMIT` so a snippet cannot multiply the database load. All calculation and sandbox defaults are provisional.

## App guide and screen buttons

`APP_GUIDE_PROMPT` (`src/prompt_templates/app_guide.py`) names the app's tabs, screens and buttons. `suggest_screen(screen)` takes one screen from a closed set; after the run, `AgentService` appends up to two distinct screens as a ```` ```actions ```` block and strips it before replaying history. Update the prompt when a mobile route moves.

## Long-term memory (off by default)

`AGENT_MEMORY_ENABLED=true` turns on the [ADR-0002](../../docs/architecture/adr/0002-agent-long-term-memory.md) memory. It is not product behavior until the PO approves it. ADR-0002 owns the recall, ranking and reconcile design; [the recall benchmark](evaluation/memory_recall/README.md) measures it.

- Needs the migrations `20261014000000_agent_memories.sql` and `20261015000000_agent_memory_visibility.sql`, and an embedder from `AGENT_MEMORY_EMBEDDING_PROVIDER`:
  - `sentence-transformers` (default) runs locally and needs `uv sync --group memory`; the Docker image leaves that group out, so there the flag logs an error and stays off.
  - `cloudflare` calls Workers AI with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; owner messages and facts are sent to Cloudflare.
- Vectors are cut to 384 dimensions. Changing the model needs `agent_memories` cleared or re-embedded first.
- Recall: up to ten `preference` memories lead every turn, then the five best matches by cosine plus BM25 (`src/memory/ranking.py`). A failed search answers without memories. The stream sends a `memory` event before the first `delta`.
- Write: after a saved turn, the chat model extracts up to five facts of the types in `AGENT_MEMORY_TYPES`, reconciles them with similar live memories and merges memories older than 7 days. It runs in the background and never fails the turn. Facts with a Vietnamese phone number are dropped.
- The owner's switch lives in `agent_memory_settings` (on when no row); off stops recall and writes and deletes nothing. Deleting a conversation deletes the memories it produced.

## Text drafts

`DraftService.parse(shop_id, mode, text)` in `src/drafts/service.py` turns owner text or an STT transcript into a `DraftView`. It writes nothing and has no endpoint yet; the planned `/internal/v1/drafts/parse` and audio belong to #3.

- `SALE` matches lines against the shop's ACTIVE catalog; an unknown id, ambiguous line or `confidence` below 0.7 leaves the product empty with a Vietnamese warning, and a line with quantity 0 or less is dropped with one. Price always comes from the catalog.
- `EXPENSE` makes one line per expense with the amount in `unit_price`.
- Any model or catalog failure raises `DraftUnavailableError`, which the endpoint is to map to `503 ai_unavailable`.

## Observability

- **Logs:** stdout at `LOG_LEVEL`. `src/agent/tool_events.py` logs each tool call with its arguments and result, each cut to 1000 characters, so server logs hold the model's SQL and shop data; a tool retry logs at `WARNING`.
- **Traces:** with `LOGFIRE_TOKEN` set, `src/observability.py` sends one [Logfire](https://logfire.pydantic.dev/docs/) span per turn, model request and tool call, with timing, model, tokens, tool names, errors and `shop_id`. Content is never sent (`include_content=False`); `tests/unit_tests/test_observability.py` checks it. `LOGFIRE_ENVIRONMENT` separates staging and production. FastAPI requests are not instrumented because that would record the message.
- **Metrics:** `/metrics` exposes request rate, status and latency per route through `prometheus-fastapi-instrumentator`, timed to the last streamed byte, for the dashboards in `deploy/monitoring/`.

## Database access

| Connection | Setting | Pool (default) | Used for |
|---|---|---|---|
| Application database | `POSTGRES_URL` | `POSTGRES_POOL_MAX_SIZE` (2) | Chat history, memories, catalog for drafts |
| Shop-data reader | `AI_SQL_READER_URL` | `SQL_POOL_MAX_SIZE` (2) | `query_shop_data` and `suggest_restock` |
| Redis | `REDIS_URL` | — | Connected at startup; no feature uses it yet |

- URLs must be `postgresql://` or `postgres://`; libpq keyword strings are rejected.
- The four connections fit the Supabase session pooler's 15 clients next to Core's 10.
- PostgreSQL connects lazily on first use with a 3 s connect timeout; a request waits up to 5 s for a free connection. An unreachable database is logged, does not stop the service and makes database routes answer `503`.
- Migrations own the schema; the service never creates a table.

## Schema and migrations

The AI schema (chat history, the `vector` extension, the `ai_read` views and memory tables) lives in [`supabase/migrations/`](../../supabase/migrations/). It reads Core's tables, so run Core's Flyway migrations first. On the shared staging database, push only after the pull request merges ([Database migrations](../../docs/development/local-development.md#database-migrations)). From the repository root:

```bash
set -a && . backend/ai/.env && set +a
npx supabase@2.119.0 db push --db-url "$POSTGRES_URL"
```

Add a change as a new file with `npx supabase@2.119.0 migration new <name>`; never edit a pushed file.

## Configuration

Settings come from `src/app_config.py`, read from the environment or `.env`; blank values fall back to the default. Write `.env` with `scripts/secrets/apply.sh staging dev` ([Secrets and env files](../../docs/development/secrets-and-env.md)) or copy `.env.example`.

| Group | Variable | Default | Purpose |
|---|---|---|---|
| Server | `APP_TITLE` | `SmartLedger AI` | FastAPI title |
| | `SERVER_HOST`, `SERVER_PORT` | `0.0.0.0`, `8001` | Bind address |
| | `LOG_LEVEL` | `INFO` | Root log level |
| Core | `INTERNAL_API_TOKEN` | unset | Shared with Core; unset rejects every `/internal/v1` route |
| Database | `POSTGRES_URL` | unset | Application database |
| | `POSTGRES_POOL_MAX_SIZE` | `2` | Application pool size |
| | `REDIS_URL` | unset | Redis client |
| Shop data | `AI_SQL_READER_URL` | unset | Read-only login; unset removes the data tools |
| | `SQL_POOL_MAX_SIZE` | `2` | Reader pool size |
| | `SQL_TIMEOUT_MS` | `3000` | Statement timeout |
| | `SQL_ROW_LIMIT` | `100` | Row cap per query |
| Model | `MODEL_ALIASES` | `chat` on `claude-haiku-5-5` over `anthropic_messages` | Alias to `protocol` and `model` |
| | `MODEL_FALLBACKS` | `[]` | JSON list of `provider:model` |
| | `MODEL_TIMEOUT_SECONDS` | `20` | Timeout per model request |
| | `MODEL_REASONING_EFFORT` | `medium` | `none`, `low`, `medium` or `high` |
| | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | unset | Shared by every model; blank URL means OpenAI |
| Guardrails | `AGENT_MAX_INPUT_CHARS` | `2000` | See [Guardrails](#guardrails) |
| | `AGENT_MODEL_CALL_LIMIT` | `4` | |
| | `AGENT_TOOL_CALL_LIMIT` | `3` | |
| | `AGENT_TURN_TOKEN_LIMIT` | `200000` | |
| | `AGENT_TURN_TIMEOUT_SECONDS` | `35` | |
| | `AGENT_HISTORY_TURNS` | `30` | Exchanges sent with each turn |
| Calculation | `CALC_ENABLED` | `true` | See [Calculation and sandbox](#calculation-and-sandbox) |
| | `CALC_MAX_OPERATIONS` | `20` | |
| | `CALC_MAX_OPERAND_VALUE` | `1e15` | |
| Sandbox | `SANDBOX_ENABLED` | `true` | |
| | `SANDBOX_MAX_MEMORY_BYTES` | `67108864` | |
| | `SANDBOX_MAX_DURATION_SECS` | `5` | |
| | `SANDBOX_MAX_TOOL_CALLS` | `3` | |
| | `SANDBOX_MAX_SUSPENSIONS` | `1000` | |
| Memory | `AGENT_MEMORY_ENABLED` | `false` | See [Long-term memory](#long-term-memory-off-by-default) |
| | `AGENT_MEMORY_TYPES` | `preference,procedural,semantic` | Types the model may write |
| | `AGENT_MEMORY_EMBEDDING_PROVIDER` | `sentence-transformers` | Or `cloudflare` |
| | `AGENT_MEMORY_EMBEDDING_MODEL` | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` | Embedding model |
| | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | unset | Workers AI embeddings |
| Tracing | `LOGFIRE_TOKEN` | unset | Unset sends nothing |
| | `LOGFIRE_ENVIRONMENT` | unset | `staging` or `production` |
| Deferred | `QDRANT_URL`, `LITELLM_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | unset | Kept for planned integrations; no code reads them |

On the VPS the deploy sets the Logfire values from GitHub ([AI tracing settings](../../docs/development/ci-cd.md#ai-tracing-settings)).

## Run

```bash
uv sync --group dev
cp .env.example .env
uv run python -m src.main
```

To run against the local database instead of staging, see [Develop against the local database](../../docs/development/local-development.md#develop-against-the-local-database).

### Local Compose

From the repository root, start Core and this service against the shared staging databases ([Local Compose](../../docs/development/local-development.md#local-compose)):

```bash
docker compose --env-file backend/core/.env --env-file backend/ai/.env up --build
```

AI answers on `http://localhost:8001/health`; override the port with `AI_PORT`.

## Check

```bash
uvx pre-commit install
uv run ruff check --fix
uv run ruff format
uv run pytest
```

`pre-commit` runs Ruff (lint, import order and format) on commit. The live draft test runs only when asked: `RUN_LIVE_MODEL_TESTS=1 uv run pytest tests/integration_tests/test_draft_parse_live.py`.
