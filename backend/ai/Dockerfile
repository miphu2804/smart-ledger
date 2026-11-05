FROM python:3.11-slim-bookworm AS builder

COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock ./
COPY src ./src

# The runtime copies src directly, so avoid building the local package and its hatchling backend.
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.11-slim-bookworm AS runtime

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home /app --no-create-home app

# Agent memory's default embedding model, read from models/static-mrl-int8 under WORKDIR: the int8 ONNX export of
# static-similarity-mrl-multilingual-v1 (Apache-2.0), pinned to one Hugging Face revision and checked by SHA-256, so a
# changed upstream file fails the build instead of changing the vectors. scripts/ai/fetch-embedding-model.sh holds the
# same pins for a dev machine; change both together. Before the source lines, so a new commit does not download it again.
ARG EMBEDDING_SOURCE=https://huggingface.co/sentence-transformers/static-similarity-mrl-multilingual-v1/resolve/b68f4122911bcffcd6e1f695f2d99cd6788972d8
ADD --chown=app:app --checksum=sha256:9eaf678438a0c2669e7388e90fd8ef25c3138dd3155cb0d62fd8114760405a3a \
    ${EMBEDDING_SOURCE}/onnx/model_int8.onnx /app/models/static-mrl-int8/model.onnx
ADD --chown=app:app --checksum=sha256:11aaf894a4ccf3d95e8830e27c0f8152791fbbff2b988e29a265580b86edd216 \
    ${EMBEDDING_SOURCE}/0_StaticEmbedding/tokenizer.json /app/models/static-mrl-int8/tokenizer.json

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/src /app/src

USER app

# Last, so a new commit rebuilds only this layer; HoneyHive sessions carry it.
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

EXPOSE 8001

CMD ["python", "-m", "src.main"]
