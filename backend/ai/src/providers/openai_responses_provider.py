from openai import AsyncOpenAI
from pydantic_ai.models import Model
from pydantic_ai.models.openai import OpenAIResponsesModel, OpenAIResponsesModelSettings
from pydantic_ai.providers.openai import OpenAIProvider


class OpenAIResponsesProvider:
    """Builds models that speak the Responses API.

    Reasoning models reject function tools on /v1/chat/completions, so OpenAI's own
    models only get the agent's tools through this API.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str,
        timeout: float,
        reasoning_effort: str,
        service_tier: str | None = None,
    ) -> None:
        # Bifrost reads the key from `x-bf-vk` for every virtual key, but from the
        # Bearer header only for keys prefixed `sk-bf-`. The header sits on the client
        # because a run's `extra_headers` (src/providers/session_settings.py) replace
        # the model's whole.
        client = AsyncOpenAI(
            api_key=api_key, base_url=base_url, default_headers={"x-bf-vk": api_key}
        )
        self.provider = OpenAIProvider(openai_client=client)
        self.settings = OpenAIResponsesModelSettings(
            timeout=timeout, openai_reasoning_effort=reasoning_effort
        )
        if service_tier is not None:
            self.settings["openai_service_tier"] = service_tier

    def create_model(self, model_name: str) -> Model:
        return OpenAIResponsesModel(
            model_name, provider=self.provider, settings=self.settings
        )
