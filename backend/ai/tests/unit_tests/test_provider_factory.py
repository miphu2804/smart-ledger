from langchain_openai import ChatOpenAI

from src.app_config import AppConfig
from src.providers.factory import build_chat_model


def test_build_chat_model_returns_none_without_api_key() -> None:
    config = AppConfig(OPENAI_API_KEY=None)

    assert build_chat_model(config) is None


def test_build_chat_model_returns_none_for_blank_api_key() -> None:
    config = AppConfig(OPENAI_API_KEY="   ")

    assert build_chat_model(config) is None


def test_build_chat_model_returns_chat_openai() -> None:
    config = AppConfig(OPENAI_API_KEY="sk-test")

    model = build_chat_model(config)

    assert isinstance(model, ChatOpenAI)


def test_empty_base_url_uses_provider_default(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_BASE_URL", "")
    config = AppConfig(_env_file=None, OPENAI_API_KEY="sk-test")

    model = build_chat_model(config)

    assert isinstance(model, ChatOpenAI)
    assert model.openai_api_base is None


def test_build_chat_model_returns_none_for_unknown_provider() -> None:
    config = AppConfig(MODEL_PROVIDER="unknown")

    assert build_chat_model(config) is None
