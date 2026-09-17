# SmartLedger AI

Internal AI API used by Core. This scaffold serves `/health` (liveness). Postgres and Redis clients connect at process start and log status. `/internal/v1` routes are not implemented yet. There are no invoice or expense endpoints.

Frontend must not call this service.

## Setup

```bash
uv sync --group dev
cp .env.example .env
```

## Run

```bash
uv run python -m src.main
```

Host and port come from `SERVER__HOST` and `SERVER__PORT`.

`GET /health` returns `{"status": "ok"}` and does not check dependencies.

## Local Compose

From the repository root. Starts PostgreSQL, Redis, and this service. Langfuse is not part of the default stack.

```bash
cp .env.example .env
docker compose --profile infra up --build
```

- AI: `http://localhost:8001/health`
- Compose ports: repo-root `.env.example`

To run this app on the host against Compose Postgres and Redis:

```bash
docker compose --profile infra up postgres redis
uv sync --group dev
cp .env.example .env
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
