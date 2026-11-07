### 2026-11-07 — Clean README front pages and old document metadata

| Area | Change |
|---|---|
| Docs | • READMEs outside `docs/` no longer carry frontmatter, so GitHub opens them on the title instead of a metadata table; `AGENTS.md` and the docs conventions record the rule<br>• The root README reads as a production overview again: the course-scope paragraph is gone, the boundaries table regains a Runs on column, and the repository layout is a directory tree checked against `staging`<br>• Eighteen documents move from the old `generated: { by: human:… }` field to `author:`, and seven documents (the product set, technical design, API contracts and marketing) fold their metadata table under the title into one intro sentence; BRD, PRD and the product overview no longer label themselves as the EXE201 MVP |

Check: every directory in the layout tree exists on `staging` `a1245a1`; relative links in the edited front pages resolve; no `generated:` field remains in tracked Markdown; `git diff --check` passed. Rendering on GitHub was not checked.

### 2026-11-07 — Link onboarding to owned guides and local checks

| Area | Change |
|---|---|
| Docs | • Route code changes through service READMEs and owned guides; keep technical-writing manual and model checks distinct from runtime tests<br>• Require owning-document and local-index updates in contributor guidance; use Node 22.18+ in the 22.x line for frontend setup and link the Web guide to that prerequisite |

Check: local documentation paths and anchors resolve apart from the existing illustrative `relative/path` placeholder; `git diff --check` passed. No runtime, native or deployment checks apply to these guidance-only edits. Commit: the commit that adds this entry.

### 2026-11-07 — Restore architecture and delivery diagrams (#555)

| Area | Change |
|---|---|
| Docs | • Restored the target architecture, CI/CD, VPS network, Dopbase backup, sign-in and APK release diagrams with their draw.io sources; replaced the Dopbase host and Vercel domains with generic labels and re-exported those two SVGs<br>• Drew the staging and production app stacks in `ci-cd.drawio` as one Production | Staging box, aligned Caddy with Core, added Cloudinary for product images, grouped the Supabase databases and alert channels into titled boxes and rerouted edges so none cross or pass through an icon or title<br>• Restored the root README tech stack and system architecture sections and the diagram explanations in CI/CD, without addresses or server paths<br>• The diagram guide now allows topology drawn from tracked `deploy/` files and keeps domains, IPs, server paths, credentials and access procedures private<br>• Fixed 20 claims that a code check found stale in the API contracts, technical design, AI runtime reference, Mobile operations, Web README and development guides, and pinned every diagram export to a white background<br>• Rendered the Mermaid diagrams to white SVGs from `.mmd` sources, and rewrote the PRD functional requirements, AI runtime reference and Mobile operations guide in terms of behavior instead of class, function and file names; the CI/CD diagram now names each service's role instead of its port |

Check: internal links and anchors in 48 changed Markdown files resolve; `git diff --check` passed; no domain, IP or server path remains in the diagrams, README or CI/CD guide; the three edited diagrams were rendered and inspected, and `validate.py` reports no edge crossing in `ci-cd.drawio`; network claims were checked against `deploy/*/compose.yaml`. Commit: the commit that adds this entry.

### 2026-11-07 — Re-review fixes for documentation boundaries (#555)

| Area | Change |
|---|---|
| Docs and tooling | • The catalog `BIGINT` test now reads the AI draft reference instead of the API contract, which keeps only implemented endpoints<br>• `scripts/secrets/credential_map.py` writes to `~/.smartledger/credential-map/` outside Git and `.gitignore` blocks HTML snapshots in `docs/development/credential-map/`<br>• Restored original document authors, defined `author` as the writer, added a screenshot capture manifest, embedded the logical architecture Mermaid in the diagram guide and corrected AI logging, session ID, draft result and expense-status statements found by a source check |

Check: AI `uv run pytest` 541 passed, 80 skipped; internal links and anchors in 48 changed Markdown files resolve; `git diff --check` passed. The Mermaid render and the credential-map script run against Dopbase were not verified. Commit: the commit that adds this entry.

### 2026-11-07 — Source-verified documentation and private operations boundary (#555)

| Area | Change |
|---|---|
| Docs | • Reconciled three independent fresh-context reviews against staging `a2766ee`; corrected reports, ADMIN contracts, AI authorization/privacy/persistence and current schema boundaries<br>• Removed unimplemented API/schema plans from current references; separated AI architecture from runtime detail<br>• Removed published demo access values, environment credential snapshots and deployment/network diagrams; private infrastructure and access procedures now point to the owner's external knowledge base, while privacy safeguards remain |

Check: 72 Markdown documents and 715 internal links passed path/anchor/index/frontmatter checks; DBML matches 25 Core and 4 AI tables. All 14 walkthrough diagrams and the logical architecture rendered; the three changed walkthrough exports were updated. AI auth/observability tests: 37 passed. TypeScript token comparison confirms all three source-file edits are comment-only. BRD and nine ADR statuses are unchanged; PRD changes only diagram navigation. Live environments, private knowledge-base completeness, full secret scanning and Git-history removal were not verified or performed. Commit: the commit that adds this entry.

### 2026-11-07 — Production-first documentation and local ownership (#555)

| Area | Change |
|---|---|
| Docs | • Audited the actual tracked tree at staging `a2766ee`; separated production operation from EXE201 delivery scope and implementation/enablement/deployment/acceptance<br>• Made landing pages domain-oriented, kept local indexes, moved service detail into owned Core/AI/Mobile guides, and preserved technical safeguards, dated decisions and rollout evidence<br>• Aligned root/Mobile instructions, English technical prose and lean OKF/plain authors; reconciled source facts and resolved obsolete merge/assignment blockers without claiming live acceptance |

Check: internal paths/anchors, immediate-child index/frontmatter consistency and root navigation reachability passed; BRD/PRD stayed byte-identical, API contract body changed only link targets, all nine ADR decision statuses stayed intact, `config.ts` matched the baseline after removing comments, and `git diff --check` passed. Mobile typecheck passed; `npm test` had 192 pass/2 fail, reproduced with the same failures on baseline `a2766ee`. Source inventory and verification evidence are in the PR. Live deployment, provider/device UAT and acceptance were not verified. Commit: the commit that adds this entry.

### 2026-11-07 — Fix stale setup, CI and mobile docs against the code

| Area | Change |
|---|---|
| CI | • Path-filter table and deploy notes match `changes.sh`, `upload-settings.sh`, `infra-run.yml` and `deploy-backend.yml`: settings come from Dopbase, `container-images` runs only for the `containers` area, and `VPS_*` and the runner token names are the ones the workflows read |
| AI | • `MODEL_FALLBACKS` is documented as `protocol:model`, as in `app_config.py` |
| Honeyhive | • The sync workflows load keys from Dopbase `ai/production`, not repository secrets |
| Mobile | • Sample sign-in, test script, guide steps, Zen ring and Home/Analytics data source match the code |
| Web | • Bobi brand image names match `frontend/web/public/brand` |

Check: each changed claim was checked with grep, `ls` and a read of the cited code at `f2be945`; no build or script was run. Left alone: `backend/core/**` (Core is out of scope under AGENTS.md) and the `github.sh` step in ci-cd. Commit: the one that adds this entry.

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
