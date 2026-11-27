"""Cloudflare Workers AI embeddings for agent memory."""

from collections.abc import Sequence
from dataclasses import replace

from pydantic_ai.embeddings import EmbeddingSettings
from pydantic_ai.embeddings.openai import OpenAIEmbeddingModel
from pydantic_ai.embeddings.result import EmbeddingResult, EmbedInputType
from pydantic_ai.embeddings.wrapper import WrapperEmbeddingModel
from pydantic_ai.providers.openai import OpenAIProvider

# Workers AI embeds the bare text: unlike sentence-transformers it adds no query or
# document prompt, so each model's prompts, copied from its sentence-transformers
# config, are added here. A model missing from this map gets the bare text.
PROMPTS: dict[str, dict[EmbedInputType, str]] = {
    "@cf/google/embeddinggemma-300m": {
        "query": "task: search result | query: ",
        "document": "title: none | text: ",
    },
}


class WorkersAIEmbeddingModel(WrapperEmbeddingModel):
    """Embeds through Workers AI's OpenAI-compatible endpoint.

    Workers AI also ignores `dimensions`, so vectors are cut to the stored size here.
    Only a Matryoshka-trained model such as embeddinggemma keeps its quality when cut;
    cosine search ignores vector length, so a cut vector needs no re-normalising.
    """

    def __init__(
        self, model_name: str, *, account_id: str, api_token: str, dimensions: int
    ):
        super().__init__(
            OpenAIEmbeddingModel(
                model_name,
                provider=OpenAIProvider(
                    base_url=f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
                    api_key=api_token,
                ),
            )
        )
        self.dimensions = dimensions

    async def embed(
        self,
        inputs: str | Sequence[str],
        *,
        input_type: EmbedInputType,
        settings: EmbeddingSettings | None = None,
    ) -> EmbeddingResult:
        texts = [inputs] if isinstance(inputs, str) else inputs
        prompt = PROMPTS.get(self.model_name, {}).get(input_type, "")
        result = await self.wrapped.embed(
            [prompt + text for text in texts], input_type=input_type, settings=settings
        )
        return replace(
            result,
            embeddings=[vector[: self.dimensions] for vector in result.embeddings],
        )
