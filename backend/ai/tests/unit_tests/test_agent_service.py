import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from tests.support import TEST_GUARDRAIL_LIMITS

from src.agent.repository import ConversationNotFoundError
from src.agent.service import AgentService
from src.prompt_templates import SHOP_AGENT_SYSTEM_PROMPT


class RecordingChatModel(FakeListChatModel):
    seen_messages: list = []

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_messages = list(messages)
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


class ErrorChatModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
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


def test_chat_builds_system_prompt_and_persists_exchange() -> None:
    model = RecordingChatModel(responses=["ok"])
    conversations = FakeConversationRepository()
    agent = AgentService(model, conversations, guardrail_limits=TEST_GUARDRAIL_LIMITS)

    result = agent.chat(user_id=3, shop_id=15, message="today's revenue?")

    assert result.answer == "ok"
    assert result.conversation_id == 41
    assert result.message_id == 72
    assert model.seen_messages[0].type == "system"
    assert model.seen_messages[0].content == SHOP_AGENT_SYSTEM_PROMPT
    assert model.seen_messages[-1].content == "today's revenue?"
    assert conversations.saved_exchange == {
        "user_id": 3,
        "shop_id": 15,
        "conversation_id": None,
        "user_message": "today's revenue?",
        "assistant_message": "ok",
    }


def test_chat_adds_scoped_conversation_history_to_model_context() -> None:
    model = RecordingChatModel(responses=["ok"])
    conversations = FakeConversationRepository(
        [
            {"message_id": 1, "role": "USER", "content": "hello"},
            {"message_id": 2, "role": "ASSISTANT", "content": "hi there"},
        ]
    )
    agent = AgentService(model, conversations, guardrail_limits=TEST_GUARDRAIL_LIMITS)

    agent.chat(
        user_id=3,
        shop_id=15,
        conversation_id=41,
        message="today's revenue?",
    )

    assert conversations.history_request == (41, 3, 15, 200)
    assert [message.type for message in model.seen_messages] == [
        "system",
        "human",
        "ai",
        "human",
    ]
    assert [message.content for message in model.seen_messages[1:]] == [
        "hello",
        "hi there",
        "today's revenue?",
    ]


def test_chat_does_not_save_exchange_when_model_fails() -> None:
    conversations = FakeConversationRepository()
    agent = AgentService(
        ErrorChatModel(responses=[]),
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    with pytest.raises(RuntimeError, match="down"):
        agent.chat(user_id=3, shop_id=15, message="m")

    assert conversations.saved_exchange is None


def test_chat_sends_only_the_latest_turns_of_a_long_conversation() -> None:
    model = RecordingChatModel(responses=["ok"])
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

    agent.chat(user_id=3, shop_id=15, conversation_id=41, message="next")

    assert conversations.history_request == (41, 3, 15, 4)
    assert [message.content for message in model.seen_messages[1:]] == [
        "USER 3",
        "ASSISTANT 4",
        "USER 5",
        "ASSISTANT 6",
        "next",
    ]


def test_chat_reads_no_history_for_a_new_conversation() -> None:
    conversations = FakeConversationRepository()
    agent = AgentService(
        RecordingChatModel(responses=["ok"]),
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    agent.chat(user_id=3, shop_id=15, message="hello")

    assert conversations.history_request is None


def test_chat_rejects_a_conversation_outside_the_owner_scope() -> None:
    model = RecordingChatModel(responses=["ok"])
    conversations = FakeConversationRepository(missing=True)
    agent = AgentService(model, conversations, guardrail_limits=TEST_GUARDRAIL_LIMITS)

    with pytest.raises(ConversationNotFoundError):
        agent.chat(user_id=3, shop_id=15, conversation_id=41, message="hello")

    assert model.seen_messages == []
    assert conversations.saved_exchange is None
