import logging

import psycopg

logger = logging.getLogger(__name__)


class PostgreDBClient:
    def __init__(self, connection_string: str | None = None) -> None:
        self.connection_string = connection_string
        self.connection = None

    def connect(self) -> None:
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

    def check_health(self) -> None:
        if self.connection is not None:
            with self.connection.cursor() as cursor:
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
        if self.connection is not None:
            self.connection.close()
            self.connection = None
