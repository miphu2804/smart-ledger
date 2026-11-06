---
type: Guide
title: "SmartLedger AI service architecture"
description: "Canonical AI runtime settings, model routing, data boundaries, safety controls and operational checks."
owner: AI owner
author: miphu2804
status: stable
stale_after: 2027-01-05T22:18:48+07:00
---
# SmartLedger AI service architecture

This AI-owned guide is the canonical documentation owner for runtime settings and implementation boundaries, backed by `src/app_config.py` and composition in `src/main.py`. Source review: `staging` commit `a2766ee3a37e23c0f03fd43383b608c1b2fac898`; measured numbers retain their original evaluation context and were not remeasured. An implemented code path, a default-off flag, a configured environment and an accepted or deployed feature are different states; this page does not infer deployment or product acceptance.

## Service composition

`src/main.py` builds the application, PostgreSQL history repository, optional Redis history cache, model factory, optional tier router, read-only shop-data repository, calculation service, Monty sandbox, optional memory service and observability. Core supplies the authenticated user/shop context and the internal token; the model cannot choose either tenant.

## Chat history and context

- History is never summarized: older messages than `AGENT_HISTORY_TURNS` (default 30 exchanges) simply do not reach the model. 30 turns at the 2000-character cap fit a 100k-token window.
- The current shop time (`Asia/Ho_Chi_Minh`) follows the new message after a cache breakpoint and is never stored, so instructions and history stay a cacheable prefix.
- `AgentConversationRepository.recent_messages` checks the conversation belongs to the user and shop before reading it.
- With `REDIS_URL` set, the repository keeps each conversation's latest messages in Redis for 24 hours, keyed by conversation, user and shop, so a repeat turn skips the database read; `save_exchange` updates a cached entry after it commits, `delete_conversation` removes it, and an unset or unreachable Redis makes every turn read PostgreSQL. Start a local one with `docker run -d --rm --name smartledger-local-redis -p 127.0.0.1:6379:6379 redis:7-alpine redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru` and set `REDIS_URL=redis://127.0.0.1:6379/0`.
- `chat_conversations.summary` and `summary_through_message_id` are unused and kept only so the previous release can roll back.


## Model provider and routing

`LLMFactory.create_model(alias)` reads `MODEL_ALIASES`. Each alias has a `protocol`, `model`, optional reasoning `effort` and optional OpenAI `service_tier`:

| Protocol | Provider | API |
|---|---|---|
| `openai_responses` | `OpenAIResponsesProvider` | `/v1/responses` |
| `openai_chat` | `OpenAIChatProvider` | `/chat/completions` |

The code default is `chat` → `gpt-6-luna` over `openai_responses` with `effort: medium`. An alias without an effort uses `MODEL_REASONING_EFFORT` (default `low`). `MODEL_FALLBACKS` is a JSON list of `protocol:model`; each fallback is built with the global reasoning effort (`low` by default), not the primary alias's effort. Fallbacks are mainly for direct-provider environments; Bifrost routing and fallback rules remain in `deploy/vps/bifrost.json`.

`session_settings` sends `x-bf-session-id` (`conversation-<id>` for each turn; one-off IDs for drafts/memory) and `x-bf-lh-shop-id` for log grouping. Alias `effort` and `service_tier` map to `openai_reasoning_effort` and `openai_service_tier`; supported efforts depend on the model, while service tiers are `auto`, `default`, `flex` or `priority`. An omitted tier leaves the provider default. Fallback attempts use the remaining turn timeout, so they mainly cover fast failures.

`OPENAI_API_KEY` is the shared provider or Bifrost virtual key. `OPENAI_BASE_URL` selects the OpenAI-compatible API and defaults to `https://api.openai.com/v1` when blank. Provider clients also send the key as `x-bf-vk`; OpenAI ignores that header. Through Bifrost, model IDs have no provider prefix. `mercury-3` is served by Inception through `/chat/completions`, so its alias must use `openai_chat`.

### Model tiers

