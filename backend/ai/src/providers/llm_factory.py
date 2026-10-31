import logging

from pydantic_ai.models import Model
from pydantic_ai.models.fallback import FallbackModel

from src.app_config import AppConfig
from src.providers.anthropic_messages_provider import AnthropicMessagesProvider
from src.providers.openai_chat_provider import OpenAIChatProvider
from src.providers.openai_responses_provider import OpenAIResponsesProvider

logger = logging.getLogger(__name__)

# The OpenAI SDK reads OPENAI_BASE_URL itself when no URL is passed, and keeps a blank
# value; `.env.example` leaves it blank, so a blank setting resolves here instead.
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"

Provider = OpenAIChatProvider | OpenAIResponsesProvider | AnthropicMessagesProvider


class LLMFactory:
    """Builds Pydantic AI models by alias.

    Every model shares `OPENAI_API_KEY`, because one gateway (Bifrost on the VPS,
    OpenCode Go, or OpenAI) serves all of them. `MODEL_ALIASES` maps an alias to the
    protocol the model speaks and the model id sent to the gateway; the gateway decides
    which upstream serves it.
    """

    def __init__(self, config: AppConfig) -> None:
        self.config = config

    def create_model(self, alias: str) -> Model | None:
        """Builds the model of an alias, wrapped with the configured fallbacks.

        `MODEL_FALLBACKS` only stays for an environment that reaches OpenCode Go
        directly; Bifrost configures fallbacks in its routing rules.

        Returns:
            The model, or None when the key is unset or the alias cannot be built,
            which leaves chat disabled.
        """
        api_key = self.config.OPENAI_API_KEY
        if api_key is None or not api_key.strip():
            logger.info("model provider unconfigured")
            return None
        target = self.config.MODEL_ALIASES.get(alias)
        if target is None:
            logger.warning("unknown model alias: %s", alias)
            return None
        primary = self._build_model(target.protocol, target.model)
        if primary is None:
            return None
        fallbacks = [self._build_fallback(e) for e in self.config.MODEL_FALLBACKS]
        fallbacks = [model for model in fallbacks if model is not None]
        logger.info(
            "model alias %s configured: %s (%s), %d fallback(s)",
            alias,
            target.protocol,
            target.model,
            len(fallbacks),
        )
        if not fallbacks:
            return primary
        return FallbackModel(primary, *fallbacks)

    def _build_fallback(self, entry: str) -> Model | None:
        protocol, _, model_name = entry.partition(":")
        if not model_name:
            logger.warning("invalid model fallback, expected protocol:model: %s", entry)
            return None
        return self._build_model(protocol, model_name)

    def _build_model(self, protocol: str, model_name: str) -> Model | None:
        provider = self._build_provider(protocol)
        if provider is None:
            return None
        return provider.create_model(model_name)

    def _build_provider(self, protocol: str) -> Provider | None:
        config = self.config
        options = {
            "api_key": config.OPENAI_API_KEY,
            "timeout": config.MODEL_TIMEOUT_SECONDS,
            "reasoning_effort": config.MODEL_REASONING_EFFORT,
        }
        openai_base_url = config.OPENAI_BASE_URL or OPENAI_DEFAULT_BASE_URL
        if protocol == "openai_responses":
            return OpenAIResponsesProvider(base_url=openai_base_url, **options)
        if protocol == "openai_chat":
            return OpenAIChatProvider(base_url=openai_base_url, **options)
        if protocol == "anthropic_messages":
            # The shared key belongs to the gateway, so it must not reach Anthropic's
            # default URL.
            base_url = self._anthropic_base_url()
            if base_url is None:
                logger.warning(
                    "anthropic models need ANTHROPIC_BASE_URL or OPENAI_BASE_URL "
                    "set to a gateway"
                )
                return None
            return AnthropicMessagesProvider(base_url=base_url, **options)
        logger.warning("unknown model protocol: %s", protocol)
        return None

    def _anthropic_base_url(self) -> str | None:
        # Bifrost serves the Anthropic API under /anthropic, apart from its OpenAI API
        # under /openai, so it needs its own setting. A gateway that serves both APIs
        # under one prefix (OpenCode Go) leaves it unset, and the URL loses the /v1
        # suffix the OpenAI SDK needs. The Anthropic SDK appends /v1/messages itself.
        config = self.config
        if config.ANTHROPIC_BASE_URL and config.ANTHROPIC_BASE_URL.strip():
            return config.ANTHROPIC_BASE_URL.strip().rstrip("/")
        if config.OPENAI_BASE_URL and config.OPENAI_BASE_URL.strip():
            return config.OPENAI_BASE_URL.strip().rstrip("/").removesuffix("/v1")
        return None
