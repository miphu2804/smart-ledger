import logging
from collections.abc import Callable

from pydantic_ai.models import Model
from pydantic_ai.models.anthropic import AnthropicModel, AnthropicModelSettings
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.openai import (
    OpenAIChatModel,
    OpenAIChatModelSettings,
    OpenAIResponsesModel,
    OpenAIResponsesModelSettings,
)
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings

from src.app_config import AppConfig

logger = logging.getLogger(__name__)

# The OpenAI SDK reads OPENAI_BASE_URL itself when no URL is passed, and keeps a blank
# value; `.env.example` leaves it blank, so a blank setting resolves here instead.
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"
# OpenCode Go asks each client to name itself rather than send the SDK's User-Agent.
USER_AGENT = "smartledger-ai/0.1.0"


def build_chat_model(config: AppConfig) -> Model | None:
    """Builds the chat model, wrapped with the configured fallbacks.

    Every model shares `OPENAI_API_KEY` and `OPENAI_BASE_URL`, because one gateway
    (OpenAI, OpenCode Go, later LiteLLM) serves all of them; `MODEL_PROVIDER` and each
    `MODEL_FALLBACKS` entry only pick the API the model speaks.

    Returns:
        The model, or None when the key is unset or the primary model cannot be built,
        which leaves chat disabled.
    """
    api_key = config.OPENAI_API_KEY
    if api_key is None or not api_key.strip():
        logger.info("model provider unconfigured")
        return None
    primary = _build_model(config.MODEL_PROVIDER, config.MODEL_NAME, config)
    if primary is None:
        return None
    fallbacks = [_build_fallback(entry, config) for entry in config.MODEL_FALLBACKS]
    fallbacks = [model for model in fallbacks if model is not None]
    logger.info(
        "model provider configured: %s (%s), %d fallback(s)",
        config.MODEL_PROVIDER,
        config.MODEL_NAME,
        len(fallbacks),
    )
    if not fallbacks:
        return primary
    return FallbackModel(primary, *fallbacks)


def session_settings(session_id: str) -> ModelSettings:
    """Per-run model settings naming the gateway session of one conversation.

    OpenCode Go rejects a request without `x-opencode-session` and routes and caches
    prompts by it. The User-Agent travels in the same `extra_headers`, because a run's
    settings replace the model's `extra_headers` whole. Other gateways ignore both.
    """
    return ModelSettings(
        extra_headers={"User-Agent": USER_AGENT, "x-opencode-session": session_id}
    )


def _build_fallback(entry: str, config: AppConfig) -> Model | None:
    api, _, model_name = entry.partition(":")
    if not model_name:
        logger.warning("invalid model fallback, expected api:model: %s", entry)
        return None
    return _build_model(api, model_name, config)


def _build_model(api: str, model_name: str, config: AppConfig) -> Model | None:
    builder = _BUILDERS.get(api)
    if builder is None:
        logger.warning("unknown model provider: %s", api)
        return None
    return builder(model_name, config)


def _build_openai_responses(model_name: str, config: AppConfig) -> Model:
    # Reasoning models reject function tools on /v1/chat/completions, so OpenAI's own
    # models only get the agent's tools through the Responses API.
    return OpenAIResponsesModel(
        model_name,
        provider=_openai_provider(config),
        settings=OpenAIResponsesModelSettings(
            timeout=config.MODEL_TIMEOUT_SECONDS,
            openai_reasoning_effort=config.MODEL_REASONING_EFFORT,
        ),
    )


def _build_openai_chat(model_name: str, config: AppConfig) -> Model:
    # OpenAI-compatible models (DeepSeek, GLM, Kimi on OpenCode Go) serve only
    # /chat/completions.
    return OpenAIChatModel(
        model_name,
        provider=_openai_provider(config),
        settings=OpenAIChatModelSettings(
            timeout=config.MODEL_TIMEOUT_SECONDS,
            openai_reasoning_effort=config.MODEL_REASONING_EFFORT,
        ),
    )


def _build_anthropic(model_name: str, config: AppConfig) -> Model | None:
    # The shared key belongs to the gateway, so it must not reach Anthropic's default
    # URL.
    base_url = config.OPENAI_BASE_URL
    if base_url is None or not base_url.strip():
        logger.warning("anthropic models need OPENAI_BASE_URL set to a gateway")
        return None
    # The Anthropic SDK appends /v1/messages itself, while the shared URL ends in /v1
    # for the OpenAI SDK.
    return AnthropicModel(
        model_name,
        provider=AnthropicProvider(
            api_key=config.OPENAI_API_KEY,
            base_url=base_url.strip().rstrip("/").removesuffix("/v1"),
        ),
        settings=AnthropicModelSettings(
            timeout=config.MODEL_TIMEOUT_SECONDS,
            # Anthropic has no "none" effort; leaving it out uses the model default.
            anthropic_effort=None
            if config.MODEL_REASONING_EFFORT == "none"
            else config.MODEL_REASONING_EFFORT,
        ),
    )


def _openai_provider(config: AppConfig) -> OpenAIProvider:
    return OpenAIProvider(
        api_key=config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL or OPENAI_DEFAULT_BASE_URL,
    )


# MODEL_PROVIDER value -> builder for the API that model speaks.
_BUILDERS: dict[str, Callable[[str, AppConfig], Model | None]] = {
    "openai": _build_openai_responses,
    "openai-chat": _build_openai_chat,
    "anthropic": _build_anthropic,
}
