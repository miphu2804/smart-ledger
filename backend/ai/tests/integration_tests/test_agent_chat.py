import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

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
def client() -> TestClient:
    app.state.agent = AgentService(FakeChatModel(responses=["trả lời"]))
    return TestClient(app)


def chat(
    client: TestClient,
    message: str = "doanh thu hôm nay?",
    **kwargs,
):
    return client.post(
        "/internal/v1/agent/chat",
        json={"shop_id": "shop-1", "message": message},
        **kwargs,
    )


def test_agent_chat_returns_answer(client: TestClient) -> None:
    response = chat(client)

    assert response.status_code == 200
    body = response.json()
    assert body["answer"] == "trả lời"
    assert body["request_id"]


def test_agent_chat_does_not_reuse_messages_between_requests(
    client: TestClient,
) -> None:
    app.state.agent = AgentService(UserMessagesChatModel(responses=[]))

    first = chat(client, message="tin đầu")
    second = chat(client, message="tin sau")

    assert first.status_code == 200
    assert first.json()["answer"] == "tin đầu"
    assert second.status_code == 200
    assert second.json()["answer"] == "tin sau"


def test_agent_chat_returns_503_when_agent_missing(client: TestClient) -> None:
    app.state.agent = None

    response = chat(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "ai_unavailable"


def test_agent_chat_returns_503_on_model_error(client: TestClient) -> None:
    app.state.agent = AgentService(ErrorChatModel(responses=[]))

    response = chat(client)

    assert response.status_code == 503
    assert response.json()["detail"] == "ai_unavailable"
