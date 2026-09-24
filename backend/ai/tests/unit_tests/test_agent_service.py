import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from src.agent.service import AgentService


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
    def __init__(self, history: list[dict] | None = None) -> None:
        self.history = history or []
        self.saved_exchange: dict | None = None

    def recent_messages(self, conversation_id, user_id, shop_id, limit):
        self.history_request = (conversation_id, user_id, shop_id, limit)
        return self.history[-limit:]

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
        return kwargs["conversation_id"] or 41, 72


def test_chat_builds_system_prompt_and_persists_exchange() -> None:
    model = RecordingChatModel(responses=["ok"])
    conversations = FakeConversationRepository()
    agent = AgentService(model, conversations)

    result = agent.chat(user_id=3, shop_id=15, message="doanh thu hôm nay?")

    assert result.answer == "ok"
    assert result.conversation_id == 41
    assert result.message_id == 72
    assert model.seen_messages[0].type == "system"
    assert "15" in model.seen_messages[0].content
    assert model.seen_messages[-1].content == "doanh thu hôm nay?"
    assert conversations.saved_exchange == {
        "user_id": 3,
        "shop_id": 15,
        "conversation_id": None,
        "user_message": "doanh thu hôm nay?",
        "assistant_message": "ok",
    }


def test_chat_adds_scoped_conversation_history_to_model_context() -> None:
    model = RecordingChatModel(responses=["ok"])
    conversations = FakeConversationRepository(
        [
            {"role": "USER", "content": "xin chào"},
            {"role": "ASSISTANT", "content": "chào bạn"},
        ]
    )
    agent = AgentService(model, conversations)

    agent.chat(
        user_id=3,
        shop_id=15,
        conversation_id=41,
        message="doanh thu hôm nay?",
    )

    assert conversations.history_request == (41, 3, 15, agent.context_message_limit)
    assert [message.type for message in model.seen_messages] == [
        "system",
        "human",
        "ai",
        "human",
    ]
    assert [message.content for message in model.seen_messages[1:]] == [
        "xin chào",
        "chào bạn",
        "doanh thu hôm nay?",
    ]


def test_chat_does_not_save_exchange_when_model_fails() -> None:
    conversations = FakeConversationRepository()
    agent = AgentService(ErrorChatModel(responses=[]), conversations)

    with pytest.raises(RuntimeError, match="down"):
        agent.chat(user_id=3, shop_id=15, message="m")

    assert conversations.saved_exchange is None
