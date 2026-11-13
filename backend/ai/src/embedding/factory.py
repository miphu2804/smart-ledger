import logging
from pathlib import Path

from pydantic_ai import Embedder

from src.embedding.onnx_embedding import OnnxEmbeddingModel
from src.embedding.workers_ai_embedding import WorkersAIEmbeddingModel

logger = logging.getLogger(__name__)


def build_embedder(
    provider: str,
    model: str,
    dimensions: int,
    cloudflare_account_id: str | None = None,
    cloudflare_api_token: str | None = None,
) -> Embedder | None:
    """The memory embedder for `provider`, or None (logged) when it cannot be built.

    None turns memory off without failing startup, so chat still works.
    """
    if provider == "cloudflare":
        if not cloudflare_account_id or not cloudflare_api_token:
            logger.error("cloudflare embeddings need an account id and token")
            return None
        return Embedder(
            WorkersAIEmbeddingModel(
                model,
                account_id=cloudflare_account_id,
                api_token=cloudflare_api_token,
                dimensions=dimensions,
            )
        )
    if provider == "onnx":
        try:
            return Embedder(OnnxEmbeddingModel(Path(model), dimensions=dimensions))
        except Exception as error:
            # Missing or unreadable model files turn memory off; chat still works.
            logger.error("onnx embedding model at %r failed to load: %s", model, error)
            return None
    if provider != "sentence-transformers":
        logger.error("unknown memory embedding provider %r; memory off", provider)
        return None
    try:
        # Resolved now, so a missing `memory` dependency group shows at startup rather
        # than on the first chat; the weights still load on first use.
        return Embedder(
            f"sentence-transformers:{model}",
            settings={
                "sentence_transformers_normalize_embeddings": True,
                "dimensions": dimensions,
            },
            defer_model_check=False,
        )
    except ImportError:
        logger.error("memory enabled but the memory dependency group is missing")
        return None
