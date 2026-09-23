FROM python:3.11-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock ./
COPY src ./src

RUN uv sync --frozen --no-dev

FROM python:3.11-slim-bookworm AS runtime

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home /app --no-create-home app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/src /app/src

USER app

EXPOSE 8001

CMD ["python", "-m", "src.main"]
