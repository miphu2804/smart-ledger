import pytest
from pydantic_ai.models.function import FunctionModel
from tests.support import TEST_GUARDRAIL_LIMITS, ScriptedModel, transcript

from src.agent.repository import ConversationNotFoundError
from src.agent.service import AgentService
from src.prompt_templates import SHOP_AGENT_SYSTEM_PROMPT

pytestmark = pytest.mark.anyio


def failing_model(messages, info):
    raise RuntimeError("down")


class FakeConversationRepository:
    def __init__(self, history: list[dict] | None = None, missing: bool = False):
        self.history = history or []
        self.missing = missing
        self.history_request: tuple | None = None
        self.saved_exchange: dict | None = None

    def recent_messages(self, conversation_id, user_id, shop_id, limit):
        self.history_request = (conversation_id, user_id, shop_id, limit)
        if self.missing:
            raise ConversationNotFoundError
        return self.history[-limit:]

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
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
