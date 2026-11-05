### 2026-11-06 — Bobi refers to itself by name only

| Area | Change |
|---|---|
| AI | • The shop agent prompt says to refer to itself only by the name "Bobi", never by a pronoun, and to address the owner as "anh/chị", because "call yourself Bobi" was read as calling Bobi: a production answer opened with "Bobi ơi", and mercury-3 answered "bạn là ai" with "Tôi", "Tớ" or "Em" in every run |

Check: `uv run pytest tests/unit_tests -q` (495 passed, 1 skipped) and `ruff check`; five chat cases through the real agent and the local database, three runs on mercury-3 medium and one on gpt-6-luna high: no answer called itself "tôi", "tớ" or "em" or opened with "Bobi ơi", and "bạn là ai" answered with "Bobi" in all runs. Not verified: "Bobi ơi" did not reproduce on the old prompt either, so the fix for it is inferred; mercury-3 still sometimes says "bạn" to the owner. Commit: the one that adds this entry.

### 2026-11-05 — Line charts, preambles in the thinking line and steadier chat sheets

| Area | Change |
|---|---|
| AI | • The shop agent prompt draws figures over time as a line chart and keeps bar charts for a few separate items, states only the key figures in words instead of listing every chart point, and reads a short or vague message as a follow-up to the last turns<br>• The `suggest_screen` docstring says the reply still names where the screen is |
| Mobile | • Text the model writes before a tool call becomes that step's label in the thinking line, at the same size and weight as the waiting phrase, instead of staying in the answer; text before `suggest_screen` stays in the answer<br>• The line chart tooltip grows to fit large amounts and stays inside the chart<br>• Quick transaction chat fades its backdrop in, keeps the conversation when a suggested screen button opens a screen and reopens on return, and puts each disclaimer sentence on its own line<br>• The Bobi history and assistant settings sheets open at one fixed height and fade their content in; memory graph labels use the app font |

Check: `uv run pytest tests/unit_tests -q` (495 passed, 1 skipped) and `ruff check`; mobile `npx tsc --noEmit` and `npm test` (192 passed, 2 failing before this change: `parseOrder`, `quickNav`). Ten chat cases on main's prompt and this one through the real agent and the local database, mercury-3 medium and gpt-6-luna high: time series now come back as line charts on both models, "chỗ nào nhỉ" gets the Quản lý → Hàng hoá path, and three more Luna runs of the chart case listed no points and named the right highest day. Not verified: a real device and the deployed models. Commit: the one that adds this entry.

### 2026-11-05 — Open each HoneyHive session before the turn's first span

| Area | Change |
|---|---|
| AI | • `Observability.wait_for_session` holds the turn before its first span until HoneyHive has the session, at most `SESSION_WAIT_SECONDS`, because a span that landed first made HoneyHive create the session itself with source `api`, start time 0 and no inputs<br>• `AgentService._prepare_turn` sends the session start before reading the history, so the read hides part of the wait, and `history_ms` moves from the start metadata to a `tag_turn` update |
| Docs | • The AI README says the turn waits once for its session |

Check: `uv run pytest tests/unit_tests -q` (495 passed, 1 skipped), `ruff check` and `ruff format --check`; the two new ordering tests fail on the old code. Three turns through the real `AgentService` with a scripted model and real HoneyHive (source `repro-fix`, from Vietnam) all read back with source `repro-fix`, a real start time, the question as input, the answer and `history_ms`; the wait cost 970 ms on a new conversation and 692 and 710 ms behind a 50 ms history read. Not verified: the wait from the production host. Commit: the one that adds this entry.

### 2026-11-05 — Think less and show a plainer thinking line in chat

| Area | Change |
|---|---|
| AI | • The `chat` alias defaults to reasoning effort `medium` and `MODEL_REASONING_EFFORT` to `low`, so turns spend fewer reasoning tokens<br>• The shop agent prompt asks for the full explanation, breakdown or steps a question needs after the answer, instead of one or two sentences |
| Mobile | • The thinking line drops the check mark and the seconds counter and rotates through 10 plain phrases, in both assistant chat and quick transaction chat<br>• The three Bobi chat header buttons fold into one menu button that opens a floating menu; the title and the button borders are gone |

Check: `uv run pytest tests/unit_tests -q` (493 passed, 1 skipped), `ruff check`, `ruff format --check`; mobile `npm run typecheck` and `npm test` (187 passed, 2 failing before this change: `parseOrder`, `quickNav`); header checked in the Expo web preview. Not verified: a real device and a live chat turn with the lower effort; the effort of the deployed aliases lives in Dopbase. Commit: the one that adds this entry.

