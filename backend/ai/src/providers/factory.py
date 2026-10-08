import logging

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from src.app_config import AppConfig

logger = logging.getLogger(__name__)


def build_chat_model(config: AppConfig) -> BaseChatModel | None:
    if config.MODEL_PROVIDER != "openai":
        logger.warning("unknown model provider: %s", config.MODEL_PROVIDER)
        return None
    api_key = config.OPENAI_API_KEY
    if api_key is None or not api_key.strip():
        logger.info("model provider unconfigured")
        return None
    logger.info("model provider configured: openai (%s)", config.MODEL_NAME)
    return ChatOpenAI(
        api_key=api_key,
        model=config.MODEL_NAME,
        base_url=config.OPENAI_BASE_URL,
        timeout=config.MODEL_TIMEOUT_SECONDS,
        reasoning_effort=config.MODEL_REASONING_EFFORT,
        # Reasoning models reject function tools on /v1/chat/completions, so the agent's
        # tools only work through the Responses API.
        use_responses_api=True,
    )
