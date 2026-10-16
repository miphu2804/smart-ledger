import pytest
from pydantic_ai import Tool
from tests.support import (
    TEST_GUARDRAIL_LIMITS,
    ScriptedModel,
    tool_call,
    transcript,
)

from src.agent.service import AgentService, Done, TextDelta
from src.agent.tools import suggest_screen

pytestmark = pytest.mark.anyio

BUTTONS = '\n\n```actions\n["debts"]\n```'


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
