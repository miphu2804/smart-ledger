# Local development

How to install, run and check each service on a developer machine, how the local Compose stack reaches the databases, and how schema migrations reach the shared environments. Deployment to the VPS and Vercel is in [CI/CD](ci-cd.md); each service README has its own commands and variables. Run every command below from the repository root.

## Prerequisites

JDK 21, Python 3.11+ with [uv](https://docs.astral.sh/uv/), Node.js 20+, and Docker for the Compose stack and the local database. Frontends default to mock data and need no backend.

Get the team's credentials by following [`secrets/README.md`](../../secrets/README.md): it pulls them encrypted and writes `backend/core/.env`, `backend/ai/.env` and `frontend/mobile/.env`, with the staging database credentials. Without access, fill those files from their `.env.example` (the install commands below copy them when missing).

## Run each service

Each service has three steps: install once, run, and check before a pull request (the same checks CI runs).

### AI (Python, :8001)

```bash
cd backend/ai && uv sync --group dev && cp -n .env.example .env
```

```bash
cd backend/ai && uv run python -m src.main
```

```bash
cd backend/ai && uv run ruff check && uv run ruff format --check && uv run pytest
```

### Core (Java, :8080)

Spring does not read `.env`, so the run command exports it into the shell first. Flyway stays off against the shared database; see [Database migrations](#database-migrations).

```bash
cd backend/core && bash ./mvnw dependency:go-offline && cp -n .env.example .env
```

```bash
cd backend/core && set -a && source .env && set +a && FLYWAY_ENABLED=false bash ./mvnw spring-boot:run
```

```bash
cd backend/core && bash ./mvnw verify
```

### Mobile (Expo)

```bash
cd frontend/mobile && npm install
```

```bash
cd frontend/mobile && npx expo start
```

```bash
cd frontend/mobile && npm run typecheck && npm run export:web
```

### Web landing and admin (Vite, :5173)

`/admin` needs `VITE_ADMIN_ENABLED=true` in `frontend/web/.env.local`.

```bash
cd frontend/web && npm install
```

```bash
cd frontend/web && npm run dev
```

```bash
cd frontend/web && npm run lint && npm run build
```

### Core and AI together in Docker

Core is published on :8000 and AI on :8001. Neither command changes the database schema.

```bash
docker compose --env-file backend/core/.env --env-file backend/ai/.env up --build
```

## Local Compose

Dev and staging share the staging Supabase project and Redis Cloud database; production uses a separate Supabase project and Redis Cloud database. There are no local PostgreSQL or Redis containers. Credentials live in each service's Git-ignored env file: `backend/core/.env` defines `DATABASE_URL` (JDBC), `DATABASE_USERNAME`, `DATABASE_PASSWORD`, and `backend/ai/.env` defines `POSTGRES_URL`, `REDIS_URL` (use `rediss://` when TLS is enabled on Redis Cloud; no feature reads Redis yet) and the optional `AI_SQL_READER_URL` for the shop-data tool. Production values are in `secrets/production/env/`. Service settings stay in each service's own file: `backend/core/.env` supplies `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` (absolute host path of the service-account key, mounted read-only into the container), and Compose loads `backend/ai/.env` for model and API keys. Core calls AI at `AI_BASE_URL` (Compose sets `http://ai:8001`) with the shared `INTERNAL_API_TOKEN`: put the same value in `backend/ai/.env` and `backend/core/.env`; a missing or mismatched value makes every Agent call fail (`401` from AI, `503 ai_unavailable` from Core). Default stack is Core and AI. AI sends Pydantic Logfire traces only when `LOGFIRE_TOKEN` is set in `backend/ai/.env` (no message content); Langfuse is not enabled, and no code reads its keys.

```bash
docker compose --env-file backend/core/.env --env-file backend/ai/.env up --build
```

Do not run the app with the production bootstrap credentials; production values belong in the `production` environment's secret store. Automated tests use a disposable PostgreSQL (CI service containers), never Supabase: AI integration tests read `POSTGRES_TEST_URL`, Core PostgreSQL tests read `CORE_TEST_POSTGRES_URL` (see [Core README](../../backend/core/README.md#run-tests)).

## Database migrations

Dev and staging share one database, so a migration that runs from a developer machine changes the schema for everyone. Core runs Flyway at startup when `FLYWAY_ENABLED=true` (the Core default); the commands above set it to `false`, and Core then only checks that the schema matches its entities.

- **Never migrate the shared database from a feature branch.** A migration applied there and later edited, or a second branch that uses the same version number, makes Flyway reject the checksum and stops Core for everyone. A column change that is not merged yet breaks the code running on `staging`.
- **Never edit a migration that has run on staging**; add a new version instead. Production follows the same steps after the release is approved.

### Develop against the local database

`scripts/local-db.sh` starts a local PostgreSQL with the Core and AI migrations applied; the second command points Core and AI at it. See [Secrets and env files](secrets-and-env.md#3-set-up-a-machine).

```bash
scripts/local-db.sh
```

```bash
scripts/secrets/apply.sh staging dev --apply
```

### Develop a migration on a disposable database

CI repeats this on every pull request. A branch whose entities need a migration that staging lacks cannot start against the shared database, because the schema check fails.

1. Start a disposable PostgreSQL:

   ```bash
   docker run --rm -p 5432:5432 -e POSTGRES_DB=smartledger -e POSTGRES_USER=smartledger -e POSTGRES_PASSWORD=smartledger pgvector/pgvector:pg17
   ```

2. Point `DATABASE_URL=jdbc:postgresql://localhost:5432/smartledger` (and `POSTGRES_URL` for AI) at it.
3. Run Core with `FLYWAY_ENABLED=true`.

### Migrate staging after a merge

After a pull request with a Core or AI migration merges, one person checks out `origin/staging`, runs both steps, and tells the team. This manual step stands in for the staging deploy until one exists.

1. Run Core once with Flyway on:

   ```bash
   FLYWAY_ENABLED=true docker compose --env-file backend/core/.env --env-file backend/ai/.env up --build core
   ```

2. Push the AI migrations, as in the [AI README](../../backend/ai/README.md#schema-and-migrations):

   ```bash
   npx supabase@2.119.0 db push --db-url "$POSTGRES_URL"
   ```
