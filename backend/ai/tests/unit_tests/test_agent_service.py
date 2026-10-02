from datetime import datetime

import pytest
from langchain_core.language_models.fake_chat_models import (
    FakeListChatModel,
    FakeMessagesListChatModel,
)
from langchain_core.messages import AIMessage

from src.agent.prompt_template import SHOP_AGENT_SYSTEM_PROMPT
from src.agent.repository import ConversationNotFoundError
from src.agent.service import AgentService
from src.agent.summary import FOLD_TRIGGER_MESSAGES, KEEP_RECENT_MESSAGES
from src.agent.tools import get_all_tools


class RecordingChatModel(FakeListChatModel):
    seen_messages: list = []

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_messages = list(messages)
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


class ToolCallingChatModel(FakeMessagesListChatModel):
    seen_calls: list = []

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_calls = [*self.seen_calls, list(messages)]
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


class ErrorChatModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("down")


class RecordingSummaryModel(FakeListChatModel):
    seen_prompts: list = []

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_prompts = [*self.seen_prompts, list(messages)]
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


class ErrorSummaryModel(FakeListChatModel):
    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("summary down")


def history(count: int, content: str = "short note") -> list[dict]:
    return [
        {"message_id": index + 1, "role": "USER", "content": content}
        for index in range(count)
    ]


class FakeConversationRepository:
    def __init__(
        self,
        history: list[dict] | None = None,
        summary: str | None = None,
        summary_through_message_id: int | None = None,
        save_summary_applies: bool = True,
        missing: bool = False,
    ) -> None:
        self.history = history or []
        self.summary = summary
        self.summary_through_message_id = summary_through_message_id
        self.save_summary_applies = save_summary_applies
        self.missing = missing
        self.context_request: tuple | None = None
        self.saved_exchange: dict | None = None
        self.saved_summaries: list[dict] = []
        self.folded: list[dict] = []
        self.folded_request: tuple | None = None

    def context_for(self, conversation_id, user_id, shop_id):
        self.context_request = (conversation_id, user_id, shop_id)
        if self.missing:
            raise ConversationNotFoundError
        return {
            "summary": self.summary,
            "summary_through_message_id": self.summary_through_message_id,
            "messages": self.history,
        }

    def folded_messages(self, conversation_id, user_id, shop_id):
        self.folded_request = (conversation_id, user_id, shop_id)
        return self.folded

    def save_exchange(self, **kwargs):
        self.saved_exchange = kwargs
        return kwargs["conversation_id"] or 41, 72

    def save_summary(self, **kwargs):
        self.saved_summaries.append(kwargs)
        if not self.save_summary_applies:
            return False
        self.summary = kwargs["summary"]
        self.summary_through_message_id = kwargs["through_id"]
        return True


def test_chat_builds_system_prompt_and_persists_exchange() -> None:
    model = RecordingChatModel(responses=["ok"])
    conversations = FakeConversationRepository()
    agent = AgentService(model, conversations)

    result = agent.chat(user_id=3, shop_id=15, message="doanh thu hôm nay?")

    assert result.answer == "ok"
    assert result.conversation_id == 41
    assert result.message_id == 72
    assert model.seen_messages[0].type == "system"
    assert model.seen_messages[0].content == SHOP_AGENT_SYSTEM_PROMPT
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
            {"message_id": 1, "role": "USER", "content": "xin chào"},
            {"message_id": 2, "role": "ASSISTANT", "content": "chào bạn"},
        ]
    )
    agent = AgentService(model, conversations)

    agent.chat(
        user_id=3,
        shop_id=15,
        conversation_id=41,
        message="doanh thu hôm nay?",
    )

    assert conversations.context_request == (41, 3, 15)
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


def test_chat_injects_stored_summary_after_system_prompt() -> None:
    model = RecordingChatModel(responses=["ok"])
    conversations = FakeConversationRepository(
        history=[{"message_id": 9, "role": "USER", "content": "còn nợ không?"}],
        summary="1. Customers and debts: Lan owes 200000",
        summary_through_message_id=8,
    )
    agent = AgentService(model, conversations)

    agent.chat(user_id=3, shop_id=15, conversation_id=41, message="doanh thu hôm nay?")

    assert [message.type for message in model.seen_messages] == [
        "system",
        "system",
        "human",
        "human",
    ]
    assert model.seen_messages[0].content == SHOP_AGENT_SYSTEM_PROMPT
    assert "Lan owes 200000" in model.seen_messages[1].content
    assert [message.content for message in model.seen_messages[2:]] == [
        "còn nợ không?",
        "doanh thu hôm nay?",
    ]


def test_chat_omits_summary_message_when_none_is_stored() -> None:
    model = RecordingChatModel(responses=["ok"])
    agent = AgentService(model, FakeConversationRepository(summary=None))

    agent.chat(user_id=3, shop_id=15, message="doanh thu hôm nay?")

    assert [message.type for message in model.seen_messages] == ["system", "human"]


def test_fold_summary_does_nothing_while_history_fits_the_window() -> None:
    summary_model = RecordingSummaryModel(responses=["rewritten"])
    conversations = FakeConversationRepository(history=history(FOLD_TRIGGER_MESSAGES))
    agent = AgentService(None, conversations, summary_model)

    assert agent.fold_summary(41, 3, 15) is False
    assert summary_model.seen_prompts == []
    assert conversations.saved_summaries == []


