import pytest
from pydantic_ai import Tool
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from tests.support import (
    TEST_GUARDRAIL_LIMITS,
    ScriptedModel,
    tool_call,
    transcript,
)

from src.agent.service import AgentService, Done, Reset, TextDelta
from src.agent.tools import suggest_screen

pytestmark = pytest.mark.anyio

BUTTONS = '\n\n```actions\n["debts"]\n```'
# The whole answer, written before the model calls suggest_screen.
LIST = "Gợi ý nhập thêm:\n- Ức gà: 3 kg\n- Đậu xanh: 1 kg\n\nĐây chỉ là gợi ý."
FOLLOW_UP = "Bấm nút bên dưới để mở Công nợ."
# The same answer written again after a button call, with a changed last sentence.
REWRITE = LIST.replace("Đây chỉ là gợi ý.", "Đây chỉ là gợi ý!")


def answer_then_button(text: str = LIST) -> ModelResponse:
    return ModelResponse(
        parts=[TextPart(text), ToolCallPart("suggest_screen", {"screen": "debts"})]
    )


def shown(events: list) -> str:
    """The text on screen: a Reset clears what was shown before it."""
    text = ""
    for event in events:
        if isinstance(event, Reset):
            text = ""
        elif isinstance(event, TextDelta):
            text += event.text
    return text


class FakeConversationRepository:
    def __init__(self, history: list[dict] | None = None) -> None:
        self.history = history or []
        self.saved_exchange: dict | None = None

    def recent_messages(self, conversation_id, user_id, shop_id, limit):
        return self.history

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
        return kwargs["conversation_id"] or 41, 72


def build_agent(model, conversations=None) -> AgentService:
    return AgentService(
        model,
        conversations or FakeConversationRepository(),
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )


def test_model_can_only_pick_a_listed_screen() -> None:
    schema = Tool(suggest_screen).tool_def.parameters_json_schema

    assert list(schema["properties"]) == ["screen"]
    assert schema["properties"]["screen"]["enum"] == [
        "sales",
        "voice_order",
        "orders",
        "products",
        "debts",
        "expenses",
        "reports",
    ]


async def test_chat_stores_the_suggested_screen_as_a_button_block() -> None:
    conversations = FakeConversationRepository()
    model = ScriptedModel(tool_call("suggest_screen", {"screen": "debts"}), "Còn nợ.")

    result = await build_agent(model, conversations).chat(
        user_id=3, shop_id=15, message="ai còn nợ?"
    )

    assert result.answer == "Còn nợ." + BUTTONS
    assert conversations.saved_exchange["assistant_message"] == result.answer


async def test_buttons_skip_repeats_and_stop_at_two() -> None:
    model = ScriptedModel(
        tool_call(
            "suggest_screen",
            {"screen": "debts"},
            {"screen": "debts"},
            {"screen": "sales"},
            {"screen": "expenses"},
        ),
        "ok",
    )

    result = await build_agent(model).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == 'ok\n\n```actions\n["debts", "sales"]\n```'


async def test_an_unlisted_screen_is_retried_and_adds_no_button() -> None:
    model = ScriptedModel(tool_call("suggest_screen", {"screen": "/admin"}), "ok")

    result = await build_agent(model).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == "ok"
    assert [kind for kind, _ in transcript(model.requests[-1][0])][-1] == "retry"


async def test_stream_chat_sends_the_buttons_with_the_answer() -> None:
    model = ScriptedModel(tool_call("suggest_screen", {"screen": "debts"}), "Còn nợ.")

    events = [
        event
        async for event in await build_agent(model).stream_chat(
            user_id=3, shop_id=15, message="m"
        )
    ]

    streamed = "".join(event.text for event in events if isinstance(event, TextDelta))
    assert streamed == "Còn nợ." + BUTTONS
    assert isinstance(events[-1], Done)
    assert events[-1].result.answer == streamed


async def test_history_replays_answers_without_their_buttons() -> None:
    conversations = FakeConversationRepository(
        history=[
            {"role": "USER", "content": "ai còn nợ?"},
            {"role": "ASSISTANT", "content": "Còn nợ." + BUTTONS},
        ]
    )
    model = ScriptedModel("ok")

    await build_agent(model, conversations).chat(
        user_id=3, shop_id=15, message="m", conversation_id=41
    )

    assert ("assistant", "Còn nợ.") in transcript(model.requests[0][0])


