"""Agent memory embeddings computed in this process from a static ONNX model."""

import asyncio
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import onnxruntime
from pydantic_ai.embeddings import EmbeddingModel, EmbeddingSettings
from pydantic_ai.embeddings.result import EmbeddingResult, EmbedInputType
from tokenizers import Tokenizer


class OnnxEmbeddingModel(EmbeddingModel):
    """Embeds with a static embedding model exported to ONNX, such as the int8 export
    of static-similarity-mrl-multilingual-v1.

    `directory` holds `model.onnx` and `tokenizer.json`. A static model looks each
    token up in a table and averages the rows, so one text costs well under a
    millisecond on one core and needs no torch. It is Matryoshka-trained, so its
    vectors are cut to the stored size and then scaled back to unit length.
    """

    def __init__(self, directory: Path, *, dimensions: int):
        super().__init__()
        self.directory = directory
        self.dimensions = dimensions
        self.tokenizer = Tokenizer.from_file(str(directory / "tokenizer.json"))
        options = onnxruntime.SessionOptions()
        # One thread per call: the chat path embeds one short message, and extra
        # threads would only compete with the other requests on a small host.
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        # Errors only: the export logs harmless graph-rewrite warnings on every start.
        options.log_severity_level = 3
        self.session = onnxruntime.InferenceSession(
            str(directory / "model.onnx"), options, providers=["CPUExecutionProvider"]
        )

    @property
    def model_name(self) -> str:
        return self.directory.name

    @property
    def system(self) -> str:
        return "onnx"

    async def embed(
        self,
        inputs: str | Sequence[str],
        *,
        input_type: EmbedInputType,
        settings: EmbeddingSettings | None = None,
    ) -> EmbeddingResult:
        texts, _ = self.prepare_embed(inputs, settings)
        vectors = await asyncio.to_thread(self._vectors, texts)
        return EmbeddingResult(
            embeddings=vectors,
            inputs=texts,
            input_type=input_type,
            model_name=self.model_name,
            provider_name=self.system,
        )

    def _vectors(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    def _vector(self, text: str) -> list[float]:
        """One text at a time, so no padding can enter the average. The model was
        trained without [CLS] and [SEP], so none are added.

        A text with no tokens has no direction, and pgvector's cosine distance to a
        zero vector is undefined, so it is refused; the memory service catches the
        error and goes on without memory.
        """
        ids = self.tokenizer.encode(text, add_special_tokens=False).ids
        if not ids:
            raise ValueError("nothing to embed: the text has no tokens")
        input_ids = np.array([ids], dtype=np.int64)
        output = self.session.run(
            None, {"input_ids": input_ids, "attention_mask": np.ones_like(input_ids)}
        )[0][0][: self.dimensions]
        norm = float(np.linalg.norm(output))
        return (output / norm if norm else output).tolist()
