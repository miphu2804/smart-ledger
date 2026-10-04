# SmartLedger

AI voice POS for small shops (So Nghe Loi): say a sentence and the AI records items, quantities, and prices. Product overview: [docs/product/project-overview.md](docs/product/project-overview.md).

## Setup

Install dependencies once per service. Requirements: Docker (optional), JDK 21, Python 3.11+ with [uv](https://docs.astral.sh/uv/), Node.js 20+.

```bash
# AI (Python)
cd backend/ai && uv sync --group dev && cp -n .env.example .env

# Core (Java): downloads Maven dependencies via the wrapper
cd backend/core && bash ./mvnw dependency:go-offline && cp -n .env.example .env

# Mobile (Expo)
cd frontend/mobile && npm install

# Web admin (Vite)
cd frontend/web && npm install
```

Fill in `backend/core/.env` and `backend/ai/.env` from their `.env.example`; database credentials come from the root `.env.staging` (see [Local Compose](#local-compose)). Frontends default to mock data and need no backend.

## Run

```bash
# AI, :8001
cd backend/ai && uv run python -m src.main

# Core, :8080. Spring does not read .env, so export it into the shell first.
# Flyway stays off against the shared database (see Database migrations)
cd backend/core && set -a && source ../../.env.staging && source .env && set +a && FLYWAY_ENABLED=false bash ./mvnw spring-boot:run

# Mobile
cd frontend/mobile && npx expo start

# Web admin, :5173
cd frontend/web && npm run dev

# AI + Core in Docker (Core :8000, AI :8001)
docker compose --env-file .env.staging --env-file backend/core/.env up --build
```

Core does not change the database schema in these commands; see [Database migrations](#database-migrations).

Checks before a PR (same as CI):

```bash
cd backend/ai && uv run ruff check && uv run ruff format --check && uv run pytest
cd backend/core && bash ./mvnw verify
cd frontend/mobile && npm run typecheck && npm run export:web
```

## Layout

Documentation-first MVP: BRD/PRD remain provisional and the architecture diagram describes the MVP target. Java Core implements Firebase sessions, shops, catalog, customers, sale drafts, sales, payments, debts, expenses, report summary, OWNER audit history, and proxies Agent chat to AI. Python AI implements `/health` and internal Agent chat with persistent conversations and a read-only shop-data tool. Voice/image parsing, replenishment, insight chat, and the admin dashboard APIs are not implemented. Mobile and admin web default to mock data; mobile can call the real Core, admin web cannot yet. Production readiness has not been verified. Implementation status lives in [Technical design §1](docs/architecture/technical-design.md#1-phạm-vi).

```text
smart-ledger/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── PROGRESS.md
├── compose.yaml         # Core + AI (Supabase + Redis Cloud)
├── docs/                 # source of truth; start at docs/README.md
│   ├── product/          # product description, BRD, PRD
│   ├── architecture/     # technical design, ERD, ADRs, diagrams
│   ├── contracts/        # HTTP/wire contracts
│   ├── design/           # mobile UI direction and wording
│   └── development/      # release runbooks
├── frontend/             # mobile OWNER + web ADMIN; mock by default
├── backend/
│   ├── core/             # Core public API (Java), DB owner
│   └── ai/               # Internal AI API (Python FastAPI)
```

## AI service

Python 3.11+, [uv](https://docs.astral.sh/uv/). See [backend/ai/README.md](backend/ai/README.md).

`GET /health` is liveness. AI exposes chat and conversation CRUD under `/internal/v1/agent/*`, guarded by the `X-Internal-Token` header; only Core calls it. See [API contracts](docs/contracts/api-contracts.md) for current routes and MVP targets.

## Local Compose

Dev and staging share the staging Supabase project and Redis Cloud database; production uses a separate Supabase project and Redis Cloud database. There are no local PostgreSQL or Redis containers. Credentials live in Git-ignored files at the repository root: `.env.staging` and `.env.production` each define `DATABASE_URL` (JDBC), `DATABASE_USERNAME`, `DATABASE_PASSWORD` for Core and `POSTGRES_URL`, `REDIS_URL` for AI (use `rediss://` when TLS is enabled on Redis Cloud). Service settings stay in each service's own file: `backend/core/.env` supplies `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` (absolute host path of the service-account key, mounted read-only into the container), and Compose loads `backend/ai/.env` for model and API keys. Core calls AI at `AI_BASE_URL` (Compose sets `http://ai:8001`) with the shared `INTERNAL_API_TOKEN`: put the same value in `backend/ai/.env` and in one of the `--env-file` files; a missing or mismatched value makes every Agent call fail (`401` from AI, `503 ai_unavailable` from Core). Default stack is Core and AI; Langfuse is not enabled.

```bash
docker compose --env-file .env.staging --env-file backend/core/.env up --build
```

Do not run the app with the production bootstrap credentials; production values belong in the `production` environment's secret store. Automated tests use a disposable PostgreSQL (CI service containers), never Supabase: AI integration tests read `POSTGRES_TEST_URL`, Core PostgreSQL tests read `CORE_TEST_POSTGRES_URL` (see [Core README](backend/core/README.md#run-tests)).

### Database migrations

Dev and staging share one database, so a migration that runs from a developer machine changes the schema for everyone. Core runs Flyway at startup when `FLYWAY_ENABLED=true` (the Core default); the commands above set it to `false`, and Core then only checks that the schema matches its entities.

- **Never migrate the shared database from a feature branch.** A migration applied there and later edited, or a second branch that uses the same version number, makes Flyway reject the checksum and stops Core for everyone. A column change that is not merged yet breaks the code running on `staging`.
- **Develop a migration on a disposable database.** Start one with `docker run --rm -p 5432:5432 -e POSTGRES_DB=smartledger -e POSTGRES_USER=smartledger -e POSTGRES_PASSWORD=smartledger pgvector/pgvector:pg17`, point `DATABASE_URL=jdbc:postgresql://localhost:5432/smartledger` (and `POSTGRES_URL` for AI) at it, and run Core with `FLYWAY_ENABLED=true`. CI repeats this on every pull request. A branch whose entities need a migration that staging lacks cannot start against the shared database, because the schema check fails.
- **Migrate staging only from merged code.** After a pull request with a Core or AI migration merges, one person checks out `origin/staging`, runs Core once with `FLYWAY_ENABLED=true` (for Compose: `FLYWAY_ENABLED=true docker compose --env-file .env.staging --env-file backend/core/.env up --build core`), applies any new AI migration with `psql` as in the [AI README](backend/ai/README.md), and tells the team. This manual step stands in for the staging deploy until one exists.
- **Never edit a migration that has run on staging**; add a new version instead. Production follows the same steps after the release is approved.

## References

| Document | Description |
|---|---|
| [Documentation Index](docs/README.md) | Map, lifecycle, and source-of-truth rules |
| [Project overview](docs/product/project-overview.md) | Product, audience, and boundaries |
| [Architecture diagram](docs/architecture/diagrams/src/architecture.mmd) | MVP target system boundary |
| [Technical design](docs/architecture/technical-design.md) | MVP design and verification, pending review |
| [Progress log](PROGRESS.md) | Append-only completion log |
| [`AGENTS.md`](AGENTS.md) | Canonical project instructions for coding agents |
| [`CLAUDE.md`](CLAUDE.md) | Imports `AGENTS.md` for Claude |
| [Contributing guide](CONTRIBUTING.md) | Branch, commit, and pull request conventions |
