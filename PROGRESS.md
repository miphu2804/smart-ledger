### [2026-09-24 21:18 UTC+07:00] — [Release] Prepare branch histories for production release

**Done:** Prepared the history sync needed to release `staging` into `main`, keeping the mobile tree from `staging` across the 39 overlapping additions. Added the missing required `container-images` check.

**Changed files:** `.github/workflows/ci.yml`, `CONTRIBUTING.md`, and `PROGRESS.md`; no application source changes.

**Flow explained:** Including `main` in the staging release history lets the required `staging` → `main` release PR merge without repeating mobile add/add conflicts. CI now builds the custom Docker Compose images for the required `container-images` status.

**Check:** The merged mobile tree matches `origin/staging` and the web tree matches `origin/main`. CI for `c9bcf43` passed; the new image job and this sync PR's checks are pending.

### [2026-09-24 17:43 UTC+07:00] — [AI] Verify persisted chat CRUD before merge

**Done:** Manually called the live AI HTTP service with two short model requests and verified create, list, detail, rename, continue, delete, scope isolation, and post-delete behavior against disposable PostgreSQL 16 and Redis. The staging database was not used.

**Changed files:** AI conversation API integration coverage, the AI CI PostgreSQL service, and the PRD chat requirement mapping.

**Flow explained:** CI runs the real-PostgreSQL CRUD check as an AI API/database integration test. Authenticated Core-to-AI E2E remains a later CI step after that product flow exists.

**Check:** Manual HTTP flow passed; AI suite passed 24 tests; Ruff and format checks passed. Local Core Maven verification could not start because Java is unavailable; the PR's Core CI job must pass before merge.

### [2026-09-24 01:01 UTC+07:00] — [CI] Verify compact summary artifact

**Done:** The final PR run passed AI, Core, and summary jobs. Downloaded `ci-summary` and verified the board reports 12 Python tests and 11 Java tests, with zero failures, errors, or skips.

**Changed files:** `PROGRESS.md`.

**Check:** GitHub Actions run `35899451138` passed; one 261-byte `ci-summary` artifact was attached.

### [2026-09-24 00:58 UTC+07:00] — [CI] Publish compact test summary artifact

**Done:** Added one compact Markdown board to the Actions run summary and as a downloadable artifact. It shows each backend job result and test totals, failures, errors, and skips.

**Changed files:** `.github/workflows/ci.yml`, `PROGRESS.md`.

**Flow explained:** A final job runs after AI and Core even when either fails, then uploads one `ci-summary` artifact retained for 14 days.

**Check:** Pending.

### [2026-09-24 00:53 UTC+07:00] — [CI] Run release source guard from base branch

**Done:** Moved the main source-branch policy into a separate `pull_request_target` workflow. It reads PR metadata without checking out or running proposed code, allowing same-repository `staging` and `hotfix/*` only.

**Changed files:** `.github/workflows/ci.yml`, `.github/workflows/release-policy.yml`, `PROGRESS.md`.

**Flow explained:** Once this workflow is present on `main`, configure `Release policy / Release source branch` as a required check in the `main` ruleset.

**Check:** Pending.

### [2026-09-24 00:50 UTC+07:00] — [CI] Confirm Java and Python checks on PR #38

**Done:** GitHub Actions passed the AI job and Core Maven `verify`; Core ran 11 tests with no failures. The release source check skipped as expected because PR #38 targets `staging`.

**Changed files:** `PROGRESS.md`.

**Check:** PR #38 checks passed.

### [2026-09-24 00:45 UTC+07:00] — [CI] Validate Java and Python; guard release source

**Done:** Added Core Java 21 Maven verification alongside the existing AI Python lint, format, and test checks. Added a source-branch check for PRs into `main`, allowing same-repository `staging` and `hotfix/*` branches.

**Changed files:** `.github/workflows/ci.yml`, `PROGRESS.md`.

**Flow explained:** The `release-source` check is only required for pull requests targeting `main`; it must be configured as a required check in the `main` ruleset after this workflow reaches `main`.

**Check:** AI Ruff check and format check passed; Python tests passed (12). Local Core verification could not start because no Java runtime is installed; GitHub Actions validation pending. Workflow YAML parsed; `git diff --check` passed.

