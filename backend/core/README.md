# SmartLedger Core — setup

Core is a Java 21 / Spring Boot backend. This README covers how to run it locally on Windows, macOS/Linux, in IntelliJ IDEA, or with Docker Compose. For product behavior and API details, see the [documentation index](../../docs/README.md) and [API contracts](../../docs/contracts/api-contracts.md).

## Prerequisites

- JDK 21 for a host/IntelliJ run. The included Maven wrapper downloads the required Maven version; a separate Maven installation is not needed.
- A PostgreSQL database: the shared staging Supabase database from the repo-root `.env.staging`, or your own local `smartledger` database.
- Firebase project ID and a Firebase service-account JSON file. Keep the JSON outside the repository and do not commit it.

Set these environment variables in the process that launches Core. [`.env.example`](.env.example) is a reference; Spring Boot does not load it automatically.

| Variable | Description |
|---|---|
| `DATABASE_URL` | JDBC URL, for example `jdbc:postgresql://localhost:5432/smartledger` |
| `DATABASE_USERNAME`, `DATABASE_PASSWORD` | PostgreSQL credentials |
| `FIREBASE_PROJECT_ID` | Firebase project used by this backend |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to the service-account JSON **on the machine running Core** |
| `SERVER_PORT`, `PORT` | Optional; `SERVER_PORT` takes precedence, then the hosted runtime's `PORT`, then `8080` |
| `CORS_ALLOWED_ORIGINS` | Exact browser origins, comma-separated; empty by default (no cross-origin browser access) |
| `OPENAPI_ENABLED`, `SWAGGER_UI_ENABLED` | Both default to `true` for local/staging; set both to `false` on production |
| `FLYWAY_ENABLED` | `false` for the shared dev/staging database; `true` for a disposable database or an authorized migration run |
| `FIREBASE_AUTH_EMULATOR_HOST` | Optional for local Auth Emulator testing, e.g. `127.0.0.1:9099` without `http://` |
| `AI_BASE_URL` | Optional; AI service URL for the Agent proxy, defaults to `http://localhost:8001` |
| `INTERNAL_API_TOKEN` | Shared with AI and sent as `X-Internal-Token`; a missing or mismatched value makes AI return `401`, which Core reports as `503 ai_unavailable` |
| `IDEMPOTENCY_TTL_DAYS` | Optional; retention of `Idempotency-Key` results, defaults to `30` |
| `CLOUDINARY_ENABLED` | `false` by default; set `true` only when all Cloudinary variables below are present |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-only Cloudinary credential; never commit or put in mobile/web variables |
| `CLOUDINARY_PUBLIC_ID_PREFIX` | Required when media is enabled; relative namespace such as `smartledger/local`, `smartledger/staging`, or `smartledger/prod` |
| `MEDIA_UPLOAD_LEASE_SECONDS` | PENDING Product/logo/avatar upload lease, defaults to `300`; an expired lease can be safely claimed again with the same key/file |
| `CLOUDINARY_CLEANUP_FIXED_DELAY_MS` | Optional cleanup worker delay; defaults to `60000` ms and is useful as a short value only in local testing |

