from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIResponsesModel

from src.app_config import AppConfig
from src.providers.factory import USER_AGENT, build_chat_model, session_settings


def test_build_chat_model_returns_none_without_api_key() -> None:
    config = AppConfig(OPENAI_API_KEY=None)

    assert build_chat_model(config) is None


def test_build_chat_model_returns_none_for_blank_api_key() -> None:
    config = AppConfig(OPENAI_API_KEY="   ")

    assert build_chat_model(config) is None


def test_build_chat_model_returns_a_responses_model() -> None:
    config = AppConfig(OPENAI_API_KEY="sk-test", MODEL_PROVIDER="openai")

    model = build_chat_model(config)

    assert isinstance(model, OpenAIResponsesModel)
    assert model.model_name == config.MODEL_NAME


def test_empty_base_url_uses_provider_default(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_BASE_URL", "")
    config = AppConfig(
        _env_file=None, OPENAI_API_KEY="sk-test", MODEL_PROVIDER="openai"
    )

    model = build_chat_model(config)

    assert model.base_url == "https://api.openai.com/v1/"


def test_build_chat_model_returns_none_for_unknown_provider() -> None:
    config = AppConfig(MODEL_PROVIDER="unknown")

    assert build_chat_model(config) is None


def test_build_chat_model_sets_timeout_and_configured_reasoning() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test", MODEL_PROVIDER="openai", MODEL_REASONING_EFFORT="high"
    )

    model = build_chat_model(config)

    assert model.settings["openai_reasoning_effort"] == "high"
    assert model.settings["timeout"] == config.MODEL_TIMEOUT_SECONDS


GATEWAY_URL = "https://opencode.ai/inference/go/v1"


def test_openai_chat_provider_returns_a_chat_model_on_the_gateway() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        OPENAI_BASE_URL=GATEWAY_URL,
        MODEL_PROVIDER="openai-chat",
        MODEL_NAME="deepseek-v4.1-flash",
    )

    model = build_chat_model(config)

    assert isinstance(model, OpenAIChatModel)
    assert model.model_name == "deepseek-v4.1-flash"
    assert model.base_url == GATEWAY_URL + "/"


def test_anthropic_provider_drops_the_shared_v1_suffix() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        OPENAI_BASE_URL=GATEWAY_URL,
        MODEL_PROVIDER="anthropic",
        MODEL_NAME="claude-haiku-5-5",
    )

    model = build_chat_model(config)

    assert isinstance(model, AnthropicModel)
    assert model.base_url == "https://opencode.ai/inference/go/"


def test_anthropic_provider_needs_a_gateway_url(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    config = AppConfig(
        _env_file=None,
        OPENAI_API_KEY="sk-test",
        MODEL_PROVIDER="anthropic",
        MODEL_NAME="claude-haiku-5-5",
    )

    assert build_chat_model(config) is None


def test_fallbacks_wrap_the_primary_model_in_order() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        OPENAI_BASE_URL=GATEWAY_URL,
        MODEL_PROVIDER="openai",
        MODEL_NAME="gpt-5.6-luna",
        MODEL_FALLBACKS=[
            "openai-chat:deepseek-v4.1-flash",
            "anthropic:claude-haiku-5-5",
        ],
    )

    model = build_chat_model(config)

    assert isinstance(model, FallbackModel)
    assert [m.model_name for m in model.models] == [
        config.MODEL_NAME,
        "deepseek-v4.1-flash",
        "claude-haiku-5-5",
    ]


def test_invalid_fallbacks_are_skipped() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        MODEL_PROVIDER="openai",
        MODEL_FALLBACKS=["deepseek-v4.1-flash", "unknown:some-model"],
    )

    model = build_chat_model(config)

    assert isinstance(model, OpenAIResponsesModel)


def test_fallbacks_parse_from_a_json_env_value(monkeypatch) -> None:
    monkeypatch.setenv("MODEL_FALLBACKS", '["openai-chat:deepseek-v4.1-flash"]')

    config = AppConfig(_env_file=None)

    assert config.MODEL_FALLBACKS == ["openai-chat:deepseek-v4.1-flash"]


def test_anthropic_provider_sets_effort_from_reasoning_effort() -> None:
    config = AppConfig(OPENAI_API_KEY="sk-test", OPENAI_BASE_URL=GATEWAY_URL)

    model = build_chat_model(config)

    assert model.model_name == "claude-haiku-5-5"
    assert model.settings["anthropic_effort"] == "medium"


def test_session_settings_name_the_client_and_the_session() -> None:
    settings = session_settings("conversation-7")

    assert settings["extra_headers"] == {
        "User-Agent": USER_AGENT,
        "x-opencode-session": "conversation-7",
    }