### [2026-09-24 UTC+07:00] — [AI] Add PostgreSQL-backed agent chat history

**Done:** Implemented Agent conversation persistence, history context, and conversation management against the chat history ERD.

**Changed files:** AI PostgreSQL migration, repository, service, internal API, tests, and related API/technical documentation.

**Flow explained:** Chat turns are committed atomically; later turns load up to 20 scoped messages; OWNER can list, rename, view, and delete conversations.

**Check:** Ruff and format passed; 15 AI tests passed; PostgreSQL 16 migration and end-to-end persistence/scope/delete check passed.

### [2026-09-23 22:12 UTC+07:00] — [Docs] Reconcile Phase 1 ERD with staging schema

**Done:** Aligned the ERD, diagram, description, and technical design with Core's `shops`/`shop_id` schema and one Firebase identity per user. Documented validation for custom draft items and debt sales that require a customer. Preserved all earlier progress entries while merging the latest `staging` into the ERD branch.

**Changed files:** `docs/architecture/diagrams/src/erd.dbml`, `docs/architecture/diagrams/src/erd.dbdiagram`, `docs/architecture/erd-description.md`, `docs/architecture/technical-design.md`, and `PROGRESS.md`.

**Flow explained:** The ERD remains a logical target. Core #12 must add the product migration before AI #37 can test a shop-scoped catalog query against the real database.

**Check:** DBML and diagram agree on 20 tables and 44 relationships; `git diff --check` passed; AI Ruff check and format check passed; `uv run pytest -q` passed 12 tests with one upstream deprecation warning. Remote PR review and checks remain pending.

### [2026-09-20 17:26 UTC+07:00] — [Docs] Finalize Phase 1 ERD and core validation rules

**Done:** Scoped product barcode uniqueness to `(store_id, barcode)`, moved `store_id` to `notification_events`, converted `auth_identities` to 1:N, and documented tenant consistency and payment-debt validation rules.

**Changed files:**
- `docs/architecture/diagrams/src/erd.dbml` — updated product barcode index, notification tables, and auth identities
- `docs/architecture/diagrams/src/erd.dbdiagram` — synchronized store-notification relationship
- `docs/architecture/erd-description.md` — added core business validation rules and updated entity descriptions

**Flow explained:** Barcodes are unique per store; notifications and auth identities support multi-recipient and multi-provider flows; business integrity is enforced at service layer.

**Check:** Verified DBML schema syntax and cross-document references.

### [2026-09-19 10:30 UTC+07:00] — [Feature] AI agent chat endpoint on LangChain

**Done:** Added stateless `POST /internal/v1/agent/chat` backed by a LangChain `create_agent` loop and configurable `ChatOpenAI` model. The endpoint returns `503 ai_unavailable` when the provider is absent or fails; service-credential auth and DB-backed tools remain deferred. Updated the API contract to use snake_case and document the baseline internal route.

**Changed files:** `backend/ai/src/agent/`, `backend/ai/src/providers/`, `backend/ai/src/main.py`, `backend/ai/src/app_config.py`, AI dependencies and tests, environment/Compose configuration, READMEs, and `docs/contracts/api-contracts.md`.

**Check:** Ruff check and format passed; `uv run pytest` passed 12 tests; Compose E2E connected PostgreSQL and Redis, returned `200` from `/health`, and returned the expected `503` from chat without a configured model.

### [2026-09-18 UTC+07:00] — [Docs] Align Phase 1 ERD and technical design

**Done:** Updated the Phase 1 ERD, its description, and technical design to use Firebase Phone/Google, `store_id`, persisted sale drafts, sales/payments/debts, simple stock, AI trace, idempotency, archive/void lifecycle, `BIGINT` VND, and UTC timestamps.

**Changed files:** `docs/architecture/diagrams/src/erd.dbml`, `docs/architecture/erd-description.md`, and `docs/architecture/technical-design.md`.

**Check:** Ran `git diff --check`; DBML remains a logical schema and PostgreSQL constraints/indexes must be implemented in Flyway migrations.

### [2026-09-17 21:00 UTC+07:00] — [Docs] Document release merge flow and align branch rules

