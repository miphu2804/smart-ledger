from datetime import UTC, datetime
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from tests.support import TEST_GUARDRAIL_LIMITS

from src.agent.repository import (
    AgentConversationRepository,
    ConversationNotFoundError,
)
from src.agent.service import AgentService
from src.main import app


class FakeChatModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


class ErrorChatModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("down")


class UserMessagesChatModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        content = " | ".join(
            str(message.content) for message in messages if message.type == "human"
        )
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=content))]
        )


@pytest.fixture
def client(internal_headers: dict[str, str], wire_agent_state) -> TestClient:
    conversations = Mock(spec=AgentConversationRepository)
    conversations.context_for.return_value = {
        "messages": [],
    }
    conversations.save_exchange.return_value = (101, 502)
    agent = AgentService(
        FakeChatModel(responses=["answer"]),
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )
    wire_agent_state(agent, conversations)
    return TestClient(app, headers=internal_headers, raise_server_exceptions=False)


def chat(
    client: TestClient,
    message: str = "today's revenue?",
    conversation_id: int | None = None,
):
    payload = {"user_id": 7, "shop_id": 12, "message": message}
    if conversation_id is not None:
        payload["conversation_id"] = conversation_id
    return client.post("/internal/v1/agent/chat", json=payload)


def test_agent_chat_returns_persisted_message_ids(client: TestClient) -> None:
    response = chat(client)

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "answer"
    assert body["conversation_id"] == 101
    assert body["message_id"] == 502
    assert body["request_id"]
    app.state.conversations.save_exchange.assert_called_once_with(
        user_id=7,
        shop_id=12,
        conversation_id=None,
        user_message="today's revenue?",
        assistant_message="answer",
    )


@pytest.mark.parametrize("message", ["", "  \t\n  "])
def test_agent_chat_endpoint_rejects_blank_messages(
    client: TestClient, message: str
) -> None:
    response = chat(client, message=message)

    assert response.status_code == 422


def test_agent_chat_endpoint_strips_message_whitespace(client: TestClient) -> None:
    app.state.agent = AgentService(
        UserMessagesChatModel(responses=[]),
        app.state.conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    response = chat(client, message="  today's revenue?  ")

    assert response.status_code == 200
    assert response.json()["answer"] == "today's revenue?"


def test_agent_chat_does_not_reuse_messages_between_conversations(
    client: TestClient,
) -> None:
    app.state.agent = AgentService(
        UserMessagesChatModel(responses=[]),
        app.state.conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    first = chat(client, message="first message")
    second = chat(client, message="tin sau")

    assert first.status_code == 200
    assert first.json()["answer"] == "first message"
    assert second.status_code == 200
    assert second.json()["answer"] == "tin sau"
    assert app.state.conversations.save_exchange.call_count == 2
    assert all(
        call.kwargs["conversation_id"] is None
        for call in app.state.conversations.save_exchange.call_args_list
    )


def test_conversation_can_be_renamed_listed_and_deleted(client: TestClient) -> None:
    timestamp = datetime.now(UTC)
    summary = {
        "conversation_id": 101,
        "title": "Morning shift",
        "last_message_at": timestamp,
    }
    app.state.conversations.rename_conversation.return_value = summary
    app.state.conversations.list_conversations.return_value = [summary]
    app.state.conversations.get_conversation.return_value = {
        **summary,
        "messages": [
            {
                "message_id": 501,
                "role": "USER",
                "content": "today's revenue?",
                "created_at": timestamp,
            },
            {
                "message_id": 502,
                "role": "ASSISTANT",
                "content": "answer",
                "created_at": timestamp,
            },
        ],
    }

    renamed = client.patch(
        "/internal/v1/agent/conversations/101",
        json={"user_id": 7, "shop_id": 12, "title": "Morning shift"},
    )
    listed = client.get(
        "/internal/v1/agent/conversations",
        params={"user_id": 7, "shop_id": 12},
    )
    detail = client.get(
        "/internal/v1/agent/conversations/101",
        params={"user_id": 7, "shop_id": 12},
    )
    deleted = client.delete(
        "/internal/v1/agent/conversations/101",
        params={"user_id": 7, "shop_id": 12},
    )

    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Morning shift"
    assert listed.json()[0]["title"] == "Morning shift"
    assert [message["role"] for message in detail.json()["messages"]] == [
        "USER",
        "ASSISTANT",
    ]
    assert deleted.status_code == 204
    app.state.conversations.rename_conversation.assert_called_once_with(
        conversation_id=101, user_id=7, shop_id=12, title="Morning shift"
    )
    app.state.conversations.delete_conversation.assert_called_once_with(
        conversation_id=101, user_id=7, shop_id=12
    )


@pytest.mark.parametrize("title", ["", "  \t\n  ", "x" * 256])
def test_conversation_rename_endpoint_rejects_invalid_titles(
    client: TestClient, title: str
) -> None:
    response = client.patch(
        "/internal/v1/agent/conversations/101",
        json={"user_id": 7, "shop_id": 12, "title": title},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("title", "expected_title"),
    [("  Morning shift  ", "Morning shift"), ("x" * 255, "x" * 255)],
)
def test_conversation_rename_endpoint_accepts_and_trims_valid_titles(
    client: TestClient, title: str, expected_title: str
) -> None:
    app.state.conversations.rename_conversation.side_effect = (
        lambda conversation_id, user_id, shop_id, title: {
            "conversation_id": conversation_id,
            "title": title,
            "last_message_at": datetime.now(UTC),
        }
    )

    response = client.patch(
        "/internal/v1/agent/conversations/101",
        json={"user_id": 7, "shop_id": 12, "title": title},
    )

    assert response.status_code == 200
    assert response.json()["title"] == expected_title


def test_chat_hides_conversation_owned_by_another_scope(client: TestClient) -> None:
    app.state.conversations.context_for.side_effect = ConversationNotFoundError

    response = chat(client, conversation_id=101)

    assert response.status_code == 404
    assert response.json()["detail"] == "conversation_not_found"


def test_agent_chat_returns_503_when_agent_missing(client: TestClient) -> None:
    app.state.agent = None

    response = chat(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "ai_unavailable"


def test_agent_chat_returns_503_on_model_error(client: TestClient) -> None:
    app.state.agent = AgentService(
        ErrorChatModel(responses=[]),
        app.state.conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    response = chat(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "ai_unavailable"
