import logging
from contextlib import contextmanager

from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)


class PostgreDBClient:
    """Connection pool of the application database, shared by every request.

    Each transaction borrows a connection, so requests run side by side up to
    `max_size`, and a connection the server dropped is replaced at the next checkout
    instead of failing every later request.
    """

    CONNECT_TIMEOUT_SECONDS = 3
    # A request waits this long for a free connection, then fails with 503.
    CHECKOUT_TIMEOUT_SECONDS = 5

    def __init__(self, connection_string: str | None = None, max_size: int = 2) -> None:
        self.pool = None
        if connection_string is None or not connection_string.strip():
            logger.info("postgres unconfigured")
            return
        self.pool = ConnectionPool(
            connection_string,
            min_size=1,
            max_size=max_size,
            kwargs={"connect_timeout": self.CONNECT_TIMEOUT_SECONDS},
            check=ConnectionPool.check_connection,
            timeout=self.CHECKOUT_TIMEOUT_SECONDS,
            open=False,
            name="postgres",
        )

    def connect(self) -> None:
        # Without waiting: an unreachable database must not stop the service from
        # starting. The pool keeps retrying and requests answer 503 meanwhile.
        if self.pool is not None:
            self.pool.open(wait=False)

    @contextmanager
    def transaction(self):
        if self.pool is None:
            raise RuntimeError("postgres unavailable")
        with self.pool.connection() as connection:
            with connection.transaction():
                yield connection

    def close(self) -> None:
        if self.pool is not None:
            self.pool.close()