def test_fold_summary_rewrites_and_advances_watermark() -> None:
    summary_model = RecordingSummaryModel(responses=["1. Customers and debts: none"])
    conversations = FakeConversationRepository(
        history=history(FOLD_TRIGGER_MESSAGES + 2), summary_through_message_id=None
    )
    agent = AgentService(None, conversations, summary_model)

    assert agent.fold_summary(41, 3, 15) is True
    assert conversations.saved_summaries == [
        {
            "conversation_id": 41,
            "user_id": 3,
            "shop_id": 15,
            "summary": "1. Customers and debts: none",
            "through_id": FOLD_TRIGGER_MESSAGES + 2 - KEEP_RECENT_MESSAGES,
            "expected_through_id": None,
        }
    ]


def test_fold_summary_sends_the_early_fact_to_the_summary_model() -> None:
    summary_model = RecordingSummaryModel(responses=["rewritten"])
    backlog = history(FOLD_TRIGGER_MESSAGES + 2)
    backlog[0]["content"] = "Lan owes 200000 VND"
    agent = AgentService(
        None, FakeConversationRepository(history=backlog), summary_model
    )

    agent.fold_summary(41, 3, 15)

    prompt = summary_model.seen_prompts[0]
    assert prompt[0].type == "system"
    assert prompt[1].type == "human"
    assert "Lan owes 200000 VND" in prompt[1].content


def test_fold_summary_keeps_the_previous_summary_in_the_prompt() -> None:
    summary_model = RecordingSummaryModel(responses=["rewritten"])
    conversations = FakeConversationRepository(
        history=history(FOLD_TRIGGER_MESSAGES + 2),
        summary="1. Customers and debts: Lan owes 200000",
        summary_through_message_id=5,
    )
    agent = AgentService(None, conversations, summary_model)

    agent.fold_summary(41, 3, 15)

    assert "Lan owes 200000" in summary_model.seen_prompts[0][1].content
    assert conversations.saved_summaries[0]["expected_through_id"] == 5


def test_fold_summary_skips_everything_when_the_summary_model_fails() -> None:
    conversations = FakeConversationRepository(
        history=history(FOLD_TRIGGER_MESSAGES + 2)
    )
    agent = AgentService(None, conversations, ErrorSummaryModel(responses=["x"]))

    assert agent.fold_summary(41, 3, 15) is False
    assert conversations.saved_summaries == []
    assert conversations.summary is None
    assert conversations.summary_through_message_id is None


def test_fold_summary_drops_the_rewrite_when_a_concurrent_fold_won() -> None:
    summary_model = RecordingSummaryModel(responses=["rewritten"])
    conversations = FakeConversationRepository(
        history=history(FOLD_TRIGGER_MESSAGES + 2), save_summary_applies=False
    )
    agent = AgentService(None, conversations, summary_model)

    assert agent.fold_summary(41, 3, 15) is False
    assert len(conversations.saved_summaries) == 1
    assert conversations.summary_through_message_id is None


def test_fold_summary_ignores_a_deleted_conversation() -> None:
    conversations = FakeConversationRepository(missing=True)
    agent = AgentService(
        None, conversations, RecordingSummaryModel(responses=["rewritten"])
    )

    assert agent.fold_summary(41, 3, 15) is False


def test_fold_summary_does_nothing_without_a_summary_model() -> None:
    conversations = FakeConversationRepository(
        history=history(FOLD_TRIGGER_MESSAGES + 2)
    )
    agent = AgentService(None, conversations, None)

    assert agent.fold_summary(41, 3, 15) is False
    assert conversations.context_request is None


def test_fold_summary_batches_a_long_backlog_and_chains_watermarks() -> None:
    summary_model = RecordingSummaryModel(responses=["rewritten"])
    conversations = FakeConversationRepository(history=history(200, "x" * 400))
    agent = AgentService(None, conversations, summary_model)

    assert agent.fold_summary(41, 3, 15) is True
    assert len(conversations.saved_summaries) > 1
    through_ids = [saved["through_id"] for saved in conversations.saved_summaries]
    assert through_ids == sorted(through_ids)
    assert len(set(through_ids)) == len(through_ids)
    assert conversations.summary_through_message_id == through_ids[-1]
    assert conversations.saved_summaries[0]["expected_through_id"] is None
    assert [
        saved["expected_through_id"] for saved in conversations.saved_summaries[1:]
    ] == through_ids[:-1]


def search_then_answer(query: str) -> ToolCallingChatModel:
    return ToolCallingChatModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "search_chat_history",
                        "args": {"query": query},
                        "id": "call-1",
                    }
                ],
            ),
            AIMessage(content="Lan owes 235000"),
        ]
    )


def test_chat_searches_folded_history_within_the_request_scope() -> None:
    model = search_then_answer("Lan")
    conversations = FakeConversationRepository(summary="1. Customers and debts")
    conversations.folded = [
        {
            "message_id": 3,
            "role": "USER",
            "content": "Lan owes 235000 for rice",
            "created_at": datetime(2026, 10, 1),
        }
    ]
    agent = AgentService(model, conversations)

    result = agent.chat(user_id=3, shop_id=15, conversation_id=41, message="Lan?")

    assert result.answer == "Lan owes 235000"
    assert conversations.folded_request == (41, 3, 15)
    tool_message = model.seen_calls[-1][-1]
    assert tool_message.type == "tool"
    assert "[#3 2026-10-01] USER: Lan owes 235000 for rice" in tool_message.content


def test_search_tool_does_not_query_a_new_conversation() -> None:
    model = search_then_answer("Lan")
    conversations = FakeConversationRepository()
    agent = AgentService(model, conversations)

    agent.chat(user_id=3, shop_id=15, message="Lan?")

    assert conversations.folded_request is None
    assert "No earlier message" in model.seen_calls[-1][-1].content


def test_search_tool_exposes_only_the_query_to_the_model() -> None:
    (search_tool,) = get_all_tools(FakeConversationRepository())

    assert list(search_tool.tool_call_schema.model_json_schema()["properties"]) == [
        "query"
    ]
