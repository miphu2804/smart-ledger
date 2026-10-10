import asyncio
from dataclasses import replace

import pytest
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import FunctionModel
from tests.support import TEST_GUARDRAIL_LIMITS, ScriptedModel, transcript

from src.agent.guardrails import GuardrailError
from src.agent.repository import ConversationNotFoundError
from src.agent.service import (
    AgentChatResult,
    AgentService,
    Done,
    Reset,
    TextDelta,
)
from src.prompt_templates import SHOP_AGENT_SYSTEM_PROMPT

pytestmark = pytest.mark.anyio


def failing_model(messages, info):
    raise RuntimeError("down")


def shown_text(events: list) -> str:
    """The text the owner sees: the deltas after the last Reset."""
    text = ""
    for event in events:
        if isinstance(event, Reset):
            text = ""
        elif isinstance(event, TextDelta):
            text += event.text
    return text


async def collect(events) -> list:
    return [event async for event in events]


class FakeExecutor:
    def run(self, shop_id: int, sql: str) -> dict:
        return {"columns": ["phone"], "rows": [["0901234567"]], "truncated": False}


class FakeConversationRepository:
    def __init__(self, history: list[dict] | None = None, missing: bool = False):
        self.history = history or []
        self.missing = missing
        self.history_request: tuple | None = None
        self.saved_exchange: dict | None = None
        self.saves: list[dict] = []

    def recent_messages(self, conversation_id, user_id, shop_id, limit):
        self.history_request = (conversation_id, user_id, shop_id, limit)
        if self.missing:
            raise ConversationNotFoundError
        return self.history[-limit:]

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
        self.saves.append(kwargs)
        return kwargs["conversation_id"] or 41, 72


async def test_chat_sends_the_instructions_and_persists_the_exchange() -> None:
    model = ScriptedModel("ok")
    conversations = FakeConversationRepository()
    agent = AgentService(model, conversations, guardrail_limits=TEST_GUARDRAIL_LIMITS)

    result = await agent.chat(user_id=3, shop_id=15, message="today's revenue?")

    assert (result.answer, result.conversation_id, result.message_id) == ("ok", 41, 72)
    assert (result.model, result.model_version) == ("test-model", "test-model")
    messages, info = model.requests[0]
    assert info.instructions == SHOP_AGENT_SYSTEM_PROMPT
    assert transcript(messages) == [("user", "today's revenue?")]
    assert conversations.saved_exchange == {
        "user_id": 3,
        "shop_id": 15,
        "conversation_id": None,
        "user_message": "today's revenue?",
        "assistant_message": "ok",
    }


async def test_chat_adds_scoped_conversation_history_to_model_context() -> None:
    model = ScriptedModel("ok")
    conversations = FakeConversationRepository(
        [
            {"message_id": 1, "role": "USER", "content": "hello"},
            {"message_id": 2, "role": "ASSISTANT", "content": "hi there"},
        ]
    )
    agent = AgentService(model, conversations, guardrail_limits=TEST_GUARDRAIL_LIMITS)

    await agent.chat(
        user_id=3,
        shop_id=15,
        conversation_id=41,
        message="today's revenue?",
    )

    assert conversations.history_request == (41, 3, 15, 200)
    assert transcript(model.requests[0][0]) == [
        ("user", "hello"),
        ("assistant", "hi there"),
        ("user", "today's revenue?"),
    ]


