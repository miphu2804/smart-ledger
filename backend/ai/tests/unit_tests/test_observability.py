import asyncio
import inspect
import json
import logging
import threading
import time
from collections import Counter
from contextlib import contextmanager
from dataclasses import replace
from types import SimpleNamespace

import pytest
from honeyhive import HoneyHiveTracer
from honeyhive._generated.models.LegacyStartSessionRequestSession import (
    LegacyStartSessionRequestSession,
)
from honeyhive.models import StartSessionRequest
from opentelemetry import baggage, context
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic_ai import Agent, Embedder
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.instrumented import InstrumentationSettings
from tests.support import TEST_GUARDRAIL_LIMITS, ScriptedModel
from tests.unit_tests.test_agent_memory import (
    FakeMemoryRepository,
    memory_service,
    recalled,
)
from tests.unit_tests.test_agent_service import (
    FakeConversationRepository,
    FakeShopData,
    collect,
)

from src import observability
from src.agent.errors import GuardrailError
from src.agent.service import AgentService
from src.app_config import AppConfig
from src.observability import Observability

pytestmark = pytest.mark.anyio

# Text the owner, the model and the shop-data tool exchange in the traced turn; all of
# it reaches a span. FakeShopData answers with the phone number 0901234567.
QUESTION = "Số của chị Lan 0912345678 là gì?"
SQL = "SELECT phone FROM v_shop_profile WHERE note = 'chi Lan'"
ANSWER = "Số của chị Lan là 0901234567."
TURN_CONTENT = ("0912345678", "0901234567", "chị Lan", "chi Lan", "v_shop_profile")