When `MODEL_TIERING_ENABLED=true` and all required aliases and `TIER_CLASSIFIER_URL` are present, `LLMRouterService` classifies the request through Bifrost `/v1/decisions` and selects one alias per turn:

| Tier | Alias | Intended model |
|---|---|---|
| `SIMPLE` | `chat-simple` | `mercury-3`, `openai_chat`, effort `instant` |
| `MEDIUM` | `chat-medium` | `mercury-3`, `openai_chat`, effort `medium` |
| `COMPLEX` | `chat-complex` | `gpt-6-luna`, `openai_responses`, effort `high` |

A representative configuration is:

```json
{
  "chat": {"protocol": "openai_responses", "model": "gpt-6-luna", "effort": "medium"},
  "chat-simple": {"protocol": "openai_chat", "model": "mercury-3", "effort": "instant"},
  "chat-medium": {"protocol": "openai_chat", "model": "mercury-3", "effort": "medium"},
  "chat-complex": {"protocol": "openai_responses", "model": "gpt-6-luna", "effort": "high"}
}
```

If tiering is off, the classifier URL is blank, or any tier alias is missing, every turn uses `chat`. Memory always uses `chat`. Classification runs beside memory recall and waits at most `TIER_CLASSIFIER_TIMEOUT_SECONDS` (default 1.5 seconds); an error, timeout or refused answer selects `chat-complex` for that turn. A conversation retains its highest successful tier for one day of inactivity in process memory; a restart causes classification again. A fallback classification is not retained. The model is selected once, so all tool calls in that turn use it. The classifier records its own plain-HTTP model span; it is not an agent tool call.

## Read-only shop data

`query_shop_data` and `suggest_restock` exist only when `AI_SQL_READER_URL` is configured. The separate login is a member of the `NOLOGIN` `ai_sql_reader` role, which has `SELECT` only on the eight `ai_read` views. Views filter on the transaction setting `smartledger.shop_id`; an unset setting returns no rows and the views omit sensitive customer/contact and transfer-reference fields.

The SQL guard rejects statements over 4000 characters, accepts exactly one `SELECT` over the allowlisted views/functions through `sqlglot`, re-renders it with `LIMIT`, and the repository runs it in one `READ ONLY` transaction with a bound shop ID, statement timeout, row cap and 200-character text-cell cap. A rejected query returns an `Error[CODE]` for the model to correct; connection and other operational failures fail the turn with `503 ai_unavailable`. Refunds, stock-in history and customer contacts are not exposed.

## Restock suggestions

`suggest_restock(period)` returns tracked ACTIVE products below cover, most urgent first, each with a suggested quantity and a fixed Vietnamese reason. It changes nothing.

- Only `CONFIRMED` sales in the period count.
- Suggested quantity is `ceil(sold_qty / days * COVER_DAYS - max(stock_qty, 0))`, shown only when positive.
- `COVER_DAYS` (7, in `src/restock/policy.py`) and the periods `last_7_days` and `last_30_days` are provisional.
- It runs one fixed `SELECT` through the same guard and pool as `query_shop_data` and flags a list cut by the row cap.


## Guardrails and answer safety

`GuardrailService` applies deterministic checks around each run:

| Check | Setting (default) | Result |
|---|---|---|
| Input length | `AGENT_MAX_INPUT_CHARS` (2000) | `422 input_too_long` before a model call |
| Model calls | `AGENT_MODEL_CALL_LIMIT` (4) | `422 answer_unavailable` |
| Turn tokens | `AGENT_TURN_TOKEN_LIMIT` (200000) | `422 answer_unavailable` |
| Turn time | `AGENT_TURN_TIMEOUT_SECONDS` (35) | `422 answer_timeout` |
| Tool calls | `AGENT_TOOL_CALL_LIMIT` (3) | Further calls are refused; the model answers with available data |
| Answer screen | `answer_screen.py` | Empty/leaking output is retried; persistent failure is `422 answer_unavailable` |

Input redaction masks keys, tokens, private keys, JWTs, IBANs, Luhn-valid cards and emails as `[redacted:<kind>]`; phone numbers are not masked. The answer screen blocks internal view names, settings, error codes and SQL. Limits are implementation defaults, not approved product requirements. Core maps other AI failures to `503 ai_unavailable`.

