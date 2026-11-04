import os
import time

import pytest

from src.infra.redis_client import RedisClient


def test_unconfigured_client_returns_nothing_and_ignores_writes() -> None:
    cache = RedisClient()

    cache.set("key", "value", 60)

    assert cache.get("key") is None
    cache.delete("key")
    cache.close()


def test_unreachable_server_fails_open_within_a_second(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Port 1 on localhost refuses connections at once.
    cache = RedisClient("redis://:secret@127.0.0.1:1/0")
    started = time.monotonic()

    cache.set("key", "value", 60)
    value = cache.get("key")
    cache.delete("key")

    assert value is None
    assert time.monotonic() - started < 1
    assert "redis get failed: ConnectionError" in caplog.text
    assert "secret" not in caplog.text


@pytest.mark.skipif(
    not os.getenv("REDIS_TEST_URL"), reason="set REDIS_TEST_URL to run against Redis"
)
def test_round_trip_against_a_real_server() -> None:
    cache = RedisClient(os.environ["REDIS_TEST_URL"])
    try:
        cache.set("redis-client-test", "value", 60)

        assert cache.get("redis-client-test") == "value"
        assert 0 < cache.client.ttl("redis-client-test") <= 60

        cache.delete("redis-client-test")

        assert cache.get("redis-client-test") is None
    finally:
        cache.close()
