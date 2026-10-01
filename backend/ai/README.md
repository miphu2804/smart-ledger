# SmartLedger AI

Internal AI API intended for Core; Core does not call it yet. The service exposes `/health`, `POST /internal/v1/agent/chat`, and list/detail/rename/delete routes under `/internal/v1/agent/conversations`. Chat history is stored in PostgreSQL. Postgres and Redis clients connect at process start and log status. Internal service authentication is not implemented yet. There are no invoice or expense endpoints.

Frontend must not call this service.

## Chat history schema

Run Core's Flyway migrations first so `users` and `shops` exist, then apply the versioned AI migration:

```bash
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/001_create_chat_history.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/002_enable_pgvector.sql
```

The AI service does not create or migrate tables at startup. `ai_request_id` remains nullable; its foreign key is deferred until the `ai_requests` table is installed.

## Setup

```bash
uv sync --group dev
cp .env.example .env
```

## Run

```bash
uv run python -m src.main
```

Host and port come from `SERVER_HOST` and `SERVER_PORT`.

`GET /health` returns `{"status": "ok"}` and does not check dependencies.

## Local Compose

From the repository root. Starts Core and this service against the shared staging Supabase and Redis Cloud databases; there are no local PostgreSQL or Redis containers. Langfuse is not part of the default stack. See the root [README](../../README.md#local-compose) for the env files.

```bash
docker compose --env-file .env.staging --env-file backend/core/.env up --build
```

- AI: `http://localhost:8001/health`
- Compose ports use the defaults in `compose.yaml` and can be overridden with shell environment variables.

To run this app on the host, export `POSTGRES_URL` and `REDIS_URL` from the repo-root `.env.staging` (dev shares the staging databases). `AppConfig` reads them from the process environment, which takes precedence over the local `.env`:

```bash
uv sync --group dev
cp .env.example .env
set -a && source ../../.env.staging && set +a
uv run python -m src.main
```

## Check

Ruff replaces isort (rule `I`) and Black (`ruff-format`). Auto-fix on commit:

```bash
uvx pre-commit install
```

```bash
uv run ruff check --fix
uv run ruff format
uv run pytest
```
