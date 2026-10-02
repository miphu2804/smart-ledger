from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from src.agent.repository import AgentConversationRepository
from src.agent.service import AgentService
from src.app_config import app_config
from src.main import app

CHAT = "/internal/v1/agent/chat"
CONVERSATIONS = "/internal/v1/agent/conversations"
SCOPE = {"user_id": 7, "shop_id": 12}
PAYLOAD = {**SCOPE, "message": "doanh thu hôm nay?"}


class EchoChatModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


@pytest.fixture
def client() -> TestClient:
    # Deliberately without default credentials: every test states its own token.
    app.state.fake_conversations = Mock(spec=AgentConversationRepository)
    app.state.fake_conversations.context_for.return_value = {
        "summary": None,
        "summary_through_message_id": None,
        "messages": [],
    }
    app.state.fake_conversations.save_exchange.return_value = (101, 502)
    app.state.agent = AgentService(
        EchoChatModel(responses=["trả lời"]), app.state.fake_conversations
    )
    return TestClient(app)


def test_health_needs_no_token(client: TestClient) -> None:
    assert client.get("/health").status_code == 200


@pytest.mark.parametrize(
    ("method", "url", "kwargs"),
    [
        ("post", CHAT, {"json": PAYLOAD}),
        ("get", CONVERSATIONS, {"params": SCOPE}),
        ("get", f"{CONVERSATIONS}/101", {"params": SCOPE}),
        ("patch", f"{CONVERSATIONS}/101", {"json": {**SCOPE, "title": "Ca sáng"}}),
        ("delete", f"{CONVERSATIONS}/101", {"params": SCOPE}),
    ],
)
def test_internal_routes_reject_a_missing_token(
    client: TestClient, method: str, url: str, kwargs: dict
) -> None:
    response = getattr(client, method)(url, **kwargs)

    assert response.status_code == 401
    assert response.json()["detail"] == "unauthorized"


def test_internal_route_rejects_a_wrong_token(client: TestClient) -> None:
    response = client.get(
        CONVERSATIONS, params=SCOPE, headers={"X-Internal-Token": "wrong-token"}
    )

    assert response.status_code == 401


def test_internal_route_rejects_a_token_that_only_shares_a_prefix(
    client: TestClient,
) -> None:
    response = client.get(
        CONVERSATIONS,
        params=SCOPE,
        headers={"X-Internal-Token": f"{app_config.INTERNAL_API_TOKEN}-extra"},
    )

    assert response.status_code == 401


def test_internal_route_accepts_the_configured_token(
    client: TestClient, internal_headers: dict[str, str]
) -> None:
    response = client.post(CHAT, json=PAYLOAD, headers=internal_headers)

    assert response.status_code == 200
    assert response.json()["answer"] == "trả lời"


def test_missing_token_is_rejected_before_the_agent_is_consulted(
    client: TestClient,
) -> None:
    app.state.agent = None

    response = client.post(CHAT, json=PAYLOAD)

    assert response.status_code == 401


def test_routes_fail_closed_when_no_token_is_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(app_config, "INTERNAL_API_TOKEN", None)

    assert client.get("/health").status_code == 200
    assert client.post(CHAT, json=PAYLOAD).status_code == 401
    assert (
        client.post(
            CHAT, json=PAYLOAD, headers={"X-Internal-Token": "anything"}
        ).status_code
        == 401
    )
