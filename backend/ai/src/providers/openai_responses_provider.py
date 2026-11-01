from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIResponsesModel, OpenAIResponsesModelSettings
from pydantic_ai.providers.openai import OpenAIProvider


class OpenAIResponsesProvider:
    """Builds models that speak the Responses API.

    Reasoning models reject function tools on /v1/chat/completions, so OpenAI's own
    models only get the agent's tools through this API.
    """

    def __init__(
        self, api_key: str, base_url: str, timeout: float, reasoning_effort: str
    ) -> None:
        self.provider = OpenAIProvider(api_key=api_key, base_url=base_url)
        self.settings = OpenAIResponsesModelSettings(
            timeout=timeout, openai_reasoning_effort=reasoning_effort
        )

    def create_model(self, model_name: str) -> Model:
        return OpenAIResponsesModel(
            model_name, provider=self.provider, settings=self.settings
        )
