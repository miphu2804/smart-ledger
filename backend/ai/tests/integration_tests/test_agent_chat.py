import json
from dataclasses import replace
from datetime import UTC, datetime
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, TextPart
from pydantic_ai.models.function import FunctionModel
from tests.support import TEST_GUARDRAIL_LIMITS, ScriptedModel, echo_user_prompts

from src.agent.guardrails import GuardrailLimits
from src.agent.repository import AgentConversationRepository, ConversationNotFoundError
from src.agent.service import AgentService
from src.main import app


def answer(messages, info) -> ModelResponse:
    return ModelResponse(parts=[TextPart("answer")])


def failing_model(messages, info):
    raise RuntimeError("down")


async def broken_answer(messages, info):
    # Longer than the screen's hold-back window, so the prefix is released.
    yield "Rice sells for 30.000 VND/kg, and 12 kg are left on the shelf today. "
    raise RuntimeError("down")


@pytest.fixture
def client(internal_headers: dict[str, str], wire_agent_state) -> TestClient:
    conversations = Mock(spec=AgentConversationRepository)
    conversations.recent_messages.return_value = []
    conversations.save_exchange.return_value = (101, 502)
    agent = AgentService(
        FunctionModel(answer),
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


def stream_chat(
    client: TestClient,
    message: str = "today's revenue?",
    conversation_id: int | None = None,
) -> httpx.Response:
    payload = {"user_id": 7, "shop_id": 12, "message": message}
    if conversation_id is not None:
        payload["conversation_id"] = conversation_id
    with client.stream(
        "POST", "/internal/v1/agent/chat/stream", json=payload
    ) as response:
        response.read()
    return response


def sse_events(response: httpx.Response) -> list[tuple[str, dict]]:
    """The (event, data) pairs of an event stream, in arrival order."""
    events = []
    for block in response.text.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in block.split("\n"))
        events.append((fields["event"], json.loads(fields["data"])))
    return events


def shown_text(events: list[tuple[str, dict]]) -> str:
    """The text the owner sees: the deltas after the last reset."""
    text = ""
    for name, data in events:
        if name == "reset":
            text = ""
        elif name == "delta":
            text += data["text"]
    return text


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
        FunctionModel(echo_user_prompts),
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
        FunctionModel(echo_user_prompts),
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
    app.state.conversations.recent_messages.side_effect = ConversationNotFoundError

    response = chat(client, conversation_id=101)

    assert response.status_code == 404
    assert response.json()["detail"] == "conversation_not_found"


def test_guardrail_stop_returns_its_code(client: TestClient) -> None:
    app.state.agent = AgentService(
        FunctionModel(answer),
        app.state.conversations,
        guardrail_limits=GuardrailLimits(
            max_input_chars=5,
            model_call_limit=1,
            tool_call_limit=1,
            turn_token_limit=1000,
            turn_timeout_seconds=5,
        ),
    )

    response = chat(client, message="too long for the limit")

    assert response.status_code == 422
    assert response.json() == {"detail": "input_too_long"}
    app.state.conversations.save_exchange.assert_not_called()


def test_agent_chat_returns_503_when_agent_missing(client: TestClient) -> None:
    app.state.agent = None

    response = chat(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "ai_unavailable"


def test_agent_chat_returns_503_on_model_error(client: TestClient) -> None:
    app.state.agent = AgentService(
        FunctionModel(failing_model),
        app.state.conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    response = chat(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "ai_unavailable"


def test_stream_sends_deltas_then_done_with_the_persisted_turn(
    client: TestClient,
) -> None:
    answer = "Rice sells for 30.000 VND/kg, 12 kg left."
    app.state.agent = AgentService(
        ScriptedModel(answer),
        app.state.conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    response = stream_chat(client)
    events = sse_events(response)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    names = [name for name, _ in events]
    assert names.count("delta") > 1
    assert names.count("done") == 1
    assert names[-1] == "done"
    assert shown_text(events) == answer
    done = events[-1][1]
    assert done["answer"] == answer
    assert done["conversation_id"] == 101
    assert done["message_id"] == 502
    assert done["model"] == "test-model"
    assert done["model_version"] == "test-model"
    assert done["request_id"]
    app.state.conversations.save_exchange.assert_called_once_with(
        user_id=7,
        shop_id=12,
        conversation_id=None,
        user_message="today's revenue?",
        assistant_message=answer,
    )


def test_stream_retries_a_leaking_answer_without_showing_it(
    client: TestClient,
) -> None:
    answer = "Rice sells for 30.000 VND/kg."
    app.state.agent = AgentService(
        ScriptedModel("SELECT name FROM v_products", answer),
        app.state.conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    events = sse_events(stream_chat(client))

    emitted = "".join(data["text"] for name, data in events if name == "delta")
    for leak in ("select", "from v_", "v_products"):
        assert leak not in emitted.lower()
    assert shown_text(events) == answer
    assert events[-1][0] == "done"
    assert events[-1][1]["answer"] == answer


def test_stream_ends_with_an_error_event_when_the_screen_stops_the_answer(
    client: TestClient,
) -> None:
    app.state.agent = AgentService(
        ScriptedModel("Error[SQL_ERROR]", "Error[SQL_ERROR]"),
        app.state.conversations,
        guardrail_limits=replace(TEST_GUARDRAIL_LIMITS, model_call_limit=2),
    )

    response = stream_chat(client)
    events = sse_events(response)

    assert response.status_code == 200
    assert events[-1] == ("error", {"detail": "answer_unavailable"})
    assert "done" not in [name for name, _ in events]
    app.state.conversations.save_exchange.assert_not_called()


def test_stream_ends_with_an_error_event_when_the_model_fails_midway(
    client: TestClient,
) -> None:
    app.state.agent = AgentService(
        FunctionModel(stream_function=broken_answer),
        app.state.conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )

    response = stream_chat(client)
    events = sse_events(response)

    assert response.status_code == 200
    assert "delta" in [name for name, _ in events]
    assert events[-1] == ("error", {"detail": "ai_unavailable"})
    app.state.conversations.save_exchange.assert_not_called()


def test_stream_refuses_a_conversation_outside_scope_before_streaming(
    client: TestClient,
) -> None:
    app.state.conversations.recent_messages.side_effect = ConversationNotFoundError

    response = stream_chat(client, conversation_id=101)

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["detail"] == "conversation_not_found"


def test_stream_refuses_an_overlong_message_before_streaming(
    client: TestClient,
) -> None:
    app.state.agent = AgentService(
        FunctionModel(answer),
        app.state.conversations,
        guardrail_limits=GuardrailLimits(
            max_input_chars=5,
            model_call_limit=1,
            tool_call_limit=1,
            turn_token_limit=1000,
            turn_timeout_seconds=5,
        ),
    )

    response = stream_chat(client, message="too long for the limit")

    assert response.status_code == 422
    assert response.json() == {"detail": "input_too_long"}
    app.state.conversations.save_exchange.assert_not_called()


def test_stream_refuses_with_503_when_agent_missing(client: TestClient) -> None:
    app.state.agent = None

    response = stream_chat(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "ai_unavailable"


@pytest.mark.parametrize("message", ["", "  \t\n  "])
def test_stream_endpoint_rejects_blank_messages(
    client: TestClient, message: str
) -> None:
    response = stream_chat(client, message=message)

    assert response.status_code == 422