async def test_chat_keeps_the_answer_written_before_the_button_call() -> None:
    model = ScriptedModel(answer_then_button(), FOLLOW_UP)

    result = await build_agent(model).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == LIST + "\n\n" + FOLLOW_UP + BUTTONS


async def test_stream_chat_extends_the_answer_written_before_the_button_call() -> None:
    model = ScriptedModel(answer_then_button(), FOLLOW_UP)

    events = [
        event
        async for event in await build_agent(model).stream_chat(
            user_id=3, shop_id=15, message="m"
        )
    ]

    # Nothing shown is taken back: the list stays and the follow-up joins it.
    assert not any(isinstance(event, Reset) for event in events)
    streamed = "".join(event.text for event in events if isinstance(event, TextDelta))
    assert streamed == LIST + "\n\n" + FOLLOW_UP + BUTTONS
    assert events[-1].result.answer == streamed


async def test_a_preamble_before_a_data_tool_call_is_still_dropped() -> None:
    model = ScriptedModel(
        answer_then_button(),
        ModelResponse(
            parts=[TextPart("Để tôi xem lại."), ToolCallPart("unknown_tool", {})]
        ),
        "Còn nợ.",
    )

    result = await build_agent(model).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == "Còn nợ." + BUTTONS


async def test_text_before_the_button_call_that_leaks_is_dropped() -> None:
    model = ScriptedModel(answer_then_button("Theo smartledger.shop_id thì"), "Còn nợ.")

    result = await build_agent(model).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == "Còn nợ." + BUTTONS


async def test_chat_drops_a_reply_that_repeats_the_answer_before_the_button() -> None:
    # After suggest_screen returns, models often write the same answer again.
    model = ScriptedModel(answer_then_button(), LIST)

    result = await build_agent(model).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == LIST + BUTTONS


async def test_stream_chat_does_not_send_a_repeated_answer_twice() -> None:
    model = ScriptedModel(answer_then_button(), answer_then_button(), LIST + "\n")

    events = [
        event
        async for event in await build_agent(model).stream_chat(
            user_id=3, shop_id=15, message="m"
        )
    ]

    assert not any(isinstance(event, Reset) for event in events)
    streamed = "".join(event.text for event in events if isinstance(event, TextDelta))
    assert streamed == LIST + BUTTONS
    assert events[-1].result.answer == streamed


async def test_a_reply_that_rewrites_the_answer_is_shown_once() -> None:
    model = ScriptedModel(answer_then_button(), LIST + " Bấm nút bên dưới.")

    events = [
        event
        async for event in await build_agent(model).stream_chat(
            user_id=3, shop_id=15, message="m"
        )
    ]

    assert shown(events) == LIST + " Bấm nút bên dưới." + BUTTONS
    assert events[-1].result.answer == shown(events)


async def test_stream_chat_replaces_the_shown_answer_on_a_second_button_call() -> None:
    model = ScriptedModel(answer_then_button(), answer_then_button(REWRITE), "Xong.")

    events = [
        event
        async for event in await build_agent(model).stream_chat(
            user_id=3, shop_id=15, message="m"
        )
    ]

    assert any(isinstance(event, Reset) for event in events)
    assert shown(events) == REWRITE + "\n\nXong." + BUTTONS
    assert events[-1].result.answer == shown(events)


async def test_chat_replaces_the_answer_that_a_rewrite_changes_at_the_end() -> None:
    model = ScriptedModel(answer_then_button(), REWRITE)

    result = await build_agent(model).chat(user_id=3, shop_id=15, message="m")

    assert result.answer == REWRITE + BUTTONS


async def test_a_rewrite_of_a_later_answer_keeps_the_text_before_it() -> None:
    later = "Bấm nút bên dưới để mở Công nợ và xem từng khoản nợ."
    later_rewritten = later.replace("nợ.", "nợ!")
    model = ScriptedModel(
        answer_then_button(),
        answer_then_button(later),
        answer_then_button(later_rewritten),
        "Xong.",
    )

    events = [
        event
        async for event in await build_agent(model).stream_chat(
            user_id=3, shop_id=15, message="m"
        )
    ]

    # The rewrite is the only Reset: the list before it is sent again after the Reset.
    resets = [index for index, event in enumerate(events) if isinstance(event, Reset)]
    assert len(resets) == 1
    assert shown(events[resets[0] :]).startswith(LIST + "\n\n")
    assert shown(events) == LIST + "\n\n" + later_rewritten + "\n\nXong." + BUTTONS
    assert events[-1].result.answer == shown(events)
