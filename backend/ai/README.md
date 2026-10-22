# SmartLedger AI

Internal AI API called only by Core, which proxies its public `/api/v1/agent/*` routes here. The service exposes `/health`, `POST /internal/v1/agent/chat`, `POST /internal/v1/agent/chat/stream` (Core relays it as `POST /api/v1/agent/chat/stream`, see [Streaming chat](#streaming-chat)), list/detail/rename/delete routes under `/internal/v1/agent/conversations`, and `GET`/`PUT /internal/v1/agent/memory/settings` for the owner's [long-term memory](#long-term-memory-off-by-default) switch. The agent can read the current shop's profile, categories, products, sales, debts, payments received and expenses through read-only SQL tools. Chat history is stored in PostgreSQL. PostgreSQL connects lazily on the first request that needs it, and the Redis client connects at process start; an unreachable or unreadable database URL is logged, does not stop the service, and makes database routes answer `503 ai_unavailable`. Every `/internal/v1` route requires the shared `X-Internal-Token` header. There are no invoice or expense endpoints.

Frontend must not call this service.

## Chat history schema

The AI schema (chat history, the `vector` extension and the `ai_read` views) lives in the Supabase CLI migrations at [`supabase/migrations/`](../../supabase/migrations/); the first file is a baseline that folds the earlier AI migrations together. It reads Core's tables, so run Core's Flyway migrations first. On the shared dev/staging database, push only after the pull request merges (see [Database migrations](../../README.md#database-migrations)). From the repository root:

```bash
set -a && . ./.env.staging && set +a
npx supabase@2.119.0 db push --db-url "$POSTGRES_URL"
```

`db push` applies only the files not yet recorded in `supabase_migrations.schema_migrations`. Every baseline statement is safe to re-run, so it also applies over a database that already had the old `backend/ai/migrations` files. Add a change as a new file (`npx supabase@2.119.0 migration new <name>`); never edit a file that has been pushed.

The AI service does not create or migrate tables at startup. `ai_request_id` remains nullable; its foreign key is deferred until the `ai_requests` table is installed. For vectors, the baseline only enables the `vector` extension ([ADR-0001](../../docs/architecture/adr/0001-vector-store-pgvector.md)); the only table with embeddings is `agent_memories`, created by the [long-term memory](#long-term-memory-off-by-default) migrations.

## Chat context

Each chat turn sends the static system prompt, then the conversation's latest `AGENT_HISTORY_TURNS` owner and assistant exchanges verbatim, except that each earlier answer's ```actions block is removed (default 30 turns, that is 60 messages, oldest first), then the new owner message. Older messages do not reach the model. The conversation history is never summarized: no summary model folds it, nothing runs on it after a turn and there is no history search tool. With [long-term memory](#long-term-memory-off-by-default) on, a separate background step extracts and merges memory facts, never the history. Owners chat little; 30 turns at the 2000-character input cap keep one request well inside a 100k-token context window.

`AgentConversationRepository.recent_messages(conversation_id, user_id, shop_id, limit)` reads the history. It first checks that the conversation belongs to that user and shop; otherwise the request fails with `404 conversation_not_found`.

### Long-term memory (off by default)

`AGENT_MEMORY_ENABLED=true` turns on the [ADR-0002](../../docs/architecture/adr/0002-agent-long-term-memory.md) memory, which is not product behavior until the PO approves it. It needs both memory migrations ([`agent_memories`](../../supabase/migrations/20261014000000_agent_memories.sql), then [`agent_memory_visibility`](../../supabase/migrations/20261015000000_agent_memory_visibility.sql)) and an embedder, picked by `AGENT_MEMORY_EMBEDDING_PROVIDER`:

- `sentence-transformers` (default) runs `AGENT_MEMORY_EMBEDDING_MODEL` in this process and needs `uv sync --group memory`; the Docker image leaves that group out, so there the flag logs an error and stays off.
- `cloudflare` calls Workers AI's OpenAI-compatible `/v1/embeddings` with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, so no local model is needed. Workers AI takes only the text, so `WorkersAIEmbeddingModel` (`src/memory/workers_ai_embedding.py`) adds the model's query and document prompts (embeddinggemma's are built in) and cuts the vector to the column's 384 dimensions. Owner messages and facts are sent to Cloudflare to be embedded.

Either way, vectors are cut to `EMBEDDING_DIMENSIONS` (384, the migration's size), which only a Matryoshka-trained model such as embeddinggemma survives. Changing the model leaves stored vectors in the old model's space: clear or re-embed `agent_memories` first. When on:

- Before the model answers, `AgentMemoryService.with_memories` embeds the owner's message with the configured Pydantic AI `Embedder`, searches the owner's unexpired memories, scoped to the request's shop and user (`src/memory/repository.py` loads, `src/memory/ranking.py` ranks): the 20 nearest by cosine plus the 20 best BM25 matches of the message over unaccented syllables, ranked by cosine + 0.1 × BM25 share of the best (no decay, importance or use count; see [the recall benchmark](evaluation/memory_recall/README.md)), and places the top five, each dated in shop time and typed, before the message under "Earlier facts from this owner", as Tencent's Agentic RAG prompt does. The model calls no tool, and the stored message is the owner's redacted message without the memories. A failed search answers without memories.
- After a turn is saved, `AgentMemoryService.remember` asks the chat model for up to five durable facts the owner stated (the model reads the owner's message and the answer, and the prompt allows only the owner's words), with today's date so "last week" becomes a date, and embeds them. Facts that replace no recalled memory are checked, as in Hy Memory's reconcile, against up to three live memories each with cosine 0.6 or more that the turn did not recall: one model call marks each fact `new`, `replaces` one of those ids, or `known` (dropped); with no such memory there is no call, and a failed call keeps the facts. The rest are appended. It then compresses the owner's memories older than 7 days, as Tencent does: each conversation's memories from one shop day are merged by the chat model into one to five facts that replace them in one transaction, keep the latest date and carry `metadata.summarized_from`, so they are not merged again. At most three such groups per turn. It runs in the background; a failure is logged and never fails the turn.
- Deleting a conversation deletes the memories it produced, summaries included (`ON DELETE CASCADE`).

Visibility and control, after Sakana Chat's "My Fish" (migration [`20261015000000_agent_memory_visibility.sql`](../../supabase/migrations/20261015000000_agent_memory_visibility.sql), applied after the first one):

- Each recall sets `last_used_at` and adds to `use_count`, which the owner sees; neither ranks memories.
- The extraction model sees the recalled memories as `[id] fact` and may set `replaces` on a fact that corrects one. The id is accepted only if that turn recalled it. The old row gets `superseded_by` and stops being recalled; deleting the newer fact's chat sets it back to NULL, so the old fact returns.
- Only the types in `AGENT_MEMORY_TYPES` (default `preference,procedural,semantic`) are extracted; summaries keep their sources' types by prompt only, the code screens them just for phone numbers; facts holding a Vietnamese phone number are dropped, including from summaries.
- Up to ten live `preference` memories (most important, then newest) lead every turn whatever the message, ahead of the five searched ones, which never repeat them: a preference such as "answer in tables" rarely resembles the question it should shape. This follows the always-loaded `MEMORY.md` of Cognition's [agent memory repo](https://cognition.com/agent-memory-repo).
- When memories are recalled, the stream sends a `memory` event before the first `delta`, each memory with its `source_conversation_id` and `created_at`, so the app can open the chat it came from (see the [stream contract](../../docs/contracts/api-contracts.md#stream-trả-lời-chat)).
- `GET`/`PUT /internal/v1/agent/memory/settings` read and set the owner's switch in `agent_memory_settings` (on when no row). Off stops recall and writes, deletes nothing. When the service is not built, `GET` answers `available: false` and `PUT` answers `409`.

Each new owner message is followed, after a cache breakpoint, by the current shop time (`get_time` in `src/utils.py`, Asia/Ho_Chi_Minh), which is never stored, so the static instructions and the history stay a cacheable prefix.

`chat_conversations.summary` and `summary_through_message_id` still exist, because the AI baseline migration created them. The code neither reads nor writes them. They are kept so the previous release can roll back, and a later migration drops them after this deploy.

The agent runs on [Pydantic AI](https://ai.pydantic.dev/). `build_chat_model` in `src/providers/factory.py` builds the model from `MODEL_PROVIDER`, which names the API the model speaks: `openai` (`OpenAIResponsesModel`, `/v1/responses`; OpenAI reasoning models reject function tools on `/v1/chat/completions`), `openai-chat` (`OpenAIChatModel`, `/chat/completions`) or `anthropic` (`AnthropicModel`, `/v1/messages`). Every model shares `OPENAI_API_KEY` and `OPENAI_BASE_URL`, so one gateway such as [OpenCode Go](https://opencode.ai/docs/go/) (`https://opencode.ai/inference/go/v1`) serves all three; a blank `OPENAI_BASE_URL` means the OpenAI default, and `anthropic` requires it set. `MODEL_FALLBACKS` lists `provider:model` entries, as JSON, tried in order through a `FallbackModel` when the previous model fails; a fallback starts with what is left of `AGENT_TURN_TIMEOUT_SECONDS`, so it helps mostly with fast failures (HTTP errors, rate limits). OpenCode Go rejects a request without an `x-opencode-session` header, so each agent turn and draft parse runs with `session_settings` from the factory: the session is `conversation-<id>` (a one-off id for a conversation's first turn, each draft and each memory extraction or summary) and the User-Agent is `smartledger-ai/<version>`. The default model is Claude Haiku 5.5 (`anthropic`, `claude-haiku-5-5`) on OpenCode Go. `MODEL_REASONING_EFFORT` (default `medium`) sets `openai_reasoning_effort` for the `openai` and `openai-chat` models, where `none` is sent as is, and `anthropic_effort` for `anthropic`, where `none` leaves the model default.

## Shop data tool (read-only SQL)

When `AI_SQL_READER_URL` is set, the agent gets a `query_shop_data` tool that runs one model-written `SELECT` against the current shop's profile, categories, products, sales, sale items, debts, payments and expenses. Without it the agent still chats, only without that tool and without `suggest_restock`. There is no SQL HTTP endpoint.

Five layers keep the query inside the current shop and read-only:

1. **Role.** The baseline creates the `NOLOGIN` group role `ai_sql_reader`, which has only `USAGE` on schema `ai_read` and `SELECT` on its views (five in the baseline, three more from `20261016000000_ai_read_ledger_views.sql`, eight in all), and no grant on Core's tables.
2. **Views.** `ai_read.v_shop_profile`, `v_categories` and `v_products` filter on the transaction setting `smartledger.shop_id` and do not expose `shop_id`; an unset setting returns no rows. They are `security_barrier` views, so a failing filter cannot quote another shop's row in its error. `v_sales` and `v_sale_items` follow the same rule and deliberately leave out customer snapshots (PII) and the free-text `void_reason`. `v_debts`, `v_payments` and `v_expenses` (migration `20261016000000_ai_read_ledger_views.sql`, which needs Core's Flyway migrations through V9) follow the same rule; debts and payments are scoped through their sale. They leave out customer names and phone numbers (only the opaque `customer_id`, for counting customers), transfer references, the users who received or recorded money, the free-text expense description, and archived expenses.
3. **Guard.** `SqlGuard` in `src/sql/guard.py` parses the SQL with `sqlglot` and accepts exactly one `SELECT` (with `WITH` and `UNION`) over those views. Functions and cast types come from an allowlist, so `set_config`, `current_setting`, `pg_*` and `dblink` are rejected along with `information_schema`, `pg_catalog`, base tables, `FOR UPDATE`, `SELECT INTO`, DML, DDL, `SET` and `COPY`. The statement that runs is the guard's own rendering, wrapped as `SELECT * FROM (...) q LIMIT n`.
4. **Execution.** `ShopDataRepository` in `src/sql/repository.py` borrows a connection from its own `PostgreDBClient` pool for `AI_SQL_READER_URL` (at most `SQL_POOL_MAX_SIZE` connections, default 2), runs one `READ ONLY` transaction, sets `smartledger.shop_id` from the authenticated request as a bound parameter, applies `SQL_TIMEOUT_MS` (default 3000) and `SQL_ROW_LIMIT` (default 100) and cuts text cells at 200 characters. The scope, timeout and search path are transaction-local, so a connection goes back to the pool without them, and the read-only flag is reset on return. The guard's SQL is sent without bind parameters (`no_parameters`), so `:name` or `%` in it is never read as a placeholder. The tool reads the shop from the Pydantic AI run context (`RunContext[AgentContext]`, filled from the run's `deps`); the model only passes `sql`, and a call with any other argument is sent back for a retry without running.
5. **Output.** Results reach the model as data with a header saying so. The guard and the repository raise `ValueError("CODE: reason")` for a query the guard or the database rejects, and the tool returns it as `Error[CODE]: reason` (for example `Error[UNSAFE_FUNCTION]`, `Error[QUERY_TIMEOUT]`, `Error[SQL_ERROR]`) so the model can rewrite it. Any other failure, such as an unreachable reader database, a full pool or an unconfigured reader, propagates and fails the turn with `503 ai_unavailable`.

All prompt templates live in `src/prompt_templates/` (`shop_agent.py`, `app_guide.py`, `sql_agent.py`, `restock.py`, `calculation.py`, `draft_parse.py`, `memory.py`). Short tool results and guardrail retry notes stay next to their code (`src/agent/tools.py`, `src/agent/guardrails/`). Prompt text is English and static; the agent always answers the owner in Vietnamese.

### Agent guardrails

`AgentService` calls one `GuardrailService` facade (`src/agent/guardrails/service.py`), which holds the limits and applies the [Pydantic AI Harness guardrails](https://pydantic.dev/docs/ai/harness/guardrails/) around each Pydantic AI run, in order: a length check on the owner's latest message (`AGENT_MAX_INPUT_CHARS`, default 2000) stops the turn before any model call; `InputRedaction` (`input_redaction.py`) runs the Harness secret detector and then its personal-data detector on the owner's message before the model sees it, replacing API keys, bearer tokens, JWTs, private keys, IBANs, card numbers that pass the Luhn check and emails with `[redacted:<name>]` (the redacted text is what gets stored; the US SSN pattern is left out because its 3-2-4 digit shape matches order codes); per-turn limits on model requests and tokens (`UsageLimits`: `AGENT_MODEL_CALL_LIMIT` 4, and `AGENT_TURN_TOKEN_LIMIT` 200000 input plus output tokens across the turn's requests), a turn time limit (`GuardrailService.run_limits`, `AGENT_TURN_TIMEOUT_SECONDS` 35, below Core's 40 s read timeout so a turn Core gave up on is not stored; with long-term memory on, the recall runs before this clock starts, so a slow embedder can still let a JSON turn be stored after Core gave up) and tool calls (the `ToolCallLimit` capability in `tool_call_limit.py`, `AGENT_TOOL_CALL_LIMIT` 3), where a call over the limit is refused and the tools are hidden so the model answers from what it already has; and a Harness `OutputGuardrail` running `AnswerScreen.check` (`answer_screen.py`), which sends an empty answer, or one that leaks view names, scope settings, error codes or SQL, back to the model with a `retry` verdict so it answers again. Each retry is a model request, so the request limit bounds the retries.

A guardrail that stops the turn raises `GuardrailError` (`run_limits` raises it for a run stopped by a limit), which the service maps to `422 {"detail": "<code>"}` and for which nothing is stored: `input_too_long` for an over-long message, `answer_unavailable` when the run reaches the request or token limit or the screen still rejects the answer after its retries, `answer_timeout` when it passes the time limit. Each answered turn logs its token usage so the token limit can be sized from real traffic; the defaults are provisional until the PO approves them. The service holds no owner-facing text; the app maps each code to its own copy. Core forwards these `422` codes as its own error `code` and turns any other non-404 AI error into `503 ai_unavailable`. All checks are deterministic: there is no model-based safety check, human approval step or LLM query checker, because each adds a model call and the guard plus the read-only role already bound what a query can do.

Push the baseline as a user with `CREATEROLE` (first run only) and the `search_path` that holds Core's tables, then create the login the service uses. Keep the password in the environment's secrets, never in Git:

```sql
CREATE ROLE smartledger_ai_reader LOGIN PASSWORD '<secret>' IN ROLE ai_sql_reader;
ALTER ROLE smartledger_ai_reader SET default_transaction_read_only = on;
```

```bash
AI_SQL_READER_URL=postgresql://smartledger_ai_reader:<secret>@<host>:5432/<db>
```

Phase 1 covers the shop profile, categories, products, sales and sale lines (`sale_status` `CONFIRMED` and `VOIDED`), debts, payments and ACTIVE expenses. Customer names and contacts, expense descriptions, refunds and stock-in history are not exposed yet.

## Streaming chat

`POST /internal/v1/agent/chat/stream` runs the same turn as `POST /internal/v1/agent/chat` and answers with `text/event-stream`. The request, pre-stream status codes, events and `done` body are defined in the [API contracts](../../docs/contracts/api-contracts.md#stream-trả-lời-chat); this section covers how the service produces them.

- `AgentService.stream_chat` runs the history read and the input check before it yields anything, so a pre-stream failure raises before any byte is sent. The turn then runs through `agent.iter()`, and each model response is read with `stream_text(delta=True)`. `run_stream` is not used: it stops at the first final-looking output and skips later tool calls and the retry loop.
- The Harness `OutputGuardrail` sees only the final output, not delta text. `AnswerScreen.screened_prefix` therefore releases only the prefix that no continuation can turn into a `LEAK_PATTERN` match. It holds back a short tail, and anything after a `select` that could still start a `select … from` match, until that match is ruled out or 400 characters have passed. `AnswerScreen.check` still runs in the output guardrail on every complete answer, so a rejected answer is retried.
- The service sends `reset` when shown text must be discarded: a model response followed by a data tool call, or an answer the screen rejected and the model retried. Text a response writes before calling only `suggest_screen` is part of the answer, not a preamble: the screen checks it, the stream keeps it, and the next response's text follows it after a blank line, as in the stored answer. Before `done`, it releases the rest of the final answer; if the text already shown is not a prefix of that answer, it sends `reset` and then the whole answer. The text after the last `reset` therefore equals the stored answer.
- Nothing is saved unless the run completes. A guardrail stop raises `GuardrailError` from the iterator, with the same codes, timeout and limits as the JSON route. Closing the stream early, for example when the caller disconnects, cancels the run; a disconnect that lands while the exchange is already being written cannot stop that write.
- Core relays this route as `POST /api/v1/agent/chat/stream`; see [Stream trả lời chat](../../docs/contracts/api-contracts.md#stream-trả-lời-chat).

## Restock suggestions

When `AI_SQL_READER_URL` is set, the agent also gets a `suggest_restock` tool. It takes one argument, `period`, and returns the tracked ACTIVE products whose stock is below the cover the policy aims for, most urgent first: each item carries a suggested quantity and a short Vietnamese reason. It changes nothing.

- Only confirmed sales count: the service sums `v_sale_items.quantity` for rows whose `sale_status = 'CONFIRMED'` fall in the requested window, joins them to `v_products` and keeps tracked ACTIVE products. Voided sales are excluded.
- A product is suggested only when `ceil(sold_qty / days * COVER_DAYS - max(stock_qty, 0))` is positive, where `days` is the length of the requested period; stock below zero counts as zero. A shop whose stock already covers the period gets no suggestions.
- `COVER_DAYS` in `src/restock/policy.py` is the only tunable. It currently defaults to 7 days, and the periods `last_7_days` (the period `RESTOCK_PROMPT` tells the model to use when the owner names none; the tool's `period` argument has no default) and `last_30_days` are likewise provisional: all three await product-owner sign-off and are not yet agreed product behaviour.
- The service runs one fixed `SELECT` through the same guard and shop-data pool (`ShopDataRepository`) as `query_shop_data`, so the shop scope, statement timeout and row cap apply unchanged. The candidate list is capped at the fastest-selling rows the row cap returns, and the result flags when that cap was hit so the agent can say the list is partial.
- `RestockSuggestion.reason` is a fixed Vietnamese sentence built from the period's sales and the current stock; the agent copies `suggested_qty`, `unit` and `reason` verbatim rather than recomputing them.

## Calculations and the sandbox

When `CALC_ENABLED` is set (default on), the agent also gets a `calculate` tool so it computes arithmetic instead of doing sums in its head. The model sends an ordered list of steps over a closed operation set (`add`, `subtract`, `multiply`, `divide`, `percentage` — `a` is the percent of `b` — `round` half-up with `digits` 0–6, `min`, `max`), and any step after the first may pass `$` for the previous step's result. The tool is an agent option injected like the others: the composition root builds `CalculationService` from `CALC_MAX_OPERATIONS` (20 steps per call) and `CALC_MAX_OPERAND_VALUE` (1e15, inside float's exact integer range) in `src/calculation/`, a framework-free package. A rejected plan returns `Error[CODE]: reason` (`DIVISION_BY_ZERO`, `BAD_OPERATION`, `OPERAND_TOO_LARGE`, `RESULT_TOO_LARGE`, `TOO_MANY_OPERATIONS`, `INVALID_NUMBER`) for the model to fix; the reported result is rounded to 6 decimal places and the step trail stays raw as the audit. The defaults are provisional and await PO sign-off.

When `SANDBOX_ENABLED` is set (default on, needs the `codemode` extra of `pydantic-ai-harness`; without it the sandbox turns itself off and the service still runs), the agent gets one more tool, `run_code`: the model writes a Python program that runs in the [Monty](https://github.com/pydantic/monty) sandbox and may call `query_shop_data` and `suggest_restock` from inside the code, so multi-step work over shop data costs no extra model turns. `Sandbox` (`src/sandbox/wrapper.py`) is a thin wrapper around the Harness Code Mode capability and the only module that imports it; the agent receives it injected, and the tool names it folds in are the `tools` of `SandboxLimits` (main.py supplies `query_shop_data` and `suggest_restock`; unregistered names match nothing). Folded tools leave the model-facing tool list, so with the sandbox on the model reaches shop data only through `run_code`. Monty starts only when a turn actually contains a `run_code` call — plain chat, `calculate` and screen buttons never touch it.

- Each `run_code` snippet is bounded by `SANDBOX_MAX_DURATION_SECS` (5 s of execution; time awaiting a nested tool does not count) and `SANDBOX_MAX_MEMORY_BYTES` (64 MiB of Monty heap): an allocation past the heap raises `MemoryError` inside the snippet, and Code Mode returns it to the model as a retry, so a runaway program costs a retry, not a worker. `SANDBOX_MAX_TOOL_CALLS` (3) bounds nested tool calls per snippet and `SANDBOX_MAX_SUSPENSIONS` (1000) bounds cumulative host interactions. The heap value limits the sandbox only, not the AI process: the OS or container limit stays the last bound.
- The `ToolCallLimit` guardrail counts `run_code` as one call; calls nested inside a snippet do not count against `AGENT_TOOL_CALL_LIMIT` (verified against the harness 0.55), so `SANDBOX_MAX_TOOL_CALLS` is kept at the guardrail's value: a snippet cannot multiply the database load the guardrail bounds. Raise both settings together if a snippet legitimately needs more calls. One snippet is one `tool_start`/`tool_end` pair, whatever it called inside.
- The prompts match the tools the model actually has: `CALC_PROMPT` (calculate) is appended whenever calculation is on, and the `run_code` guidance only when the sandbox is on; the SQL and restock prompts name the direct tools when it is off and the program path when it is on. The pure `calculate` tool stays callable past the tool-call limit (it does no I/O), so a turn can query the data and still run every sum through it.
- Limits and defaults are provisional and await PO sign-off.

## App guide and screen buttons

The agent always gets `APP_GUIDE_PROMPT` (`src/prompt_templates/app_guide.py`), which names the app's tabs, screens and buttons so it can tell the owner how to do something, and the `suggest_screen` tool. The tool takes one closed-set `screen` and returns its choice as `ToolReturn` metadata, which the model never reads back. After the run, `AgentService` appends the accepted screens, deduplicated and capped at two, to the answer as a ```` ```actions ```` block, and strips that block from stored answers before replaying history. The block format is in the [API contract](../../docs/contracts/api-contracts.md). Keep the prompt in step with the mobile routes when a screen moves or is renamed.

## Text drafts

The async `DraftService.parse(shop_id, mode, text)` in `src/drafts/service.py` turns an owner's text or STT transcript into a `DraftView` without `request_id`, which the endpoint assigns. It changes nothing: no sale, expense or stock is written. The endpoint `/internal/v1/drafts/parse` and audio belong to #3; this module is the text step it calls.

- `SALE` loads the shop's ACTIVE catalog through `ProductCatalogRepository` (`src/drafts/catalog.py`), puts `id | name | unit` into the prompt, and the model returns lines with `product_id`, `qty`, `confidence` and an `ambiguous` flag through native structured output (`NativeOutput(DraftOutput)`).
- `src/drafts/matching.py` then decides, without I/O: an id outside the shop catalog, an ambiguous line, no match, or `confidence` below `MIN_MATCH_CONFIDENCE` (0.7, a provisional default) leaves `product_id`, `unit` and `unit_price` as `null` and adds a Vietnamese warning. A kept line takes name, unit and price from the catalog row; a price the owner says is ignored.
- `EXPENSE` skips the catalog. Each expense is one line with `qty = 1`, the description in `name` and the amount in `unit_price`; a missing amount stays `null` with a warning.
- Every model failure, invalid model output, missing model or catalog failure raises `DraftUnavailableError`, which the planned endpoint (#3) is to map to `503 ai_unavailable` so Core falls back to manual entry.
- The Vietnamese text set (typos, no diacritics, abbreviations, ambiguous and unknown items) runs against the configured real model only when asked: `RUN_LIVE_MODEL_TESTS=1 uv run pytest tests/integration_tests/test_draft_parse_live.py`.

## Tracing (Logfire)

When `LOGFIRE_TOKEN` is set, `src/observability.py` configures [Pydantic Logfire](https://logfire.pydantic.dev/docs/) at startup and traces every Pydantic AI agent run: one `invoke_agent` span per turn with a `chat` span per model request and an `execute_tool` span per tool call, carrying timing, model, token counts, tool names, errors and `metadata.shop_id`. Spans are recorded with `include_content=False`, so the owner's question, the history, the answer, tool arguments (the model's SQL) and tool results never leave the service; a test (`tests/unit_tests/test_observability.py`) checks a traced turn and a failed model call for them. Only the tool descriptions and schemas are sent. `LOGFIRE_ENVIRONMENT` (`staging`, `production`) separates the environments in one Logfire project. Logfire reads `LOGFIRE_SERVICE_VERSION` from the environment itself and shows it on each trace. On Railway the deploy sets all three from GitHub ([AI tracing settings](../../docs/development/ci-cd.md#ai-tracing-settings)). A blank token configures nothing and sends nothing; stdout logging is unchanged either way, and an unreachable Logfire only prints a warning at startup. FastAPI requests are not instrumented, because Logfire's FastAPI integration records endpoint arguments, which include the message.

## Internal authentication

`INTERNAL_API_TOKEN` is the credential shared with Core. Callers send it in the `X-Internal-Token` header; a missing or wrong value returns `401 unauthorized`. An unset or blank token fails closed, so every `/internal/v1` route returns `401` while `/health` keeps answering. Core sends the header from its own `INTERNAL_API_TOKEN`, so both services must hold the same value. Keep the staging and production values in those environments' secrets.

## Routes and database access

`src/main.py` is the composition root. It builds one `APIRouter` with prefix `/internal/v1` and the `X-Internal-Token` dependency, includes each flow's router under it, and mounts it on the app. Today the only flow router is `src/agent/router.py` (prefix `/agent`) for chat, conversation CRUD and the memory settings. Every `/internal/v1` route inherits the token check. A new flow adds one include line there; the planned `/internal/v1/drafts/parse` is not implemented yet.

`main.py` maps `ConversationNotFoundError` to `404 conversation_not_found`, `GuardrailError` to `422` with its code, and any other unhandled exception to `503 ai_unavailable`, logging the cause; FastAPI's `HTTPException`s (`401 unauthorized`, `409 memory_unavailable`) and request-validation `422`s keep their status. The chat route is async: the agent awaits the model on the event loop, while the blocking database calls and the sync tools run in worker threads, so a slow model call holds no thread. `GET /health` is async too.

The application database (`POSTGRES_URL`: chat history and the catalog) is reached through a SQLAlchemy 2 engine (`src/infra/postgre_db_client.py`, psycopg 3 driver) whose pool holds at most `POSTGRES_POOL_MAX_SIZE` connections (default 2, min 1) with no overflow. `POSTGRES_URL` must be a `postgresql://` or `postgres://` URL; a libpq keyword string (`host=... dbname=...`) is not accepted. The default is kept low because the Supabase session pooler (port 5432) allows 15 clients in total, and Core sets no Hikari pool size, so Spring's default lets it open up to 10. The pool checks a connection before lending it (`pool_pre_ping`) and replaces broken ones, so requests do not queue on a single connection and a dropped connection recovers without a restart. Repositories map only the columns they use as declarative ORM classes (`ChatConversation`, `ChatMessage`, `AgentMemory`, `AgentMemorySetting`, read-only `Product`); Core's Flyway and the Supabase migrations own the schema, so the service never creates a table. The read-only shop-data reader (`AI_SQL_READER_URL`, same URL rule) has a second `PostgreDBClient` with its own pool of at most `SQL_POOL_MAX_SIZE` connections (default 2), so with the defaults AI holds at most 4 database connections, which still fits the session pooler's 15 clients next to Core's 10. `ShopDataRepository` runs the guard's SQL as text through that pool rather than as ORM statements.

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
