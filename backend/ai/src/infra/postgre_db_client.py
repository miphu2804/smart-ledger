import logging

import psycopg

logger = logging.getLogger(__name__)


class PostgreDBClient:
    def __init__(self, connection_string: str | None = None) -> None:
        """Create a client that treats a missing or blank URL as unconfigured."""
        self.connection_string = connection_string
        self.connection = None

    def connect(self) -> None:
        """Open the configured connection, logging and suppressing failures."""
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
        """Verify PostgreSQL responds, using a temporary connection if needed.

        Raises:
            RuntimeError: If no URL is configured or the probe result is unexpected.
        """
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
        """Close and discard the active connection, if any."""
        if self.connection is not None:
            self.connection.close()
            self.connection = None