async def test_chat_does_not_save_exchange_when_model_fails() -> None:
    conversations = FakeConversationRepository()
    agent = AgentService(
        FunctionModel(failing_model),
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    with pytest.raises(RuntimeError, match="down"):
        await agent.chat(user_id=3, shop_id=15, message="m")

    assert conversations.saved_exchange is None


async def test_chat_sends_only_the_latest_turns_of_a_long_conversation() -> None:
    model = ScriptedModel("ok")
    history = [
        {"message_id": index, "role": role, "content": f"{role} {index}"}
        for index in range(1, 7)
        for role in ["USER" if index % 2 else "ASSISTANT"]
    ]
    conversations = FakeConversationRepository(history)
    agent = AgentService(
        model,
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
        history_turns=2,
    )

    await agent.chat(user_id=3, shop_id=15, conversation_id=41, message="next")

    assert conversations.history_request == (41, 3, 15, 4)
    assert [text for _, text in transcript(model.requests[0][0])] == [
        "USER 3",
        "ASSISTANT 4",
        "USER 5",
        "ASSISTANT 6",
        "next",
    ]


async def test_chat_reads_no_history_for_a_new_conversation() -> None:
    conversations = FakeConversationRepository()
    agent = AgentService(
        ScriptedModel("ok"),
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    await agent.chat(user_id=3, shop_id=15, message="hello")

    assert conversations.history_request is None


async def test_chat_rejects_a_conversation_outside_the_owner_scope() -> None:
    model = ScriptedModel("ok")
    conversations = FakeConversationRepository(missing=True)
    agent = AgentService(model, conversations, guardrail_limits=TEST_GUARDRAIL_LIMITS)

    with pytest.raises(ConversationNotFoundError):
        await agent.chat(user_id=3, shop_id=15, conversation_id=41, message="hello")

    assert model.requests == []
    assert conversations.saved_exchange is None


async def test_chat_without_a_model_is_unavailable() -> None:
    agent = AgentService(
        None, FakeConversationRepository(), guardrail_limits=TEST_GUARDRAIL_LIMITS
    )

    with pytest.raises(RuntimeError, match="agent model unavailable"):
        await agent.chat(user_id=3, shop_id=15, message="hello")


async def test_stream_chat_streams_deltas_that_make_up_the_answer() -> None:
    answer = "Rice sells for 30.000 VND/kg, 12 kg left."
    conversations = FakeConversationRepository()
    agent = AgentService(
        ScriptedModel(answer), conversations, guardrail_limits=TEST_GUARDRAIL_LIMITS
    )

    events = await collect(
        await agent.stream_chat(user_id=3, shop_id=15, message="rice?")
    )

    assert shown_text(events) == answer
    assert not any(isinstance(event, Reset) for event in events)
    assert events[-1] == Done(
        AgentChatResult(
            conversation_id=41,
            message_id=72,
            answer=answer,
            model="test-model",
            model_version="test-model",
        )
    )
    assert conversations.saves == [
        {
            "user_id": 3,
            "shop_id": 15,
            "conversation_id": None,
            "user_message": "rice?",
            "assistant_message": answer,
        }
    ]


async def test_stream_chat_retries_a_leaking_answer_without_streaming_it() -> None:
    answer = "Rice sells for 30.000 VND/kg."
    model = ScriptedModel("SELECT name FROM v_products", answer)
    agent = AgentService(
        model, FakeConversationRepository(), guardrail_limits=TEST_GUARDRAIL_LIMITS
    )

    events = await collect(await agent.stream_chat(user_id=3, shop_id=15, message="m"))

    emitted = "".join(event.text for event in events if isinstance(event, TextDelta))
    for leak in ("select", "from v_", "v_products"):
        assert leak not in emitted.lower()
    assert shown_text(events) == answer
    assert len(model.requests) == 2


async def test_stream_chat_resets_text_written_before_a_tool_call() -> None:
    preamble = "Let me check the products for this shop now."
    answer = "Rice sells for 30.000 VND/kg."
    model = ScriptedModel(
        ModelResponse(
            parts=[
                TextPart(preamble),
                ToolCallPart(
                    "query_shop_data", {"sql": "SELECT phone FROM v_shop_profile"}
                ),
            ]
        ),
        answer,
    )
    agent = AgentService(
        model,
        FakeConversationRepository(),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
        sql_executor=FakeExecutor(),
    )

    events = await collect(await agent.stream_chat(user_id=3, shop_id=15, message="m"))

    reset_at = events.index(Reset())
    shown_before_reset = "".join(
        event.text for event in events[:reset_at] if isinstance(event, TextDelta)
    )
    assert shown_before_reset and preamble.startswith(shown_before_reset)
    assert shown_text(events) == answer


async def test_stream_chat_never_takes_back_text_it_already_sent() -> None:
    # A view name cut at the chunk end is released as a prefix; the next chunk extends
    # it to `v_products_backup`, which shrinks the screened prefix for a moment.
    chunks = ("Open the notes about v_products", "_backup", " and then rice prices.")

    async def chunked_answer(messages, info):
        for chunk in chunks:
            yield chunk

    agent = AgentService(
        FunctionModel(stream_function=chunked_answer),
        FakeConversationRepository(),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    events = await collect(await agent.stream_chat(user_id=3, shop_id=15, message="m"))

    deltas = [event.text for event in events if isinstance(event, TextDelta)]
    assert "" not in deltas
    assert not any(isinstance(event, Reset) for event in events)
    assert "".join(deltas) == "".join(chunks)


async def test_stream_chat_stops_an_answer_the_screen_keeps_rejecting() -> None:
    limits = replace(TEST_GUARDRAIL_LIMITS, model_call_limit=2)
    conversations = FakeConversationRepository()
    agent = AgentService(
        ScriptedModel("Error[SQL_ERROR]", "Error[SQL_ERROR]"),
        conversations,
        guardrail_limits=limits,
    )

    events = await agent.stream_chat(user_id=3, shop_id=15, message="m")
    with pytest.raises(GuardrailError) as stopped:
        await collect(events)

    assert stopped.value.code == "answer_unavailable"
    assert conversations.saves == []


async def test_stream_chat_stops_a_turn_past_the_timeout() -> None:
    async def slow_answer(messages, info):
        yield "Rice sells for 30.000 VND/kg, "
        await asyncio.sleep(1)
        yield "12 kg left."

    limits = replace(TEST_GUARDRAIL_LIMITS, turn_timeout_seconds=0.05)
    conversations = FakeConversationRepository()
    agent = AgentService(
        FunctionModel(stream_function=slow_answer),
        conversations,
        guardrail_limits=limits,
    )

    events = await agent.stream_chat(user_id=3, shop_id=15, message="m")
    with pytest.raises(GuardrailError) as stopped:
        await collect(events)

    assert stopped.value.code == "answer_timeout"
    assert conversations.saves == []


async def test_closing_a_stream_early_cancels_the_run_and_saves_nothing() -> None:
    async def slow_answer(messages, info):
        yield "Rice sells for 30.000 VND/kg, "
        await asyncio.sleep(5)
        yield "12 kg left."

    conversations = FakeConversationRepository()
    agent = AgentService(
        FunctionModel(stream_function=slow_answer),
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    tasks_before = asyncio.all_tasks()
    events = await agent.stream_chat(user_id=3, shop_id=15, message="m")
    first = await anext(events)
    await events.aclose()

    assert isinstance(first, TextDelta)
    assert conversations.saves == []
    assert asyncio.all_tasks() - tasks_before == set()


async def test_a_slow_consumer_does_not_use_up_the_turn_timeout() -> None:
    answer = "Rice sells for 30.000 VND/kg, 12 kg left."
    limits = replace(TEST_GUARDRAIL_LIMITS, turn_timeout_seconds=0.05)
    agent = AgentService(
        ScriptedModel(answer), FakeConversationRepository(), guardrail_limits=limits
    )

    events = []
    async for event in await agent.stream_chat(user_id=3, shop_id=15, message="m"):
        events.append(event)
        await asyncio.sleep(0.1)

    assert shown_text(events) == answer
    assert isinstance(events[-1], Done)


async def test_pre_stream_refusals_raise_on_await_before_any_event() -> None:
    model = ScriptedModel("ok")
    out_of_scope = AgentService(
        model,
        FakeConversationRepository(missing=True),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )
    too_long = AgentService(
        model,
        FakeConversationRepository(),
        guardrail_limits=replace(TEST_GUARDRAIL_LIMITS, max_input_chars=5),
    )
    no_model = AgentService(
        None, FakeConversationRepository(), guardrail_limits=TEST_GUARDRAIL_LIMITS
    )

    with pytest.raises(ConversationNotFoundError):
        await out_of_scope.stream_chat(
            user_id=3, shop_id=15, message="hello", conversation_id=41
        )
    with pytest.raises(GuardrailError) as refused:
        await too_long.stream_chat(user_id=3, shop_id=15, message="hello world")
    assert refused.value.code == "input_too_long"
    with pytest.raises(RuntimeError, match="agent model unavailable"):
        await no_model.stream_chat(user_id=3, shop_id=15, message="hello")

    assert model.requests == []
