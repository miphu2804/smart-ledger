---
type: Architecture Decision
title: "ADR-0009: Trace every Agent chat turn to HoneyHive, redacting sensitive data first"
description: "Accepted for AI: HoneyHive traces each Agent chat turn with redacted content; Core correlation still needs owner approval."
owner: project owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-06T22:18:48+07:00 }
---
# ADR-0009: Trace every Agent chat turn to HoneyHive, redacting sensitive data first

- **Status:** Accepted for the AI part; the code was merged into `staging` through PR #467. The Core correlation part in section 4 is still Proposed and needs a separate owner approval under [AGENTS.md](../../../AGENTS.md#scope).
- **Date:** 2026-11-01
- **Owner:** the project owner decides to send chat content to HoneyHive; the AI service owner keeps the code and tests.
- **Related:** [`NFR-007`, `NFR-008`](../../product/product-requirements.md), [ADR-0006](0006-deterministic-agent-guardrails.md), [ADR-0008](0008-bifrost-owns-routing-and-fallback.md), [AI README](../../../backend/ai/README.md#observability), [`src/observability.py`](../../../backend/ai/src/observability.py), [eval suite](../../../backend/ai/evaluation/agent_chat/README.md).

## 1. Context

When the shop owner reports "chat is slow" or "the answer is wrong", the team needs to replay that turn's exact question, the SQL the model wrote, the tool results and the answer, and needs to compare two prompt versions on the same set of questions. A trace with only timing and tokens cannot answer "why is it wrong".

Logfire previously ran with `include_content=False`. HoneyHive replaces Logfire because it combines traces, sessions, experiments and evaluators in one place, and it accepts Pydantic AI's OpenTelemetry spans without custom code for each span.

## 2. Decision

### 2.1. Content in the trace

- Pydantic AI runs with `include_content=True` and `include_binary_content=False`: spans contain the system prompt, the question, the history, the SQL, the tool results and the answer, but no images or audio.
- `NFR-008` allows customer names and phone numbers to reach HoneyHive, and only HoneyHive. Bifrost keeps `disable_content_logging: true`.
- There is no environment variable to turn content off. To turn it off, change the parameters in `Observability.start` and deploy, or delete `HH_API_KEY` to turn tracing off entirely.

### 2.2. Guardrails run before the trace

`InputRedaction` ([ADR-0006](0006-deterministic-agent-guardrails.md)) replaces keys, tokens, card numbers, IBANs and emails in the question with `[redacted:<name>]` before the session opens and before the model runs. The redacted version is what the model sees, what is stored in the history and what HoneyHive receives, so the history and memory sent in later turns are also redacted.

| Content source | Passes the guardrail | Note |
|---|---|---|
| The shop owner's question | Yes, `InputRedaction` | Phone numbers are not redacted, because the model needs the real number to look up |
| History and memory | Yes, because they are stored from the redacted version | |
| SQL and tool parameters | Not needed | The model writes them from the redacted question |
| Tool results | No | The `ai_read` views have no customer names or phone numbers; `v_shop_profile` has the shop's own number |
| The answer | No | An answer rejected by `AnswerScreen` still stays in the span |

FastAPI is not instrumented, because the HTTP span would record the unredacted body.

### 2.3. One session per chat turn

`AgentService` opens a session after `InputRedaction` and closes the session when there is an answer. The session id is set locally in OTel baggage, so the chat turn does not wait for HoneyHive and concurrent requests do not mix sessions.

| When | Sent to the session |
|---|---|
| Open | the redacted `inputs.question`, `user_properties.user_id`, `metadata.shop_id`, `metadata.conversation_id`, `metadata.model`, `metadata.prompt_version`, `metadata.git_sha` |
| Close | `outputs.answer`, `metrics` including input tokens, tokens read from cache, output tokens, the number of model calls, the number of tool calls, and `first_text_ms` for a streamed turn: the time from when the turn arrives to the first text the shop owner sees, including memory recall and a lead-in sentence discarded by `Reset` |
| Error | `metadata.error`: a guardrail code such as `answer_timeout`, the exception type name, or `cancelled` when the shop owner closes the stream |
| After saving the first turn | the new conversation's `metadata.conversation_id` |

`prompt_version` is the first 12 characters of the SHA-256 of the instructions and tool definitions, so sessions can be filtered, or two evals compared, by prompt without naming versions by hand. `git_sha` is the commit that `deploy-backend.yml` passes into the image, so a new bug can be separated by release. Memory runs in the chat turn's context, so its spans join the same session and carry `shop_id` like the chat spans; the embedding span is also traced. The recall result has its own `memory recall` span (event_type `tool`, `AgentMemoryService._recall`): `inputs.question`, `outputs.memories` (id, content, memory_type, score), `metrics.recalled_count` and `metadata.shop_id`, so you can read which memories entered the prompt without inferring it from the embedding span. A turn that is not sampled or has no session does not create this span. Drafts do not open a session, and the SDK drops spans that have no session. `HH_SAMPLE_RATE` (default 1) sets the share of turns that are traced; a turn outside the sample does not open a session, so the SDK drops all of its spans. Each session update waits for the session to be created, up to 5 seconds, because HoneyHive drops an update for a session that does not exist yet; the SDK returns `None` instead of raising an error when session creation fails, so the app logs a `WARNING`. A session update is a blocking HTTP call, so it runs on two dedicated threads instead of the default thread pool that the DB calls use. The SDK logs one `WARNING` for each span dropped because it has no session; turns outside the sample and drafts do this on purpose, so the app filters that line. When the app shuts down, `lifespan` waits for memory writes to finish for up to 10 seconds and then cancels what is still running before closing the DB pool, waits for session updates for up to 10 seconds, flushes the spans still in the queue for up to 5 seconds, and then shuts down the tracer. `deploy/vps/compose.yaml` gives the AI container 60 seconds to stop, because an open stream can run up to the 35-second limit before the steps above; Docker's default of 10 seconds would kill the process before the flush. Tracing starts in `lifespan` and not at import, and tests clear `HH_API_KEY`, so running tests sends nothing to HoneyHive.

### 2.4. Eval and evaluators

- [`evaluation/agent_chat`](../../../backend/ai/evaluation/agent_chat/README.md) runs the real agent on a fake shop with `honeyhive.experiments.evaluate`, 3 times per question, and records the model, `prompt_version` and `suite_version` (a hash of the cases and the seed) on every row so two runs can be compared. The seed has orders at 00:30 and 23:30 shop time, discounts, cancelled orders, debts paid in part or in full, and one discontinued product, so a timezone bug or a missing filter makes the answer wrong. Cases with a number are graded with SQL on the source tables; cases graded by meaning (minimum stock, out of scope, best-selling items) are graded by a model against written criteria.
- The online evaluators live in code in [`.honeyhive`](../../../.honeyhive/README.md), following HoneyHive's config-as-code structure: one Python evaluator grades every rejected `query_shop_data` call, and the other evaluators grade the session's `outputs.answer` when the answer exposes a view name, SQL or a tool name, gives a number without calling any tool, uses Markdown that the prompt forbids, has a chart block that the app cannot draw, or is not written in Vietnamese. They grade the session and not the agent span, because a turn that ends early after the screen button has no output on the agent span; HoneyHive regrades the session when the answer arrives later (checked on 2026-11-01). The `sql-parse-check` evaluator (HoneyHive's SQL Parse Check template) grades whether the `inputs.tool_arguments.sql` of each `execute_tool query_shop_data` parses as PostgreSQL. There is no online LLM judge, because it would send the shop owner's question and answer through HoneyHive to another model provider, outside the data flow that `NFR-008` allows. The offline eval suite `backend/ai/evaluation/agent_chat` runs locally with the tracer off, grades client-side (including the Tool Usage, Failure Recovery, Answer Faithfulness, Context Relevance and Tool Trajectory templates through the Bifrost alias of `--judge`) on the fake shop, and then only syncs the scores to HoneyHive following "Sync Offline Evaluations": each case is one session of the experiment run, with no spans. Three daily alerts (p95 chat turn above 20 seconds, query error rate above 20%, more than 5 failed turns not counting cancelled turns), only on traffic whose `source` is `production`, also live there, email the project members, and are created with a control plane key that the AI service does not read.
- User feedback is not done, because it needs a Core API and mobile UI.

## 3. Rejected options

- **Keep Logfire with `include_content=False`:** it cannot answer why an answer is wrong, and it has no experiments to compare prompts.
- **Redact at the trace boundary by wrapping HoneyHive's exporter:** the model would still see the original data, and it depends on the SDK's internal code. Pydantic AI has no hook that transforms content, and OTel's `_on_ending` runs when the span attributes are already locked.
- **Run `InputRedaction` on tool results:** it would catch an email or card number mixed into shop data, but it changes what the model sees; the current views have no such column.
- **Bifrost's guardrails:** an enterprise feature that runs after the span is created.
- **Langfuse:** removed from the configuration; HoneyHive covers the same need.

## 4. Correlation with Core (Proposed)

Core does not yet send `traceparent` to AI and does not write the trace id into its logs. Proposal: Core generates a `traceparent` for each call to AI and writes the trace id into its logs, and AI accepts that context. This touches Core, so it needs the project owner's approval; until it is approved, AI keeps the default.

## 5. Consequences and risks

- Customer names and phone numbers that the shop owner types sit on HoneyHive for the retention period of the plan in use. The legal obligations for personal data have not been reviewed; `AGENTS.md` requires an official source, a responsible person and explicit approval.
- The free plan limits the number of events per month; a turn with memory and one tool call creates about 8 events (the `memory recall` span adds exactly 1 event per turn that has a recall), not counting session updates, and one full eval run creates a few hundred. When traffic nears the limit, lower `HH_SAMPLE_RATE` on production.
- Cost on HoneyHive is 0 and there is no path yet to bring Bifrost's cost there: HoneyHive does not compute prices itself, the session `Cost` is the sum of the `metadata.cost` that the application sets on child events ([Session Aggregations](https://docs.honeyhive.ai/v2/tracing/aggregation-logic)), and Bifrost computes the cost of each request but only writes it to its logs, without returning it in the response or a header. Prices live in only one place, Bifrost (its synced price table, plus `governance.pricing_overrides` in `deploy/vps/bifrost.json` for models the table lacks, currently `mercury-3`), so look at cost in Bifrost or the provider invoice; bringing it to HoneyHive would need reading Bifrost's `GET /api/logs/stats` with an admin account, a credential decision that has not been approved.
- If HoneyHive is slow or down, the chat turn still answers; only that turn's session fields and spans are lost.
- Stdout logs at INFO and WARNING level record only the tool name, the call id, lengths, error codes or error types; SQL, tool results, error reasons and memory tracebacks exist only at DEBUG, so do not turn on DEBUG on staging or production.
- The `spans` fixture in `test_observability.py` builds its own `InstrumentationSettings`; a separate test locks the parameters that `Observability.start` passes in.

## 6. Verification

- `tests/unit_tests/test_agent_chat_evaluation.py`: each template evaluator maps the right fields and runs only for the matching cases (fake judge), memory writes are blocked, the sync payload contains no spans and keeps `datapoint_id` stable, and the order is create run, log session, complete run.
- `tests/unit_tests/test_observability.py`: content is in the span, media is not, an email is redacted before it enters the span, the session opens with the redacted question and closes with the answer and tokens, a streamed turn records `first_text_ms`, a timed-out turn and a closed stream record `metadata.error`, a turn outside the sample sends nothing, a rejected session logs a `WARNING`, a message rejected by a guardrail does not open a session, a hung HoneyHive does not hold the chat turn, the flush sends session updates before spans and then shuts down the tracer, every call matches the real SDK signature, two concurrent turns keep their own sessions, and INFO logs contain no chat turn content. The `memory recall` span carries the question, the recalled memories and `recalled_count`, is still created when recall fails, and is not created when the turn has no session.
- Real turns on `smartledger-local-db` (2026-11-01): the session has `git_sha`, `first_text_ms` and the `internal-leak` score; a timed-out turn has `metadata.error = answer_timeout`; the memory span carries `shop_id`; the embedding span is present. A session that received an answer exposing SQL after 3 seconds was graded `internal-leak = True`.
- Local OTLP byte capture (2026-11-01): the question, SQL, tool results and answer are present; emails and card numbers are redacted.
- Not checked: real traces on staging and production.

## Sources

Read on 2026-11-01: [HoneyHive docs](https://docs.honeyhive.ai/v2), the `honeyhive` 1.8.1 SDK source (`tracer/core/context.py`, `tracer/processing/span_processor.py`), [Pydantic AI instrumentation](https://ai.pydantic.dev/logfire/).