@pytest.fixture
def spans():
    """Trace every agent the way HoneyHive is configured, into memory."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    previous = Agent._instrument_default
    Agent.instrument_all(
        InstrumentationSettings(
            tracer_provider=provider,
            include_content=True,
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


def traced_agent(tracer=None, sample_rate: float = 1.0) -> AgentService:
    model = ScriptedModel(
        ModelResponse(parts=[ToolCallPart("query_shop_data", {"sql": SQL})]), ANSWER
    )
    return AgentService(
        model,
        FakeConversationRepository(),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
        shop_data=FakeShopData(),
        observability=Observability(tracer, sample_rate),
    )


async def slow_reply(messages, info) -> ModelResponse:
    await asyncio.sleep(5)
    return ModelResponse(parts=[])


async def slow_stream(messages, info):
    yield "Rice sells for 30.000 VND/kg, "
    await asyncio.sleep(5)
    yield "12 kg left."


def slow_agent(tracer, turn_timeout_seconds: float = 60) -> AgentService:
    return AgentService(
        FunctionModel(function=slow_reply, stream_function=slow_stream),
        FakeConversationRepository(),
        guardrail_limits=replace(
            TEST_GUARDRAIL_LIMITS, turn_timeout_seconds=turn_timeout_seconds
        ),
        observability=Observability(tracer),
    )


class RecordingTracer:
    """Records each call the way the HoneyHive SDK receives it."""

    project_name = "smartledger"
    source_environment = "production"

    def __init__(self) -> None:
        self.sessions: list[dict] = []
        self.enrichments: list[dict] = []
        self.flushes: list[dict] = []
        self.enrichments_at_flush: int | None = None
        self.stopped = False
        self.threads: set[str] = set()
        self.spans: list[dict] = []

    async def acreate_session(self, **kwargs) -> str | None:
        self.sessions.append(kwargs)
        return kwargs["session_id"]

    @property
    def client(self) -> SimpleNamespace:
        """The sessions API the real creation goes through; it lands in
        `acreate_session`, so each fake decides how creation behaves."""

        async def start_async(data: dict) -> str | None:
            return await self.acreate_session(**data["session"])

        return SimpleNamespace(sessions=SimpleNamespace(start_async=start_async))

    def enrich_session(self, **kwargs) -> None:
        self.enrichments.append(kwargs)
        self.threads.add(threading.current_thread().name)

    @contextmanager
    def trace(self, name, event_type=None, **kwargs):
        self.spans.append({"name": name, "event_type": event_type})
        yield

    def enrich_span(self, **fields) -> None:
        self.spans[-1].update(fields)

    def force_flush(self, **kwargs) -> None:
        self.flushes.append(kwargs)
        self.enrichments_at_flush = len(self.enrichments)

    def shutdown(self) -> None:
        self.stopped = True


class SlowTracer(RecordingTracer):
    """Creates the session late and records whether each update came after it."""

    async def acreate_session(self, **kwargs) -> None:
        if not kwargs.get("skip_api_call"):
            await asyncio.sleep(0.05)
        self.sessions.append(kwargs)

    def enrich_session(self, **kwargs) -> None:
        self.enrichments.append({**kwargs, "after_creation": len(self.sessions) == 2})


class BaggageTracer(RecordingTracer):
    """Keeps the session id in OTel baggage, as the HoneyHive SDK does, and records
    the id each call sees."""

    async def acreate_session(self, **kwargs) -> None:
        if kwargs.get("skip_api_call"):
            context.attach(baggage.set_baggage("session_id", kwargs["session_id"]))
        # Lets the other turn run in between.
        await asyncio.sleep(0)
        self.sessions.append({**kwargs, "seen": baggage.get_baggage("session_id")})

    def enrich_session(self, **kwargs) -> None:
        self.enrichments.append({**kwargs, "seen": baggage.get_baggage("session_id")})


class RefusingTracer(RecordingTracer):
    """Returns None for the real creation, as the SDK does on an HTTP error."""

    async def acreate_session(self, **kwargs) -> str | None:
        session_id = await super().acreate_session(**kwargs)
        return session_id if kwargs.get("skip_api_call") else None


class HangingTracer(RecordingTracer):
    async def acreate_session(self, **kwargs) -> None:
        if not kwargs.get("skip_api_call"):
            await asyncio.sleep(3600)


def test_blank_key_leaves_tracing_off(monkeypatch) -> None:
    def must_not_run(*args, **kwargs):
        raise AssertionError("honeyhive configured without a key")

    monkeypatch.setattr(observability.HoneyHiveTracer, "init", must_not_run)

    Observability.start(AppConfig(HH_API_KEY="  "))
    Observability.start(AppConfig(HH_API_KEY=None))


@pytest.mark.parametrize("source", ["local", "staging"])
def test_source_other_than_production_leaves_tracing_off(monkeypatch, source) -> None:
    def must_not_run(*args, **kwargs):
        raise AssertionError("honeyhive traced outside production")

    monkeypatch.setattr(observability.HoneyHiveTracer, "init", must_not_run)

    Observability.start(AppConfig(HH_API_KEY="key", HH_SOURCE=source))


def test_key_traces_agents_with_message_content_but_no_media(monkeypatch) -> None:
    calls: dict = {}
    tracer = SimpleNamespace(provider=TracerProvider())

    def init(**kwargs):
        calls.update(kwargs)
        return tracer

    monkeypatch.setattr(observability.HoneyHiveTracer, "init", init)
    previous = Agent._instrument_default, Embedder._instrument_default
    config = AppConfig(
        HH_API_KEY="key",
        HH_API_URL=None,
        HH_SOURCE="production",
    )

    try:
        Observability.start(config)
        settings = Agent._instrument_default
        embedder_settings = Embedder._instrument_default
    finally:
        Agent.instrument_all(previous[0])
        Embedder.instrument_all(previous[1])

    assert calls == {
        "api_key": "key",
        "source": "production",
        "server_url": None,
        "skip_backend_session_creation": True,
    }
    assert settings.include_content is True
    assert settings.include_binary_content is False
    assert embedder_settings is settings


async def test_turn_opens_a_session_with_the_redacted_question() -> None:
    tracer = RecordingTracer()
    agent = traced_agent(tracer)

    await agent.chat(user_id=3, shop_id=15, message="mail chi.lan@example.vn")
    await asyncio.gather(*agent.observability._background)

    local, remote = tracer.sessions
    assert local["skip_api_call"] is True
    assert remote["session_id"] == local["session_id"]
    assert remote["start_time"] == pytest.approx(time.time() * 1000, abs=60_000)
    assert remote["inputs"] == {"question": "mail [redacted:email]"}
    assert remote["user_properties"] == {"user_id": 3}
    assert remote["metadata"] == {
        "shop_id": 15,
        "conversation_id": None,
        "model": agent.model_name,
        "prompt_version": agent.prompt_version,
        "git_sha": None,
    }


async def test_traced_turn_times_the_save_in_its_own_span() -> None:
    tracer = RecordingTracer()
    agent = traced_agent(tracer)

    await agent.chat(user_id=3, shop_id=15, message=QUESTION)

    assert {"name": "save turn", "event_type": "tool"} in tracer.spans


async def test_turn_closes_its_session_with_the_answer_and_tokens() -> None:
    tracer = RecordingTracer()
    agent = traced_agent(tracer)

    result = await agent.chat(user_id=3, shop_id=15, message=QUESTION)
    await asyncio.gather(*agent.observability._background)

    timed, finished, linked = tracer.enrichments
    assert isinstance(timed["metadata"].pop("history_ms"), int)
    assert timed == {"metadata": {}}
    assert finished["outputs"] == {"answer": ANSWER}
    assert finished["metrics"]["tool_calls"] == 1
    assert finished["metrics"]["model_requests"] == 2
    assert finished["metrics"]["input_tokens"] > 0
    assert linked == {"metadata": {"conversation_id": result.conversation_id}}


async def test_session_updates_wait_until_the_session_exists() -> None:
    tracer = SlowTracer()
    agent = traced_agent(tracer)

    await agent.chat(user_id=3, shop_id=15, message=QUESTION)
    while agent.observability._background:
        await asyncio.gather(*agent.observability._background)

    assert len(tracer.enrichments) == 3
    assert all(enrichment["after_creation"] for enrichment in tracer.enrichments)


async def test_first_span_waits_until_the_session_exists() -> None:
    tracer = SlowTracer()
    sessions_at_model_call: list[int] = []

    def reply(messages, info) -> ModelResponse:
        sessions_at_model_call.append(len(tracer.sessions))
        return ModelResponse(parts=[TextPart(ANSWER)])

    agent = traced_agent(tracer)
    agent.agent = Agent(FunctionModel(reply))

    await agent.chat(user_id=3, shop_id=15, message=QUESTION)

    # The skipped local call plus the real start, both done before the model ran.
    assert sessions_at_model_call == [2]


async def test_session_start_is_sent_while_the_history_is_read() -> None:
    sent = threading.Event()

    class SignallingTracer(RecordingTracer):
        async def acreate_session(self, **kwargs) -> str | None:
            if not kwargs.get("skip_api_call"):
                sent.set()
            return await super().acreate_session(**kwargs)

    class WaitingConversations(FakeConversationRepository):
        def recent_messages(self, *args):
            self.sent_during_read = sent.wait(timeout=1)
            return super().recent_messages(*args)

    conversations = WaitingConversations()
    agent = traced_agent(SignallingTracer())
    agent.conversations = conversations

    await agent.chat(user_id=3, shop_id=15, conversation_id=41, message=QUESTION)

    assert conversations.sent_during_read


async def test_a_refused_message_opens_no_session() -> None:
    tracer = RecordingTracer()
    agent = traced_agent(tracer)

    with pytest.raises(GuardrailError):
        await agent.chat(user_id=3, shop_id=15, message="x" * 100_001)

    assert tracer.sessions == []


async def test_streamed_turn_records_the_wait_for_the_first_words() -> None:
    tracer = RecordingTracer()
    agent = traced_agent(tracer)

    await collect(await agent.stream_chat(user_id=3, shop_id=15, message=QUESTION))
    await asyncio.gather(*agent.observability._background)

    finished = tracer.enrichments[1]
    assert finished["outputs"] == {"answer": ANSWER}
    assert finished["metrics"]["first_text_ms"] >= 0


@pytest.mark.parametrize("streamed", [False, True])
async def test_a_turn_past_the_timeout_marks_its_session(streamed) -> None:
    tracer = RecordingTracer()
    agent = slow_agent(tracer, turn_timeout_seconds=0.05)

    with pytest.raises(GuardrailError):
        if streamed:
            await collect(await agent.stream_chat(user_id=3, shop_id=15, message="m"))
        else:
            await agent.chat(user_id=3, shop_id=15, message="m")
    await asyncio.gather(*agent.observability._background)

    assert tracer.enrichments[1:] == [{"metadata": {"error": "answer_timeout"}}]


async def test_a_closed_stream_marks_its_session_cancelled() -> None:
    tracer = RecordingTracer()
    agent = slow_agent(tracer)

    events = await agent.stream_chat(user_id=3, shop_id=15, message="m")
    await anext(events)
    await events.aclose()
    await asyncio.gather(*agent.observability._background)

    assert tracer.enrichments[1:] == [{"metadata": {"error": "cancelled"}}]


async def test_a_turn_left_out_of_the_sample_sends_nothing() -> None:
    tracer = RecordingTracer()
    agent = traced_agent(tracer, sample_rate=0)

    await agent.chat(user_id=3, shop_id=15, message=QUESTION)

    assert tracer.sessions == []
    assert tracer.enrichments == []
    assert agent.observability._background == set()


async def test_the_real_sdk_drops_an_unsampled_turn_quietly() -> None:
    """Offline: a refused port, and no session is ever created."""
    sdk_log = logging.getLogger("honeyhive.early_init")
    records: list[logging.LogRecord] = []
    handler = logging.Handler()
    handler.emit = records.append
    sdk_log.addHandler(handler)
    previous = Agent._instrument_default, Embedder._instrument_default
    observability = Observability.start(
        AppConfig(HH_API_KEY="key", HH_API_URL="http://127.0.0.1:9", HH_SAMPLE_RATE=0)
    )
    try:
        agent = AgentService(
            ScriptedModel(ANSWER),
            FakeConversationRepository(),
            guardrail_limits=TEST_GUARDRAIL_LIMITS,
            observability=observability,
        )
        result = await agent.chat(user_id=3, shop_id=15, message=QUESTION)
        await observability.flush()
    finally:
        sdk_log.removeHandler(handler)
        Agent.instrument_all(previous[0])
        Embedder.instrument_all(previous[1])

    assert result.answer == ANSWER
    assert not any("no session_id" in record.getMessage() for record in records)


async def test_session_updates_skip_the_default_thread_pool() -> None:
    tracer = RecordingTracer()
    agent = traced_agent(tracer)

    await agent.chat(user_id=3, shop_id=15, message=QUESTION)
    await asyncio.gather(*agent.observability._background)

    assert tracer.threads
    assert all(name.startswith("honeyhive") for name in tracer.threads)


async def test_a_refused_session_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    agent = traced_agent(RefusingTracer())

    with caplog.at_level(logging.WARNING):
        await agent.chat(user_id=3, shop_id=15, message=QUESTION)
        await asyncio.gather(*agent.observability._background)

    assert "honeyhive session not created" in caplog.text


async def test_flush_sends_session_updates_before_the_spans_then_stops() -> None:
    tracer = SlowTracer()
    agent = traced_agent(tracer)

    await agent.chat(user_id=3, shop_id=15, message=QUESTION)
    await agent.observability.flush()

    assert tracer.enrichments_at_flush == 3
    assert tracer.stopped


async def test_calls_match_the_honeyhive_sdk() -> None:
    """The fakes accept anything, so check each recorded call binds to the SDK."""
    tracer = RecordingTracer()
    agent = traced_agent(tracer)

    await agent.chat(user_id=3, shop_id=15, message=QUESTION)
    await agent.observability.flush()

    local, remote = tracer.sessions
    StartSessionRequest.model_validate({"session": remote})
    for method, calls in (
        (HoneyHiveTracer.acreate_session, [local]),
        (HoneyHiveTracer.enrich_session, tracer.enrichments),
        (HoneyHiveTracer.force_flush, tracer.flushes),
    ):
        for kwargs in calls:
            inspect.signature(method).bind(tracer, **kwargs)
    assert {"start_time", "inputs", "metadata", "user_properties"} <= set(
        LegacyStartSessionRequestSession.model_fields
    )
    assert {"outputs", "metrics", "metadata"} <= set(
        inspect.signature(HoneyHiveTracer.enrich_session).parameters
    )


async def test_hung_honeyhive_holds_the_turn_only_for_the_session_wait() -> None:
    agent = traced_agent(HangingTracer())
    agent.observability.SESSION_WAIT_SECONDS = 0.05

    async with asyncio.timeout(1):
        result = await agent.chat(user_id=3, shop_id=15, message=QUESTION)

    assert result.answer == ANSWER
    for task in agent.observability._background:
        task.cancel()


@pytest.mark.parametrize("streamed", [False, True])
async def test_traced_turn_carries_the_shop_and_the_message_content(
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
    for content in TURN_CONTENT:
        assert content in text


async def test_redaction_runs_before_the_message_reaches_a_span(spans) -> None:
    await traced_agent().chat(user_id=3, shop_id=15, message="mail chi.lan@example.vn")

    text = exported(spans)
    assert "chi.lan@example.vn" not in text
    assert "[redacted:email]" in text


async def test_concurrent_turns_keep_their_own_sessions() -> None:
    tracer = BaggageTracer()
    first, second = traced_agent(tracer), traced_agent(tracer)

    await asyncio.gather(
        first.chat(user_id=3, shop_id=15, message=QUESTION),
        second.chat(user_id=4, shop_id=16, message=QUESTION),
    )
    await asyncio.gather(
        *first.observability._background, *second.observability._background
    )

    opened = [session for session in tracer.sessions if "metadata" in session]
    assert {session["metadata"]["shop_id"] for session in opened} == {15, 16}
    assert all(session["seen"] == session["session_id"] for session in tracer.sessions)
    session_ids = {session["session_id"] for session in opened}
    assert len(session_ids) == 2
    # Each turn finishes and links its own session, never the other turn's.
    seen = Counter(enrichment["seen"] for enrichment in tracer.enrichments)
    assert seen == dict.fromkeys(session_ids, 3)
    assert baggage.get_baggage("session_id") is None


async def test_info_logs_hold_no_turn_content(caplog: pytest.LogCaptureFixture) -> None:
    agent = traced_agent()

    with caplog.at_level(logging.INFO):
        await agent.chat(user_id=3, shop_id=15, message=QUESTION)

    assert "tool done query_shop_data" in caplog.text
    for text in TURN_CONTENT:
        assert text not in caplog.text


async def test_recall_span_lists_the_memories_the_turn_received() -> None:
    tracer = RecordingTracer()
    observability = Observability(tracer)
    service = memory_service(
        ScriptedModel(), FakeMemoryRepository(recalled=[recalled()])
    )
    service.observability = observability
    await observability.start_turn_session(15, 3, None, "gạo?", {})

    await service.with_memories(15, 3, "gạo?")

    assert tracer.spans == [
        {
            "name": "memory ready",
            "event_type": "tool",
            "metadata": {"shop_id": 15},
            "outputs": {"ready": True},
        },
        {
            "name": "memory recall",
            "event_type": "tool",
            "inputs": {"question": "gạo?"},
            "metadata": {"shop_id": 15},
            "outputs": {
                "memories": [
                    {
                        "id": 7,
                        "content": recalled().content,
                        "memory_type": "semantic",
                        "score": 0.8,
                    }
                ]
            },
            "metrics": {"recalled_count": 1},
        },
    ]


async def test_failed_recall_leaves_the_turn_and_span_standing() -> None:
    tracer = RecordingTracer()
    observability = Observability(tracer)
    service = memory_service(
        ScriptedModel(),
        FakeMemoryRepository(recalled=[recalled()], error=RuntimeError("db down")),
    )
    service.observability = observability
    await observability.start_turn_session(15, 3, None, "gạo?", {})

    prompt, used = await service.with_memories(15, 3, "gạo?")

    assert (prompt, used) == ("gạo?", [])
    assert [span["name"] for span in tracer.spans] == [
        "memory ready",
        "memory recall",
    ]


async def test_untraced_turn_recalls_without_a_span() -> None:
    tracer = RecordingTracer()
    service = memory_service(
        ScriptedModel(), FakeMemoryRepository(recalled=[recalled()])
    )
    service.observability = Observability(tracer)

    _, used = await service.with_memories(15, 3, "gạo?")

    assert len(used) == 1
    assert tracer.spans == []
