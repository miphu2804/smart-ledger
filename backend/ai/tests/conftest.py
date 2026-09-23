import pytest

from src.infra.postgre_db_client import PostgreDBClient
from src.infra.redis_db_client import RedisDBClient


@pytest.fixture(autouse=True)
def stub_client_lifecycle(monkeypatch) -> None:
    monkeypatch.setattr(PostgreDBClient, "connect", lambda self: None)
    monkeypatch.setattr(PostgreDBClient, "close", lambda self: None)
    monkeypatch.setattr(RedisDBClient, "connect", lambda self: None)
    monkeypatch.setattr(RedisDBClient, "close", lambda self: None)
