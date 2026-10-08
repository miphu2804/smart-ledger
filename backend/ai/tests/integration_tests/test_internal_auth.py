import re
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from tests.support import TEST_GUARDRAIL_LIMITS

from src.agent.repository import AgentConversationRepository
from src.agent.service import AgentService
from src.app_config import app_config
from src.main import app

CHAT = "/internal/v1/agent/chat"
CONVERSATIONS = "/internal/v1/agent/conversations"
CONVERSATION = f"{CONVERSATIONS}/{{conversation_id}}"
SCOPE = {"user_id": 7, "shop_id": 12}
PAYLOAD = {**SCOPE, "message": "today's revenue?"}

# Read from the app's OpenAPI paths, so a route a later flow mounts is covered without
# editing here. `app.routes` cannot serve: it holds included routers, not their routes.
INTERNAL_ROUTES = sorted(
    (method.upper(), path)
    for path, operations in app.openapi()["paths"].items()
    if path.startswith("/internal/v1/")
    for method in operations
)


class EchoChatModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self


@pytest.fixture
def client(wire_agent_state) -> TestClient:
    # Deliberately without default credentials: every test states its own token.
    conversations = Mock(spec=AgentConversationRepository)
    conversations.recent_messages.return_value = []
    conversations.save_exchange.return_value = (101, 502)
    agent = AgentService(
        EchoChatModel(responses=["answer"]),
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
    )
    wire_agent_state(agent, conversations)
    return TestClient(app)


def test_health_needs_no_token(client: TestClient) -> None:
    assert client.get("/health").status_code == 200


def test_internal_routes_cover_the_agent_contract() -> None:
    assert set(INTERNAL_ROUTES) >= {
        ("POST", CHAT),
        ("GET", CONVERSATIONS),
        ("GET", CONVERSATION),
        ("PATCH", CONVERSATION),
        ("DELETE", CONVERSATION),
    }


@pytest.mark.parametrize(("method", "path"), INTERNAL_ROUTES)
def test_internal_routes_reject_a_missing_token(
    client: TestClient, method: str, path: str
) -> None:
    # No body or query: the token check must answer before request validation.
    response = client.request(method, re.sub(r"\{[^}]+\}", "101", path))

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
    assert response.json()["answer"] == "answer"


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
