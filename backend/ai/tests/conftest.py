import pytest

from src.app_config import app_config
from src.main import app

TEST_INTERNAL_TOKEN = "test-internal-token"


@pytest.fixture
def anyio_backend() -> str:
    # Async tests (`pytest.mark.anyio`) run on asyncio only, like uvicorn.
    return "asyncio"


@pytest.fixture(autouse=True)
def no_application_database(monkeypatch: pytest.MonkeyPatch) -> None:
    # A local .env may point at the shared staging databases. Tests that need PostgreSQL
    # build their own client from POSTGRES_TEST_URL instead.
    monkeypatch.setattr(app_config, "POSTGRES_URL", None)
    monkeypatch.setattr(app_config, "REDIS_URL", None)


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
