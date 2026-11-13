"""Re-embeds every stored agent memory with the configured embedding provider.

Vectors from two embedding models are not comparable, so an environment that changes
`AGENT_MEMORY_EMBEDDING_PROVIDER` or `AGENT_MEMORY_EMBEDDING_MODEL` must re-embed its
stored memories or recall ranks them on noise. Run from `backend/ai` with the target
environment's settings:

    uv run python -m src.memory.reembed            # dry run: embeds, writes nothing
    uv run python -m src.memory.reembed --apply    # writes the new vectors

It reads `POSTGRES_URL` and the embedding settings from the environment or `.env`,
embeds the content of every row, superseded and expired ones included, and writes all
vectors in one transaction, so a failure leaves the old vectors in place. Running it
again with the previous provider restores vectors of the previous model.
"""

import argparse
import asyncio
import logging
import sys

import numpy as np
from pydantic_ai import Embedder
from sqlalchemy import select, update

from src.app_config import app_config
from src.embedding.factory import build_embedder
from src.infra.postgre_db_client import PostgreDBClient
from src.memory.repository import EMBEDDING_DIMENSIONS, AgentMemory

logger = logging.getLogger(__name__)

# Texts per embedding call: bounds a remote provider's request size.
BATCH_SIZE = 64


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply", action="store_true", help="write the vectors (default: dry run)"
    )
    apply = parser.parse_args().apply
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    embedder = build_embedder(
        app_config.AGENT_MEMORY_EMBEDDING_PROVIDER,
        app_config.AGENT_MEMORY_EMBEDDING_MODEL,
        EMBEDDING_DIMENSIONS,
        app_config.CLOUDFLARE_ACCOUNT_ID,
        app_config.CLOUDFLARE_API_TOKEN,
    )
    if embedder is None:
        logger.error("no embedder: check AGENT_MEMORY_EMBEDDING_* (see the log above)")
        return 1
    postgres = PostgreDBClient(app_config.POSTGRES_URL)
    try:
        rows = _rows(postgres)
        logger.info(
            "re-embedding %d memories with %s %s",
            len(rows),
            app_config.AGENT_MEMORY_EMBEDDING_PROVIDER,
            app_config.AGENT_MEMORY_EMBEDDING_MODEL,
        )
        vectors = asyncio.run(_embed(embedder, [content for _, content in rows]))
        _check(vectors)
        if not apply:
            logger.info("dry run: %d vectors ready, nothing written", len(vectors))
            return 0
        _write(postgres, [row_id for row_id, _ in rows], vectors)
        logger.info("wrote %d vectors", len(vectors))
        return 0
    finally:
        postgres.close()


def _rows(postgres: PostgreDBClient) -> list[tuple[int, str]]:
    with postgres.session() as session:
        return [
            (row.id, row.content)
            for row in session.execute(
                select(AgentMemory.id, AgentMemory.content).order_by(AgentMemory.id)
            )
        ]


async def _embed(embedder: Embedder, texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        result = await embedder.embed_documents(batch)
        vectors.extend(list(vector) for vector in result.embeddings)
        logger.info("embedded %d/%d", len(vectors), len(texts))
    return vectors


def _check(vectors: list[list[float]]) -> None:
    """Refuses vectors the column cannot hold or cosine cannot rank."""
    for vector in vectors:
        if len(vector) != EMBEDDING_DIMENSIONS:
            raise ValueError(
                f"got {len(vector)} dimensions, the column holds {EMBEDDING_DIMENSIONS}"
            )
        if not np.isfinite(vector).all() or not np.any(vector):
            raise ValueError("got a zero or non-finite vector")


def _write(
    postgres: PostgreDBClient, ids: list[int], vectors: list[list[float]]
) -> None:
    with postgres.session() as session:
        session.execute(
            update(AgentMemory),
            [
                {"id": row_id, "embedding": vector}
                for row_id, vector in zip(ids, vectors, strict=True)
            ],
        )


if __name__ == "__main__":
    sys.exit(main())
