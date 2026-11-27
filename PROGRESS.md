### 2026-11-23 — Plan ads on app open and in the Bobi chat

| Area | Change |
|---|---|
| Mobile | • `PlanPromo.tsx` shows a plan ad when the app opens (with "Không hiện lại hôm nay") and a "Cần hỏi Bobi nhiều hơn?" popup in the assistant once a day when today's answered questions reach the Free limit from the catalog; a 429 `ai_quota_exhausted` turns it into "Hết lượt hỏi Bobi hôm nay"<br>• Frequency rules in `src/lib/promo.ts`, saved per account (`promoStorage*.ts`): Free accounts only, never on the first app open on a device, during the guide or with a pending payment; at most once per open and 6 hours apart; ads at least 1 hour apart<br>• Same `EXPO_PUBLIC_IN_APP_PURCHASE` gate as the plan screens, so Play builds show no ads; the quick-ask sheet only counts questions<br>• `agentErrorMessage` explains `ai_quota_exhausted` |
| Docs | • PRD: the ad rules next to the mobile checkout note<br>• User flow: "Quảng cáo gói" above Tổng quan in the Quản lý flow and "Gợi ý mua gói" after Câu trả lời in the Bobi flow, captured on the mock web build |

Check: `npx tsc --noEmit` passes; `node --test` 223 of 223 including 10 new promo tests; Playwright e2e 28 of 28 including first open without an ad, the snooze tick, the plans link and the Bobi popup. Not verified: Android, a real 429 from Core (quota enforcement is off). Commit: the one that adds this entry.

### 2026-11-21 — Buy a plan from the Quản lý tab