**Done:** Updated `CONTRIBUTING.md` to require squash merges into `staging` and merge commits for `staging` → `main` releases, citing the GitLab Flow production-branch pattern. Resolved the `PROGRESS.md` convention as newest-first. Repo rules now match: `staging-squash` (squash only), `main-release-merge` (merge only), and `required_linear_history` disabled on `main` so release merge commits are allowed. Merged #28 to `main` via merge commit `ecf9f83`.

**Changed files:** `CONTRIBUTING.md`, `PROGRESS.md`; repo rulesets `staging-squash`/`main-release-merge` and `main` branch protection.

**Flow explained:** Feature branches come from `staging`, squash-merge back into `staging`, and release PRs merge (not squash) into `main` so `staging` history stays linked and no post-release resync is needed.

**Check:** `gh api` rulesets and branch protection verified after edits; `gh pr merge 28 --merge` succeeded as merge commit.

### [2026-09-17 12:30 UTC+07:00] — [Feature] AI Postgres and Redis clients at startup

**Done:** Closed #7 without `GET /ready`. AI connects Postgres and Redis in FastAPI lifespan and logs `connected` / `unconfigured` / `connect failed`. `/health` stays liveness. Compose default remains Postgres + Redis + AI.

**Changed files:** `backend/ai/src/infra/postgre_db_client.py`, `backend/ai/src/infra/redis_db_client.py`, `backend/ai/src/infra/__init__.py`, `backend/ai/src/main.py`, `backend/ai/src/data_clients.py` (deleted), `backend/ai/tests/conftest.py`, `backend/ai/tests/integration_tests/test_ready.py` (deleted), `backend/ai/README.md`, `README.md`, `AGENTS.md`, `PROGRESS.md`

**Flow explained:** Lifespan constructs clients with `POSTGRES__URL` / `REDIS__URL`, calls `connect()`, stores them on `app.state`, and `close()` on shutdown. `/health` returns `{"status": "ok"}` without pinging. `/ready` is not served.

**Check:** `uv run ruff check`, `ruff format --check`, `pytest` (1 passed). Compose AI log `postgres connected` / `redis connected`; `/health` 200; `/ready` 404.

### [2026-09-16 17:10 UTC+07:00] — [Feature] AI Postgres and Redis clients plus /ready

**Done:** Implemented #7 on `feat/ai-postgres-redis-clients` in the backend worktree. AI pings Postgres and Redis. `/health` stays liveness. Default Compose is Postgres + Redis + AI. No LiteLLM, Qdrant, Langfuse, `/internal/v1`, or invoice/expense endpoints.

**Changed files:** `backend/ai/src/data_clients.py`, `backend/ai/src/main.py`, `backend/ai/tests/integration_tests/test_ready.py`, `backend/ai/pyproject.toml`, `backend/ai/uv.lock`, `backend/ai/Dockerfile`, `backend/ai/.dockerignore`, `backend/ai/.env.example`, `backend/ai/README.md`, `compose.yaml`, `.env.example`, `README.md`, `AGENTS.md`, `PROGRESS.md`

**Flow explained:** `GET /ready` returns 200 when both `POSTGRES__URL` and `REDIS__URL` ping; 503 if either is missing, blank, or down. Compose injects those URLs. Langfuse is not in the default stack.

**Check:** `uv run ruff check`, `ruff format --check`, `pytest` (8 passed). Compose `/health` 200 and `/ready` 200 `postgres=ok, redis=ok`; `/ready` 503 after Postgres stop while `/health` stayed 200.
### [2026-09-24 12:06 UTC+07:00] — [UI] Introduce the assistant after mobile sign-in

**Done:** Added a compact post-sign-in assistant modal based on the supplied preview and the current minimal mobile palette. It uses the supplied mascot, explains the tap/hold gesture, and provides direct Voice, Agent chat, close, and later actions. The existing guide flag now opens the modal after explicit sign-in and stays dismissed within that session; silent session restoration does not show it. Added `FR-025` and `AC-018` for the observable behavior.

