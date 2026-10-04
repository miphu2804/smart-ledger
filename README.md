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

Dev and staging share the staging Supabase project, Redis Cloud database and Firebase project; production uses a separate Supabase project, Redis Cloud database and Firebase project, so test accounts never mix with real users. Point `FIREBASE_PROJECT_ID` and the service-account key in `backend/core/.env` at the staging Firebase project; the mobile app's Firebase files per environment are described in the [mobile README](frontend/mobile/README.md#gắn-firebase-đăng-nhập--xác-thực-số-điện-thoại). There are no local PostgreSQL or Redis containers. Credentials live in Git-ignored files at the repository root: `.env.staging` and `.env.production` each define `DATABASE_URL` (JDBC), `DATABASE_USERNAME`, `DATABASE_PASSWORD` for Core and `POSTGRES_URL`, `REDIS_URL` for AI (use `rediss://` when TLS is enabled on Redis Cloud). Service settings stay in each service's own file: `backend/core/.env` supplies `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` (absolute host path of the service-account key, mounted read-only into the container), and Compose loads `backend/ai/.env` for model and API keys. Core calls AI at `AI_BASE_URL` (Compose sets `http://ai:8001`) with the shared `INTERNAL_API_TOKEN`: put the same value in `backend/ai/.env` and in one of the `--env-file` files; a missing or mismatched value makes every Agent call fail (`401` from AI, `503 ai_unavailable` from Core). Default stack is Core and AI; Langfuse is not enabled.

```bash
docker compose --env-file .env.staging --env-file backend/core/.env up --build
```

Do not run the app with the production bootstrap credentials; production values belong in the `production` environment's secret store. Automated tests use a disposable PostgreSQL (CI service containers), never Supabase: AI integration tests read `POSTGRES_TEST_URL`, Core PostgreSQL tests read `CORE_TEST_POSTGRES_URL` (see [Core README](backend/core/README.md#run-tests)).

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
