import json

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, ToolCallPart
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.instrumented import InstrumentationSettings
from tests.support import TEST_GUARDRAIL_LIMITS, ScriptedModel
from tests.unit_tests.test_agent_service import (
    FakeConversationRepository,
    FakeExecutor,
    collect,
)

from src import observability
from src.agent.service import AgentService
from src.app_config import AppConfig

pytestmark = pytest.mark.anyio

# Text the owner, the model and the shop-data tool exchange in the traced turn; none of
# it may reach a span. FakeExecutor answers with the phone number 0901234567.
QUESTION = "Số của chị Lan 0912345678 là gì?"
SQL = "SELECT phone FROM v_shop_profile WHERE note = 'chi Lan'"
ANSWER = "Số của chị Lan là 0901234567."
PRIVATE_TEXT = ("0912345678", "0901234567", "chị Lan", "chi Lan", "v_shop_profile")


@pytest.fixture
def spans():
    """Trace every agent the way Logfire is configured, into memory."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    previous = Agent._instrument_default
    Agent.instrument_all(
        InstrumentationSettings(
            tracer_provider=provider,
            include_content=False,
            include_binary_content=False,
        )
    )
    yield exporter
    Agent.instrument_all(previous)


def exported(exporter: InMemorySpanExporter) -> str:
    return "\n".join(
        json.dumps(dict(span.attributes or {}), ensure_ascii=False, default=str)
        for span in exporter.get_finished_spans()
    )


def traced_agent() -> AgentService:
    model = ScriptedModel(
        ModelResponse(parts=[ToolCallPart("query_shop_data", {"sql": SQL})]), ANSWER
    )
    return AgentService(
        model,
        FakeConversationRepository(),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
        sql_executor=FakeExecutor(),
    )


def test_blank_token_leaves_tracing_off(monkeypatch) -> None:
    def must_not_run(*args, **kwargs):
        raise AssertionError("logfire configured without a token")

    monkeypatch.setattr(observability.logfire, "configure", must_not_run)
    monkeypatch.setattr(observability.logfire, "instrument_pydantic_ai", must_not_run)

    assert observability.configure_tracing(AppConfig(LOGFIRE_TOKEN="  ")) is False
    assert observability.configure_tracing(AppConfig(LOGFIRE_TOKEN=None)) is False


def test_token_traces_agents_without_message_content(monkeypatch) -> None:
    calls: dict = {}
    monkeypatch.setattr(
        observability.logfire,
        "configure",
        lambda **kwargs: calls.setdefault("configure", kwargs),
    )
    monkeypatch.setattr(
        observability.logfire,
        "instrument_pydantic_ai",
        lambda **kwargs: calls.setdefault("instrument", kwargs),
    )
    config = AppConfig(LOGFIRE_TOKEN="token", LOGFIRE_ENVIRONMENT="staging")

    assert observability.configure_tracing(config) is True

    assert calls["configure"]["token"] == "token"
    assert calls["configure"]["environment"] == "staging"
    assert calls["configure"]["console"] is False
    assert calls["instrument"] == {
        "include_content": False,
        "include_binary_content": False,
    }


@pytest.mark.parametrize("streamed", [False, True])
async def test_traced_turn_carries_the_shop_but_no_message_content(
    spans, streamed
) -> None:
    agent = traced_agent()

    if streamed:
        await collect(await agent.stream_chat(user_id=3, shop_id=15, message=QUESTION))
    else:
        await agent.chat(user_id=3, shop_id=15, message=QUESTION)

    names = [span.name for span in spans.get_finished_spans()]
    assert "execute_tool query_shop_data" in names
    run = next(s for s in spans.get_finished_spans() if s.name.startswith("invoke"))
    assert json.loads(run.attributes["metadata"]) == {"shop_id": 15}
    assert run.attributes["gen_ai.aggregated_usage.input_tokens"] > 0
    text = exported(spans)
    for private in PRIVATE_TEXT:
        assert private not in text


async def test_a_failed_model_call_keeps_its_message_out_of_the_trace(spans) -> None:
    def failing_model(messages, info):
        raise RuntimeError("provider echoed 0912345678")

    agent = AgentService(
        FunctionModel(failing_model),
        FakeConversationRepository(),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    with pytest.raises(RuntimeError):
        await agent.chat(user_id=3, shop_id=15, message=QUESTION)

    assert spans.get_finished_spans()
    assert "0912345678" not in exported(spans)
