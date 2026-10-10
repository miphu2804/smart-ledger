from pydantic_ai.models.openai import OpenAIResponsesModel

from src.app_config import AppConfig
from src.providers.factory import build_chat_model


def test_build_chat_model_returns_none_without_api_key() -> None:
    config = AppConfig(OPENAI_API_KEY=None)

    assert build_chat_model(config) is None


def test_build_chat_model_returns_none_for_blank_api_key() -> None:
    config = AppConfig(OPENAI_API_KEY="   ")

    assert build_chat_model(config) is None


def test_build_chat_model_returns_a_responses_model() -> None:
    config = AppConfig(OPENAI_API_KEY="sk-test")

    model = build_chat_model(config)

    assert isinstance(model, OpenAIResponsesModel)
    assert model.model_name == config.MODEL_NAME


def test_empty_base_url_uses_provider_default(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_BASE_URL", "")
    config = AppConfig(_env_file=None, OPENAI_API_KEY="sk-test")

    model = build_chat_model(config)

    assert model.base_url == "https://api.openai.com/v1/"


def test_build_chat_model_returns_none_for_unknown_provider() -> None:
    config = AppConfig(MODEL_PROVIDER="unknown")

    assert build_chat_model(config) is None


def test_build_chat_model_sets_timeout_and_configured_reasoning() -> None:
    config = AppConfig(OPENAI_API_KEY="sk-test", MODEL_REASONING_EFFORT="high")

    model = build_chat_model(config)

    assert model.settings["openai_reasoning_effort"] == "high"
    assert model.settings["timeout"] == config.MODEL_TIMEOUT_SECONDS
