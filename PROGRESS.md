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

### 2026-11-04 — Readable eval output and a simpler eval README

| Area | Change |
|---|---|
| AI | • `evaluation/core/render.py` renders a `Table` to the terminal with rich and to markdown; the eval report prints a progress bar, a per-case table and a metrics table with bounds and PASS or FAIL<br>• A run logs `WARNING` and above unless `--verbose` or `LOG_LEVEL` is set; `--model ALIAS` runs the agent on another alias while the judge keeps `chat`<br>• A run gates on the evaluation's own `thresholds.toml` by default; `--gate` picks another file |
| Docs | • The three evaluation READMEs are rewritten short: the plain command first, options after, then the files to touch for common changes |

Check: unit tests 456 passed, ruff check and format pass; `uv run evaluation/run.py memory` with no flags shows 5 PASS rows and exits 0, recall 0.8601516427969671, local database rows equal before and after; a stricter `--gate` file exits with `gate failed: recall: 0.86 < 0.99`; `agent_chat --dry-run` prints no INFO line and the same plan as before. Not verified: a paid `agent_chat` run with `--model`. Commit: the one that adds this entry.
### 2026-11-04 — Chat turns pick their model by complexity

| Area | Change |
|---|---|
| AI | • With `MODEL_TIERING_ENABLED=true`, TypeSafe Jev rates each turn through Bifrost's `/v1/decisions` and the turn runs on `chat-simple`, `chat-medium` or `chat-complex` (planned as `mercury-3` low, `mercury-3` high, `gpt-6-luna` xhigh), so easy questions answer fast; off by default, every turn stays on `chat`<br>• The rating runs beside memory recall; an error, a timeout past 1.5 s or a refusal runs `chat-complex`, a conversation keeps the highest tier it reached and stops asking Jev once complex, and all steps of a turn use one model<br>• HoneyHive sessions carry `tier`, `tier_alias` and `tier_mechanism` next to the turn's real `model` |
| Deploy | • `bifrost.json` adds the `typesafe` provider (`TYPESAFE_API_KEY`, no retries), lets `vk-ai` use `jev-latest`, and limits `inception` to chat completions, which is all Mercury serves |
| Docs | • ADR-0008 update on why tiers are picked in AI and not by Bifrost routing rules, AI README section on model tiers, the Bifrost key in `ci-cd.md`, regenerated credential map |

Check: unit tests 457 passed, ruff check and format pass; startup wiring checked with the four aliases set and with them missing (`tiering off`). Not verified: a real `/v1/decisions` call, `gpt-6-luna` with effort `xhigh`, Mercury in real chat, and the chat eval with tiers on. Commit: the one that adds this entry.

### 2026-11-04 — One class-based evaluation pipeline for agent_chat and memory

| Area | Change |
|---|---|
| AI | • `evaluation/run.py <evaluation>` picks `AgentChatEval` or `MemoryEval` from the `EVALS` dispatch table; `EvaluationPipeline` runs each case through the evaluation's target, then through its evaluators<br>• `metrics/` holds one evaluator class per layer (`TaskEvaluator`, `ToolUseEvaluator`, `MemoryEvaluator`, `RecallEvaluator`, `ResponseQualityEvaluator`, `SafetyEvaluator`, `PerformanceEvaluator`) and a `Judge`, as in the NexiraCopilot evaluation platform<br>• `targets/` wraps the real services, one class per file: `AgentTarget` runs the app's agent with a `WithoutMemoryWrites` proxy instead of patching `remember`; `MemoryTarget` calls `AgentMemoryService.with_memories` on the local database with a `CachingEmbedder`<br>• `agent_chat/cases.yaml` holds each case's full SQL with no templates; `memory/cases.jsonl` freezes the 2374 queries from `generate.py`<br>• The memory_recall grid-search harness is removed; the `memory` evaluation scores the shipped ranking instead of a copy of it |
| CI | • `run-eval.sh` and `start-eval-database.sh` use the new paths |
| Docs | • `evaluation/README.md` explains the layout and how to add an evaluation; ADR-0002, ADR-0008, ADR-0009, `ci-cd.md`, `.honeyhive/README.md` and the AI README point at the new paths |

Check: `agent_chat --dry-run` prints the same plan as before except `suite_version`, which moves from `7a34fe0c0744` to `f459b4c569b6` because the SQL in `cases.yaml` lost its stray indentation and trailing spaces (the expected values are unchanged); `memory --gate` gives recall 0.860, by form 0.951 / 0.899 / 0.627, stale-only 0.039, equal to the numbers ADR-0002 recorded, and leaves no row in the local database; unit tests 452 passed; ruff check and format pass. Not verified: a full paid `agent_chat` run, `--sync`, and the CI workflow. Commit: the one that adds this entry.

### 2026-11-04 — Assistant chats wait with the thought line again

| Area | Change |
|---|---|
| Mobile | • The Trợ lý screen and the quick-ask sheet show the thought line (`ThoughtLine`: rotating waiting phrases and tool step labels) again instead of the three typing dots<br>• Restored `ThoughtLine`, the waiting phrases and tool step labels with their tests; removed `TypingDots`<br>• Kept the shared `ChatComposer` and answers without the Bobi icon and label |
| Docs | • `api-contracts.md` and `AC-118` describe the thought line again |

