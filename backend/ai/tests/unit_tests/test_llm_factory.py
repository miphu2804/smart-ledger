import pytest
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIResponsesModel

from src.app_config import AppConfig, ModelAlias
from src.llm.factory import LLMFactory
from src.llm.session_settings import session_settings


def chat_alias(
    protocol: str, model: str = "gpt-6-luna", effort: str | None = None
) -> dict[str, ModelAlias]:
    return {"chat": ModelAlias(protocol=protocol, model=model, effort=effort)}


def build_chat_model(config: AppConfig):
    return LLMFactory(config).create_model("chat")


def test_build_chat_model_returns_none_without_api_key() -> None:
    config = AppConfig(OPENAI_API_KEY=None)

    assert build_chat_model(config) is None


def test_build_chat_model_returns_none_for_blank_api_key() -> None:
    config = AppConfig(OPENAI_API_KEY="   ")

    assert build_chat_model(config) is None


def test_build_chat_model_returns_a_responses_model() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test", MODEL_ALIASES=chat_alias("openai_responses")
    )

    model = build_chat_model(config)

    assert isinstance(model, OpenAIResponsesModel)
    assert model.model_name == "gpt-6-luna"


def test_empty_base_url_uses_provider_default(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_BASE_URL", "")
    config = AppConfig(
        _env_file=None,
        OPENAI_API_KEY="sk-test",
        MODEL_ALIASES=chat_alias("openai_responses"),
    )

    model = build_chat_model(config)

    assert model.base_url == "https://api.openai.com/v1/"


def test_create_model_returns_none_for_unknown_protocol() -> None:
    config = AppConfig(MODEL_ALIASES=chat_alias("unknown"))

    assert build_chat_model(config) is None


def test_build_chat_model_sets_timeout_and_configured_reasoning() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        MODEL_ALIASES=chat_alias("openai_responses"),
        MODEL_REASONING_EFFORT="high",
    )

    model = build_chat_model(config)

    assert model.settings["openai_reasoning_effort"] == "high"
    assert model.settings["timeout"] == config.MODEL_TIMEOUT_SECONDS


GATEWAY_URL = "http://bifrost:8080/openai/v1"


def test_openai_chat_provider_returns_a_chat_model_on_the_gateway() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        OPENAI_BASE_URL=GATEWAY_URL,
        MODEL_ALIASES=chat_alias("openai_chat", "mercury-3"),
    )

    model = build_chat_model(config)

    assert isinstance(model, OpenAIChatModel)
    assert model.model_name == "mercury-3"
    assert model.base_url == GATEWAY_URL + "/"


def test_fallbacks_wrap_the_primary_model_in_order() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        OPENAI_BASE_URL=GATEWAY_URL,
        MODEL_ALIASES=chat_alias("openai_responses", "gpt-5.6-luna"),
        MODEL_FALLBACKS=[
            "openai_chat:mercury-3",
            "openai_responses:gpt-6-luna",
        ],
    )

    model = build_chat_model(config)

    assert isinstance(model, FallbackModel)
    assert [m.model_name for m in model.models] == [
        "gpt-5.6-luna",
        "mercury-3",
        "gpt-6-luna",
    ]


def test_invalid_fallbacks_are_skipped() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        MODEL_ALIASES=chat_alias("openai_responses"),
        MODEL_FALLBACKS=["mercury-3", "unknown:some-model"],
    )

    model = build_chat_model(config)

    assert isinstance(model, OpenAIResponsesModel)


def test_fallbacks_parse_from_a_json_env_value(monkeypatch) -> None:
    monkeypatch.setenv("MODEL_FALLBACKS", '["openai_chat:mercury-3"]')

    config = AppConfig(_env_file=None)

    assert config.MODEL_FALLBACKS == ["openai_chat:mercury-3"]


def test_default_alias_is_luna_on_responses_with_medium_effort() -> None:
    config = AppConfig(_env_file=None, OPENAI_API_KEY="sk-test")

    model = build_chat_model(config)

    assert isinstance(model, OpenAIResponsesModel)
    assert model.model_name == "gpt-6-luna"
    assert model.settings["openai_reasoning_effort"] == "medium"


def test_alias_effort_overrides_the_default_effort() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        MODEL_ALIASES=chat_alias("openai_chat", "mercury-3", effort="low"),
        MODEL_REASONING_EFFORT="high",
    )

    model = build_chat_model(config)

    assert model.settings["openai_reasoning_effort"] == "low"


def test_alias_without_effort_uses_the_default_effort() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        MODEL_ALIASES=chat_alias("openai_responses"),
        MODEL_REASONING_EFFORT="medium",
    )

    model = build_chat_model(config)

    assert model.settings["openai_reasoning_effort"] == "medium"


def test_alias_service_tier_is_sent_with_the_model_settings() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        MODEL_ALIASES={
            "chat": ModelAlias(
                protocol="openai_responses", model="gpt-6-luna", service_tier="priority"
            )
        },
    )

    model = build_chat_model(config)

    assert model.settings["openai_service_tier"] == "priority"
    assert model.settings["timeout"] == config.MODEL_TIMEOUT_SECONDS


def test_alias_without_service_tier_leaves_the_provider_default() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test", MODEL_ALIASES=chat_alias("openai_responses")
    )

    model = build_chat_model(config)

    assert "openai_service_tier" not in model.settings


@pytest.mark.parametrize("protocol", ["openai_responses", "openai_chat"])
def test_client_sends_the_key_as_a_bifrost_virtual_key_header(protocol: str) -> None:
    config = AppConfig(
        OPENAI_API_KEY="vk-test",
        OPENAI_BASE_URL=GATEWAY_URL,
        MODEL_ALIASES=chat_alias(protocol),
    )

    model = build_chat_model(config)

    assert model.client.default_headers["x-bf-vk"] == "vk-test"


def test_anthropic_protocol_is_gone() -> None:
    config = AppConfig(
        OPENAI_API_KEY="sk-test",
        OPENAI_BASE_URL=GATEWAY_URL,
        MODEL_ALIASES=chat_alias("anthropic_messages", "claude-haiku-5-5"),
    )

    assert build_chat_model(config) is None


def test_create_model_returns_none_for_unknown_alias() -> None:
    config = AppConfig(OPENAI_API_KEY="sk-test")

    assert LLMFactory(config).create_model("unknown") is None


def test_model_aliases_parse_from_a_json_env_value(monkeypatch) -> None:
    monkeypatch.setenv(
        "MODEL_ALIASES", '{"chat":{"protocol":"openai_chat","model":"gpt-6-luna"}}'
    )

    config = AppConfig(_env_file=None)

    assert config.MODEL_ALIASES == chat_alias("openai_chat", "gpt-6-luna")


def test_session_settings_name_the_session_and_the_shop() -> None:
    settings = session_settings("conversation-7", 42)

    assert settings["extra_headers"] == {
        "x-bf-session-id": "conversation-7",
        "x-bf-lh-shop-id": "42",
    }
