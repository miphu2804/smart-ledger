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

With `FLYWAY_ENABLED=true` (the default in `application.yml`) Flyway runs committed migrations at startup; JPA then validates the schema. The shared dev/staging database is migrated only from merged code, so set `FLYWAY_ENABLED=false` when you point Core at it (see [Database migrations](../../README.md#database-migrations)). Use the same Firebase project ID for the backend and any locally generated test tokens.

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

Compose forwards `CORS_ALLOWED_ORIGINS`, `OPENAPI_ENABLED` and `SWAGGER_UI_ENABLED` from its env files into Core. Set the actual FE origins in the env file selected for that environment and recreate the Core container after changing them. Host/IntelliJ and hosted runtimes use the same variables directly.

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

The test creates and removes only a randomly named `core_void_test_*` schema, requires permission to create schemas, and does not run Flyway. It uses real business services and transactions, with auth/idempotency stubbed. Without `CORE_TEST_POSTGRES_URL`, these five PostgreSQL tests are skipped; unit/web tests still run normally.

To run **all** Core tests, including migration, audit/checkout rollback and real PostgreSQL readiness coverage, keep the three test-only variables above and run `.\mvnw.cmd verify` (or `./mvnw verify`). The migration/audit suites manage their own randomly named schemas; use a disposable database with schema-creation permission. The readiness test checks connectivity with valid and deliberately invalid test credentials, so an expected database-health warning can appear in the logs.

## Time display

No extra IntelliJ, JVM or Docker timezone setting is required. Core uses UTC internally; API timestamps include Vietnam's `+07:00` offset, and report periods follow the Vietnam calendar. Clients should parse the offset, not add seven hours. Date/time inputs must include an offset (`Z` or `+07:00`).

Optionally display PostgreSQL `TIMESTAMPTZ` values in Vietnam time in your SQL client's connection:

```sql
SET TIME ZONE 'Asia/Ho_Chi_Minh';
```

This affects only that connection's display, not stored data or teammates' connections. Reapply after reconnecting, or use the SQL client's session initialization setting.