**Changed files:** `frontend/mobile/src/components/AssistantIntroModal.tsx`, `src/components/MascotBadge.tsx`, `src/components/ZenRing.tsx`, `src/store/AppStore.tsx`, `app/(tabs)/index.tsx`, `frontend/mobile/README.md`, `docs/product/product-requirements.md`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript, web export, and `git diff --check` passed. Browser views at 320×568 and 390×844 showed the actions inside the modal; Voice and Agent chat buttons navigated to their screens, and dismissing remained effective after tab navigation. iPhone 17 Pro Simulator showed the modal and confirmed Agent chat opens and returning Home keeps the modal closed. Voice/chat internals remain mock implementations; silent Firebase session restoration was checked in code, not in a live Firebase session.

### [2026-09-24 11:56 UTC+07:00] — [UI] Use supplied mascot for the floating AI entry

**Done:** Replaced the star graphic in the floating Zen ring with the circular mascot badge supplied by the user. The original PNG is kept unchanged as a mobile asset and cropped only while rendering. Enlarged the visible target to 64px and moved its short hold hint clear of the Home date.

**Changed files:** `frontend/mobile/assets/assistant-mascot-badge.png`, `frontend/mobile/src/components/ZenRing.tsx`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript passed. Web screenshots at 320px and 390px and an iPhone 17 Pro Simulator view showed the supplied badge on Home. Web interaction verified tap opens the Voice/Agent chat menu, dragging changes position, and a 650ms hold opens `/voice`. On Sales, dragging toward checkout stopped with the mascot bottom at y=732, above the checkout button at y=786.

### [2026-09-24 11:50 UTC+07:00] — [UI] Keep revenue card height stable across report periods

**Done:** Reserved a fixed comparison area in the Home revenue card so switching between Today, Yesterday, and This month does not shift the period tabs or following sections. On narrow screens the comparison badge uses its own row; percentage text still appears only when a valid comparison is available.

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript and `git diff --check` passed. Browser measurements at 320px showed 211px card height and the priority heading at y=461 for all three periods; at 390px, the corresponding values were 187px and y=437. Visual screenshots at both widths showed the badge and long month revenue without clipping.

### [2026-09-24 11:44 UTC+07:00] — [UI] Restore Home grouping and remove duplicate AI entry points

**Done:** Restored the Home reading order from the earlier layout: revenue card, period selector, two priorities in one card, sales action, then data suggestion and best sellers. Kept the revenue card as the analytics drilldown. Made the shared Zen ring the Voice/Agent chat entry across tabs; removed duplicate AI shortcuts from Home and More. The Sales tab now opens the product grid directly, with the ring resting near the title and clear of the fixed checkout bar.

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `app/(tabs)/sales.tsx`, `app/(tabs)/more.tsx`, `app/pos.tsx`, `src/components/ZenRing.tsx`, `src/components/ui.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript, web export, and `git diff --check` passed. Browser walkthrough at 320px and 390px verified Home hierarchy, direct Sales entry, Zen ring navigation, one-item checkout, and ring drag clamping above checkout. iPhone 17 Pro Simulator verified the Home layout and Sales grid with the ring clear of the cart bar. Web export still emits the existing missing `android.googleServicesFile` warning; it exits successfully.

### [2026-09-24 11:26 UTC+07:00] — [UI] Add mobile sales analytics drilldown

**Done:** Moved the Home period selector above the rounded revenue card and linked the card to a new `/analytics` screen. The screen follows the chosen period with revenue, order count, hourly/weekly trend, recorded expenses, estimated gross profit, best sellers, shop-wide debt, and invoice drilldown. Added the report to `Khác` and kept the selected period when opening best sellers.

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `app/(tabs)/more.tsx`, `app/analytics.tsx`, `app/bestsellers.tsx`, `src/components/ReportPeriodTabs.tsx`, `src/components/charts.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Flow explained:** The Home card now opens analytics instead of invoices. Report metrics use non-cancelled, finalized invoices and the selected date range; outstanding debt is explicitly shop-wide. Gross profit is shown separately from recorded expenses to avoid counting ingredient purchases twice. Expense-inclusive net profit remains unresolved pending a cost/expense rule for `AC-007`.

