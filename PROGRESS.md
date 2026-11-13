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

### 2026-11-08 — Add opt-in durable AI turn receipts and cancellation

| Area | Change |
|---|---|
| AI | • Default-off internal turn/fence protocol, one durable claim across JSON/SSE, scoped result/restart replay, 202 pending and terminal cancellation/tombstones<br>• Atomic exchange/success receipt, original model metadata and deletion-safe 410; no second generation, replay cache or Core quota accounting |
| Schema/docs | • Owner-approved separate metadata-only AI migration; original receipt migration and V21 remain intact<br>• Update contract, FR status, runtime/rollback guide, ERD and chat/receipt models/charts; synchronize the nonsecret gate/templates |

Check: Linux AI Ruff lint/format and pytest passed (625 passed, 14 skipped: 13 opt-in live model cases and 1 optional real Redis case); all 16 new real-PostgreSQL receipt/migration cases executed. Windows full pytest had 623 passed/14 skipped and two unchanged cache/Redis timing failures; both pass on Linux. Core Maven verify passed (1,564 tests, 0 failures/errors/skips), required PostgreSQL report gate and 13 gate self-tests passed. TLC checked AgentTurn (340 distinct states) and DurableTurn (49), separately from runtime tests; Pele-rendered SVGs were inspected. DBML parsing, Compose dummy config, local links/traceability, OKF and diff checks passed. Dopbase CLI is missing, so credential-map generation remains blocked. No shared migration/configuration, live provider call, FE acceptance or Core quota enforcement was executed. Commit: not created.

### 2026-11-08 — Add durable subscription fulfillment and quota reads

| Area | Change |
|---|---|
| Core | • Independently default-off grant worker atomically applies unique accepted payments, calendar-month renewal and APPLIED evidence with restart/concurrency recovery<br>• Shopless active-OWNER subscription/quota GETs; exact-expiry Free fallback, Vietnam/weekly windows and existing counters, enforcementEnabled=false; no chat admission/debit |
| Safety/docs | • Disabled/unsupported payers and backward clocks retain pending money; skipped writes roll back; bounded cursor batches avoid failed-row starvation<br>• Reuse approved V21 without a new migration; sync contracts, FR status, runbook and default-off variable/templates |

Check: final Maven verify passed (1,564 tests, 0 failures/errors/skips), including 11 required SubscriptionPostgresTest cases; the full PostgreSQL report gate and 13 gate self-tests passed. Compose validation used dummy values; local links/traceability, OKF (50 concepts) and diff checks passed. Initial sandbox Mockito attach was interrupted and rerun outside the sandbox with its agent preloaded. Dopbase CLI is missing, so credential-map generation remains blocked. No shared migration/configuration, SePay delivery, real transfer, FE acceptance or AI quota enforcement was executed. Commit: not created.

### 2026-11-08 — Implement default-off SePay payment APIs

| Area | Change |
|---|---|
| Core | • Add active-OWNER catalog/create/status without shop scope; immutable price/recipient snapshots, original-response replay and 30-minute expiry projection<br>• HMAC raw JSON ingress is the sole exact POST Firebase exception; provider/request locks and durable dedupe commit bank outcome plus PAID/PENDING once |
| Safety | • Preserve missing/wrong/late/extra transfers for review; main-account matching only, no subscription/quota/ledger/role mutation<br>• Separate default-off creation/receipt gates; bounded input/SQL waits, safe failures and no raw provider data in records/logs |
| Docs and Config | • Update contract/requirements/ERD and add Core setup/Test mode/reconciliation guide; document remaining shared-pool acquisition wait<br>• Keep seven env keys aligned in application, example, template and Compose; update Core→SePay credential-map source; generation blocked by missing Dopbase CLI |

Check: final full Maven verify passed (1,543 tests, 0 failures/errors/skips), required PostgreSQL suites including 13 SePay transaction tests and 13 gate self-tests passed. Coverage includes HMAC/raw JSON, Swagger headers/body, same/different-ID concurrency, expiry races, rollback and silently skipped writes. Compose validation used dummy values only; 75 added local links/anchors, requirement uniqueness, OKF (50 concepts) and diff checks passed. Credential-map generation was blocked by missing Dopbase CLI. No shared configuration/migration, provider delivery, FE checkout or Live transfer was executed; subscription/AI quota execution remains pending. Commit: not created.

### 2026-11-07 — Add approved billing and AI quota storage

| Area | Change |
|---|---|
| Product | • Record approved BR-027–029 → FR-041–043 → AC-128–150: Free 2 AI turns/day; paid OWNER plans 99,000 VND/1 calendar month or 297,000 VND/3 months, both 300/week<br>• Preserve staging's existing chart AC-127; billing acceptance IDs are unpublished draft additions |
| Core | • Owner-approved V21 creates six private tables with scoped payment/grant FKs, provider/key dedupe, period/window uniqueness and quota/state checks<br>• Append-only bank/grant guards; no existing ledger mutation or runtime writer |
| AI and Docs | • Separate receipt migration preserves successful evidence after chat deletion; no receipt API/writer enabled<br>• Update schema, ERD/DBML, requirements/contracts and verification guides; sync staging 0cc94ec while preserving unrelated work |