The final answer may contain a generated ```` ```actions ```` block only for up to two distinct `suggest_screen` buttons from the closed set `sales`, `voice_order`, `orders`, `products`, `debts`, `expenses`, `reports`. The service strips that block before replaying history.

## Calculation and sandbox

`calculate` is an optional pure in-process tool. With `CALC_ENABLED=true`, it evaluates up to `CALC_MAX_OPERATIONS` (20) steps from `add`, `subtract`, `multiply`, `divide`, `percentage`, `round`, `min` and `max`; `$` references the previous result. Every operand and result stays within `CALC_MAX_OPERAND_VALUE` (`1e15`). It performs no I/O and is exempt from the ordinary tool-call budget so arithmetic does not consume the data-tool budget.

`run_code` is a separate optional Code Mode capability. With `SANDBOX_ENABLED=true` and the `codemode` extra installed, model-written Python runs in Monty. `SANDBOX_TOOLS` is currently empty: data tools stay direct, so a normal data question does not start Monty. The sandbox is started only when the model calls `run_code`; it is not a general process or host shell.

| Limit | Setting (default) | Boundary |
|---|---|---|
| Monty execution time | `SANDBOX_MAX_DURATION_SECS` (5) | Per snippet |
| Monty heap | `SANDBOX_MAX_MEMORY_BYTES` (64 MiB) | Heap limit, not process RSS |
| Nested tool calls | `SANDBOX_MAX_TOOL_CALLS` (3) | Nested calls do not count against `AGENT_TOOL_CALL_LIMIT` |
| Host suspensions | `SANDBOX_MAX_SUSPENSIONS` (1000) | Code Mode resource limit |

The wrapper passes tool names and resource limits to Code Mode; it adds no explicit host filesystem or network permission grants. `SANDBOX_TOOLS=()` exposes no nested data tools. This describes repository wiring, not an independently verified audit of every dependency sandbox permission. The OS/container limit remains the final process boundary. The outer guardrail counts one `run_code` as one call and does not see nested calls; if tools are later folded into Monty, keep its nested-call limit aligned with the per-turn tool limit to avoid multiplying database load. Calculation and sandbox defaults are provisional, not product acceptance.

## Long-term memory and ONNX embeddings

`AGENT_MEMORY_ENABLED` defaults to `false`; this is not product behavior until ADR-0002 is approved. When enabled, memory recall and writes are scoped to the same `shop_id` and `user_id`. Recall takes up to ten `preference` memories and five best cosine/BM25 matches. After a saved turn, a background task extracts up to five allowed facts and reconciles older memories; memory failures do not fail the turn. Deleting a conversation deletes memories sourced by it. The owner's switch is stored in `agent_memory_settings`.

The code default is `AGENT_MEMORY_EMBEDDING_PROVIDER=onnx` and `AGENT_MEMORY_EMBEDDING_MODEL=models/static-mrl-int8`. `OnnxEmbeddingModel` loads `model.onnx` and `tokenizer.json` with CPU `onnxruntime`, one thread per call, no torch, and stores 384-dimensional normalized vectors. The Docker image's pinned int8 export is the static multilingual model; it adds roughly 330 MB of memory and its measured memory-evaluation recall is lower than the comparison embeddinggemma result (0.753 versus 0.861 at 384 dimensions). A missing/unreadable model turns memory off while chat remains available.

Other providers are `cloudflare` (Workers AI, sending owner text/facts outside the service) and `sentence-transformers` (requires `uv sync --group memory`, omitted from the Docker image). Memory needs `20261014000000_agent_memories.sql` and `20261015000000_agent_memory_visibility.sql`; the migration's `vector(384)` dimension must match the embedder. A failed search answers without memories, the stream emits `memory` before its first `delta`, and extracted facts containing a Vietnamese phone number are dropped. The owner's switch defaults on when no row exists; switching it off stops recall/writes without deleting data.

Vectors from different models cannot be compared. An authorized environment change must set the new embedding values and deploy before re-embedding, so memories written in between cannot keep old-model vectors. From `backend/ai` with that environment's `POSTGRES_URL` and new settings, run `uv run python -m src.memory.reembed` first as a dry run, then with `--apply`. Recall is off-target between deployment and completion; the script writes all vectors in one transaction, and rerunning with the old settings restores old-model vectors. This procedure is retained operational guidance, not authorization to change Dopbase or a shared database.

## Draft parser boundary

`DraftService.parse(shop_id, mode, text)` in `src/drafts/service.py` turns owner text or an STT transcript into a `DraftView`. It writes nothing and has no endpoint yet; the planned `/internal/v1/drafts/parse` and audio belong to #3.

- `SALE` matches lines against the shop's ACTIVE catalog; an unknown id, ambiguous line or `confidence` below 0.7 leaves the product empty with a Vietnamese warning, and a line with quantity 0 or less is dropped with one. Price always comes from the catalog.
- `EXPENSE` makes one line per expense with the amount in `unit_price`.
- Any model or catalog failure raises `DraftUnavailableError`, which the endpoint is to map to `503 ai_unavailable`.

## Streaming and persistence

The [stream contract](../../../docs/contracts/api-contracts.md#chat-answer-stream) defines the events. How the service produces them:

- History and input checks run before the first byte, so a pre-stream failure is a normal JSON error; a later failure ends the stream with an `error` event carrying the same code.
- The run uses `agent.iter()` with `stream_text(delta=True)`; `run_stream` would stop at the first final-looking output and skip later tool calls.
- `AnswerScreen.screened_prefix` releases only text no continuation can turn into a leak, holding back a short tail (up to 400 characters after a `select`).
- `reset` discards shown text when a data tool call or a retry follows it. The text after the last `reset` always equals the stored answer.
- Nothing is saved unless the run completes; closing the stream cancels the run.

## Observability

- **Logs:** stdout at `LOG_LEVEL`. At `INFO` and `WARNING`, `src/agent/tool_events.py` logs each tool call with its name, call id and the size of its arguments and result, and a rejected query, a turn without an answer or a failed memory step logs its code or error type, so server logs hold no shop data; the SQL, results and reasons, each cut to 1000 characters, and memory tracebacks log at `DEBUG` only. A tool retry logs at `WARNING`.
- **Traces:** with `HH_API_KEY` set and `HH_SOURCE=production`, `src/observability.py` sends one [HoneyHive](https://docs.honeyhive.ai/v2) span per turn, model request, tool call and memory embedding, with timing, model, tokens, tool names, errors, `shop_id` and the content, grouped into one HoneyHive session per turn. The content is the prompts, the redacted question, tool arguments, tool results and the answer, so customer names and phone numbers the owner types reach HoneyHive (`NFR-008`); raw media does not, and `InputRedaction` removes keys, tokens, card numbers, IBANs and emails before the session opens. `tests/unit_tests/test_observability.py` checks both. The session opens with the redacted question, `user_id`, `shop_id`, `conversation_id`, the model, `prompt_version` (a hash of the instructions and tool definitions) and `git_sha`, the commit the deploy workflow builds into the image, and closes with the answer and the turn's tokens, model requests and tool calls, plus `first_text_ms` for a streamed turn, the wait from the turn's arrival to the first words the owner sees, memory recall and any preamble included, so the session list reads like the chat and filters by prompt version or release. A turn that fails, times out or is cancelled instead gets `metadata.error`, the guardrail code such as `answer_timeout`, the exception type, or `cancelled` when the owner closed the stream. Each update waits for the session to be created first, up to five seconds, because HoneyHive loses an update for a session it does not have yet, and a session HoneyHive refuses logs a `WARNING`. Those updates are blocking HTTP calls, so they run on two threads of their own and a slow HoneyHive cannot hold the threads the database calls use. The tier classifier calls Bifrost's `/v1/decisions` over plain HTTP, which no agent instrumentation sees, so it records its own `tier classifier` span of type `model` inside the turn's `llm router` span, with the model and the `prompt_tokens`, `completion_tokens` and `total_tokens` Bifrost reports, which HoneyHive adds to the session's token totals and model events. Only the chat agent opens sessions; memory runs inside the chat turn's session with its `shop_id`, and a draft run has none, so the SDK drops its spans. `HH_SAMPLE_RATE` (default 1) traces that share of turns; a turn outside the sample opens no session, so the SDK drops its spans too, and the SDK's warning for each dropped span is filtered out. A turn sends about seven events, more with tool calls, against the free plan's monthly cap. Cost stays 0 on HoneyHive: it sums the `metadata.cost` the app sets on events and prices nothing itself, and Bifrost, which prices every model request, writes that cost only to its own log, so read it there (`deploy/vps/bifrost.json` holds the one price override, for `mercury-3`, which Bifrost's built-in price list lacks). Cloudflare embeddings, when selected, run outside Bifrost and have no cost record there; the default ONNX embedder runs locally. Any other `HH_SOURCE` (the default `local`, or `staging`) turns tracing off, so the free plan's monthly events stay for production. FastAPI requests are not instrumented because that would record the unredacted message. The turn waits on HoneyHive only once, before its first span, until the session exists, up to five seconds: a span that reaches HoneyHive first makes it create the session itself with source `api`, start time 0 and no inputs, which the later start does not fix. The session start goes out before the history read, so the read hides part of that wait, and `history_ms` reaches the session as a later update; a slow or down HoneyHive costs a turn at most that wait and loses only the session fields and the spans. The session fields go out through HoneyHive's sessions API with the turn's start time, because the SDK's `acreate_session` sends none and HoneyHive would then time the session from 1970 to its last span. On shutdown the app waits up to ten seconds for memory writes, cancels any still running before the database pool closes, waits up to ten seconds for session updates, flushes queued spans for up to five seconds, then shuts the tracer down; `deploy/vps/compose.yaml` gives the container 60 seconds to stop, enough for an open stream to finish first. Tracing starts in `lifespan`, not at import, and the tests clear `HH_API_KEY`, so a test run sends nothing to HoneyHive.
- **Online evaluators:** HoneyHive scores every new `query_shop_data` call for a refused query and every turn's answer, on its session, for leaked internals, figures no tool supports, forbidden Markdown, a chart the app cannot draw and a reply not in Vietnamese, with Python evaluators kept as config as code in [`.honeyhive`](../../../.honeyhive/README.md) at the repository root, together with the charts and the alerts on a slow p95 turn, on the query error rate and on failed turns, all on `production` traffic only; `sync-evaluators.sh` and `sync-dashboards.sh` there apply them, by hand or from the workflows on a merge into `main`.
- **Metrics:** `/metrics` exposes request rate, status and latency per route through `prometheus-fastapi-instrumentator`, timed to the last streamed byte, for the dashboards in `deploy/monitoring/`.

## Database and migrations

| Connection | Setting | Used for |
|---|---|---|
| Application database | `POSTGRES_URL`, pool `POSTGRES_POOL_MAX_SIZE` (2) | Chat history, memories and draft catalog |
| Shop-data reader | `AI_SQL_READER_URL`, pool `SQL_POOL_MAX_SIZE` (2) | `query_shop_data` and `suggest_restock` |

URLs must use `postgresql://` or `postgres://`; libpq keyword strings are rejected. Connections are lazy, with a 3-second connect timeout and a 5-second pool wait. An unavailable database does not stop startup but makes dependent routes unavailable. The service never creates tables. After applying the baseline, create the login used by `AI_SQL_READER_URL` as a member of the reader group; keep its password in environment secrets:

