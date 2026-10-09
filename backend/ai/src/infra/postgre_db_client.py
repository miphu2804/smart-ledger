import logging
from contextlib import AbstractContextManager

from sqlalchemy import create_engine
from sqlalchemy.exc import ArgumentError, NoSuchModuleError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Mapped classes of the application database.

    Core's Flyway and the AI baseline migration own the schema, so the mappings only
    describe the columns this service reads or writes; nothing here creates a table.
    """


class PostgreDBClient:
    """SQLAlchemy engine and sessions of the application database, shared by requests.

    Each transaction borrows a pooled connection, so requests run side by side up to
    `pool_size`, and a connection the server dropped is replaced at the next checkout
    instead of failing every later request. The engine connects lazily, so an
    unreachable database does not stop the service from starting; requests answer 503
    until it is back.
    """

    CONNECT_TIMEOUT_SECONDS = 3
    # A request waits this long for a free connection, then fails with 503.
    CHECKOUT_TIMEOUT_SECONDS = 5

    def __init__(self, url: str | None = None, pool_size: int = 2) -> None:
        self.engine = None
        self.sessions = None
        if url is None or not url.strip():
            logger.info("postgres unconfigured")
            return
        # SQLAlchemy 2.1 maps a plain postgresql:// URL to psycopg 3 but has no alias
        # for postgres://, which libpq and many hosts accept.
        if url.startswith("postgres://"):
            url = "postgresql://" + url.removeprefix("postgres://")
        try:
            self.engine = create_engine(
                url,
                pool_size=pool_size,
                max_overflow=0,
                pool_timeout=self.CHECKOUT_TIMEOUT_SECONDS,
                pool_pre_ping=True,
                connect_args={"connect_timeout": self.CONNECT_TIMEOUT_SECONDS},
            )
        except (ArgumentError, NoSuchModuleError) as error:
            # Like an unreachable database, a URL SQLAlchemy cannot read leaves the
            # service up and answering 503. Log the error class only: the URL holds the
            # password.
            logger.error("postgres url invalid: %s", type(error).__name__)
            return
        # Repositories return plain values after the transaction, so loaded objects
        # keep their attributes instead of reloading them from a closed session.
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

    def session(self) -> AbstractContextManager[Session]:
        """A session in one transaction: commit on success, roll back on error."""
        if self.sessions is None:
            raise RuntimeError("postgres unavailable")
        return self.sessions.begin()

    def close(self) -> None:
        if self.engine is not None:
            self.engine.dispose()