**Check:** TypeScript and web export passed. Browser walkthrough at 320px and 390px verified Home → analytics → invoices, period changes with distinct totals, top-seller drilldown, and no horizontal overflow. Native layout remains unverified.

### [2026-09-24 11:12 UTC+07:00] — [UI] Remove preview labels from mobile review flow

**Done:** Removed “demo/giả lập” labels from the visible sign-in, Home, Zen ring, Voice, Chat, expense, and More screens. Removed fake social sign-in and sample-data reset from regular navigation; actions without a real printer or invitation no longer report success. Updated the mobile README with the current reviewer sign-in steps.

**Changed files:** `frontend/mobile/app/`, `frontend/mobile/src/components/ZenRing.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript, web export, and `git diff --check` passed. The web flow was exercised from phone sign-in with mock OTP through Home, Zen ring, Chat, and More; no preview label appeared in those screens. Data, OTP, Voice, and Chat remain mock implementations, documented for reviewers; this is a UI review build, not a production release.

### [2026-09-24 UTC+07:00] — [Feature] Restore mobile shadows and Zen ring

**Done:** Increased native/web card and CTA depth and added a draggable Zen ring across the four mobile tabs. Tap opens demo Voice/Agent chat choices; hold opens Voice directly. Updated the visual reference to describe the implemented demo behavior.

**Changed files:** `frontend/mobile/src/theme.ts`, `src/components/ui.tsx`, `src/components/ZenRing.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/_layout.tsx`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Flow explained:** The ring stays above tab screens, is clamped above the tab bar and safe areas, and disappears on child screens. Voice/chat remain sample-data demos; business writes and audio capture are unchanged.

**Check:** TypeScript and web export passed. In the web demo, card shadow rendered, ring menu and Voice navigation worked, dragging moved the ring, and a 500 ms hold opened Voice. An iOS simulator screenshot showed the card shadows and ring; Android remains unverified.

### [2026-09-21 23:40 UTC+07:00] — [Feature] Mobile Firebase sign-in wired to Core session

**Done:** The mobile app signs in with Firebase (phone OTP and email/password) and sends the Firebase ID token to Core `POST /api/v1/auth/session`. A first sign-in asks for a display name because Core requires it. Added dev-only logging, a diagnostics screen, a 15 s request timeout and a local CORS proxy for web testing. Mock mode (`EXPO_PUBLIC_USE_MOCK=true`) is unchanged.

**Changed files:**
- `frontend/mobile/src/lib/auth/`, `src/lib/api.ts`, `src/lib/sessionApi.ts`, `src/lib/errors.ts`, `src/lib/debug.ts` — created
- `frontend/mobile/app/(auth)/email.tsx`, `app/(auth)/profile.tsx`, `app/debug.tsx` — created
- `frontend/mobile/scripts/dev-cors-proxy.js`, `frontend/mobile/eas.json` — created
- `frontend/mobile/app/(auth)/welcome.tsx`, `otp.tsx`, `setup.tsx`, `app/index.tsx`, `app/(tabs)/more.tsx` — modified
- `frontend/mobile/src/store/AppStore.tsx`, `src/config.ts`, `src/data/types.ts` — modified
- `frontend/mobile/app.json`, `package.json`, `package-lock.json`, `.env.example`, `README.md` — modified

**Flow explained:** Firebase verifies the phone or email, then the app sends `Authorization: Bearer <ID token>`. Core verifies the token, upserts the account and returns role, shops and `needsOnboarding`. A new account must send `displayName` (400 otherwise). On start Firebase restores the session and the app calls `GET /me` (404 asks for the name again, 401 signs out). Core has no `POST /shops` yet, so shop creation stays local (`EXPO_PUBLIC_MOCK_SHOPS=true`).

**Check:** `tsc --noEmit` is clean. Node logic tests ran against a stub of Core built from the `feat/auth-session` code (session, `/me`, 401/403/404, timeout). The web UI was walked through in mock mode. Unverified: Firebase sign-in on Android (no development build has run yet) and the app against the real Core end to end. `google-services.json` is not committed because the repository is public; provide it from the Firebase Console. Open contract mismatches with backend: Core returns camelCase, numeric ids and a single `industry`, while the docs say snake_case, uuid and `industries`; Core has no CORS configuration.

### [2026-09-16 00:00 UTC+07:00] — [Fix] Pin setup-uv action version

**Done:** Replaced unresolved `astral-sh/setup-uv@v10` with `v10.1.0` so CI can resolve the action.

**Changed files:**
- `.github/workflows/ci.yml` — modified

**Flow explained:** GitHub Actions has no floating `v10` tag; the workflow now pins a released tag.

**Check:** Confirmed `v10` 404 and `v10.1.0` exists via GitHub API. CI run on the PR is unverified until Actions starts.

### [2026-09-15 23:41 UTC+07:00] — [Feature] Set up Python AI runtime; leave Java Core

**Done:** Scaffolded FastAPI `/health` for AI (`:8001`) with uv, ruff, and pytest. Left Core as Java; did not record an ADR for the scaffold.

**Changed files:**
- `backend/ai/` — created FastAPI app, config, tests, lockfile
- `backend/core/` — left as Java placeholder; Python files removed
- `docs/architecture/technical-design.md` — Java Core, Python AI env names
- `README.md`, `AGENTS.md`, `docs/README.md` — Core is Java, do not modify
- `.github/workflows/ci.yml`, `.pre-commit-config.yaml` — AI only

**Flow explained:** AI starts on `:8001`; `GET /health` returns `{"status": "ok"}`. Core stays Java. Internal `/internal/v1` is not implemented.

**Check:** `uv run ruff check`, `uv run ruff format --check`, and `uv run pytest` passed in `backend/ai` (1 test).

### [2026-09-15 21:50 UTC+07:00] — [Docs] Initialize project documentation

**Done:** Initialized the MVP product, architecture, API contract, delivery workflow, and backlog documentation.

**Changed files:** `README.md`, `CONTRIBUTING.md`, `docs/`, `PROGRESS.md`, and `BLOCKERS.md`.

**Flow explained:** `Business requirements → product requirements → technical design → API contract → sprint issues`.

**Check:** Validated Markdown whitespace, DBML, and draw.io sources; visually inspected the architecture export.
### [2026-09-24 10:45 UTC+07:00] — [Feature] Migrate mobile owner UI to minimal style

**Done:** Created `feat/mobile-minimal-ui` from `origin/feat/mobile-firebase-auth` in an isolated worktree. Set the visual direction from the user image in `docs/design/mobile-ui-style-migration.md`: warm neutral surfaces, charcoal primary actions, restrained green accent, one prominent revenue card, four bottom tabs, and clear demo labeling. Two delegated coding passes covered Home/tokens and remaining routes; the main pass reviewed visuals and corrected data labels, period navigation, narrow product cards, and mock voice presentation.

**Changed files:** `docs/design/mobile-ui-style-migration.md`, its reference image, `docs/README.md`, `frontend/mobile/src/theme.ts`, shared components and mock category colors, and the owner-facing mobile routes. `backend/core` and storage/API code were not changed.

**Flow explained:** Home filters finalized-order revenue by Today/Yesterday/This Month, labels shop-wide debt separately, and sends the selected period to Orders. The new Sales tab leads to POS or the clearly labeled sample-voice flow. More retains access to expenses, debts, products and reports while removing out-of-MVP entries. Mock insights state their data source or lack of evidence.

**Check:** `npm run typecheck`, `npm run export:web`, and `git diff --check` passed. In the running web app, checked Home layout, period numbers and repeat navigation to Orders, Sales → POS → Checkout, More → Expenses, sample-voice expense parsing, and sample-voice order parsing. Visual review covered 320px and 390px web widths; no clipped controls found. Native iOS/Android rendering, system font scaling, and backend/real microphone acceptance criteria remain unverified.
### [2026-09-24 12:17 UTC+07:00] — [UI] Open three quick actions around the mascot

**Done:** Replaced the single Zen ring menu card with three separate rounded actions modeled on the supplied reference: Agent chat, Voice, and Gợi ý. Added restrained green connectors and individual soft shadows. The menu opens beside the mascot when space permits and above/below it after a drag to the center; Gợi ý opens today's existing analytics. Tap, drag, and the 500 ms hold shortcut remain available. Updated the intro copy, mobile route note, design reference, and `FR-026`/`AC-019`.

**Changed files:** `frontend/mobile/src/components/ZenRing.tsx`, `src/components/AssistantIntroModal.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, `docs/product/product-requirements.md`, and `PROGRESS.md`.

