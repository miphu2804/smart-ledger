import logging

import redis

logger = logging.getLogger(__name__)


class RedisDBClient:
    def __init__(self, connection_string: str | None = None) -> None:
        self.connection_string = connection_string
        self.client = None

    def connect(self) -> None:
        if self.client is not None:
            return
        url = self.connection_string
        if url is None or not url.strip():
            logger.info("redis unconfigured")
            return
        client = None
        try:
            client = redis.Redis.from_url(
                url,
                socket_connect_timeout=3,
                socket_timeout=3,
            )
            if client.ping() is not True:
                raise RuntimeError("redis ping did not return True")
            self.client = client
            logger.info("redis connected")
        except Exception:
            logger.warning("redis connect failed", exc_info=True)
            if client is not None:
                client.close()
            self.client = None

    def check_health(self) -> None:
        if self.client is not None:
            if self.client.ping() is not True:
                raise RuntimeError("redis ping did not return True")
            return
        url = self.connection_string
        if url is None or not url.strip():
            raise RuntimeError("redis url missing")
        with redis.Redis.from_url(
            url,
            socket_connect_timeout=3,
            socket_timeout=3,
        ) as client:
            if client.ping() is not True:
                raise RuntimeError("redis ping did not return True")

    def close(self) -> None:
        if self.client is not None:
            self.client.close()
            self.client = None
