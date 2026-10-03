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

# Core, :8080. Spring does not read .env, so export it into the shell first
cd backend/core && set -a && source ../../.env.staging && source .env && set +a && bash ./mvnw spring-boot:run

# Mobile
cd frontend/mobile && npx expo start

# Web admin, :5173
cd frontend/web && npm run dev

# AI + Core in Docker (Core :8000, AI :8001)
docker compose --env-file .env.staging --env-file backend/core/.env up --build
```

The first Core start applies Flyway migrations to the database in `DATABASE_URL`.

Checks before a PR (same as CI):

```bash
cd backend/ai && uv run ruff check && uv run ruff format --check && uv run pytest
cd backend/core && bash ./mvnw verify
cd frontend/mobile && npm run typecheck && npm run export:web
```

## Layout

Documentation-first MVP. **Verified in the current code:** BRD/PRD remain provisional and architecture describes the MVP target. Java Core implements Firebase session and current-user endpoints plus the auth/shop migration; shop and ledger APIs are not implemented. Python AI implements `/health` and internal Agent chat with persistent conversation management; Core does not call AI yet. Mobile and admin web default to mock data. Production readiness has not been verified.

```text
smart-ledger/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── PROGRESS.md
├── compose.yaml         # Core + AI (Supabase + Redis Cloud)
├── docs/
│   ├── product/          # product description, BRD, PRD
│   ├── architecture/     # overview, technical design, ADRs
│   └── contracts/        # HTTP/wire contracts
├── frontend/             # mobile OWNER + web ADMIN; mock by default
├── backend/
│   ├── core/             # Core public API (Java), DB owner
│   └── ai/               # Internal AI API (Python FastAPI)
```

## AI scaffold

Python 3.11+, [uv](https://docs.astral.sh/uv/). See [backend/ai/README.md](backend/ai/README.md).

```bash
cd backend/ai && uv sync --group dev && uv run python -m src.main
```

`GET /health` is liveness. Postgres and Redis clients connect at process start. AI exposes chat and conversation CRUD under `/internal/v1/agent/*`; internal service authentication is not implemented yet. See [API contracts](docs/contracts/api-contracts.md) for current routes and MVP targets.

## Local Compose

Dev and staging share the staging Supabase project and Redis Cloud database; production uses a separate Supabase project and Redis Cloud database. There are no local PostgreSQL or Redis containers. Credentials live in Git-ignored files at the repository root: `.env.staging` and `.env.production` each define `DATABASE_URL` (JDBC), `DATABASE_USERNAME`, `DATABASE_PASSWORD` for Core and `POSTGRES_URL`, `REDIS_URL` for AI (use `rediss://` when TLS is enabled on Redis Cloud). Service settings stay in each service's own file: `backend/core/.env` supplies `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` (absolute host path of the service-account key, mounted read-only into the container), and Compose loads `backend/ai/.env` for model and API keys. Default stack is Core and AI; Langfuse is not enabled.

```bash
docker compose --env-file .env.staging --env-file backend/core/.env up --build
```

Do not run the app with the production bootstrap credentials; production values belong in the `production` environment's secret store. Automated tests use a disposable PostgreSQL (`POSTGRES_TEST_URL`, CI service container), never Supabase.

## References

| Document | Description |
|---|---|
| [Documentation Index](docs/README.md) | Map, lifecycle, and source-of-truth rules |
| [Project overview](docs/product/project-overview.md) | Product, audience, and boundaries |
| [Architecture diagram](docs/architecture/diagrams/src/architecture.mmd) | MVP target system boundary |
| [Technical design](docs/architecture/technical-design.md) | Proposed MVP design, pending review |
| [Progress log](PROGRESS.md) | Append-only completion log |
| [`AGENTS.md`](AGENTS.md) | Canonical project instructions for coding agents |
| [`CLAUDE.md`](CLAUDE.md) | Imports `AGENTS.md` for Claude |
| [Contributing guide](CONTRIBUTING.md) | Branch, commit, and pull request conventions |
