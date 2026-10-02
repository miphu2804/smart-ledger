# SmartLedger AI

Internal AI API intended for Core; Core does not call it yet. The service exposes `/health`, `POST /internal/v1/agent/chat`, and list/detail/rename/delete routes under `/internal/v1/agent/conversations`. Chat history is stored in PostgreSQL. Postgres and Redis clients connect at process start and log status. Every `/internal/v1` route requires the shared `X-Internal-Token` header. There are no invoice or expense endpoints.

Frontend must not call this service.

## Chat history schema

Run Core's Flyway migrations first so `users` and `shops` exist, then apply the versioned AI migrations in order:

```bash
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/001_create_chat_history.sql
psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f migrations/003_add_chat_summary.sql
```

The AI service does not create or migrate tables at startup. `ai_request_id` remains nullable; its foreign key is deferred until the `ai_requests` table is installed. Version `002` is reserved for the pgvector work and is not part of this service yet.

## Chat context and rolling summary

Each turn sends the stored summary followed by every message not yet folded into it. A message therefore leaves the model context only after the summarizer has written it into the summary, and a fold that has not run yet never hides messages.

- The verbatim window keeps 50 messages and may grow to 60 before a fold happens, so most turns do not call the summarizer at all.
- A backlog longer than one batch (about 3000 estimated tokens, `len(text) // 4`) is folded in several passes, and each pass is persisted before the next one starts.
- Summarization runs as a FastAPI background task after the reply, so the current turn is never slowed down. It never raises: a model or database failure leaves the stored summary untouched and the next turn retries it.
- Concurrent folds cannot lose messages: a fold only advances `summary_through_message_id` from the value it read, so the later writer is dropped.
- `SUMMARY_MODEL_NAME` selects the summarization model and falls back to `MODEL_NAME`.

`summary` and `summary_through_message_id` live on `chat_conversations`, so deleting a conversation removes its summary with it.

Folded messages stay in `chat_messages`. When the summary lacks an exact figure, name, date or wording, the agent calls `search_chat_history`, which matches the query words against the folded messages of the current conversation, ignoring Vietnamese diacritics, and returns up to five hits with the message before and after each. The tool takes only the query; the conversation, user and shop come from the request context, so the model cannot read another shop's history.

The OpenAI client uses the Responses API because reasoning models reject function tools on `/v1/chat/completions`. An `OPENAI_BASE_URL` proxy must therefore serve `/v1/responses`. `MODEL_REASONING_EFFORT` (default `high`) sets the reasoning effort for both the chat and summary models.

## Internal authentication

`INTERNAL_API_TOKEN` is the credential shared with Core. Callers send it in the `X-Internal-Token` header; a missing or wrong value returns `401 unauthorized`. An unset or blank token fails closed, so every `/internal/v1` route returns `401` while `/health` keeps answering. Keep the staging and production values in those environments' secrets, and remember that Core does not send the header yet.

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

From the repository root. Starts PostgreSQL, Redis, and this service. Langfuse is not part of the default stack. Set `POSTGRES_PASSWORD` in the shell or a Compose `--env-file` first.

```bash
docker compose up --build
```

- AI: `http://localhost:8001/health`
- Compose ports use the defaults in `compose.yaml` and can be overridden with shell environment variables.

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
