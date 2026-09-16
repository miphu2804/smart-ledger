import logging
from collections.abc import Callable

import psycopg
import redis

logger = logging.getLogger(__name__)


def ping_postgres(url: str) -> None:
    with psycopg.connect(url, connect_timeout=3) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            if cursor.fetchone() != (1,):
                raise RuntimeError("postgres ping did not return 1")


def ping_redis(url: str) -> None:
    with redis.Redis.from_url(
        url,
        socket_connect_timeout=3,
        socket_timeout=3,
    ) as client:
        if client.ping() is not True:
            raise RuntimeError("redis ping did not return True")


def check_target(name: str, url: str | None, ping: Callable[[str], None]) -> str:
    if url is None or not url.strip():
        return "unconfigured"
    try:
        ping(url)
    except Exception:
        logger.warning("%s ping failed", name, exc_info=True)
        return "unavailable"
    return "ok"