Check: `tsc` reports no error in `src` (only the missing `@playwright/test` module in `e2e/`); `node --test tests/thinkingPhrases.test.ts tests/toolSteps.test.ts` passes 9/9. Not verified on a device.

### 2026-11-04 — Assistant chats wait with dots and share one composer

| Area | Change |
|---|---|
| Mobile | • While the first words of an answer are on their way, the Trợ lý screen and the quick-ask sheet on Đơn hàng show only three pulsing dots (`TypingDots`); the waiting phrases, timer and tool step names are gone<br>• Answers no longer start with the Bobi icon and the "Trợ lý Bobi" label<br>• The quick-ask sheet uses the Trợ lý screen's input (`ChatComposer`: type, record, send) and drops its button to the Trợ lý screen, which left no way back<br>• Unused code removed: `ThoughtLine`, the waiting phrases and tool step labels with their tests |
| Docs | • `api-contracts.md` describes the new waiting state; PRD `AC-118` |

Check: `npx tsc --noEmit` passes; unit tests 178/180, with `parseOrder` and `quickNav` failing on `staging` too; `npx playwright test` on this branch; both screens checked on the mock web build at 375×812 in the session that wrote the change. Not verified: answers from real AI and Core, and a real phone. Commit: the one that adds this entry.
### 2026-11-04 — agent_chat eval split into a package

| Area | Change |
|---|---|
| AI | • `evaluation/agent_chat/run.py` (1167 lines) is now a thin command line over `cases.py`, `scoring.py`, `judge.py`, `pipeline.py`, `reporting.py` and `honeyhive_sync.py`, laid out by role like the NexiraCopilot evaluation platform, with no behavior change<br>• `honeyhive_sync.py` and the command line are the only modules that import `honeyhive`; scoring, judging and reporting run without it<br>• The unit tests import the modules instead of loading the script from its path |
| Docs | • The agent_chat README lists the new modules and names the module that does each step |

Check: an AST comparison finds 71 of the 72 old top-level symbols unchanged, and `RESULTS` still points at `agent_chat/results`; the 69 datapoints built after the split match the ones built before byte for byte, with `suite_version` `7a34fe0c0744`; `--dry-run` prints the same plan apart from the random `session_id`; unit tests 441 passed; ruff check and format pass. Not verified: a full run with the model and `--sync`. Commit: the one that adds this entry.

### 2026-11-03 — Revenue questions on Orders open the assistant in a sheet

| Area | Change |
|---|---|
| Mobile | • Under the totals card on Orders, three chips ask Bobi about revenue (last month, this month against last month, best sellers over 7 days), like the revenue page of MoMo<br>• A chip opens a bottom sheet that sends the question through the same agent stream as the Assistant screen, shows the answer as it arrives, follow-up chips and a box to ask more; an AI error puts the question back in the box, and leaving the screen closes the sheet |
| Docs | • `AC-116` for the chips and the sheet |

Check: `tsc` passes; `node --test` 185/187 (the new `aiSuggestions` tests pass; `parseOrder` and `quickNav` fail on `staging` too); on the mock web build at 375×812 a chip opens the sheet and sends the question, follow-ups and the AI-failure path work, and opening the Assistant closes the sheet. Not checked against real Core and AI, or on a phone.

### 2026-11-03 — Sign-in screen as one card, without Facebook

| Area | Change |
|---|---|
| Mobile | • `welcome.tsx` becomes one centred card: logo, "Đăng nhập Sổ Nghe Lời", full-width "Tiếp tục với Google" and "Tiếp tục với Zalo", a "hoặc" divider, an email field with "Tiếp tục", "Quên mật khẩu?" and the footer "Chưa có tài khoản? Tạo tài khoản"; the policy link stays below the card for `AC-110`<br>• The Facebook button is gone; the Facebook sign-in code and SDK stay<br>• The method of the last successful sign-in on the device (`lastSignInStorage`: a file on the phone, `localStorage` on web) gets a "Lần trước dùng" badge<br>• The typed email reaches the password screen through `emailDraft` in memory, not a route param, so on web it never lands in the URL; `email.tsx` opens in login or reset mode from the `mode` param |
| Tests | • `tests/lastSignIn.test.ts` covers reading the stored method; `e2e/smoke.spec.ts` expects the new title and no "Facebook" text |
| Docs | • `FR-010` and the login description drop Facebook and `AC-117` covers the new screen; the mobile README follows the new labels |

Check: `tsc --noEmit` passes; `node --test tests/*.test.ts` passes 184 of 186, and the two failures (`parseOrder`, quick nav) also fail on `staging`; Playwright 4 of 4; on the mock web build at 375×812 an invalid email shows the error, a valid one opens the password screen prefilled with no email in the URL, "Quên mật khẩu?" opens the reset form prefilled, and the badge appears after a sign-in. Not verified: real Google and Zalo sign-in, and a phone. Commit: the one that adds this entry.

