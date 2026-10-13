import logging

from pydantic_ai.models import Model
from pydantic_ai.models.openai import (
    OpenAIResponsesModel,
    OpenAIResponsesModelSettings,
)
from pydantic_ai.providers.openai import OpenAIProvider

from src.app_config import AppConfig

logger = logging.getLogger(__name__)

# The OpenAI SDK reads OPENAI_BASE_URL itself when no URL is passed, and keeps a blank
# value; `.env.example` leaves it blank, so a blank setting resolves here instead.
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"


def build_chat_model(config: AppConfig) -> Model | None:
    if config.MODEL_PROVIDER != "openai":
        logger.warning("unknown model provider: %s", config.MODEL_PROVIDER)
        return None
    api_key = config.OPENAI_API_KEY
    if api_key is None or not api_key.strip():
        logger.info("model provider unconfigured")
        return None
    logger.info("model provider configured: openai (%s)", config.MODEL_NAME)
    # Reasoning models reject function tools on /v1/chat/completions, so the agent's
    # tools only work through the Responses API.
    return OpenAIResponsesModel(
        config.MODEL_NAME,
        provider=OpenAIProvider(
            api_key=api_key,
            base_url=config.OPENAI_BASE_URL or OPENAI_DEFAULT_BASE_URL,
        ),
        settings=OpenAIResponsesModelSettings(
            timeout=config.MODEL_TIMEOUT_SECONDS,
            openai_reasoning_effort=config.MODEL_REASONING_EFFORT,
        ),
    )