```sql
CREATE ROLE smartledger_ai_reader LOGIN PASSWORD '<secret>' IN ROLE ai_sql_reader;
ALTER ROLE smartledger_ai_reader SET default_transaction_read_only = on;
```

AI migrations live in [`supabase/migrations/`](../../../supabase/migrations/). They create chat history, the `vector` extension, read views, the reader role and memory tables. Core migrations must be applied first. On shared environments, push only from merged staging code under the repository [migration process](../../../docs/development/local-development.md#database-migrations):

```bash
set -a && . backend/ai/.env && set +a
npx supabase@2.119.0 db push --db-url "$POSTGRES_URL"
```

Create a new migration; never edit one that has been pushed.

## Configuration

`src/app_config.py` reads the environment or `.env`; blank values use defaults. The following list is the canonical volatile setting map.

| Group | Variable | Default |
|---|---|---|
| Server | `APP_TITLE` | `SmartLedger AI` |
|  | `SERVER_HOST`, `SERVER_PORT`, `LOG_LEVEL` | `0.0.0.0`, `8001`, `INFO` |
| Core | `INTERNAL_API_TOKEN` | unset; unset rejects `/internal/v1` |
| Database | `POSTGRES_URL`, `REDIS_URL` | unset |
|  | `POSTGRES_POOL_MAX_SIZE` | `2` |
| Shop data | `AI_SQL_READER_URL` | unset; data tools off |
|  | `SQL_POOL_MAX_SIZE`, `SQL_TIMEOUT_MS`, `SQL_ROW_LIMIT` | `2`, `3000`, `100` |
| Model | `MODEL_ALIASES` | `chat` → `gpt-6-luna`, responses, `medium` |
|  | `MODEL_FALLBACKS` | `[]`; fallback effort uses `MODEL_REASONING_EFFORT` |
|  | `MODEL_TIMEOUT_SECONDS`, `MODEL_REASONING_EFFORT` | `20`, `low` |
| Tiering | `MODEL_TIERING_ENABLED` | `false` |
|  | `TIER_CLASSIFIER_URL`, `TIER_CLASSIFIER_MODEL`, `TIER_CLASSIFIER_TIMEOUT_SECONDS` | unset, `typesafe/jev-latest`, `1.5` |
| Provider | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | unset |
| Guardrails | `AGENT_MAX_INPUT_CHARS`, `AGENT_MODEL_CALL_LIMIT`, `AGENT_TOOL_CALL_LIMIT` | `2000`, `4`, `3` |
|  | `AGENT_TURN_TOKEN_LIMIT`, `AGENT_TURN_TIMEOUT_SECONDS`, `AGENT_HISTORY_TURNS` | `200000`, `35`, `30` |
| Calculation | `CALC_ENABLED`, `CALC_MAX_OPERATIONS`, `CALC_MAX_OPERAND_VALUE` | `true`, `20`, `1e15` |
| Sandbox | `SANDBOX_ENABLED`, `SANDBOX_MAX_MEMORY_BYTES`, `SANDBOX_MAX_DURATION_SECS` | `true`, `67108864`, `5` |
|  | `SANDBOX_MAX_TOOL_CALLS`, `SANDBOX_MAX_SUSPENSIONS` | `3`, `1000` |
| Memory | `AGENT_MEMORY_ENABLED`, `AGENT_MEMORY_TYPES` | `false`, `preference,procedural,semantic` |
|  | `AGENT_MEMORY_EMBEDDING_PROVIDER`, `AGENT_MEMORY_EMBEDDING_MODEL` | `onnx`, `models/static-mrl-int8` |
|  | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | unset |
| Tracing | `HH_API_KEY`, `HH_API_URL`, `HH_SOURCE`, `HH_SAMPLE_RATE`, `GIT_SHA` | unset, unset, `local`, `1`, unset |
| Deferred | `QDRANT_URL`, `LITELLM_URL` | unset; no code reads them |

Operational secrets are supplied through the repository secrets process; this guide does not assert which values are configured in any environment.

## Run and check

From `backend/ai`:

```bash
uv sync --group dev
cp .env.example .env
uv run python -m src.main
uv run ruff check
uv run ruff format --check
uv run pytest
```

Use `RUN_LIVE_MODEL_TESTS=1 uv run pytest tests/integration_tests/test_draft_parse_live.py` only when live model testing is intentional. From the repository root, local Compose is documented in [Local Compose](../../../docs/development/local-development.md#local-compose). Evaluation commands and test-case ownership are in [Evaluation](../evaluation/README.md).
