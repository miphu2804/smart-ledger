# SmartLedger AI

Internal AI API used by Core. This scaffold only serves `/health`; `/internal/v1` routes are not implemented yet.

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

`GET /health` returns `{"status": "ok"}`.

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
