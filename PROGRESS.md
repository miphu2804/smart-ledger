### [2026-09-25 23:20 UTC+07:00] — [Feature] Add Core business flow from shop to paid sale

**Done:** Committed Core shop management, category and product CRUD, manual sale-draft lifecycle, confirmed-sale reads, and payment reads in `dba9bd5`. Added Flyway V2–V3 for shop archive/status reasons and V4 for categories, products, sale drafts/items, sales/items, and payments. Refactored Core service interfaces/implementations, enums, business errors, and entity boilerplate.

**Changed files:** `backend/core` controllers, DTOs, entities, repositories, services, enums, migration files `V2__add_shop_archive.sql`, `V3__add_shop_inactive_reason.sql`, `V4__create_catalog_and_paid_sales.sql`, and tests; `PROGRESS.md`.

**Flow explained:** OWNER manages shops by ID; shop-scoped catalog and checkout endpoints require an owned ACTIVE shop via `X-Shop-Id`. Categories and products are archived instead of physically deleted. Manual drafts can be created, reviewed, replaced, cancelled, and confirmed; drafts do not affect stock or revenue. Confirmation currently requires full payment and atomically creates a sale, item snapshots, an initial payment, and tracked-stock deductions. Sales and payments have read endpoints. Partial payment, debt repayment, and AI-origin drafts remain outside this implemented flow.

**Check:** `backend/core/mvnw.cmd -q test` passed 79 tests with no failures or errors; `git diff --cached --check` passed before the Core commit. Flyway V4 has not been independently smoke-tested on a clean PostgreSQL database after the final file restoration; runtime migration and end-to-end API verification remain pending.

### [2026-09-19 10:30 UTC+07:00] — [Feature] AI agent chat endpoint on LangChain

**Done:** Added stateless `POST /internal/v1/agent/chat` backed by a LangChain `create_agent` loop and configurable `ChatOpenAI` model. The endpoint returns `503 ai_unavailable` when the provider is absent or fails; service-credential auth and DB-backed tools remain deferred. Updated the API contract to use snake_case and document the baseline internal route.

**Changed files:** `backend/ai/src/agent/`, `backend/ai/src/providers/`, `backend/ai/src/main.py`, `backend/ai/src/app_config.py`, AI dependencies and tests, environment/Compose configuration, READMEs, and `docs/contracts/api-contracts.md`.

**Check:** Ruff check and format passed; `uv run pytest` passed 12 tests; Compose E2E connected PostgreSQL and Redis, returned `200` from `/health`, and returned the expected `503` from chat without a configured model.

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
### [2026-09-23 21:30 UTC+07:00] — [Feature] Add shop management and tenancy guard

**Done:** Added OWNER shop create/read/update APIs, including the reusable active-shop ownership guard used by later business APIs. Moved Core enum types out of `entity` into `enums`.

**Changed files:** `backend/core` controller, service, DTOs, entity/repository, exception handling, enum package, and tests; `PROGRESS.md`.

**Flow explained:** An active OWNER can create shops and access or update only the selected owned shop via `X-Shop-Id`; inactive shops can remain visible for management but are rejected by the shared business-operation guard.

### [2026-09-24 22:50 UTC+07:00] — [Feature] Add soft archive for shops

**Done:** Added owner-initiated soft archive for shops. `DELETE /api/v1/shops/{shopId}` now marks a shop as `ARCHIVED` and records `archived_at`; it does not physically delete the row.

**Changed files:** Core shop migration, entity/status/service/controller/error handling, shop-service tests, and `PROGRESS.md`.

**Flow explained:** Archived shops are no longer returned by `/api/v1/me`; direct read and update requests treat them as unavailable. Changing a shop to `ARCHIVED` through `PATCH` is rejected so archiving always uses the explicit delete route. No ADMIN suspension status or restore endpoint was added.

**Check:** Core unit tests passed: 20 tests, 0 failures, 0 errors. Flyway will apply V2 on the next Core startup.

### [2026-09-24 23:15 UTC+07:00] — [Schema] Record a shop archive reason

**Done:** Added pending Flyway migration V3 with nullable `shops.archived_reason` (maximum 500 characters). It is nullable so shops archived before this field exists remain valid.

**Changed files:** `backend/core/src/main/resources/db/migration/V3__add_shop_archive_reason.sql`, `PROGRESS.md`.

