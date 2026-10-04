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
    def __init__(
        self,
        history: list[dict] | None = None,
        missing: bool = False,
    ) -> None:
        self.history = history or []
        self.missing = missing
        self.context_request: tuple | None = None
        self.saved_exchange: dict | None = None

    def context_for(self, conversation_id, user_id, shop_id):
        self.context_request = (conversation_id, user_id, shop_id)
        if self.missing:
            raise ConversationNotFoundError
        return {"messages": self.history}

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

    assert conversations.context_request == (41, 3, 15)
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
