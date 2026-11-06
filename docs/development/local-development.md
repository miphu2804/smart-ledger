---
type: Runbook
title: "Local development"
description: "Setup, run commands, pre-PR checks, local Compose, the local database and the shared-database migration workflow."
owner: Technical owner
status: stable
author: miphu2804
stale_after: 2027-01-03T23:08:04+07:00
---
# Local development

How to install, run and check each service on a developer machine, how the local Compose stack reaches the databases, and how schema migrations reach the shared environments. Deployment to the VPS and Vercel is in [CI/CD](ci-cd.md); each service README has its own commands and variables. Run every command below from the repository root.

## Prerequisites

JDK 21, Python 3.11+ with [uv](https://docs.astral.sh/uv/), Node.js 20+, and Docker for the Compose stack and the local database. Offline frontend demos can use mock data without a backend. Mobile requires explicit API endpoint and mock flags; configure them using the [Mobile guide](../../frontend/mobile/README.md) rather than assuming defaults.

Follow [`secrets/README.md`](../../secrets/README.md) for authorized credential access. The default `dev` source uses local database URLs; staging values are used only when deliberately selected. The scripts write local plaintext `.env` files and backups, protected by filesystem permissions, not application-level encryption. Without access, fill those files from their `.env.example` (the install commands below copy them when missing).

## Run each service

Each service has three steps: install once, run, and check before a pull request (the same checks CI runs).

### AI (Python, :8001)

```bash
cd backend/ai && uv sync --group dev && cp -n .env.example .env
```

```bash
cd backend/ai && uv run python -m src.main
cd backend/ai && uv run uvicorn src.main:app --reload --port 8001   # or this one: restarts on each code change
```

Scripts run the same way, without `python` in front: `uv run evaluation/run.py agent_chat --dry-run`. The [Evaluation guide](../../backend/ai/evaluation/README.md) owns evaluation commands and options.

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

Dev and staging share the staging Supabase project; production uses a separate Supabase project. The default Compose stack has no PostgreSQL service; use the opt-in [local database script](#develop-against-the-local-database) for a separate disposable development database. Credentials live in each service's Git-ignored env file: `backend/core/.env` defines `DATABASE_URL` (JDBC), `DATABASE_USERNAME`, `DATABASE_PASSWORD`, and `backend/ai/.env` defines `POSTGRES_URL` and the optional `AI_SQL_READER_URL` for the shop-data tool. Production values are in `secrets/production/env/`. Service settings stay in each service's own file: `backend/core/.env` supplies `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` (absolute host path of the service-account key, mounted read-only into the container), and Compose loads `backend/ai/.env` for model and API keys. Core calls AI at `AI_BASE_URL` (Compose sets `http://ai:8001`) with the shared `INTERNAL_API_TOKEN`: put the same value in `backend/ai/.env` and `backend/core/.env`; a missing or mismatched value makes every Agent call fail (`401` from AI, `503 ai_unavailable` from Core). Default stack is Core and AI. AI sends HoneyHive traces, with the redacted chat content, only when `HH_API_KEY` is set in `backend/ai/.env`.

```bash
docker compose --env-file backend/core/.env --env-file backend/ai/.env up --build
```

Do not run the app with the production bootstrap credentials; production values belong in the `production` environment's secret store. Automated tests use a disposable PostgreSQL (CI service containers), never Supabase: AI integration tests read `POSTGRES_TEST_URL`, Core PostgreSQL tests read `CORE_TEST_POSTGRES_URL` (see [Core README](../../backend/core/README.md#run-tests)).

## Chat-history cache

The AI service caches each conversation's latest messages in Redis when `REDIS_URL` is set; without it every turn reads PostgreSQL.
Start a local Redis with this command:

```bash
docker run -d --rm --name smartledger-local-redis -p 127.0.0.1:6379:6379 redis:7-alpine redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru
```

Then set `REDIS_URL=redis://127.0.0.1:6379/0` in `backend/ai/.env`.
The Redis client tests run against it with `REDIS_TEST_URL=redis://127.0.0.1:6379/15 uv run pytest tests/unit_tests/test_redis_client.py`.

## Database migrations

Development defaults to the local database. A deliberately selected shared database is a separate operational target; a migration there affects other users. Core runs Flyway at startup when `FLYWAY_ENABLED=true` (the Core default); the commands above set it to `false`, and Core then only checks that the schema matches its entities.

- **Never migrate the shared database from a feature branch.** A migration applied there and later edited, or a second branch that uses the same version number, makes Flyway reject the checksum and stops Core for everyone. A column change that is not merged yet breaks the code running on `staging`.
- **Never edit a migration that has run on staging**; add a new version instead. Production follows the same steps after the release is approved.

### Develop against the local database

`scripts/local-db.sh` starts a local PostgreSQL with the Core and AI migrations applied; the second command points Core and AI at it. See [Secrets and env files](secrets-and-env.md#local-development).

```bash
scripts/local-db.sh
```

```bash
scripts/secrets/apply.sh dev dev --apply
```

### Develop a migration on a disposable database

CI verifies fresh migrations on an isolated database. For local verification, create a disposable, loopback-only PostgreSQL instance through the approved local setup, point only test connections at it and run Core with Flyway enabled. Never use shared business data or deployment credentials for this check.

### Migrate staging after a merge

Shared migrations require merged code, explicit owner authorization, a verified backup/recovery plan and the approved operational window. Check the actual target and migration history before applying anything; do not infer them from local defaults. The [private operations knowledge base](https://app.notion.com/p/M-i-tr-ng-v-domain-407f1ce5c3ac80249cd0c2a28c259436) owns access and execution procedures. Keep Core-before-AI ordering and never repair, baseline, delete migration history or edit an applied migration to bypass a failure.