**Check:** Migration is pending and will be applied by Flyway at the next Core startup. The archive API payload is intentionally unchanged until the team confirms whether an archive reason is optional or required.

### [2026-09-24 23:25 UTC+07:00] — [Schema] Correct shop reason to INACTIVE only

**Done:** Replaced the pending V3 archive-reason migration with `inactive_reason` (maximum 500 characters). No archive reason is stored.

**Changed files:** Replaced the pending V3 migration file; `PROGRESS.md`.

**Flow explained:** `inactive_reason` is reserved for an ADMIN/system suspension message that the owner can see. The future ADMIN/system operation must set the reason when it changes a shop to `INACTIVE`.

### [2026-09-24 23:30 UTC+07:00] — [Schema] Keep separate inactive and archive reasons

**Done:** Updated pending migration V3 to add both `inactive_reason` and `archived_reason` to `shops`.

**Flow explained:** `inactive_reason` explains an ADMIN/system temporary suspension; `archived_reason` records why an OWNER soft-archived a shop. The fields are intentionally separate because the actors and business meanings differ.

### [2026-09-24 23:45 UTC+07:00] — [Feature] Enforce shop lifecycle ownership and reasons

**Done:** Added owner archive reason input and an ADMIN-only shop-status operation. OWNER can edit only active shops and archive an owned shop with an archive reason. ADMIN can set an active shop to `INACTIVE` with a required reason, then reactivate it. Session responses include non-archived owned shops and their applicable status reason.

**Changed files:** Core shop DTOs, entity, repository, services, owner/admin controllers, error codes, migration V3, tests, and `PROGRESS.md`.

**Flow explained:** `ACTIVE` permits owner operations. `INACTIVE` preserves data and shows the ADMIN/system reason while blocking owner updates and future business operations. `ARCHIVED` is owner soft deletion, records its separate reason, and stays hidden from normal owner access.

**Check:** `clean test` passed 22 tests with 0 failures and 0 errors. Only `V3__add_shop_status_reasons.sql` exists in build output; it remains pending until Core restarts.

### [2026-09-24 23:55 UTC+07:00] — [Fix] Preserve applied Flyway V3 and add archive reason as V4

**Done:** Restored applied V3 to its original `inactive_reason` schema and added `archived_reason` as V4. V3 had already been installed in the local database, so changing its name/content caused Flyway validation to fail.

**Changed files:** Core migration V3 restored, migration V4 added, `PROGRESS.md`.

**Check:** V4 must be applied after a clean rebuild. Existing V1–V3 migration history remains intact.

### [2026-09-25 00:05 UTC+07:00] — [Fix] Restore V3 checksum to the applied status-reasons schema

**Done:** Restored V3 with both `inactive_reason` and `archived_reason`, matching the schema already installed locally. Removed the redundant V4 source migration.

**Flow explained:** V3 was applied before its later rename/refactor; Flyway requires its original version, description, and SQL checksum to remain stable. Both reason fields therefore remain grouped in the applied V3 history.

### [2026-09-25 00:15 UTC+07:00] — [Refactor] Keep status API with the Shop resource

**Done:** Moved the status-change endpoint and request DTO into the Shop module. Removed the separate `AdminShopController`.

**Flow explained:** Status changes are now served at `PATCH /api/v1/shops/{shopId}/status`. Authorization remains enforced in the service layer and is currently ADMIN-only, so controller organization does not weaken access control.

**Check:** `clean test` passed 22 tests with 0 failures and 0 errors.

### [2026-09-25 00:35 UTC+07:00] — [Feature] Prepare Product CRUD without a migration

**Done:** Added Product create, list, detail, full replacement, and soft archive APIs in Core using the current BIGINT Product/Category ERD. Product access uses the owned ACTIVE shop guard; category references must be ACTIVE in the same shop. Barcode uniqueness follows the current ERD, including archived products.

**Changed files:** `backend/core` Product and Category entities, repositories, Product service/controller, request/response DTOs, catalog enum, error codes, unit tests, and `PROGRESS.md`. No database migration was added.

**Check:** Core unit tests passed 30 tests, 0 failures, 0 errors. Runtime API verification is pending: the local database has no `products` or `categories` tables, and JPA schema validation will reject startup until a reviewed migration supplies them.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests, including 7 ShopService tests.
### [2026-09-23 21:38 UTC+07:00] — [Refactor] Reduce Shop entity boilerplate with Lombok

