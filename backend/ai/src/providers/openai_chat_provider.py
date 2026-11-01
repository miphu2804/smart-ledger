from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
from pydantic_ai.providers.openai import OpenAIProvider


class OpenAIChatProvider:
    """Builds models that speak /chat/completions.

    OpenAI-compatible models (DeepSeek, GLM, Kimi on OpenCode Go) serve only this API.
    """

    def __init__(
        self, api_key: str, base_url: str, timeout: float, reasoning_effort: str
    ) -> None:
        self.provider = OpenAIProvider(api_key=api_key, base_url=base_url)
        self.settings = OpenAIChatModelSettings(
            timeout=timeout, openai_reasoning_effort=reasoning_effort
        )

    def create_model(self, model_name: str) -> Model:
        return OpenAIChatModel(
            model_name, provider=self.provider, settings=self.settings
        )
