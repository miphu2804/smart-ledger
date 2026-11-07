### 2026-11-07 — Align quick-navigation test labels with the app

| Area | Change |
|---|---|
| Mobile | • Update the quick-navigation label expectations to Tạo đơn and Trợ lý Bobi; keep runtime labels, routes and behavior unchanged |

Check: `npm ci`, `npm test` (196 passed, 0 failed), `npm run typecheck`, mock-mode `npm run export:web` and `git diff --check` passed. Native Firebase files were not supplied; native and GA4 device verification were not performed. Commit: the commit that adds this entry.

### 2026-11-06 — Mobile usage analytics in GA4 behind a consent prompt

| Area | Change |
|---|---|
| Mobile | • `@react-native-firebase/analytics` 26.4.0 with `firebase.json` turning off automatic collection, advertising IDs and automatic screen reporting; Android blocks `AD_ID` and iOS builds without IDFA<br>• `AnalyticsConsentPrompt` asks once per device right after sign-in, and Settings has a "Gửi số liệu sử dụng" switch; nothing is sent until the user agrees, and withdrawing resets on-device Analytics data<br>• Screen views from expo-router segments with `[id]` kept as is, the Core account id as `user_id`, and the events in `analyticsEvents.ts`: `login`, `shop_created`, `sale_completed`, `voice_order_reviewed`, `ai_message_sent`, `product_created`, `expense_created`, with enum or count parameters only; the web build sends nothing |
| Docs | • ADR-0010, `BR-026`, `FR-039`, `NFR-011`, `AC-119`–`AC-121` as proposed and awaiting approval; Data safety adds device IDs and the Google Analytics processor row with the checks the legal owner still has to make; the mobile README explains DebugView |

Check: `npm run typecheck` passes; `npm test` 194 of 196 pass, and the two failures (`parseOrder` shared names, quick navigation labels) fail the same way on a clean `staging` checkout. Not verified: a native build, the consent dialog on a device, and events in DebugView. Commit: the one that adds this entry.

### 2026-11-06 — Add shared documentation skills for agents

| Area | Change |
|---|---|
| Agent tooling | • Add project-scoped `technical-writing`, `writing-for-agents` and `retro` skills with pinned hashes in `skills-lock.json`; expose Claude links through `.claude/skills` symlinks to `.agents/skills` |

Check: `npx skills list --json` shows all three project skills for Claude Code, Codex, GitHub Copilot, Pi and Zed; `git diff --check`. No runtime changes. Commit: the one that adds this entry.

### 2026-11-06 — Docs describe SmartLedger as running in production, are in English outside product and carry OKF frontmatter

| Area | Change |
|---|---|
| Docs index | • All 31 documents in `docs/` start with OKF v0.2 frontmatter (`type`, `title`, `description`, `owner`, `status`, `generated`, `stale_after`); the owner and last-update rows left the metadata tables<br>• `docs/index.md` lists every document for agents and replaces the hand-kept document map in `docs/README.md`; a one-off script built the indexes and was then removed, so agents keep them by hand under the `AGENTS.md` rules<br>• `AGENTS.md` requires docs to change in the same pull request as the code, refreshed dates, an updated index and no new document for a topic that already has one |
| Docs language and index | • Every document outside `docs/product/` is in English: technical design, API contracts, the ADRs, design, marketing, the READMEs under `docs/`, the frontend READMEs and `BLOCKERS.md`; anchors changed with the headings and 79 links across the repository were rewritten (0 broken)<br>• The index also covers 23 repository documents outside `docs/` (service READMEs, `backend/core/docs/`, `CONTRIBUTING.md`, `SECURITY.md` and others) with frontmatter, uses strict OKF entries (title, path and description) and gives every folder with two or more entries its own `index.md`<br>• `generated.by` names the person who last changed a document (`human:<GitHub login>`, from Git history for untouched documents) and every timestamp uses `+07:00`; `AGENTS.md` and the docs conventions state the rules<br>• Fixed on the way: the frontend README no longer says web admin has no Core API, the mobile README no longer lists Google sign-in as missing, and the ADR-0003 link to a missing anchor |
| Docs | • `AGENTS.md`, the docs index, technical design, API contract, ERD description, diagram guide and the mobile README say SmartLedger runs in production and no longer call it documentation-first; the architecture is called the target architecture<br>• Stacked on #550: the product documents keep its EXE201 course MVP priorities and wording, gain frontmatter and index entries, and its new audit and demo documents are listed in `docs/product/index.md`; the EXE201 priority paragraph in technical design §1 is translated to English<br>• Warnings about provisional requirements, unaccepted features and the auth gap stay as they were |