**Check:** TypeScript and `git diff --check` passed. Web runtime screenshots at 390×844 and 320×700 showed all three actions; at 320×568 they stayed inside the viewport on Sales and More. Web interactions verified dragging the mascot to the center, opening the fallback menu, routing Voice, Agent chat, and Gợi ý, and holding to open Voice. Native device rendering of this menu was not checked in this pass.
### [2026-09-24 12:28 UTC+07:00] — [UI] Add feature tour and simplify mascot actions

**Done:** Extended the post-login intro to three steps for the assistant, sales/orders, and overview/store management. Kept direct assistant actions on step one; added Next, Back, Start, and Skip paths. On the Zen ring menu, removed decorative connectors, renamed the options Chatbot/Giọng nói/Gợi ý, and added stronger hover shadow with pressed feedback. Updated the mobile notes, visual spec, and `FR-025`/`FR-026` with `AC-018`/`AC-019`.

**Changed files:** `frontend/mobile/src/components/AssistantIntroModal.tsx`, `src/components/ZenRing.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, `docs/product/product-requirements.md`, and `PROGRESS.md`.

**Check:** TypeScript and `git diff --check` passed. On web at 320×568, all three intro steps kept their primary action visible; Next, Back, Start and Skip worked, and returning to Home did not reopen the intro. At 390×844, the intro Giọng nói shortcut opened `/voice`. The three mascot actions stayed within a 320px viewport, hover changed the card shadow, Chatbot opened `/ai`, Gợi ý opened `/analytics?period=today`, and a 650ms hold opened `/voice`. Native rendering was not checked in this pass.

### [2026-09-24 17:18 UTC+07:00] — [CI] Gate Core migrations and mobile web preview

**Done:** Added a fresh-PostgreSQL Flyway smoke check to Core CI and a mobile TypeScript/web-export job to the backend CI PR. Declared the Firebase JS SDK used by the web adapter, configured Vercel for Expo SPA exports, and documented preview setup.

**Changed files:** `.github/workflows/ci.yml`, `frontend/mobile/.gitignore`, `frontend/mobile/package.json`, `frontend/mobile/package-lock.json`, `frontend/mobile/vercel.json`, `frontend/mobile/README.md`, `CONTRIBUTING.md`, and `PROGRESS.md`.

**Flow explained:** CI now checks AI, Core, and browser export before merge; Vercel can deploy PR/staging previews when connected. Browser preview defaults to mock auth and sample data.

**Check:** `npm ci --offline`, TypeScript, Expo web export with mock mode and Firebase enabled, JSON validation, and `git diff --check` passed. Flyway 13.7.0 applied V1 to disposable PostgreSQL 16 and created `users`, `auth_identities`, and `shops`. Maven verification will run on GitHub Actions because no Java runtime is installed locally.
### [2026-09-24 22:32 UTC+07:00] — [Docs] Reconcile implementation status with code

**Done:** Reviewed project documentation against the `staging` checkout and corrected stale descriptions of frontend location, mock behavior, Core auth, AI conversation routes, API payloads, and mobile integration status. Kept proposed MVP requirements separate from implemented endpoints.

**Changed files:** `README.md`, `backend/ai/README.md`, `frontend/mobile/README.md`, `docs/architecture/technical-design.md`, `docs/contracts/api-contracts.md`, `docs/design/mobile-ui-style-migration.md`, `docs/product/project-overview.md`, `docs/product/product-requirements.md`, and `PROGRESS.md`.

**Flow explained:** The current mobile and web apps use mock business data by default. Mobile can call Core's Firebase session endpoints; Core has no shop or ledger API and does not proxy AI. AI persists internal Agent conversations. The remaining API and architecture sections describe the MVP target.

**Check:** Compared documented routes and payloads with Core controllers/DTOs, AI routers/schemas, and frontend config/services; `git diff --check` passed; all local links in changed Markdown files resolved. No runtime behavior changed.
