import asyncio
import math
from pathlib import Path

import numpy as np
import pytest
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace

from src.app_config import app_config
from src.main import build_memory_embedder
from src.memory.onnx_embedding import OnnxEmbeddingModel

VOCAB = {"[UNK]": 0, "gas": 1, "giao": 2, "tận": 3, "nơi": 4}


class TokenRows:
    """Stands in for the ONNX session: the vector of a text is its first token id
    followed by its token count, padded to 8 numbers, so a test can tell which text
    and how many tokens the model received."""

    def __init__(self):
        self.calls = []

    def run(self, outputs, feed):
        self.calls.append(feed)
        ids = feed["input_ids"][0]
        row = np.zeros(8, dtype=np.float32)
        row[0], row[1], row[2] = ids[0], len(ids), 2.0
        return [row[None, :]]


def model(dimensions: int) -> OnnxEmbeddingModel:
    """The class with its two files replaced: a word-level tokenizer and `TokenRows`."""
    instance = OnnxEmbeddingModel.__new__(OnnxEmbeddingModel)
    super(OnnxEmbeddingModel, instance).__init__()
    instance.directory = Path("static-mrl-int8")
    instance.dimensions = dimensions
    tokenizer = Tokenizer(WordLevel(VOCAB, unk_token="[UNK]"))
    tokenizer.pre_tokenizer = Whitespace()
    instance.tokenizer = tokenizer
    instance.session = TokenRows()
    return instance


def test_vectors_keep_the_text_order_are_cut_and_have_unit_length():
    embedder = model(dimensions=3)

    result = asyncio.run(
        embedder.embed(["gas giao", "giao tận nơi"], input_type="document")
    )

    assert result.inputs == ["gas giao", "giao tận nơi"]
    assert result.provider_name == "onnx"
    assert [len(vector) for vector in result.embeddings] == [3, 3]
    first, second = result.embeddings
    assert first[0] / first[1] == pytest.approx(1 / 2)  # token id 1, 2 tokens
    assert second[0] / second[1] == pytest.approx(2 / 3)  # token id 2, 3 tokens
    for vector in result.embeddings:
        assert math.sqrt(sum(x * x for x in vector)) == pytest.approx(1.0)


def test_each_text_runs_alone_without_padding_or_special_tokens():
    embedder = model(dimensions=3)

    asyncio.run(embedder.embed(["gas", "giao tận nơi"], input_type="document"))

    feeds = embedder.session.calls
    assert [feed["input_ids"].tolist() for feed in feeds] == [[[1]], [[2, 3, 4]]]
    assert [feed["attention_mask"].tolist() for feed in feeds] == [[[1]], [[1, 1, 1]]]


def test_a_text_without_tokens_is_refused():
    embedder = model(dimensions=3)

    with pytest.raises(ValueError, match="no tokens"):
        asyncio.run(embedder.embed("   ", input_type="query"))


def test_a_missing_model_directory_turns_memory_off(monkeypatch, tmp_path):
    monkeypatch.setattr(app_config, "AGENT_MEMORY_EMBEDDING_PROVIDER", "onnx")
    monkeypatch.setattr(app_config, "AGENT_MEMORY_EMBEDDING_MODEL", str(tmp_path))

    assert build_memory_embedder() is None
