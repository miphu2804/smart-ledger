import logging
from contextlib import contextmanager
from threading import RLock

import psycopg

logger = logging.getLogger(__name__)


class PostgreDBClient:
    def __init__(self, connection_string: str | None = None) -> None:
        self.connection_string = connection_string
        self.connection = None
        self._lock = RLock()

    def connect(self) -> None:
        with self._lock:
            if self.connection is not None:
                return
            url = self.connection_string
            if url is None or not url.strip():
                logger.info("postgres unconfigured")
                return
            try:
                self.connection = psycopg.connect(url, connect_timeout=3)
                logger.info("postgres connected")
            except Exception:
                logger.warning("postgres connect failed", exc_info=True)
                self.connection = None

    @contextmanager
    def transaction(self):
        with self._lock:
            if self.connection is None or self.connection.closed:
                raise RuntimeError("postgres unavailable")
            with self.connection.transaction():
                yield self.connection

    def check_health(self) -> None:
        if self.connection is not None:
            with self.transaction() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1")
                    if cursor.fetchone() != (1,):
                        raise RuntimeError("postgres ping did not return 1")
            return
        url = self.connection_string
        if url is None or not url.strip():
            raise RuntimeError("postgres url missing")
        with psycopg.connect(url, connect_timeout=3) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                if cursor.fetchone() != (1,):
                    raise RuntimeError("postgres ping did not return 1")

    def close(self) -> None:
        with self._lock:
            if self.connection is not None:
                self.connection.close()
                self.connection = None
