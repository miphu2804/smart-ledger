import json
import math
import sys
from pathlib import Path

from pydantic_ai.embeddings import EmbeddingResult

from src.app_config import app_config
from src.memory.embedder import build_embedder

BATCH = 50


class CachingEmbedder:
    """Embeds from a file of vectors, asking the app's embedder only for texts the
    file lacks, so a rerun with a model makes no network call.

    Vectors are unit length, keyed "q|<query>" and "d|<memory>", one file per model
    inside `directory`. It answers the two calls `AgentMemoryService` makes of an
    embedder.
    """

    def __init__(self, directory: Path) -> None:
        self.model = app_config.AGENT_MEMORY_EMBEDDING_MODEL
        self.path = directory / f"{self.model.replace('/', '_').lstrip('@')}.json"
        self.vectors: dict[str, list[float]] = (
            json.loads(self.path.read_text()) if self.path.exists() else {}
        )
        self.saved = len(self.vectors)

    async def embed_query(self, query: str) -> EmbeddingResult:
        return await self._embed("q", "query", [query])

    async def embed_documents(self, documents: list[str]) -> EmbeddingResult:
        return await self._embed("d", "document", documents)

    def save(self) -> None:
        if len(self.vectors) != self.saved:
            self.path.parent.mkdir(exist_ok=True)
            self.path.write_text(json.dumps(self.vectors))

    async def _embed(self, kind: str, input_type, texts: list[str]) -> EmbeddingResult:
        missing = sorted({one for one in texts if f"{kind}|{one}" not in self.vectors})
        if missing:
            await self._fetch(kind, missing)
        return EmbeddingResult(
            [self.vectors[f"{kind}|{one}"] for one in texts],
            inputs=texts,
            input_type=input_type,
            model_name=self.model,
            provider_name="cache",
        )

    async def _fetch(self, kind: str, missing: list[str]) -> None:
        """Embeds the texts the file lacks with the app's embedder, in batches."""
        embedder = build_embedder(
            app_config.AGENT_MEMORY_EMBEDDING_PROVIDER,
            app_config.AGENT_MEMORY_EMBEDDING_MODEL,
            app_config.CLOUDFLARE_ACCOUNT_ID,
            app_config.CLOUDFLARE_API_TOKEN,
        )
        if embedder is None:
            raise SystemExit(
                "no memory embedder: check AGENT_MEMORY_EMBEDDING_* in .env"
            )
        embed = embedder.embed_query if kind == "q" else embedder.embed_documents
        for start in range(0, len(missing), BATCH):
            batch = missing[start : start + BATCH]
            result = await embed(batch)
            for one, vector in zip(batch, result.embeddings, strict=True):
                self.vectors[f"{kind}|{one}"] = self._normalize(vector)
            print(f"embedded {len(self.vectors)} texts", file=sys.stderr)

    @staticmethod
    def _normalize(vector: list[float]) -> list[float]:
        """`vector` scaled to length 1, so a dot product is the cosine pgvector uses."""
        norm = math.sqrt(sum(x * x for x in vector)) or 1.0
        return [x / norm for x in vector]