**Done:** Added Lombok and replaced handwritten `Shop` getters and JPA no-argument constructor with `@Getter` and protected `@NoArgsConstructor`.

**Changed files:** `backend/core/pom.xml`, `backend/core/.../entity/Shop.java`, `PROGRESS.md`.

**Flow explained:** `Shop.create` and `Shop.update` remain explicit business operations; Lombok generates only read access and the JPA-required protected constructor, not public setters.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.
### [2026-09-23 21:41 UTC+07:00] — [Refactor] Apply Lombok consistently to Core entities

**Done:** Applied Lombok getter generation and protected JPA constructors to all current Core entities: `UserAccount`, `AuthIdentity`, and `Shop`.

**Changed files:** `backend/core/.../entity/UserAccount.java`, `backend/core/.../entity/AuthIdentity.java`, `PROGRESS.md`.

**Flow explained:** Entity factory and domain methods remain the only supported mutation paths; Lombok supplies read access and the JPA constructor without exposing setters.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.
### [2026-09-23 21:49 UTC+07:00] — [Refactor] Centralize Core business error codes

**Done:** Replaced individual Core business exception classes with `BusinessException` and centralized `ErrorCode` definitions.

**Changed files:** `backend/core` business services, exception handler, tests, `enums/ErrorCode.java`, and `exception/BusinessException.java`; `PROGRESS.md`.

**Flow explained:** Services throw one typed exception with an enum code; the shared handler derives the HTTP status, stable API code, message, and optional field details from it. Firebase/Spring Security authentication failures remain separate.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests; no source references to the retired business exception classes remain.
### [2026-09-23 21:54 UTC+07:00] — [Refactor] Separate Core service contracts from implementations

**Done:** Added `AuthSessionService` and `ShopService` interfaces, with their Spring implementations moved to `service/impl`.

**Changed files:** `backend/core` service interfaces, service implementations, and unit tests; `PROGRESS.md`.

**Flow explained:** Controllers depend only on service contracts; Spring injects the single `@Service` implementation. Future alternate implementations or mocks do not require controller changes.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress clean test` passed 18 tests.
### [2026-09-23 22:08 UTC+07:00] — [Docs] Correct Swagger response schemas

**Done:** Declared the success DTO and shared `ApiErrorResponse` schema explicitly for every documented Auth and Shop endpoint response.

**Changed files:** `backend/core/.../controller/AuthController.java`, `backend/core/.../controller/ShopController.java`, `PROGRESS.md`.

**Flow explained:** Swagger now shows a success payload only for 200/201 responses and the standard error envelope for 400/401/403/404 responses.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.
### [2026-09-23 22:12 UTC+07:00] — [Docs] Simplify Swagger error response display

**Done:** Collapsed detailed Swagger error status rows into one `default` standard error response for each Auth and Shop endpoint.

**Changed files:** `backend/core/.../controller/AuthController.java`, `backend/core/.../controller/ShopController.java`, `PROGRESS.md`.

**Flow explained:** Runtime still returns the exact HTTP status and `ErrorCode`; Swagger now presents only the success payload plus a shared error envelope to keep each endpoint readable.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.
### [2026-09-23 22:27 UTC+07:00] — [Refactor] Use shop ID paths for shop management

**Done:** Changed Shop read and update endpoints to `GET/PATCH /api/v1/shops/{shopId}`.

**Changed files:** `backend/core` Shop controller, service contract/implementation, error details, tests, and `PROGRESS.md`.

**Flow explained:** Shop management now identifies the resource in its URL and still verifies OWNER ownership. The `X-Shop-Id` guard is retained only for future shop-scoped business APIs.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress clean test` passed 18 tests; retired `/current` API names are absent.
### [2026-09-24 22:15 UTC+07:00] — [Docs] Show success responses only in Swagger

**Done:** Removed Swagger `default` error response rows from all current Auth and Shop endpoints.

**Changed files:** `backend/core/.../controller/AuthController.java`, `backend/core/.../controller/ShopController.java`, `PROGRESS.md`.

**Flow explained:** Swagger now presents only each endpoint's success DTO. Runtime error envelopes and HTTP status behavior are unchanged.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.
