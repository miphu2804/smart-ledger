---
type: Service Guide
title: "SmartLedger Core — setup"
description: "How to run, configure and test the Java Core service, with links to service-owned verification and rollout guides."
owner: Core owner
author: miphu2804
status: stable
stale_after: 2027-01-05T22:18:48+07:00
---
# SmartLedger Core — setup

Core is the Java 21 / Spring Boot public API for SmartLedger, which runs in production. It owns authenticated business transactions and shop access, and proxies Agent chat to the internal AI service. Code is predominantly layered (`controller/`, `service/`, `repository/`, `entity/`, `dto/`) with capability packages such as `zalo/`, `media/` and `ratelimit/`; this documentation cleanup does not reorganize code.

[API contracts](../../docs/contracts/api-contracts.md) owns consumer behavior; [technical design §1](../../docs/architecture/technical-design.md#1-scope) owns implementation evidence. Service-owned [feature handoffs and verification](docs/index.md) own rollout, recovery and focused regression commands. Checked-in migrations, runtime flags, deployment and acceptance are separate facts.

## Prerequisites and configuration

Use JDK 21 and the Maven wrapper; a separate Maven install is unnecessary. Spring does not load `.env` automatically: export the values into the process or use IntelliJ's run configuration. Start from [`.env.example`](.env.example); retrieve team credentials through the [secrets workflow](../../docs/development/secrets-and-env.md), never from Git/chat.

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | Reachable PostgreSQL database; use JDBC URL syntax |
| `FIREBASE_PROJECT_ID` | Must match the client Firebase project |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to a server-only Firebase service-account file |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Hosted JSON alternative; a non-empty value takes precedence over file/ADC |
| `FLYWAY_ENABLED` | Source default is `true`; explicitly set `false` for ordinary shared dev/staging runs |
| `CORS_ALLOWED_ORIGINS` | Exact comma-separated browser origins; no path, trailing slash or wildcard |
| `AI_BASE_URL`, `INTERNAL_API_TOKEN` | Internal AI URL and shared token; absent/mismatched token makes Agent calls unavailable |
| `OPENAPI_ENABLED`, `SWAGGER_UI_ENABLED` | Explicitly set both `false` on production; no automatic environment detection |

`SERVER_PORT`, then hosted `PORT`, then `8080` selects the port. `IDEMPOTENCY_TTL_DAYS` defaults to 30. Keep `FIREBASE_AUTH_EMULATOR_HOST` unset with real Firebase; only a deliberate local emulator run should set a host:port such as `127.0.0.1:9099`, without a scheme. A role change cannot repair a wrong-project token or unreachable emulator.

## Run locally

Run from `backend/core` against an already compatible schema; preserve the shared-database migration boundary:

```bash
cp -n .env.example .env   # keeps an existing .env; fill in the values once
set -a && source .env && set +a
FLYWAY_ENABLED=false ./mvnw spring-boot:run
```

On Windows PowerShell, set the environment in that terminal or IntelliJ, then run `.\mvnw.cmd spring-boot:run`. On macOS/Linux, use `chmod +x mvnw` once if needed. In IntelliJ, open this directory as a Maven project with JDK 21 and run `com.smartledger.core.SmartLedgerCoreApplication`; variables from another terminal are not inherited automatically.

Swagger is at `http://localhost:8080/swagger-ui/index.html` when enabled. Core retries the initial database connection for 30 seconds; inspect PostgreSQL, Firebase and Flyway logs on failure.

For Compose, run from the repository root:

```bash
docker compose --env-file backend/core/.env --env-file backend/ai/.env up --build core
```

Omit `core` to include AI. Core's container port is `8080`, exposed as host `8000` unless `CORE_PORT` changes it. Stop with `Ctrl+C`, then `docker compose down`. The default stack has no PostgreSQL service; see [Local Compose](../../docs/development/local-development.md#local-compose) and the opt-in local DB script. Compose mounts the Firebase file and does not forward `FIREBASE_SERVICE_ACCOUNT_JSON` or `ZALO_*`; an env-file entry alone cannot activate an unforwarded setting. Recreate Core after changing forwarded values. A host emulator requires a container-reachable address: container `127.0.0.1` means Core itself.

## Run tests

From `backend/core`, `./mvnw test` (PowerShell: `.\mvnw.cmd test`) runs the ordinary tests. Full verification needs an isolated disposable PostgreSQL with schema-creation permission:

```powershell
$env:CORE_TEST_POSTGRES_URL = 'jdbc:postgresql://localhost:55432/core_test'
$env:CORE_TEST_POSTGRES_USERNAME = 'test_user'
$env:CORE_TEST_POSTGRES_PASSWORD = 'test_password'
.\mvnw.cmd clean verify
python scripts/verify_postgres_tests.py target/surefire-reports
```

Without the test URL, PostgreSQL suites are skipped; skipped is not full verification. They create/drop generated schemas: never use a business, shared staging or production database. Run the report gate against fresh full-suite reports, not a focused run or stale output. [The verification guide](docs/verification.md) preserves focused test commands, fixture limits, query budgets, migration evidence and provider smoke procedures.

## Operational safety

- Shared migrations require reviewed code merged into `staging` and a named migration owner; never migrate from a feature branch, baseline an unexpected schema or repair away a failure. Follow [Database migrations](../../docs/development/local-development.md#database-migrations).
- `/actuator/health/readiness` checks PostgreSQL and returns `503` when unavailable; liveness checks only the process. Health does not prove Firebase, schema completeness, AI or business-flow acceptance. See [browser/deployment checks](docs/verification.md#browser-deployment-and-health-checks).
- Keep database credentials, Firebase projects, origins and internal tokens separate by environment; never put server credentials in FE configuration or run local tests against production.
- [Media setup and smoke testing](docs/verification.md#cloudinary-media), [Zalo runtime configuration](docs/zalo-auth-implementation-plan.md#runtime-configuration) and [feature rollout guides](docs/index.md) own their detailed flags, safety checks and recovery. No guide authorizes shared activation by itself.
- [Time display](docs/verification.md#time-display) explains UTC storage and Vietnam-offset API timestamps; clients must not add seven hours a second time.
