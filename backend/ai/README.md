# SmartLedger AI

Internal AI API used by Core. This scaffold serves `/health` (liveness) and `/ready` (Postgres + Redis). `/internal/v1` routes are not implemented yet. There are no invoice or expense endpoints.

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

`GET /ready` pings `POSTGRES__URL` and `REDIS__URL`. It returns 200 when both succeed and 503 when a URL is missing or a ping fails.

## Local Compose

From the repository root. Starts PostgreSQL, Redis, and this service. Langfuse is not part of the default stack.

```bash
docker compose up --build
```

- AI: `http://localhost:8001/health` and `http://localhost:8001/ready`
- Compose ports: repo-root `.env.example`

To run this app on the host against Compose Postgres and Redis:

```bash
docker compose up postgres redis
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
