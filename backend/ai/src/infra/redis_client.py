import logging

import redis

logger = logging.getLogger(__name__)


class RedisClient:
    """Key-value cache over Redis, shared by requests and worker threads.

    Callers must treat it as a cache, never as the source of truth. It fails open: when
    Redis is unconfigured, unreachable or erroring, `get` returns None and `set` and
    `delete` do nothing, so the caller falls back to its own source. The connection
    pool is thread-safe and connects lazily, so an unreachable server does not stop the
    service from starting.
    """

    # Redis runs next to the AI on the same host, so a slow answer means a problem.
    CONNECT_TIMEOUT_SECONDS = 0.5
    COMMAND_TIMEOUT_SECONDS = 0.5

    def __init__(self, url: str | None = None) -> None:
        self.client = None
        if url is None or not url.strip():
            logger.info("redis unconfigured")
            return
        self.client = redis.Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=self.CONNECT_TIMEOUT_SECONDS,
            socket_timeout=self.COMMAND_TIMEOUT_SECONDS,
        )

    def get(self, key: str) -> str | None:
        if self.client is None:
            return None
        try:
            return self.client.get(key)
        except redis.RedisError as error:
            self._warn("get", error)
            return None

    def set(self, key: str, value: str, ttl_seconds: int | None = None) -> None:
        if self.client is None:
            return
        try:
            self.client.set(key, value, ex=ttl_seconds)
        except redis.RedisError as error:
            self._warn("set", error)

    def delete(self, *keys: str) -> None:
        if self.client is None:
            return
        try:
            self.client.delete(*keys)
        except redis.RedisError as error:
            self._warn("delete", error)

    def close(self) -> None:
        if self.client is not None:
            self.client.close()

    @staticmethod
    def _warn(operation: str, error: Exception) -> None:
        # The error class only: its message can hold the URL, which has a password.
        logger.warning("redis %s failed: %s", operation, type(error).__name__)
