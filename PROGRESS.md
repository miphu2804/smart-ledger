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