Check: Maven verify passed (1,523 tests, 0 failures/errors/skips); all required PostgreSQL suites including 9 BillingSchemaPostgresTest tests passed their report gate; 13 gate self-tests passed. Rehearsed V1–V21 plus all AI migrations on an isolated PostgreSQL 17 database (31 Core + 5 AI tables); DBML parser, 64 added local links/anchors, unique requirement definitions, OKF check (49 concepts) and git diff --check passed. Initial runs were interrupted by Docker Hub networking/low disk space; cache/temp moved to D and verification reran successfully. No shared migration, SePay delivery, subscription/quota enforcement or integrated acceptance is claimed. Commit: not created.

### 2026-11-07 — Block the unused Android data-sync foreground-service permission

| Area | Change |
|---|---|
| Mobile | • Block the transitive background downloader's `FOREGROUND_SERVICE_DATA_SYNC` permission through Expo config and add a regression test<br>• Document rebuilding the AAB and replacing affected Play artifacts instead of claiming an unused backup feature |

Check: Mobile typecheck, 197 unit tests and web export passed on an isolated branch from staging `875fea99`; Expo introspection emits `tools:node="remove"` for the permission. A rebuilt AAB, device behavior and Play acceptance are not verified. Commit: the commit that adds this entry.

### 2026-11-07 — Refuse debug-signed production Android builds

| Area | Change |
|---|---|
| CI | • `write-release-keystore.sh` fails an `android-production` build when `ANDROID_KEYSTORE_BASE64` is empty instead of signing with the public debug keystore; `mobile-release.yml` passes it the environment<br>• Found when the release AAB from run 42350017899 built green but was signed `CN=Android Debug`, because the Dopbase `release/production` value was empty |

Check: the script exits 1 for android-production without a keystore, 0 for android-staging and with a keystore; `shellcheck --severity=warning` and `actionlint` passed.

### 2026-11-07 — English file names for product images and icons

| Area | Change |
|---|---|
| Docs | • Recaptured the 21 marketing screenshots from the mock web build at staging `a1245a1c` under English file names; renamed 14 user flow screenshots without recapture, since they come from staging and not the mock<br>• Translated the Vietnamese comments in the marketing capture scripts |
| Mobile and Web | • Renamed the Vietnamese-named overview icons in `assets/tab1-overview` and `public/brand/icons` to English and updated their references |

Check: Web lint, typecheck and build passed; Mobile typecheck passed and `npm test` 196 passed; every renamed image reference resolves to a file; the recaptured images were inspected. The landing page and the app were not opened after the icon rename. Commit: the commit that adds this entry.

### 2026-11-07 — Unquote Dopbase values in CI

| Area | Change |
|---|---|
| CI | • `load-dopbase.sh` strips the double quotes and escapes that `dopbase export --format dotenv` puts around every value, so `VPS_SSH_KEY` decodes and `VPS_KNOWN_HOSTS` is a valid known-hosts line again; staging backend deploys had failed since #553<br>• A multi-line value now fails with a clear error |

Check: a fake `dopbase` printing quoted values loads the exact bytes, a multi-line value is refused, `shellcheck --severity=warning` passed; the stored staging key decodes to an OpenSSH private key once unquoted. CD rerun pending.

### 2026-11-07 — Move document metadata into the .okf bundle

| Area | Change |
|---|---|
| Docs | • Human documents carry no frontmatter; their OKF metadata (46 concepts and generated indexes) lives in `.okf/` at mirrored paths and each concept's `resource` points to its document<br>• `scripts/docs/okf_sync.py` sets titles from the first heading, adds stub concepts, regenerates the indexes and, with `--check`, reports drift, frontmatter in a human document and broken relative links<br>• Links to the removed `index.md` files now point to `backend/core/README.md` or the `.okf/` indexes; `AGENTS.md` and the docs conventions describe the new model |
| CI | • New `docs` area in `scripts/ci/changes.sh` and a `docs` job in `ci.yml` that runs `okf_sync.py --check`, listed in the result summary |

Check: `okf_sync.py --check` passes and a second write run changes nothing; frontmatter, a missing concept and a wrong title are each reported; `bash -n`, `shellcheck` and `actionlint` pass.

### 2026-11-07 — Move HoneyHive sync scripts and trim redundant script branches

| Area | Change |
|---|---|
| CI | • `sync-evaluators.sh` and `sync-dashboards.sh` move from the repository root to `scripts/honeyhive/`, beside the other script groups; workflows, CODEOWNERS and docs point at the new paths<br>• The Vercel build and deploy scripts build one argument list instead of repeating the command per target, and `apply.sh` drops its undocumented no-op `--keep-all` and `--backup` flags |

Check: `actionlint`, `shellcheck --severity=warning` on every tracked script, `check-evaluator-ids.sh`, `check-provider-coupling.sh` and Ruff passed; the Vercel scripts ran against a stub CLI on bash 3.2 for both targets and still fail when the deploy fails. The HoneyHive and Vercel scripts were not run against the real services. Commit: the commit that adds this entry.

### 2026-11-07 — Clean README front pages and old document metadata

| Area | Change |
|---|---|
| Docs | • READMEs outside `docs/` no longer carry frontmatter, so GitHub opens them on the title instead of a metadata table; `AGENTS.md` and the docs conventions record the rule<br>• The root README reads as a production overview again: the course-scope paragraph is gone, the boundaries table regains a Runs on column, and the repository layout is a directory tree checked against `staging`<br>• Seven documents (the product set, technical design, API contracts and marketing) fold their metadata table under the title into one intro sentence; BRD, PRD and the product overview no longer label themselves as the EXE201 MVP |

Check: every directory in the layout tree exists on `staging` `a1245a1`; relative links in the edited front pages resolve; `git diff --check` passed. Rendering on GitHub was not checked.

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

