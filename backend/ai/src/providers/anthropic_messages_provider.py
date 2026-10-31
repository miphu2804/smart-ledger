from pydantic_ai.models import Model
from pydantic_ai.models.anthropic import AnthropicModel, AnthropicModelSettings
from pydantic_ai.providers.anthropic import AnthropicProvider


class AnthropicMessagesProvider:
    """Builds models that speak /v1/messages."""

    def __init__(
        self, api_key: str, base_url: str, timeout: float, reasoning_effort: str
    ) -> None:
        self.provider = AnthropicProvider(api_key=api_key, base_url=base_url)
        self.settings = AnthropicModelSettings(
            timeout=timeout,
            # Anthropic has no "none" effort; leaving it out uses the model default.
            anthropic_effort=None if reasoning_effort == "none" else reasoning_effort,
            # Anthropic caches only up to explicit breakpoints: the tools, the static
            # instructions and the last message, so each later request of a turn and
            # the next turn read the shared prefix at a tenth of the input price.
            # Explicit `cache_control` blocks, not the top-level automatic mode,
            # because the gateway may not forward that parameter.
            anthropic_cache_tool_definitions=True,
            anthropic_cache_instructions=True,
            anthropic_cache_messages=True,
        )

    def create_model(self, model_name: str) -> Model:
        return AnthropicModel(
            model_name, provider=self.provider, settings=self.settings
        )