### 2026-11-05 — Keep the shop time out of chat answers

| Area | Change |
|---|---|
| AI | • Rule 5 of the shop agent prompt and the current-time line now say the time is for working out dates only and is never written in an answer unless the owner asks what time or day it is, because low-effort tiers (`chat-simple`, mercury-3 low) appended "Giờ tại tiệm: …" to answers |
| AI eval | • Metric `no_time_echo` (gated at 1.0) flags a clock time in an answer<br>• Option `--limit N` asks only the first N `agent_chat` questions |

Check: `uv run pytest tests/unit_tests -q` (493 passed, 1 skipped), `ruff check` and `ruff format --check`; `agent_chat --repeats 1 --limit 15` with model tiering on through a local Bifrost with staging's aliases: `no_time_echo` 0.87 with the old prompt (`orders_last_month`, `revenue_today` echoed the time) and 1.00 in two runs with the new one. Not verified: the other 8 cases and 3 repeats. Commit: the one that adds this entry.

### 2026-11-05 — Read the chat hot path without a transaction

| Area | Change |
|---|---|
| AI | • `PostgreDBClient.read_session()` opens a session on an autocommit connection, so a read sends no `BEGIN` or `COMMIT` and costs the pool pre-ping and the query instead of four round trips<br>• `recall_ready`, `search` and the database branch of `recent_messages` use it; writes, `lock=True` callers and every other read stay on `session()` |

Check: `uv run pytest -q` (595 passed, 13 skipped) with `POSTGRES_TEST_URL` on a throwaway `pgvector/pgvector:pg17` container and `REDIS_TEST_URL` on a `redis:7-alpine`, both removed afterwards, `ruff check` and `ruff format --check`; a new integration test shows `read_session()` is autocommit and a later `session()` on the same pooled connection is not. A `select 1` through `PostgreDBClient` from Vietnam to the staging Supabase pooler took 167 ms p50 in `session()` and 83 ms in `read_session()`, and `session()` stayed at 164 ms afterwards. Not verified: the production gain on `memory ready`, `memory recall` and history misses. Commit: the one that adds this entry.

### 2026-11-05 — Send each HoneyHive session's start time

| Area | Change |
|---|---|
| AI | • The session opens through HoneyHive's sessions API with the turn's start time in milliseconds, because the SDK's `acreate_session` sends none: HoneyHive stored 0 and showed a turn's duration as the time from 1970 to its last span (498294 h) |
| Docs | • The AI README says why the session bypasses `acreate_session` |

Check: `uv run pytest -q` (535 passed, 79 skipped), `ruff check` and `ruff format --check`; the production session `d5af044c` read back from HoneyHive had `start_time`, `end_time` and `duration` 0 on its session event while every span was timed. Not verified: a production session after deploy. Commit: the one that adds this entry.

### 2026-11-05 — Set an OpenAI service tier per model alias

| Area | Change |
|---|---|
| AI | • An alias in `MODEL_ALIASES` takes an optional `service_tier` (`auto`, `default`, `flex` or `priority`), sent as `openai_service_tier` by both OpenAI providers, so a `gpt-6-luna` alias can run on the priority tier; an alias without one sends no tier |
| Docs | • The AI README describes the field |

Check: `uv run pytest -q tests/unit_tests/test_llm_factory.py` (21 passed), `ruff check` and `ruff format --check`. Not verified: that Bifrost forwards `service_tier` to OpenAI, and no Dopbase alias sets it yet. Commit: the one that adds this entry.

### 2026-11-05 — Re-embed stored agent memories after a provider change

| Area | Change |
|---|---|
| AI | • New `src/memory/reembed.py`: `uv run python -m src.memory.reembed` embeds every stored memory with the configured provider as a dry run, and `--apply` writes all vectors in one transaction; it refuses a vector of the wrong size, a zero vector or a non-finite one |
| Docs | • The AI README gives the order for switching an environment: set the provider in Dopbase, deploy, then re-embed; and no longer calls `sentence-transformers` the default |

Check: `uv run pytest -q` (535 passed, 79 skipped), `ruff check` and `ruff format --check`. On `smartledger-local-db` (5 memories) a dry run wrote nothing, `--apply` with `cloudflare` changed every vector (cosine about 0 against the onnx ones) and `--apply` with `onnx` restored the original vectors exactly. Not verified: a run on staging. Commit: the one that adds this entry.

