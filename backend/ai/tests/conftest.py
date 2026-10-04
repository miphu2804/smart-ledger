import pytest

from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient
from src.infra.redis_db_client import RedisDBClient
from src.main import app

TEST_INTERNAL_TOKEN = "test-internal-token"


@pytest.fixture(autouse=True)
def stub_client_lifecycle(monkeypatch) -> None:
    monkeypatch.setattr(PostgreDBClient, "connect", lambda self: None)
    monkeypatch.setattr(PostgreDBClient, "close", lambda self: None)
    monkeypatch.setattr(RedisDBClient, "connect", lambda self: None)
    monkeypatch.setattr(RedisDBClient, "close", lambda self: None)


@pytest.fixture(autouse=True)
def internal_api_token(monkeypatch: pytest.MonkeyPatch) -> None:
    # Internal routes fail closed, so every suite needs a configured token. Tests that
    # exercise the unconfigured case override this fixture themselves.
    monkeypatch.setattr(app_config, "INTERNAL_API_TOKEN", TEST_INTERNAL_TOKEN)


@pytest.fixture
def internal_headers() -> dict[str, str]:
    return {"X-Internal-Token": TEST_INTERNAL_TOKEN}


@pytest.fixture
def wire_agent_state():
    """Point the app at a test agent and its conversation store."""

    def _wire(agent, conversations) -> None:
        app.state.agent = agent
        app.state.conversations = conversations

    return _wire
