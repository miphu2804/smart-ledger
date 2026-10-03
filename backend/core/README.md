# SmartLedger Core — local setup

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
| `SERVER_PORT` | Optional; defaults to `8080` when running outside Compose |
| `FIREBASE_AUTH_EMULATOR_HOST` | Optional for local Auth Emulator testing, e.g. `127.0.0.1:9099` without `http://` |
| `AI_BASE_URL` | Optional; AI service URL for the Agent proxy, defaults to `http://localhost:8001` |
| `INTERNAL_API_TOKEN` | Shared with AI and sent as `X-Internal-Token`; a missing or mismatched value makes AI return `401`, which Core reports as `503 ai_unavailable` |
| `IDEMPOTENCY_TTL_DAYS` | Optional; retention of `Idempotency-Key` results, defaults to `30` |

Flyway runs committed migrations at startup and JPA validates the resulting schema. Use the same Firebase project ID for the backend and any locally generated test tokens.

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

## Time display

No extra IntelliJ, JVM or Docker timezone setting is required. Core uses UTC internally; API timestamps include Vietnam's `+07:00` offset, and report periods follow the Vietnam calendar. Clients should parse the offset, not add seven hours. Date/time inputs must include an offset (`Z` or `+07:00`).

Optionally display PostgreSQL `TIMESTAMPTZ` values in Vietnam time in your SQL client's connection:

```sql
SET TIME ZONE 'Asia/Ho_Chi_Minh';
```

This affects only that connection's display, not stored data or teammates' connections. Reapply after reconnecting, or use the SQL client's session initialization setting.