With `FLYWAY_ENABLED=true` (the default in `application.yml`) Flyway runs committed migrations at startup; JPA then validates the schema. The shared dev/staging database is migrated only from merged code, so set `FLYWAY_ENABLED=false` when you point Core at it (see [Database migrations](../../README.md#database-migrations)). Use the same Firebase project ID for the backend and any locally generated test tokens.

## Cloudinary media

Core uploads one Product image and one Shop logo as public media, and one user avatar as authenticated media. The client calls Core multipart endpoints; it never receives `CLOUDINARY_API_SECRET` or a provider public ID. Core accepts JPEG/PNG only, validates bytes rather than the filename/MIME, limits files to 5 MiB and dimensions to 2048×2048.

Set `CLOUDINARY_ENABLED=true` only together with cloud name, API key, API secret and a prefix. Startup deliberately fails when one is missing or the prefix is unsafe. Use separate credentials or at least prefixes for local/staging/production; for example `smartledger/local`, `smartledger/staging`, `smartledger/prod`. When disabled, media writes return `503 media_unavailable`, the cleanup worker is absent, and session endpoints still work even for an account that has a stored avatar reference.

Replacing or deleting a Product image/logo/avatar commits a `media_cleanup_jobs` row alongside the database change. The worker locks PENDING jobs with `FOR UPDATE SKIP LOCKED`, checks current references and active uploads, then deletes the old asset. Its per-job transaction remains open during deletion; competing workers skip it. Retry updates only PENDING jobs. New assets uploaded before a database rollback may still require operational cleanup.

All three uploads require `Idempotency-Key`. V14 adds `media_upload_keys` with SHOP scope for Product/logo and USER scope for avatar. An active duplicate receives `409 media_upload_in_progress`; a completed request replays its snapshot. Avatar replay regenerates the delivery URL. Expired upload leases are reclaimed atomically with a new token; old uploaders cannot complete or release a newer reservation. Final writes lock/recheck the entity and lease before changing references/audit. Deterministic public IDs use `overwrite=true` to retry identical bytes. Monetary idempotency remains in `api_idempotency_keys`.

Firebase `avatar_url` remains a fallback and keeps syncing. DELETE removes only the custom Cloudinary avatar; later sessions return the fallback. When Cloudinary is disabled, DELETE with a reference returns `503`; an absent custom reference remains a `204` no-op. Apply V13/V14 using the reviewed migration workflow before deploying to a shared database. Apply V13 audit CHECK validation during reduced or stopped writes. See the [API contract](../../docs/contracts/api-contracts.md#1-auth-và-tiệm).

## Windows PowerShell

Open PowerShell in `backend/core`, configure the variables above in that terminal (or use an IntelliJ Run Configuration), then run:

```powershell
.\mvnw.cmd spring-boot:run
```

With the default port, open `http://localhost:8080/swagger-ui/index.html` to check that Core started. Press `Ctrl+C` to stop it.

## macOS / Linux

Open a terminal in `backend/core`, export the same variables, then run:

```bash
./mvnw spring-boot:run
```

If the wrapper is not executable, run `chmod +x mvnw` once. Swagger uses the same default URL and port as on Windows.

## IntelliJ IDEA

Open `backend/core` as a Maven project and use JDK 21. Run `com.smartledger.core.SmartLedgerCoreApplication`. In **Run → Edit Configurations**, add the variables from the table to **Environment variables**; setting them in a separate terminal does not automatically pass them to IntelliJ. Make sure the database in `DATABASE_URL` is reachable before running the application.

## Docker Compose

Run this from the **repository root** with Docker Desktop/Engine running. Compose has no PostgreSQL container: database credentials come from the root `.env.staging`, and `backend/core/.env` supplies `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` as an absolute path to the JSON file on the host. See the root [README](../../README.md#local-compose) for the env files.

```powershell
docker compose --env-file .env.staging --env-file backend/core/.env up --build core
```

Omit `core` to start AI as well. Compose mounts the service-account JSON read-only and sets its path inside the container. Core listens on container port `8080`; Compose exposes it on host port `8000` by default (`CORE_PORT` changes the host port). Open `http://localhost:8000/swagger-ui/index.html` to check startup. Stop with `Ctrl+C`, then run `docker compose down` from the repository root when finished.

If the Firebase Auth Emulator runs on the host, configure `FIREBASE_AUTH_EMULATOR_HOST` with an address reachable **from the container**; `127.0.0.1` inside Core means the container, not the host.

Compose forwards `CORS_ALLOWED_ORIGINS`, `OPENAPI_ENABLED`, `SWAGGER_UI_ENABLED` and the Cloudinary variables into Core. Set the FE origins and Cloudinary values in the selected environment and recreate the Core container after changing them. Host/IntelliJ and hosted runtimes use the same variables directly.

## Browser access and deployment checks

For a browser calling Core directly, set `CORS_ALLOWED_ORIGINS` in the process running Core. For example, with Expo web on port `8081`:

```powershell
$env:CORS_ALLOWED_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'
```

For staging/production, use only the actual FE HTTPS origins, for example `https://your-staging-app.vercel.app`. An origin contains a scheme, hostname and optional port, **not** a path or trailing slash. Wildcards and wildcard preview domains are rejected. Add a preview origin explicitly only when needed. A local proxy is not a substitute for deployed CORS configuration.

CORS allows `Authorization`, `Content-Type`, `X-Shop-Id` and `Idempotency-Key` headers. Authentication still uses a bearer token, not cross-site cookies: allowing an origin does not grant a role or access to a shop. Native clients and tools such as PowerShell still require the normal authentication/authorization checks even though CORS is a browser restriction.

The following GET endpoints do not require a token and return a health status, without component details or credentials. The aggregate endpoint also lists the available probe group names:

| Endpoint | Purpose |
|---|---|
| `/actuator/health/liveness` | Process availability; does not check PostgreSQL or AI |
| `/actuator/health/readiness` | Readiness state plus PostgreSQL connectivity; returns `503` when not ready |
| `/actuator/health` | Aggregate health status |

Point a deployment health check at `/actuator/health/readiness`. Health is the only exposed Actuator endpoint; other management endpoints are not exposed. Health does **not** verify Firebase sign-in, schema completeness or the entire business flow. AI availability is not a Core readiness dependency.

Keep environment configuration separate: the existing Firebase project `smart-ledger-c2892` is for dev/staging; `smartledger-production` is for production; the Auth Emulator is local-only. Each hosted environment needs its own database credentials, matching Firebase project/service account, FE origin and (when using AI) internal token. Do not set `FIREBASE_AUTH_EMULATOR_HOST` on a real staging/production runtime. Keep service-account JSON and database passwords outside Git and out of FE configuration. Do not point local tests at the production database.

On production, explicitly set `OPENAPI_ENABLED=false` and `SWAGGER_UI_ENABLED=false`; this disables `/v3/api-docs`, its Swagger configuration endpoint and the Swagger UI. Keep both `true` on staging for API testing. These settings do not change business authentication or health checks. There is no automatic environment detection: loading a production database env file alone does not turn documentation off. With multiple Compose `--env-file` arguments, the later file and process environment can override earlier values; avoid loading local/staging Swagger settings over production settings.

After startup, test real Firebase tokens (valid, wrong project and expired), OWNER/ADMIN permissions and cross-shop denial, then run the FE business flow with mocks disabled. A passing health check or mocked web test alone does not complete CORE-004 acceptance.

## Read-only staging auth smoke check

Use [scripts/verify_staging_auth.ps1](scripts/verify_staging_auth.ps1) in Windows PowerShell 5.1 or PowerShell 7. It makes **GET requests only**, uses no production credentials and does not sign up users, create sessions or change business data. Choose the actual HTTPS **staging** origin explicitly; the script cannot determine whether a domain belongs to production. Never run it against production as a substitute for staging UAT.

Prepare two different existing OWNER profiles with their own ACTIVE shops and one existing ADMIN profile. Provision these fixtures through the team's approved process first; this script does not create them. Put the following variables in the process that runs the script:

| Variable | Value |
|---|---|
| `CORE_STAGING_URL` | Core HTTPS origin, without `/api/v1`, credentials or query parameters |
| `CORE_STAGING_FIREBASE_PROJECT_ID` | Expected staging project ID, normally `smart-ledger-c2892` |
| `CORE_STAGING_SHOP_A_ID`, `CORE_STAGING_SHOP_B_ID` | Different ACTIVE shop IDs belonging to OWNER A and OWNER B |
| `CORE_STAGING_OWNER_A_TOKEN`, `CORE_STAGING_OWNER_B_TOKEN`, `CORE_STAGING_ADMIN_TOKEN` | Fresh real Firebase **ID tokens** for those staging users |
| `CORE_STAGING_WRONG_PROJECT_TOKEN` | Fresh, genuinely issued Firebase ID token from another project (use a separate non-production test project) |
| `CORE_STAGING_EXPIRED_TOKEN` | Genuinely issued staging ID token expired for at least ten minutes; do not edit a JWT to manufacture this fixture |

Obtain tokens locally using the Firebase SDK. Do not paste tokens into chat, source code, committed env files or command-line arguments. The backend's service-account JSON is not an ID token. You may populate a token variable from your local SDK result, e.g. `$env:CORE_STAGING_OWNER_A_TOKEN = $login.idToken`; clear the five token variables when finished and close the test terminal. The script neither prints tokens nor dumps response bodies.

From `backend/core`, after setting all the variables:

```powershell
.\scripts\verify_staging_auth.ps1
```

Missing/invalid fixtures, unexpected status/error contracts, network failures or redirects fail the run instead of reporting success. JWT payload decoding checks fixture metadata only; the script does not verify signatures locally, so fake tokens are not evidence for the real Firebase matrix. There are 54 read-only checks: readiness, token rejection, roles, own-shop access and cross-shop/ADMIN denial across nine OWNER read APIs. Successful output does **not** prove FE integration, create/confirm/repay/void/expense writes, ADMIN status changes or provider UI behavior. Keep those as separate UAT checks. A private service-account file outside the repo is normal; do not commit it to make this script work.

The tool's offline guards can be checked with `.\scripts\test_verify_staging_auth.ps1`. This uses synthetic fixtures and an in-memory transport, makes no network calls and is **not** a real staging/Firebase acceptance run.

## Run tests

From `backend/core`:

```powershell
.\mvnw.cmd test
```

On macOS/Linux, use `./mvnw test`. If startup fails, check the PostgreSQL connection, Firebase credentials, and Flyway error in the Core logs.

For the real PostgreSQL repayment/void concurrency and rollback tests, point these **test-only** variables at a disposable PostgreSQL database:

```powershell
$env:CORE_TEST_POSTGRES_URL = 'jdbc:postgresql://localhost:55432/core_test'
$env:CORE_TEST_POSTGRES_USERNAME = 'test_user'
$env:CORE_TEST_POSTGRES_PASSWORD = 'test_password'
.\mvnw.cmd '-Dtest=DebtVoidPostgresTest' test
```

The test creates and removes only a randomly named `core_void_test_*` schema, requires permission to create schemas, and does not run Flyway. It uses real business services and transactions, with auth/idempotency stubbed. Without `CORE_TEST_POSTGRES_URL`, PostgreSQL suites are skipped; unit/web tests still run normally.

### Admin dashboard development tests

With the same disposable PostgreSQL variables, run:

```powershell
.\mvnw.cmd '-Dtest=AdminDashboardControllerWebTest,AdminAccessAuditServiceTest,AdminDashboardPostgresTest' test
```

`AdminDashboardPostgresTest` applies the actual V1–V15 Flyway migrations inside a generated `core_admin_test_*` schema, then removes that schema. It exercises the migrated schema without manual constraint fixtures. No additional audit table is created. Do not point test variables at staging or production.

ADMIN and OWNER events share the existing `audit_logs`; ADMIN reads are separated by their `ADMIN_*` actions and API whitelists. Shop status changes reuse the existing `SHOP_INACTIVATED`/`SHOP_REACTIVATED` event once. V11 extends action/target constraints and allows missing shop/target IDs only for the corresponding ADMIN reads; business events still require both IDs. Existing history, V10 foreign keys and append-only triggers are preserved. Failed audit persistence returns `503 admin_audit_unavailable` and rolls back the operation.

For a fresh disposable local database, use `FLYWAY_ENABLED=true` and `SPRING_JPA_HIBERNATE_DDL_AUTO=validate` to apply V1–V15 and validate the entity mappings. A Flyway-managed database already at V10 can apply V11/V12/V13/V14/V15 in order. Follow the repository's merged-code migration policy for shared environments. Do not enable Flyway blindly on a Hibernate-created database without migration history: V10 rejects pre-existing ADMIN read events. Use a fresh local database or a separately reviewed adoption plan, preserving the original database. The migrations do not baseline or repair migration history.

If V11 validation fails, PostgreSQL rolls back its schema changes; review the offending records before retrying. Recovery uses a forward fix retaining audit history. Restoring V10 constraints or older readers that cannot handle `ADMIN_*` events is unsafe after these records exist. Integrated Firebase/FE UAT and document alignment remain pending.

To run **all** Core tests, including migration, audit/checkout rollback and real PostgreSQL readiness coverage, keep the three test-only variables above and run `.\mvnw.cmd verify` (or `./mvnw verify`). The migration/audit suites manage their own randomly named schemas; use a disposable database with schema-creation permission. The readiness test checks connectivity with valid and deliberately invalid test credentials, so an expected database-health warning can appear in the logs.

### Stock-in development tests

Product stock-in adds a positive quantity under the same row lock used by checkout, void and catalog edits. PATCH no longer accepts `stockQuantity`, including null; enabling tracking starts at zero. Create and ProductResponse keep initial/current stock. See the [Product contract](../../docs/contracts/api-contracts.md#22-product) for the request, retry rules and required mobile coordination. No migration is added; V7/V10/V11 storage is reused.

With the disposable `CORE_TEST_POSTGRES_*` variables above, run:

```powershell
.\mvnw.cmd '-Dtest=ProductStockInServiceTest,ProductServiceTest,CoreBusinessContractWebTest,ApiDocumentationWebTest,IdempotencyServiceTest,AuditLogPostgresTest' test
```

`AuditLogPostgresTest` applies V1–V15 in a generated `core_audit_test_*` schema and removes only that schema. It checks concurrent receipts/retries and contention with checkout/void/PATCH/archive, audit/idempotency-write rollback, authorization and numeric overflow. Do not use shared/staging/production databases. Manual Swagger checks and mobile UAT remain separate.

### Advanced report development tests

`GET /api/v1/reports/top-products`, `/sales-series` and `/profit-estimate` reuse the summary periods and do not change `/reports/summary`. V12 adds nullable `sale_items.estimated_cost_vnd`; historical/custom/unknown-cost rows remain null. Confirm snapshots known line cost once, while PostgreSQL aggregate queries allocate sale discount, apply soldAt/voidedAt event timing and report incomplete cost coverage explicitly.

With the disposable `CORE_TEST_POSTGRES_*` variables above, run:

```powershell
.\mvnw.cmd '-Dtest=AdvancedReportServiceTest,ExpenseReportControllerWebTest,ReportAggregationPostgresTest,SaleDraftServiceTest' test
```

`ReportAggregationPostgresTest` applies V1–V15 in a generated `core_report_test_*` schema and removes only that schema. It verifies the nullable/nonnegative snapshot constraint, discounted item revenue, catalog/custom grouping, a prior-period void, daily event buckets and incomplete profit estimates. Mobile still computes its existing local analytics until FE integrates these endpoints; Core tests are not FE/staging UAT.

### Cloudinary media development tests

Run the unit/web contract tests without any Cloudinary network credential:

```powershell
.\mvnw.cmd '-Dtest=CloudinaryMediaConfigurationTest,MediaControllerWebTest,MediaServiceTest,MediaWriteTransactionServiceTest,MediaCleanupWorkerTest,MediaCleanupWorkerConfigurationTest,ImageUploadValidatorTest,MediaPublicIdFactoryTest,MediaIdempotencyReplayTest,MediaPersistenceModelTest,SaleRefundMigrationPostgresTest' test
```

Set `CORE_TEST_POSTGRES_*` only to a disposable PostgreSQL database to run the V13/V14 migration assertions and media concurrency tests. To smoke-test a real provider locally, set `CLOUDINARY_ENABLED=true`, all four Cloudinary values, `FLYWAY_ENABLED=false` and use a schema already created by local `ddl-auto=update`; do **not** point a feature branch at shared staging with `update`. Upload a small JPEG/PNG through Swagger, verify only the returned URL, replace it, then verify a `media_cleanup_jobs` row becomes COMPLETED. Local `CLOUDINARY_CLEANUP_FIXED_DELAY_MS=5000` can shorten the test wait. Do not paste Cloudinary API secrets or delivery URLs with authenticated signatures into source, tickets, or chat.

## Time display

No extra IntelliJ, JVM or Docker timezone setting is required. Core uses UTC internally; API timestamps include Vietnam's `+07:00` offset, and report periods follow the Vietnam calendar. Clients should parse the offset, not add seven hours. Date/time inputs must include an offset (`Z` or `+07:00`).

Optionally display PostgreSQL `TIMESTAMPTZ` values in Vietnam time in your SQL client's connection:

```sql
SET TIME ZONE 'Asia/Ho_Chi_Minh';
```

This affects only that connection's display, not stored data or teammates' connections. Reapply after reconnecting, or use the SQL client's session initialization setting.


## OWNER in-app notifications

V15 adds nullable `products.low_stock_threshold` and the existing ERD's `notification_events` / `notification_recipients`. Apply it through the reviewed migration workflow before using `ddl-auto=validate` with this code. No historical alerts or default thresholds are backfilled. A valid Hibernate-created local schema may be adopted, but first test a disposable copy with migration history; invalid rows stop migration. Do not baseline/repair a shared database or run feature-branch migrations there. Recovery retains these additive structures and read history; corrections use forward migrations. Stop writes during local-table adoption/index/CHECK validation; production-sized migration locking has not been benchmarked.

Set `lowStockThreshold` via Product create/PATCH (nullable, nonnegative, max 12 integer/3 fractional digits). Omitted PATCH keeps it; explicit null clears it. Tracked stock zero always raises OUT_OF_STOCK; positive stock at/below a configured threshold raises LOW_STOCK. Same-level changes do not repeat an open alert. Level changes, restocking above threshold, tracking disable and archive resolve old alerts; subsequent episodes are new events. A resolved alert remains unread until marked read. Old products are reconciled on the next business write, not by migration or an automatic startup scan.

Bearer OWNER token is required, but no `X-Shop-Id` or idempotency header for:

- `GET /api/v1/me/notifications?shopId=4&page=0&size=20` (optional shop/type/unreadOnly filters).
- `GET /api/v1/me/notifications/unread-count?shopId=4`.
- `PATCH /api/v1/me/notifications/{eventId}/read` → 204.
- `PATCH /api/v1/me/notifications/read` with `{ "ids": [1, 2] }` → atomic 204.

Pages start at 0; size 1–100 and offset <=2147483647. OWNER must be ACTIVE, have a recipient and still own the shop. INACTIVE shops expose only status notifications; ARCHIVED shops are excluded. Retry/parallel reads preserve the first readAt. Any inaccessible ID rejects the whole batch with 404. See [notification contract](../../docs/contracts/api-contracts.md#8-notification-owner--đã-có-trên-featapp-notifications) and PRD AC-055–058.

`NotificationPostgresTest` runs in a generated `core_notification_test_*` schema with actual V1–V15 and Hibernate validation, without a supplemental schema fixture. It covers event lifecycle, notification-write rollback, replay/concurrent checkout/void, read concurrency and cross-shop/status isolation. `SaleRefundMigrationPostgresTest` additionally tests V15 upgrade, local-table adoption and atomic migration failure/retry. Supply all `CORE_TEST_POSTGRES_*` variables pointing only to a disposable PostgreSQL DB. No push delivery/device registration/FCM/email/SMS/debt reminders or notification FE integration is implemented by this change.
