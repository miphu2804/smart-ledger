"""Run guarded SQL for one shop on the read-only reader connection.

Each run opens its own connection (separate from the chat-history connection), starts a
READ ONLY transaction, binds the shop from the authenticated request, caps run time and
rows, and always rolls back. The shop id is a bound parameter supplied by the caller;
nothing the model writes can set it.

Errors: `UnsafeSqlError` (guard) and `SqlQueryError` (database rejected or timed out
the query) are meant to go back to the model; `SqlUnavailableError` is infrastructure
and should fail the turn.
"""

import datetime as dt
import logging
from dataclasses import dataclass
from decimal import Decimal

import psycopg
from psycopg import errors, sql

from src.sql.guard import VIEW_SCHEMA, validate_and_wrap

logger = logging.getLogger(__name__)

MAX_CELL_CHARS = 200
CONNECT_TIMEOUT_SECONDS = 3


@dataclass(frozen=True)
class SqlResult:
    columns: list[str]
    rows: list[list]
    truncated: bool


class SqlQueryError(Exception):
    """The database rejected or cancelled the query.

    `code` and `message` are safe to show the model, which can rewrite the query.
    """

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code
        self.message = message


class SqlUnavailableError(RuntimeError):
    """The reader database cannot be reached; the chat turn fails as ai_unavailable."""


class ReadOnlySqlExecutor:
    def __init__(
        self,
        connection_string: str,
        timeout_ms: int = 3000,
        row_limit: int = 100,
        view_schema: str = VIEW_SCHEMA,
    ) -> None:
        if timeout_ms < 1 or row_limit < 1:
            raise ValueError("timeout_ms and row_limit must be positive")
        self.connection_string = connection_string
        self.timeout_ms = timeout_ms
        self.row_limit = row_limit
        self.view_schema = view_schema

    def run(self, shop_id: int, query: str) -> SqlResult:
        if not isinstance(shop_id, int) or isinstance(shop_id, bool) or shop_id < 1:
            raise ValueError("shop_id must be a positive integer")
        # One extra row tells whether the result was cut at row_limit. UnsafeSqlError
        # propagates to the caller unchanged.
        wrapped = validate_and_wrap(query, self.row_limit + 1)

        try:
            connection = psycopg.connect(
                self.connection_string, connect_timeout=CONNECT_TIMEOUT_SECONDS
            )
        except psycopg.Error as error:
            logger.warning("sql reader connect failed: %s", type(error).__name__)
            raise SqlUnavailableError("sql reader unavailable") from None

        try:
            connection.read_only = True
            with connection.cursor() as cursor:
                self._scope_transaction(cursor, shop_id)
                cursor.execute(wrapped, prepare=False)
                columns = [column.name for column in cursor.description or []]
                rows = cursor.fetchall()
        except errors.QueryCanceled:
            raise SqlQueryError(
                "QUERY_TIMEOUT", f"query exceeded {self.timeout_ms} ms; simplify it"
            ) from None
        except (psycopg.OperationalError, psycopg.InterfaceError) as error:
            logger.warning("sql reader failed: %s", type(error).__name__)
            raise SqlUnavailableError("sql reader unavailable") from None
        except psycopg.Error as error:
            raise SqlQueryError("SQL_ERROR", _error_message(error)) from None
        finally:
            try:
                connection.rollback()
            except psycopg.Error:
                pass
            finally:
                connection.close()

        truncated = len(rows) > self.row_limit
        return SqlResult(
            columns=columns,
            rows=[[_cell(value) for value in row] for row in rows[: self.row_limit]],
            truncated=truncated,
        )

    def _scope_transaction(self, cursor: psycopg.Cursor, shop_id: int) -> None:
        # All settings are transaction-local (is_local = true) and vanish on rollback.
        search_path = sql.Identifier(self.view_schema).as_string(cursor)
        cursor.execute(
            """
            SELECT
                set_config('smartledger.shop_id', %s, true),
                set_config('statement_timeout', %s, true),
                set_config('search_path', %s, true),
                set_config('standard_conforming_strings', 'on', true)
            """,
            (str(shop_id), str(self.timeout_ms), search_path),
        )


def _error_message(error: psycopg.Error) -> str:
    diag = getattr(error, "diag", None)
    primary = getattr(diag, "message_primary", None) or str(error)
    return primary.splitlines()[0][:200]


def _cell(value):
    if isinstance(value, str):
        if len(value) > MAX_CELL_CHARS:
            return value[:MAX_CELL_CHARS] + "…"
        return value
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, Decimal):
        if value.is_finite() and value == value.to_integral_value():
            return int(value)
        return str(value)
    if isinstance(value, dt.datetime | dt.date | dt.time):
        return value.isoformat()
    if isinstance(value, dt.timedelta):
        return str(value)
    return _cell(str(value))
