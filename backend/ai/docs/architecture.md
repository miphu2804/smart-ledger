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

This guide is the canonical owner for volatile AI settings and implementation boundaries. It is checked against `backend/ai/src` at the current repository revision. An implemented code path, a default-off flag, a configured environment and an accepted or deployed feature are different states; this page does not infer deployment or product acceptance.

## Service composition

`src/main.py` builds the application, PostgreSQL history repository, optional Redis history cache, model factory, optional tier router, read-only shop-data repository, calculation service, Monty sandbox, optional memory service and observability. Core supplies the authenticated user/shop context and the internal token; the model cannot choose either tenant.

A chat turn uses the latest `AGENT_HISTORY_TURNS` exchanges verbatim, with earlier ```` ```actions ```` blocks removed. The current shop time follows the message but is not stored. `chat_conversations.summary` and `summary_through_message_id` are unused compatibility columns.

## Model provider and routing

`LLMFactory.create_model(alias)` reads `MODEL_ALIASES`. Each alias has a `protocol`, `model`, optional reasoning `effort` and optional OpenAI `service_tier`:

| Protocol | Provider | API |
|---|---|---|
| `openai_responses` | `OpenAIResponsesProvider` | `/v1/responses` |
| `openai_chat` | `OpenAIChatProvider` | `/chat/completions` |

The code default is `chat` → `gpt-6-luna` over `openai_responses` with `effort: medium`. An alias without an effort uses `MODEL_REASONING_EFFORT` (default `low`). `MODEL_FALLBACKS` is a JSON list of `protocol:model`; each fallback is built with the global reasoning effort (`low` by default), not the primary alias's effort. Fallbacks are mainly for direct-provider environments; Bifrost routing and fallback rules remain in `deploy/vps/bifrost.json`.

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

`suggest_restock(period)` is also read-only. It considers `CONFIRMED` sales, uses `COVER_DAYS=7` and the closed periods `last_7_days`/`last_30_days`, and returns a suggested positive quantity. These policy defaults remain provisional and are not product acceptance.

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

The OS/container limit remains the final process boundary. If tools are later folded into Monty, keep its nested-call limit aligned with the per-turn tool limit to avoid multiplying database load.

## Long-term memory and ONNX embeddings

`AGENT_MEMORY_ENABLED` defaults to `false`; this is not product behavior until ADR-0002 is approved. When enabled, memory recall and writes are scoped to the same `shop_id` and `user_id`. Recall takes up to ten `preference` memories and five best cosine/BM25 matches. After a saved turn, a background task extracts up to five allowed facts and reconciles older memories; memory failures do not fail the turn. Deleting a conversation deletes memories sourced by it. The owner's switch is stored in `agent_memory_settings`.

The code default is `AGENT_MEMORY_EMBEDDING_PROVIDER=onnx` and `AGENT_MEMORY_EMBEDDING_MODEL=models/static-mrl-int8`. `OnnxEmbeddingModel` loads `model.onnx` and `tokenizer.json` with CPU `onnxruntime`, one thread per call, no torch, and stores 384-dimensional normalized vectors. The Docker image's pinned int8 export is the static multilingual model; it adds roughly 330 MB of memory and its measured memory-evaluation recall is lower than the comparison embeddinggemma result (0.753 versus 0.861 at 384 dimensions). A missing/unreadable model turns memory off while chat remains available.

Other providers are `cloudflare` (Workers AI, sending owner text/facts outside the service) and `sentence-transformers` (the optional memory dependency group). Vectors from different models cannot be compared: changing provider/model requires a dry-run then applied `uv run python -m src.memory.reembed` with the new environment settings. For example, run the dry run first, then add `--apply`; the migration's `vector(384)` dimension must continue to match the embedder.

## Draft parser boundary

`src/drafts/service.py` contains a text `DraftService.parse` for `SALE` and `EXPENSE`, but there is no draft HTTP route and no AI voice/image endpoint. The planned `/internal/v1/drafts/parse` remains target scope. The mobile Android voice flow is separate: it uses on-device sherpa-onnx speech recognition and the mobile rule-based `parseOrder()` parser; it does not call this service for order recognition.

## Streaming and persistence

History and input checks run before the first byte. A pre-stream failure is normal JSON; a later failure is an SSE `error` event. The agent uses `agent.iter()` with `stream_text(delta=True)` so later tool calls are not skipped. `reset` discards text that preceded a data-tool call or retry; the stored answer equals the text after the last reset. Nothing is saved if the run is incomplete or the client closes the stream.

## Observability

`/metrics` exposes request rate, status and latency through `prometheus-fastapi-instrumentator`, timed to the last streamed byte. Logs avoid shop data at normal levels: tool names, call IDs, argument/result sizes and error codes are visible at `INFO`/`WARNING`; SQL, results, reasons and memory tracebacks are `DEBUG`-only.

With `HH_API_KEY` and `HH_SOURCE=production`, one HoneyHive session covers a chat turn and its model, tool and embedding spans. The redacted question, prompts, tool arguments/results and answer are content in the trace; raw media is not sent, but customer names and phone numbers typed by an owner can reach HoneyHive (`NFR-008`). The tier classifier records a separate model span with Bifrost-reported usage. `HH_SAMPLE_RATE` controls sampling. Any other source, including local and staging, sends no traces. HoneyHive is not the business database; runtime traces do not populate the planned `ai_requests` table.

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
