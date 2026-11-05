import asyncio

import pytest
from pydantic_ai import Embedder
from pydantic_ai.embeddings import TestEmbeddingModel

from src.memory import reembed
from src.memory.repository import EMBEDDING_DIMENSIONS


def test_embeds_every_text_in_batches(monkeypatch):
    monkeypatch.setattr(reembed, "BATCH_SIZE", 2)
    texts = ["gas", "giao tận nơi", "chốt sổ 22 giờ"]
    vectors = asyncio.run(reembed._embed(Embedder(TestEmbeddingModel()), texts))
    assert len(vectors) == 3


@pytest.mark.parametrize(
    "vector",
    [[0.1] * (EMBEDDING_DIMENSIONS - 1), [0.0] * EMBEDDING_DIMENSIONS],
    ids=["wrong size", "zero"],
)
def test_refuses_a_vector_the_column_cannot_rank(vector):
    with pytest.raises(ValueError):
        reembed._check([[0.1] * EMBEDDING_DIMENSIONS, vector])