| Area | Change |
|---|---|
| Mobile | • A "Mua gói" card under the shop card on Quản lý shows the current plan and opens `app/plans.tsx`: Miễn phí, 1 tháng and 3 tháng from Core's catalog (prices are never hardcoded), "Phổ biến nhất" on the 1-month plan, a benefits table and a pay button<br>• `app/plan-payment.tsx` shows the QR, amount, bank account and `SLP…` code from Core's stored request, counts down to `expiresAt`, re-reads the status every 4 seconds and moves through Chờ thanh toán, Đã nhận thanh toán — đang kích hoạt gói and Gói đã được kích hoạt; a pending request is kept per account so reopening continues it instead of creating a second one<br>• `EXPO_PUBLIC_IN_APP_PURCHASE` hides the card and screens in Google Play builds (Play Billing policy); empty means on for web and the self-updating landing APK<br>• Plan illustrations are SVG in `PlanArt.tsx` (Canva's AI image tool is disabled for the team); the mock Core serves the catalog and pays a request after 15 seconds |
| Docs | • PRD SePay section: mobile checkout status and the Play rule with its source<br>• FE handoff: the checkout gap is closed, quota display and chat keys remain<br>• User flow: Mua gói, Chuyển khoản and Gói đã kích hoạt in the Quản lý flow, captured on the mock web build |

Check: `npx tsc --noEmit` passes; `node --test` 213 of 213 including 12 new billing tests; Playwright e2e 25 of 25 on the mock web build including the purchase and resume flows; with `EXPO_PUBLIC_IN_APP_PURCHASE=false` the card is gone. Not verified: real Core billing on staging (gates off), a real SePay transfer, Android. Commit: the one that adds this entry.

### 2026-11-16 — Tighten the turn service and the composition root

| Area | Change |
|---|---|
| AI | • `AgentTurnService.admit` returns `(created, execution)`, without the receipt row that every caller discarded, and `_raise_safe` is annotated `NoReturn`<br>• `build_llm_router` in `main.py` is `build_tier_router`, after the `TierRouter` it builds<br>• The pass over `src/agent/service.py` found nothing worth cutting |

Check: AI Ruff lint and format passed; pytest passed 635 with 14 skipped against a disposable pgvector PostgreSQL; tests changed only call sites. The OpenAPI document, `prompt_version` with the tool names, the env var names, the log messages and the SQL text are identical to `staging` at `aa394ec2`. Commit: the commit that adds this entry.

### 2026-11-16 — Name the AI modules after what they hold

| Area | Change |
|---|---|
| AI | • Files take the name of their class: `agent/turn_repository.py`, `agent/turn_service.py`, `agent/conversation_repository.py`, `infra/postgres_client.py`, `llm/tier_router.py`, `llm/model_factory.py`, `sandbox/code_mode.py`, `calculation/operations.py`; `PostgreDBClient` is `PostgresClient` and `LLMRouterService` is `TierRouter`<br>• The four memory dataclasses live in `memory/models.py`, and `phone_number.py` moves to `src/`, so `memory` no longer imports from `agent`<br>• Logger names follow the module paths; no alert or dashboard in `deploy` or `scripts` is keyed on an old name |
| Docs | • The runtime reference, the service walkthrough, the credential map source paths and two links of the business requirements audit point at the new paths |

Check: AI Ruff lint and format passed; pytest passed 635 with 14 skipped against a disposable pgvector PostgreSQL; tests changed only imports, file names and identifiers. The OpenAPI document, `prompt_version` with the tool names, the env var names, the log messages and the SQL text are identical to `staging` at `aa394ec2`; `okf_sync.py --check` passed. Commit: the commit that adds this entry.

### 2026-11-16 — Type the turn values and the turn receipt

| Area | Change |
|---|---|
| AI | • `TurnData` in `src/agent/service.py` carries one turn's values, including the optional `save`, in place of the eight or nine positional parameters of the stream path and `_save_turn`<br>• `AgentTurnRepository.get` and `cancel` return a frozen `TurnReceipt` with a `TurnState` enum instead of a mutated row dict; the router maps it to `AgentTurnReceipt`, `_pending` builds that schema, and `AgentTurnService` has type hints |

Check: AI Ruff lint and format passed; pytest passed 635 with 14 skipped against a disposable pgvector PostgreSQL; tests changed only access syntax. The OpenAPI document, `prompt_version` with the tool names, the env var names, the log messages and the SQL text are identical to `staging` at `aa394ec2`. Commit: the commit that adds this entry.

### 2026-11-15 — Give the agent one LLM service

| Area | Change |
|---|---|
| AI | • `LLMService` in `src/llm/service.py` holds the default model and the optional tier router; it picks the turn's model, names the model a turn ran on and keeps a turn's tier, so a turn without a selection runs on the default model<br>• `AgentService` takes `llm` instead of `model` and `llm_router`; the "llm router" span and the tier tags stay in `AgentService`, and memory still uses the `chat` model |

Check: AI Ruff lint and format passed; pytest passed 549 with 100 skipped, because the PostgreSQL and Redis suites were not run, so those suites are unverified; tests changed only imports, constructor calls and attribute paths. The OpenAPI document, `prompt_version` with the tool names, the env var names and the log messages are identical to `staging` at `aa394ec2`. Commit: the commit that adds this entry.

### 2026-11-15 — Pass the agent capabilities as one list

| Area | Change |
|---|---|
| AI | • `AgentCapability` in `src/agent/tools.py` pairs one optional prompt section with its tool or Pydantic AI capability; shop data, restock, calculation, memory and run-code each have one<br>• `main.py` builds the ordered list of the capabilities that are on, and `AgentService` takes `capabilities` instead of `shop_data`, `restock`, `calculation` and `sandbox`; `memory` stays a collaborator because it recalls and remembers during the turn |

Check: AI Ruff lint and format passed; pytest passed 549 with 100 skipped, because the PostgreSQL and Redis suites were not run, so those suites are unverified; tests changed only imports and constructor calls. The OpenAPI document, `prompt_version` with the tool names, the env var names and the log messages are identical to `staging` at `aa394ec2`. Commit: the commit that adds this entry.

### 2026-11-15 — Drop the router's second turn gate check

| Area | Change |
|---|---|
| AI | • The agent router no longer checks the turn flag itself before calling `AgentTurnService`, whose `admit`, `read` and `cancel` check it first; the four turn routes still answer 503 `ai_turn_unavailable` before any repository or model call |

Check: AI Ruff lint and format passed; pytest passed 545 with 100 skipped without a database, and 631 with 14 skipped against a disposable pgvector PostgreSQL, where `test_agent_turn_receipts.py` passed 18. The four turn routes with the flag off answer the same status, body and headers as before. The OpenAPI document, `prompt_version`, the SQL text and the 17 log messages are identical to `staging` at `e0811c3e`. Commit: the commit that adds this entry.

### 2026-11-15 — Pass the receipted save to the agent service explicitly

| Area | Change |
|---|---|
| AI | • `AgentService.chat` and `stream_chat` take an optional `save` function, which `_save_turn` runs in a worker thread instead of `save_exchange`; a turn without a receipt saves exactly as before<br>• `AgentTurnService` owns the receipted save (complete the receipt, then drop the cached history, in one worker-thread call) and receives the conversation repository from `main.py`<br>• `TurnExecution` moves into `src/agent/receipts.py` without its repository, and `src/agent/turn_context.py` with the `current_turn` context variable is deleted |

Check: AI Ruff lint and format passed; pytest passed 545 with 100 skipped without a database, and 631 with 14 skipped against a disposable pgvector PostgreSQL, the same counts as before the change; `test_agent_turn_receipts.py` passed 18 before and after with only constructor calls changed. The OpenAPI document, `prompt_version`, the SQL text and the 17 log messages are identical to `staging` at `e0811c3e`. Commit: the commit that adds this entry.

### 2026-11-15 — Give the turn failure table one owner

| Area | Change |
|---|---|
| AI | • `src/agent/errors.py` holds the one table from an error to its failure code (`failure_code`) and from a stored code to its replay status (`failure_status`), with the 404 and 422 statuses and the guardrail codes declared once<br>• `AgentTurnService` and the stream error helper in the agent router call that table instead of their own copies, and the conversation and guardrail handlers in `main.py` read their status from it; no status, code or log line changes |

Check: AI Ruff lint and format passed; pytest passed 545 with 100 skipped, because the PostgreSQL and Redis suites were not run, so the receipt suite is unverified; the turn pins in `test_agent_turns.py` passed with no assertion changed. The OpenAPI document, `prompt_version`, the SQL text and the 17 log messages are identical to `staging` at `e0811c3e`. Commit: the commit that adds this entry.

### 2026-11-13 — Give the memory output shapes and diacritic folding one owner

| Area | Change |
|---|---|
| AI | • `MemoryFacts`, `MemorySummary` and `MemoryDecisions` move from `src/memory/service.py` to `src/memory/fact_rules.py`, beside the item shapes they wrap<br>• `src/memory/ranking.py` exposes `unaccented`, and the memory evaluation generator uses it instead of its own copy<br>• The agent evaluation target imports `ToolStarted` from `src/agent/tool_events.py`<br>• The Vietnamese phone number pattern `PHONE_NUMBER` moves from `src/memory/fact_rules.py` to `src/agent/guardrails/phone_number.py`, and its tests move to `test_agent_guardrails.py`; the memory rules import it and still drop every fact that holds a phone number |

Check: AI Ruff lint and format passed; pytest passed 534 tests with 100 skipped, because the PostgreSQL and Redis suites were not run. The three structured-output JSON schemas, the `terms` output and the regenerated `evaluation/memory/cases.jsonl` are identical to `staging` at `6ddf862d`.

### 2026-11-13 — Package the AI evaluation by evaluation

| Area | Change |
|---|---|
| AI | • `evaluation/core/` holds only what both evaluations share: the HoneyHive sync moves to `agent_chat/`, the one-caller `core/utils.py` is gone and the local database guard joins `core/`<br>• Each evaluation folder owns its `target.py` and evaluators, so `evaluation/targets/` and `evaluation/metrics/` are gone; the moves change only import lines<br>• A distill pass turns the stateless `EvaluationPipeline` into `run_evaluation` and corrects two comments about when the app config is read |
| Docs | • The evaluation READMEs and the AI evaluation diagram name the new paths |

Check: AI Ruff lint and format passed; pytest passed 534 with 100 skipped (the PostgreSQL suites did not run) after every step, with no assertion changed. The `run.py --help` hash, the memory dry-run plan, `src/`, the case files and `.honeyhive`, `scripts` and `.github` are identical to `staging` `866c49c6`. The `agent_chat` dry-run and real runs were not run, because the local seed is from another day. Commit: the commits on `refactor/ai-evaluation-layout` after `866c49c6`.

### 2026-11-13 — Remove the screen buttons from Mobile chat

| Area | Change |
|---|---|
| Mobile | • Chat no longer draws the screen button card under an answer; `withoutActions` still drops the ```actions block that ends answers saved before 2026-11-13, so old answers show no raw JSON<br>• The `suggest_screen` step label and its answer exemption in `preambleBefore` are gone, and the mock answer no longer carries the block<br>• `readUi` drops the `ScreenButton` element, so a stored ```ui card draws without its button, and `chatScreens.ts` is deleted |
| Docs | • `frontend/mobile/docs/operations.md` describes the hidden block |

Check: `npm test` passed 201 tests, `npm run typecheck` and `npm run export:web` passed, and the rewritten tests failed before the change. Not run on a simulator. Commit: the commit that adds this entry.

### 2026-11-13 — Give embedding its own package

| Area | Change |
|---|---|
| AI | • The ONNX and Workers AI embedding models and `build_embedder` move from `src/memory/` to `src/embedding/` (`factory.py`, `onnx_embedding.py`, `workers_ai_embedding.py`), which imports nothing from `src.memory` or `src.agent`<br>• `build_embedder` takes `dimensions`; its callers pass `EMBEDDING_DIMENSIONS`, which stays in `src/memory/repository.py` as the pgvector column width; the factory's logger name becomes `src.embedding.factory` |

Check: AI Ruff lint and format passed; unit pytest passed 487 with 1 skipped. The OpenAPI document is byte-identical to `origin/staging` at `6ddf862d`. Integration suites were not run. Commit: the commit that adds this entry.

### 2026-11-13 — Remove the screen buttons from chat answers

| Area | Change |
|---|---|
| AI | • The `suggest_screen` tool, its prompt paragraph and the ```` ```actions ```` block are gone, by owner decision; the app guide still tells the owner where each screen is<br>• History replay still strips the block from answers stored before the change, so the model never reads one back<br>• The evaluators no longer allow or look for `suggest_screen` and the block |
| HoneyHive | • `invalid-chart` skips a `ScreenButton` in a ```ui card as Mobile does, and still flags a card that has nothing else to draw |
| Docs | • The chat contract, AI README and runtime reference, the walkthrough diagrams, the AgentTurn statechart, `AC-127` and `OQ-004` drop the button, and the contract's ```ui catalogue drops `ScreenButton` |

Check: AI Ruff lint and format passed; pytest passed 622 tests with 13 live-model skips on disposable PostgreSQL and Redis. OpenAPI is unchanged; `prompt_version` changes for all 32 capability combinations, so traces and evaluation runs start a new prompt group. TLC re-checked AgentTurn with 340 distinct states and no invariant errors. On the local stack, two live chat turns asking where a screen is answered without a block, the second after a block was written into the stored first answer. Commit: the commits on `feat/remove-screen-buttons`.

### 2026-11-13 — Restructure the AI service by responsibility

| Area | Change |
|---|---|
| AI | • The memory package owns its embedder factory, background writes, HTTP routes and schema, and the fact screening rules; `src.main` is imported for `app` and `lifespan`, and by one test for `SANDBOX_TOOLS`<br>• Screen-button rules sit in `src/agent/screen_buttons.py`; one `OpenAIModelProvider` builds both OpenAI protocols<br>• `AgentTurnService` receives `AgentService` and owns admission and replay; `AgentTurnRepository.complete` saves a receipted exchange through the public `owned_conversation` and `write_exchange`<br>• Model construction and per-turn tier routing share one `src/llm/` package (`factory.py`, `model_router.py`, `tier.py`, `bifrost_tier_classifier.py`, `openai_model_provider.py`, `session_settings.py`), replacing `src/providers/` and `src/llm_router/`; logger names move to `src.llm.*`<br>• A distill pass over the modules the branch created or reshaped: the factory builds a provider inline, and both chat routes open the agent run through one `AgentService._iter`<br>• `LITELLM_URL` is removed; `QDRANT_URL` and the `HH_*` fields stay pending owner approval |

Check: AI Ruff lint and format passed; pytest passed 631 tests with 13 live-model skips after every step, with the PostgreSQL and Redis suites on disposable local containers. The OpenAPI document and `prompt_version` for all 32 capability combinations are identical to `origin/staging` at `86919eba`. No statechart state or transition changed, so no model was re-checked. Commit: the commits on `refactor/ai-maintainability` after `86919eba`.

### 2026-11-12 — Make agent memory writes exact and ordered

| Area | Change |
|---|---|
| AI | • `AgentMemoryRepository.similar` reads the owner's live memories in one statement and ranks them in the service, so reconcile no longer loses its candidates to the HNSW index when one owner holds a large share of the rows<br>• `AgentMemoryService.remember` writes one exchange at a time in turn order, so a follow-up turn is reconciled against the facts the turn before it stored |
| Docs | • ADR-0002 and the AI runtime reference record both behaviours and the shutdown trade-off |

Check: AI Ruff lint and format passed; pytest passed 630 tests with 14 skipped, with the memory and conversation PostgreSQL suites on a disposable local database. The three new tests failed before the change. The memory recall evaluation is unchanged (recall 0.75 before and after on the ONNX embedder, below its embeddinggemma bounds before the change too). A local `agent_chat` run, each of the 23 questions once on `gpt-6-luna`, scored `correct` 1.00 and `recalled_expected` 1.00; its gate failed only on `answer_faithfulness` 3.00 against 4.00, as the 2026-11-04 run of the same suite did at 2.96. Commit: the commit that adds this entry.

### 2026-11-09 — Keep SePay fulfillment scans fair under retries

| Area | Change |
|---|---|
| Billing | • Capture a fixed upper request ID for each scan so both older retries and later eligible payments get a turn even when new requests keep arriving<br>• Test a valid payment after 120 failing requests and verify the scan boundary in PostgreSQL |
| Integration | • Include both review fixes and integrate staging `2ba4f80`, preserving both sets of progress entries |

Check: Core Maven verify passed 1,595 tests with no failures, errors, or skips. All 21 required PostgreSQL suites and 13 report gate self-tests passed. AI Ruff lint and format passed, and Linux pytest passed 627 tests with 14 optional skips. OKF and diff checks passed. The AI container image built, while the Core image build was stopped when the Windows system drive fell below 300 MB free. Commit: `b685202`.

### 2026-11-09 — Prepare SePay, subscription and AI quota for staging review

| Area | Change |
|---|---|
| Billing/AI | • Consolidate the seven approved phases on feat/sepay-payment-design and fast-forward the latest staging revision 9613e47 without conflicts<br>• Retain default-off collection, webhook, grant, receipt, quota admission and recovery gates; no shared migration or deployment |
| Docs | • Correct the AI protocol guide to describe the implemented Core turn/fence integration<br>• Prepare the staging PR with migration/rollback boundaries, FE handoff and explicit remaining provider/FE acceptance |

Check: retained reports confirm Core verify 1,591 tests and explicit Core–AI integration 9 tests, all without failures/errors/skips; Linux AI has 625 passed and 14 optional skips. Runtime sources did not change after those checks; the three fetched staging commits affect only Mobile and the eval workflow. Fresh Ruff lint/format, 21-suite PostgreSQL report gate, 13 gate self-tests, 123 added-document links, traceability, OKF (52 concepts, Linux read-only checker), proposed-file credential-pattern and diff checks passed. Exact Compose image builds were attempted twice but blocked by auth.docker.io connection resets before compilation; CI image-build verification remains required. Dopbase CLI is unavailable, so private credential-map regeneration was attempted but not completed. No live provider, transfer, FE acceptance, shared DB/configuration or deployment was exercised. Commit: included in this change.

### 2026-11-09 — Define GA4 system boundaries and native verification

| Area | Change |
|---|---|
| Docs | • Extend ADR-0010 with verified event semantics and proposed consent, reporting and rollout safeguards; link the native verification matrix<br>• Add GA4 system boundaries and separate staging validation from production insights; rebalance logical architecture around business capabilities, rename the combined runtime/delivery diagram to system design, and add SVG-renderer-compatible labels and PNG preview |

Check: source inspected at staging `9613e47e`; Mobile typecheck, 205 unit tests and mock web export passed; OKF/link and diff checks passed. Three SVGs render white in light/dark; logical SVG text renders in librsvg, but Zed is not independently verified. GA4 validator: 0 warnings; system design: 0 errors/crossings, with existing warnings. Native delivery, Console settings and product/legal acceptance remain unverified; no runtime changes. Commit: the commits that add this entry.

### 2026-11-09 — Grafana monitors only the system

| Area | Change |
|---|---|
| Deploy | • Overview drops its environment picker and repeats the Health and Services rows for each environment, with the alert list above them; Resources drops its unused picker<br>• Removed the product analytics dashboard, its two PostgreSQL datasources, the playbook tasks and template that wrote their login, and `GRAFANA_PG_*` from the monitor template, `run.sh` and the credential map, since GA4 now measures usage |
| Docs | • ADR-0003 is superseded by ADR-0010, and ADR-0010 records the removal |

Check: `scripts/infra/lint.sh` and `okf_sync.py --check` passed; a local Grafana 13.3.0 with fake `probe_success` metrics showed only the Infra folder, one Health and Services row per environment and no environment picker on Overview or Resources. Not verified on the VPS; `check-templates.sh` needs Dopbase and will flag `GRAFANA_PG_*` until those keys are deleted there. Commit: the commit that adds this entry.

### 2026-11-08 — Verify Core–AI integration and hand off billing/quota to FE

| Area | Change |
|---|---|
| Integration tests | • Explicit CoreAiQuotaIT uses real loopback Core HTTP → Python AI HTTP and disposable PostgreSQL, retaining production router/receipt/save/cancel logic<br>• Nine cases cover JSON/SSE replay, done-after-debit, pending/last slot, rollback/restart, fenced cancellation, failure, deletion, unavailable protocol and paid expiry |
| Handoff/docs | • Add client payment/fulfillment state handling, stable chat attempts/202/429/410, quota display, rollout compatibility and rerun instructions<br>• Sync implementation/FR status, metadata and remaining phase-six descriptions; no FE/runtime behavior or migration changes |

Check: explicit integration suite passed 9/9 without skips; Firebase verification/preliminary shop lookup, model and cache are fixtures. Restart recreates the Core context/facade and the AI process, not a separate Core JVM; paid activation is a SQL fixture, not SePay acceptance. Full Core verify passed (1,591 tests, no failures/errors/skips), all 21 required PostgreSQL suites and 13 gate self-tests passed. Linux AI Ruff lint/format passed (141 files); pytest passed (625 passed, 14 optional skips: 13 live-model and 1 Redis case). Local links/traceability, OKF (52 concepts) and diff checks passed. Dopbase CLI is missing, so credential-map generation remains blocked; only the nonsecret test-interpreter source entry was added. No shared DB/configuration, provider/real transfer, deployed FE acceptance, commit or push was performed.

### 2026-11-08 — Connect Core chat quota to durable AI receipts

| Area | Change |
|---|---|
| Core | • Default-off JSON/SSE quota admission with OWNER-wide atomic reservation, cross-transport stable keys and captured windows<br>• Receipt-based debit/release before result/done; 202 pending, safe 429/410/errors, no legacy fallback for keyed calls |
| Recovery/docs | • Fenced restart/lease reconciliation never regenerates or releases an unknown outcome; cancellation tombstones preserve late-save safety<br>• Reuse approved V21 without new migrations; sync contracts, FR status, Core/AI guides, ERD, CoreQuota model/chart and nonsecret gates/templates |

Check: full Maven verify passed (1,591 tests, no failures/errors/skips); affected HTTP/controller/transaction/Swagger suites passed again after final hardening. The required PostgreSQL report gate passed all 21 suites including 17 ChatQuotaPostgresTest cases, and its 13 self-tests passed. TLC checked CoreQuota separately (1,786 distinct states, no invariant errors); Pele SVG was rendered and inspected. DBML parsing, dummy Compose config, 105 added local links, traceability, OKF (51 concepts) and diff checks passed. Core uses a fake durable AI transport for transaction races plus scoped HTTP adapter tests; full deployed Core–AI/FE/provider acceptance and latency remain unverified. AI runtime was unchanged from phase five, whose Linux test evidence is retained below. Dopbase CLI is missing, so credential-map generation remains blocked. No shared migration/configuration, real transfer, commit or push was executed.