### 2026-11-05 — Embed agent memory with a local ONNX model

| Area | Change |
|---|---|
| AI | • New `OnnxEmbeddingModel` (`src/memory/onnx_embedding.py`) runs the int8 ONNX export of `static-similarity-mrl-multilingual-v1` in process with onnxruntime and tokenizers, no torch, cut to 384 dimensions and normalised<br>• `onnx` is the default `AGENT_MEMORY_EMBEDDING_PROVIDER`, with the model at `models/static-mrl-int8`; a model that fails to load turns memory off instead of failing startup<br>• The Docker image downloads the model from one pinned Hugging Face revision, checked by SHA-256; `scripts/ai/fetch-embedding-model.sh` does the same for a dev machine |
| Docs | • The AI README and ADR-0002 describe the provider, its measured recall (0.753 against embeddinggemma's 0.861) and that switching provider means re-embedding the stored memories |

Check: `uv run pytest -q` (532 passed, 79 skipped), `ruff check` and `ruff format --check`; the image builds on the Mac with matching checksums and gives 384-dimension vectors in the container. Real turns on `smartledger-local-db` stored a 384-dimension unit vector and recalled it for an accented paraphrase, an unaccented question and a second memory. `ai/dev` in Dopbase now uses `onnx`. Not verified: the linux/amd64 build in CI, staging, and re-embedding the staging memories that were written with Workers AI. Commit: the one that adds this entry.

### 2026-11-05 — Statecharts of the agent chat turn and the agent memory

| Area | Change |
|---|---|
| Docs | • New `docs/architecture/statecharts/` with three charts drawn from small TLA+ models: the agent chat turn, the memory task after a turn, and one stored memory row<br>• Each chart maps its states to the HoneyHive spans and log lines they leave, and lists the rules TLC checks and what the model leaves out<br>• Linked from the docs map and the service walkthrough §8.2 |

Check: TLC checked every rule on each model with none broken (agent turn 156 states, memory task 36, memory row 6); the SVGs were rendered with Pele 1.9.0 and viewed in a browser. The models were written from the code on `staging`, not replayed against it. Commit: the one that adds this entry.

### 2026-11-04 — Cache the chat history in Redis

| Area | Change |
|---|---|
| AI | • New `RedisClient` (`src/infra/redis_client.py`), a general key-value cache that fails open when Redis is unset, down or erroring<br>• `AgentConversationRepository` keeps each conversation's latest messages in Redis for 24 hours, so a repeat turn skips the database read that cost about 200 ms from Hanoi to Singapore; `save_exchange` updates a cached entry after it commits and `delete_conversation` removes it<br>• New optional `REDIS_URL` setting |
| Deploy | • `deploy/vps/compose.yaml` runs a `redis` service in each environment's stack: pinned by digest, 64 MB cap with LRU eviction, no persistence, no published port; AI starts it through `depends_on` and gets the `dns_search: .` guard Core already had, so a down `redis` or `bifrost` name never resolves through the VPS search domain |
| Docs | • The AI README and local development guide give the local Redis command and `REDIS_URL`; `ci-cd.md` describes the `redis` service and `REDIS_URL`; the CI/CD and VPS network diagrams show Redis in both stacks; the technical design no longer says the system has no Redis |

Check: `uv run pytest -q` (587 passed, 13 skipped) with `POSTGRES_TEST_URL` on a throwaway `pgvector/pgvector:pg17` container and `REDIS_TEST_URL` on a local `redis:7-alpine`, `ruff check` and `ruff format --check`; the repository tests use an in-memory fake. Four real local turns on one conversation with `REDIS_URL` set read the history in 25 ms on the first database read and 1 ms on the next two cache hits; the credential map is regenerated. `docker compose config` accepts the stack and the pinned image starts with the same flags (`PONG`, `allkeys-lru`, no save, no AOF). Not verified: the gain in production, the playbook applying the stack on the VPS, and `REDIS_URL` in Dopbase, which must be set only after the playbook has applied this compose file. Commit: the one that adds this entry.

### 2026-11-04 — Faster memory recall on the chat hot path

| Area | Change |
|---|---|
| AI | • One `recall_ready` query replaces the switch read before recall; an owner with no live memory or with memory off skips both the embedding call and the search<br>• `search` makes one scan instead of two and no longer writes; `mark_used` records the use in the background `remember` step after the answer<br>• An in-process cache keeps the last 256 question vectors, so the Bobi sheet's repeated chips skip the embedding call; the `memory enabled` span is now `memory ready` |
| Docs | • ADR-0002 says use is recorded after the answer, in the background |

Check: `uv run pytest` (582 passed, 13 skipped) with `POSTGRES_TEST_URL` on a throwaway pgvector container that was removed afterwards, `ruff check` and `ruff format --check` pass. Real turns on `smartledger-local-db`: an owner with no memories skips recall (before: 1015 and 1753 ms), an owner with two memories recalls in 612 and 1045 ms and in 3 ms for a repeated question, and both memories got their use recorded after the answer. Not verified: production timings across the Hanoi to Singapore link. Commit: the one that adds this entry.

### 2026-11-04 — Trace the untimed steps of a chat turn

| Area | Change |
|---|---|
| AI | • HoneyHive sessions carry `history_ms`, the time to read the conversation history before the session opens<br>• New `memory enabled` and `save turn` spans time the memory switch read and the exchange save, so the turn's untraced gap splits into named steps |

Check: 475 unit tests and ruff pass; two real turns on `smartledger-local-db` recorded history 0 and 26 ms, memory enabled 81 and 3 ms, memory recall 1015 and 1753 ms, save turn 44 and 33 ms. Not verified: production timings, which need the deploy. Commit: the one that adds this entry.

### 2026-11-04 — Tier classifier tokens reach HoneyHive

| Area | Change |
|---|---|
| AI | • `BifrostTierClassifier` records each `/v1/decisions` call as a `tier classifier` span of type `model` with the model and the token counts Bifrost returns, so the session's Total Tokens and model events include the `jev-latest` call; `Observability.span` takes the event type |

Check: `uv run ruff check`, `ruff format --check` and `uv run pytest tests/unit_tests` (474 passed); the SDK's `trace` and `enrich_span` signatures read from the installed package. Not verified: the span on a real HoneyHive session, since traces run only in production. Commit: the one that adds this entry.

### 2026-11-04 — HoneyHive session charts show data

| Area | Change |
|---|---|
| AI | • The First words wait, Tool calls per turn and Unsupported figure rate charts in `.honeyhive/charts/` filter on `event_type` `session` instead of `event_name` `agent-chat`; with the old filter HoneyHive searched events other than sessions for these session metrics and drew nothing |

Check: the live chart list shows HoneyHive's own session charts filter on `event_type` `session`. Not verified: the three charts drawing data, since `sync-dashboards.sh` applies them only on a merge into `main` or a manual run. Commit: the one that adds this entry.

### 2026-11-04 — Bifrost prices mercury-3

| Area | Change |
|---|---|
| CI | • `deploy/vps/bifrost.json` adds a `governance.pricing_overrides` entry for `mercury-3` on provider `inception` at the launch price from Inception's models page, because Bifrost's synced catalog prices it only under OpenRouter and logged its requests without cost |
| Docs | • ADR-0009 §5 and the AI README say why HoneyHive shows no cost: its session Cost sums the `metadata.cost` the app sets on events, and Bifrost writes the cost it computes only to its own log, not to the response; embeddings on Cloudflare have no cost record |

Check: `bifrost.json` passes `check-jsonschema` against the `transports/v2.4.0` config schema; the override-only path for a model missing from the catalog read in `cost.go` of that tag. Not verified: a non-zero cost in a live Bifrost log, since the override applies only after deploy. Commit: the one that adds this entry.

### 2026-11-04 — Admin account menu moves to the sidebar

| Area | Change |
|---|---|
| Web | • Admin header: no subtitle under the page title and no line under the header<br>• Khách hàng and Nhật ký truy cập: the faded "dữ liệu hỗ trợ tối thiểu" and log notices are gone<br>• The avatar moves from the header to the bottom of the sidebar, under Hệ thống, as a row with name and role; clicking it opens the menu above it (email, Hồ sơ, Phiên & quyền truy cập, Đăng xuất); when the sidebar is collapsed only the avatar shows and the menu opens 240 px wide<br>• Admin labels say "chủ tiệm" instead of OWNER or "chủ cơ sở" (the role value stays `OWNER`)<br>• On desktop (1280 px and up) the sidebar column stays 72 px and the open sidebar slides over the content, which is centered up to 1200 px wide, so opening or closing it never moves the content; it starts collapsed |

Check: `npm run typecheck`, `oxlint` and `npm run build` pass; on the mock admin at 1440 × 900, 1024 × 768 and 375 × 812 the menu opens above the avatar and is not cut off. Not verified: real Core mode in a browser. Commit: the one that adds this entry.

### 2026-11-04 — LLM router call shows up in HoneyHive

| Area | Change |
|---|---|
| AI | • The tier classification call to Bifrost runs inside an `llm router` span of the turn's HoneyHive session, with the user messages as input, the tier and alias as output and the mechanism as metadata; the classifier calls Bifrost over plain HTTP, which the agent instrumentation never saw |

Check: `uv run ruff check` and `uv run pytest tests/unit_tests` (472 passed). Not verified: the span on a real HoneyHive session, since traces run only in production. Commit: the one that adds this entry.

### 2026-11-04 — User flow map follows the new sign-in and the Bobi sheet

| Area | Change |
|---|---|
| Docs | • Sign-in flow: the card from #499 (Google, Zalo, email with Tiếp tục, no Facebook), a "Quên mật khẩu?" edge straight from the sign-in screen, and the password screen with the email filled in<br>• Orders flow: the Bobi suggestion strip on Đơn hàng and a new "Hỏi Trợ lý Bobi" node for the sheet from #491, with a step that links to Trợ lý history<br>• Bobi flow: notes for the composer shared with the sheet (#505), the thought line while waiting (#513) and the five quick chips<br>• Seven screenshots retaken or added on staging: `welcome`, `email-login`, `invoices`, `ai-ask-sheet`, `chat-tro-ly-ai`, `chat-dat-cau-hoi`, `chat-tra-loi`; the README says how and which test data they show |

Check: `npm run userflow` builds the page; the onboarding and orders flows render with the new edges and node on a local server. Not verified: other browsers. Commit: the one that adds this entry.

### 2026-11-04 — Cleaner routes in the CI/CD and runtime diagram

| Area | Change |
|---|---|
| Docs | • `ci-cd.drawio` and `ci-cd.svg`: Staging and Production use the same data lanes (SQL above traces), Core and AI share one SQL lane, and HoneyHive sits under Production DB<br>• Fixed the Loki icon offset, the `7. chat` arrows into LLM providers and the DB names in the diagram guide |

Check: `validate.py` 0 errors; SVG exported with `drawio` and checked on rendered PNGs. Not verified: a dark viewer. Commit: the one that adds this entry.

### 2026-11-04 — More room between messages in the Bobi sheet

| Area | Change |
|---|---|
| Mobile | • In the "Hỏi Trợ lý Bobi" sheet on Orders, the answer has no bubble, so the open-screen button (`ScreenActions`, pulled up by `marginTop: -4` for the bubbles in `/ai`) covered the last line of the answer; it now sits 14 below the text<br>• Questions, answers and follow-up chips are 20 apart instead of 12, and the chips 10 instead of 8<br>• The scroll area reaches the sheet edges and pads inside, so the button's purple shadow is no longer cut straight at the left edge |

Check: `npx tsc --noEmit` passes; on the mock web build at 390 × 844, a low-stock question in the sheet shows "Mở Hàng hoá" below the text with an uncut shadow. Not verified: a real phone. Commit: the one that adds this entry.

### 2026-11-04 — Android builds go to R2 instead of GitHub artifacts

| Area | Change |
|---|---|
| CI | • `mobile-release.yml` no longer uploads artifacts: from 2026-11-03 the account's 500 MB artifact quota failed every Android build after Gradle had finished<br>• A build that does not publish uploads its APK or AAB to R2 as `android/<environment>/ci/<run>/<file>` (`scripts/ci/upload-build.sh`) and puts the download link on the run page<br>• `check-upload-prerequisites.sh` (was `check-publish-prerequisites.sh`) checks the R2 settings on every build and the keystore only on a publish |
| Docs | • `ci-cd.md` Android build: R2 settings for each `android-*` environment, a separate bucket for dev and staging, the lifecycle rule, and how to take the AAB to Google Play |

Check: both scripts run with a fake `aws` CLI (missing settings, publish without keystore, no CLI, AAB and APK keys, failed upload); `bash -n`; `scripts/ci/check-provider-coupling.sh`; the workflow parses as YAML. Not verified: a real run, shellcheck and actionlint (CI runs them). `android-dev` and `android-staging` have no R2 settings yet, so their builds stop at the check until a bucket and token are added. Commit: the one that adds this entry.
