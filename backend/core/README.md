---
type: Service Guide
title: "SmartLedger Core — setup"
description: "How to run, configure and test the Java Core service, with links to owned feature and verification guides."
owner: Core owner
status: stable
author: miphu2804
---
# SmartLedger Core — setup

Core is the Java 21 / Spring Boot backend. It owns the public API, authentication and authorization boundary, business transactions, and PostgreSQL access. This page is the local setup and operational boundary; the [verification guide](docs/verification.md) owns detailed regression commands and evidence. Product behavior and endpoint contracts remain in the [API contracts](../../docs/contracts/api-contracts.md) and [documentation guide](../../docs/README.md).

## Boundary and feature status

Code and migrations checked into this worktree are implementation evidence, not proof that a migration has run in a shared database or that a feature has passed integrated acceptance. Shared databases are changed only from reviewed, merged code through the [migration workflow](../../docs/development/local-development.md#database-migrations). Feature-specific status, rollout and recovery pages:

- [CORE-019 quotas](docs/user-rate-limits.md) — V20 activation and recovery; default-off.
- [CORE-018 daily activity](docs/user-daily-activity.md) — V19 telemetry, retention and read-only Grafana handoff; default-off.
- [Admin daily creation counts](docs/admin-dashboard-growth.md) — additive API handoff; FE/staging acceptance remains separate.
- [CORE-021 stock decreases](docs/stock-adjustments.md) — transaction and FE handoff; no migration.
- [Zalo web implementation plan](docs/zalo-auth-implementation-plan.md), [local evidence](docs/zalo-auth.tdd.md), [Android rollout](docs/zalo-android-preparation.md), and [manual local kit](docs/zalo-manual-login.md).

## Prerequisites and configuration

- JDK 21 for a host/IntelliJ run. The Maven wrapper downloads Maven; a separate Maven installation is not needed.
- PostgreSQL: use the shared staging Supabase database from the repository `.env.staging` only for an approved run, or a local `smartledger` database. Never point local tests at production.
- Firebase project ID and a service-account JSON file. Keep the JSON outside the repository and never commit it.

Set these variables in the process that launches Core. [`.env.example`](.env.example) is a reference; Spring Boot does not load it automatically.

| Variable | Description |
|---|---|
| `DATABASE_URL` | JDBC URL, for example `jdbc:postgresql://localhost:5432/smartledger` |
| `DATABASE_USERNAME`, `DATABASE_PASSWORD` | PostgreSQL credentials |
| `FIREBASE_PROJECT_ID` | Firebase project used by this backend |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to the service-account JSON on the machine running Core |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional server-only JSON text; when nonempty it takes precedence over file/ADC credentials |
| `SERVER_PORT`, `PORT` | Optional; `SERVER_PORT`, then hosted `PORT`, then `8080` |
| `CORS_ALLOWED_ORIGINS` | Exact comma-separated browser origins; empty means no cross-origin browser access |
| `OPENAPI_ENABLED`, `SWAGGER_UI_ENABLED` | Both default to `true` for local/staging; set both to `false` on production |
| `FLYWAY_ENABLED` | `false` for shared dev/staging; `true` for disposable databases or an authorized migration run |
| `FIREBASE_AUTH_EMULATOR_HOST` | Optional host:port such as `127.0.0.1:9099`, without `http://` |
| `AI_BASE_URL` | Optional Agent service URL; defaults to `http://localhost:8001` |
| `INTERNAL_API_TOKEN` | Shared with AI as `X-Internal-Token`; missing/mismatched values produce `503 ai_unavailable` through Core |
| `IDEMPOTENCY_TTL_DAYS` | Optional `Idempotency-Key` retention; defaults to `30` |
| `CLOUDINARY_ENABLED` | `false` by default; enable only with all Cloudinary values below |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-only media credentials; never put them in mobile/web variables |
| `CLOUDINARY_PUBLIC_ID_PREFIX` | Required when media is enabled; use a separate safe namespace such as `smartledger/local` |
| `MEDIA_UPLOAD_LEASE_SECONDS` | PENDING upload lease, default `300`; expired leases can be reclaimed safely |
| `CLOUDINARY_CLEANUP_FIXED_DELAY_MS` | Optional cleanup-worker delay, default `60000`; shorten only for local testing |

With `FLYWAY_ENABLED=true` (the default in `application.yml`), Flyway runs committed migrations at startup and JPA validates the schema. Set it to `false` for a shared dev/staging database unless the migration owner is running an approved migration. A fresh disposable database may apply the checked-in migration set; do not baseline, repair or adopt an unexpected shared schema. Use the same Firebase project for backend credentials and locally generated test tokens.

Keep `FIREBASE_AUTH_EMULATOR_HOST` unset with real Firebase. Setting it to `127.0.0.1:9099` directs Admin SDK calls to the emulator and requires that emulator to be running; a database role change does not repair an emulator or wrong-project token.

### Cloudinary media

Core accepts JPEG/PNG by validated bytes rather than filename/MIME, limits uploads to 5 MiB and 2048×2048, and never sends `CLOUDINARY_API_SECRET` or provider public IDs to clients. Startup fails if a media credential or unsafe prefix is missing. Use separate credentials or at least prefixes such as `smartledger/local`, `smartledger/staging` and `smartledger/prod`. Product image/logo uploads are public media; user avatars are authenticated media. When disabled, media writes return `503 media_unavailable`, cleanup is absent, and session endpoints still work with a stored avatar reference.

Replacement/deletion writes a `media_cleanup_jobs` row with the database change. The worker claims PENDING jobs using `FOR UPDATE SKIP LOCKED`, checks current references and active uploads, and retries only PENDING jobs. Provider deletion occurs while the per-job transaction is open; an asset uploaded before a database rollback may still need operational cleanup. All uploads require `Idempotency-Key`; an active duplicate returns `409 media_upload_in_progress`, a completed request replays its snapshot, and expired leases are reclaimed atomically so stale uploaders cannot complete a newer lease. Firebase `avatar_url` remains the fallback; DELETE removes only a custom Cloudinary avatar, while disabled media returns `503` when a custom reference exists and returns `204` for an absent reference. Apply V13/V14 only through the reviewed migration workflow; see the [API contract](../../docs/contracts/api-contracts.md#1-auth-and-shop) and [verification guide](docs/verification.md#cloudinary-media).

## Run locally

### Windows PowerShell

From `backend/core`, configure the variables above in that terminal or an IntelliJ Run Configuration:

```powershell
.\mvnw.cmd spring-boot:run
```

Check `http://localhost:8080/swagger-ui/index.html`, then stop with `Ctrl+C`.

### macOS / Linux

```bash
./mvnw spring-boot:run
```

If the wrapper is not executable, run `chmod +x mvnw` once. Swagger uses the same default port.

### IntelliJ IDEA

Open `backend/core` as a Maven project with JDK 21 and run `com.smartledger.core.SmartLedgerCoreApplication`. Add the variables above under **Run → Edit Configurations → Environment variables**; variables in another terminal are not passed automatically. Confirm `DATABASE_URL` is reachable.

### Docker Compose

Run from the repository root with Docker running. Compose has no PostgreSQL container: credentials come from root `.env.staging`, while `backend/core/.env` supplies `FIREBASE_PROJECT_ID` and an absolute host path to `GOOGLE_APPLICATION_CREDENTIALS`. See [Local Compose](../../docs/development/local-development.md#local-compose).

```powershell
docker compose --env-file .env.staging --env-file backend/core/.env up --build core
```

Omit `core` to start AI. Core listens on container port `8080`; Compose exposes host port `8000` by default (`CORE_PORT` changes it). Check `http://localhost:8000/swagger-ui/index.html`, stop with `Ctrl+C`, then run `docker compose down` from the repository root. A host Auth Emulator needs an address reachable from the container; `127.0.0.1` inside Core means the container.

The checked-in Compose file mounts a Firebase key and does not forward `FIREBASE_SERVICE_ACCOUNT_JSON` or `ZALO_*`. Adding those variables to an env file does not enable them in Compose; use host/IntelliJ or reviewed hosted configuration, or an explicit override. Recreate Core after changing forwarded values.

## Browser, deployment and health checks

For a browser calling Core directly, configure exact origins in the process running Core, for example:

```powershell
$env:CORS_ALLOWED_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'
```

Use actual HTTPS FE origins in hosted environments, with no path or trailing slash. Wildcards and wildcard preview domains are rejected. CORS allows `Authorization`, `Content-Type`, `X-Shop-Id` and `Idempotency-Key`; it does not grant authentication or shop access. Native clients and PowerShell still use normal bearer and authorization checks.

Unauthenticated health endpoints expose status without component details or credentials:

| Endpoint | Purpose |
|---|---|
| `/actuator/health/liveness` | Process availability; no PostgreSQL/AI check |
| `/actuator/health/readiness` | PostgreSQL readiness; `503` when not ready |
| `/actuator/health` | Aggregate status and probe names |

Point deployment checks at readiness. Health does not verify Firebase, schema completeness, AI availability or the whole business flow; health is the only exposed Actuator surface.

Keep Firebase projects, database credentials, FE origins and internal tokens separate per environment. Do not set the Auth Emulator on staging/production, put service-account JSON or database passwords in Git/FE configuration, or use a production database for local tests. On production explicitly set `OPENAPI_ENABLED=false` and `SWAGGER_UI_ENABLED=false`; there is no automatic environment detection and later `--env-file`/process values can override earlier ones.

After startup, test real Firebase tokens (valid, wrong project and expired), OWNER/ADMIN permissions and cross-shop denial, then the FE business flow with mocks disabled. Health or a mocked web test alone is not CORE-004 acceptance.

### Read-only staging auth smoke check

Use [scripts/verify_staging_auth.ps1](scripts/verify_staging_auth.ps1) only against the actual HTTPS staging origin. It performs GET requests, creates no users/sessions/data, and is not production UAT. Prepare two existing OWNER profiles with different ACTIVE shops and one existing ADMIN through the approved fixture process; the script does not create them.

Set `CORE_STAGING_URL`, `CORE_STAGING_FIREBASE_PROJECT_ID`, `CORE_STAGING_SHOP_A_ID`, `CORE_STAGING_SHOP_B_ID`, `CORE_STAGING_OWNER_A_TOKEN`, `CORE_STAGING_OWNER_B_TOKEN`, `CORE_STAGING_ADMIN_TOKEN`, `CORE_STAGING_WRONG_PROJECT_TOKEN` and `CORE_STAGING_EXPIRED_TOKEN` in the script process. Use genuinely issued Firebase ID tokens; do not edit JWTs, paste tokens into chat/source/command arguments, or use service-account JSON as an ID token. Clear token variables and close the terminal afterward.

```powershell
.\scripts\verify_staging_auth.ps1
```

The 54 checks cover readiness, rejection, roles, own-shop access and cross-shop/ADMIN denial across nine OWNER read APIs. JWT decoding checks fixture metadata only; signatures are verified by Core. Missing fixtures, redirects, network failures or unexpected contracts fail the run. The offline guard test uses synthetic fixtures and no network; neither it nor this smoke check proves FE integration, writes, provider UI or production state.

## Run tests

From `backend/core`:

```powershell
.\mvnw.cmd test
```

On macOS/Linux use `./mvnw test`. Core retries its first database connection for 30 seconds before startup fails; inspect PostgreSQL, Firebase and Flyway logs.

Real PostgreSQL suites require a **disposable** database with schema-creation permission. They do not run Flyway against the target database and are skipped when `CORE_TEST_POSTGRES_URL` is absent; skipped is not full verification. Never use a business, shared staging or production database:

```powershell
$env:CORE_TEST_POSTGRES_URL = 'jdbc:postgresql://localhost:55432/core_test'
$env:CORE_TEST_POSTGRES_USERNAME = 'test_user'
$env:CORE_TEST_POSTGRES_PASSWORD = 'test_password'
.\mvnw.cmd verify
python scripts/verify_postgres_tests.py target/surefire-reports
```

The suites create and remove only generated schemas. For a focused list of suites and migration/history boundaries, see the [Core verification guide](docs/verification.md). For repayment/void concurrency only:

```powershell
.\mvnw.cmd '-Dtest=DebtVoidPostgresTest' test
```

The test creates/removes only a random `core_void_test_*` schema, requires schema creation, and stubs auth/idempotency. Without the test URL it is skipped.

## Zalo and Core authentication

Zalo web and Android remain disabled by runtime default and require their reviewed V17/V18 rollout before activation. The canonical implementation plan owns the web contract and safeguards; the [Android runbook](docs/zalo-android-preparation.md) owns V18 activation/recovery; the [manual guide](docs/zalo-manual-login.md) is isolated local tooling only. Do not copy `ZALO_MANUAL_*` settings to a VPS.

The host/IntelliJ configuration names are:

| Variable | Meaning |
|---|---|
| `ZALO_ENABLED` / `ZALO_NATIVE_ENABLED` | Feature flags; both default `false` |
| `ZALO_APP_ID`, `ZALO_APP_SECRET` | Provider ID and server-only secret; never FE/Git/logs/chat |
| `ZALO_CALLBACK_URL` | Exact public HTTPS `/api/v1/auth/zalo/callback` |
| `ZALO_CLIENT_ORIGINS` | Exact HTTPS FE origins, no path/trailing slash/wildcard |
| `ZALO_SESSION_ENCRYPTION_KEY` | Standard Base64 of a separate random 32-byte AES key; not app/Firebase credentials |
| `ZALO_SESSION_TTL_SECONDS`, `ZALO_PROOF_TTL_SECONDS` | Defaults 300/90; allowed 60–600 and 15–90, proof ≤ session |
| `ZALO_HTTP_TIMEOUT_SECONDS` | Default 10; allowed 1–30 per provider request |

No provider tokens, callback query/body, proof, verifier, cookies or credentials belong in logs. Configure trusted proxy handling and edge throttling before any hosted activation. Local Zalo tests use only disposable PostgreSQL and do not establish FE, real-provider, staging, APK or production acceptance.

## Time display

Core stores UTC internally, API timestamps carry Vietnam's `+07:00` offset, and report periods use the Vietnam calendar. Clients must parse the offset, not add seven hours. Date/time inputs require `Z` or `+07:00`. To display PostgreSQL `TIMESTAMPTZ` in Vietnam time for one SQL connection:

```sql
SET TIME ZONE 'Asia/Ho_Chi_Minh';
```

This changes display only and must be reapplied after reconnecting.

## Compatibility anchors

Detailed sections moved from this landing page remain available in the [verification guide](docs/verification.md). These explicit anchors keep existing architecture/contract links discoverable while directing readers to the new owner:

<a id="cloudinary-media"></a>
<a id="run-tests"></a>
<a id="exact-product-barcode-lookup-and-active-only-uniqueness-core-012--163164"></a>
<a id="owner-list-pagination-core-011"></a>
<a id="sale-and-draft-list-query-regression-tests"></a>
<a id="core-014-filtered-sale-totals"></a>
<a id="checkout-and-void-batch-product-lock-tests"></a>
<a id="batch-stock-alert-reconciliation-tests"></a>
<a id="draft-batch-product-read-tests"></a>
<a id="core-013-concurrency-and-stock-restoration-regression-tests"></a>
<a id="zalo-authentication-core-015-local-backend-implementation"></a>

See the [verification index](docs/verification.md#verification-map) for the replacement section names and commands.