Check: `grep -rniE "\bMVP\b|prototype|documentation-first"` over the Markdown files; the remaining hits are scope or priority labels, dated decisions (ADRs, open questions, the mobile UI migration plan), design prototype references and the diagram label "MVP target" in `architecture.drawio`, left because its SVG and PNG would need a re-export. Commit: the one that adds this entry.

### 2026-11-06 — Tập trung hoàn thành MVP môn EXE201

| Area | Change |
|---|---|
| Docs | • Chốt ưu tiên demo đầu-cuối, UX và phản hồi người dùng; phân biệt luồng cốt lõi, chức năng có sẵn giữ nguyên và mở rộng có thể hoãn<br>• Thêm kịch bản demo/fixture và mẫu ghi kết quả; đồng bộ overview, BRD, PRD, bản đồ docs và cách đọc tài liệu kỹ thuật/audit; không yêu cầu đầu tư thêm cho tải lớn hoặc kiến trúc mới |

Check: 377 link/anchor nội bộ hợp lệ, giữ nguyên 55 FR/NFR và 120 định nghĩa AC so với commit trước, full trace khớp; đối chiếu fixture 70.000đ doanh thu/42.000đ giá vốn/18.000đ lãi sau chi và kiểm tra không có diff runtime. Demo/người dùng chưa chạy trong đợt sửa docs, mẫu kết quả để chưa thử. Commit: commit thêm mục này; giữ log cũ theo yêu cầu append-only.

### 2026-11-06 — Kiểm định lại BRD bằng ba chuyên môn

| Area | Change |
|---|---|
| Docs | • Viết lại BRD theo mục tiêu, vai trò, phạm vi và quy tắc; tách inventory/code và truy vết chi tiết sang phụ lục kiểm định với 13 phát hiện<br>• Sửa AC-020/021/078 và mô tả privacy, Zalo, nhóm nợ; phân biệt context/lịch sử, local/Core, lưu Product/ảnh từng phần và cam kết xóa dữ liệu; không sửa runtime |

Check: ba sub-agent rà độc lập Core, AI/chat và mobile/web, sau đó đọc lại bản sửa; kiểm 153 link/anchor nội bộ, 55 dòng trace, 120 mã AC ổn định (chỉ sửa nội dung AC-020/021/078), mã BO/BR/OQ cũ được giữ và `git diff --check`. Chưa chạy runtime/provider/UAT. Commit: commit thêm mục này; giữ log cũ theo yêu cầu append-only.

### 2026-11-06 — Đối chiếu business requirements với staging

| Area | Change |
|---|---|
| Docs | • Rà tĩnh Core, AI, mobile và web tại staging `494fa6c`; bổ sung bản đồ tính năng và bằng chứng code trong BRD<br>• Nối đủ 55 FR/NFR với nguồn BRD và AC hiện có; sửa mô tả voice, Zalo, avatar, tồn và media lỗi thời; ghi câu hỏi cần sản phẩm chốt, không đổi AC hoặc nâng scope từ mock/code |

Check: kiểm tra 104 liên kết/anchor nội bộ, mã BRD, 55 dòng truy vết và 120 định nghĩa AC giữ nguyên; `git diff --check`. Chưa chạy runtime/provider/UAT vì chỉ sửa tài liệu. Commit: commit thêm mục này. Giữ nguyên log cũ theo yêu cầu append-only của phiên làm việc.

### 2026-11-06 — Stop spans from asking HoneyHive to create their session

| Area | Change |
|---|---|
| AI | • `Observability.start` turns off the SDK's `_session_auto_create` flag, which `skip_backend_session_creation` turned on: every span asked HoneyHive to create its session, and a span arriving after a session update often replaced the session that `start_turn_session` had opened with a bare one (source `api`, start time 0, no inputs), so after #542 production still showed 8 of 9 turns that way<br>• A new test runs a real tracer in test mode and checks that a turn's span carries its session id without the auto-create attribute |

Check: `uv run pytest tests/unit_tests -q` (496 passed, 1 skipped), `ruff check` and `ruff format --check`; the new test fails without the fix. Against real HoneyHive: with a session update before the span, the flag on gave 6 of 8 bare sessions and the flag off 0 of 8; five streamed turns through the local service (uvicorn, local database, OpenAI direct) read back bare 5 of 5 before the fix and complete 5 of 5 after it (source, start time, question, `history_ms`, child spans). Not verified: production after deploy. Commit: the one that adds this entry.

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
