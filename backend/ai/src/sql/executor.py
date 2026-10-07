"""Run guarded SQL for one shop on the read-only reader connection.

Each run opens its own connection (separate from the chat-history connection), starts a
READ ONLY transaction, binds the shop from the authenticated request, caps run time and
rows, and always rolls back. The shop id is a bound parameter supplied by the caller;
nothing the model writes can set it.

Errors: the guard and the database rejecting or timing out a query raise
`ValueError("CODE: reason")`, which is safe to show the model. Anything else, such as
an unreachable reader database (`psycopg.OperationalError`), propagates and fails the
turn.
"""

import datetime as dt
from decimal import Decimal

import psycopg
from psycopg import errors, sql

from src.sql.guard import SqlGuard


class ReadOnlySqlExecutor:
    MAX_CELL_CHARS = 200
    CONNECT_TIMEOUT_SECONDS = 3

    def __init__(
        self,
        connection_string: str,
        timeout_ms: int = 3000,
        row_limit: int = 100,
        view_schema: str = SqlGuard.VIEW_SCHEMA,
    ) -> None:
        if timeout_ms < 1 or row_limit < 1:
            raise ValueError("timeout_ms and row_limit must be positive")
        self.connection_string = connection_string
        self.timeout_ms = timeout_ms
        self.row_limit = row_limit
        self.view_schema = view_schema
        # One extra row tells whether the result was cut at row_limit.
        self.guard = SqlGuard(row_limit + 1)

    def run(self, shop_id: int, query: str) -> dict:
        """Return `{"columns": [...], "rows": [[...]], "truncated": bool}`."""
        if not isinstance(shop_id, int) or isinstance(shop_id, bool) or shop_id < 1:
            raise ValueError("shop_id must be a positive integer")
        wrapped = self.guard.validate_and_wrap(query)

        connection = psycopg.connect(
            self.connection_string, connect_timeout=self.CONNECT_TIMEOUT_SECONDS
        )
        try:
            connection.read_only = True
            with connection.cursor() as cursor:
                self._scope_transaction(cursor, shop_id)
                cursor.execute(wrapped, prepare=False)
                columns = [column.name for column in cursor.description or []]
                rows = cursor.fetchall()
        except errors.QueryCanceled:
            raise ValueError(
                f"QUERY_TIMEOUT: query exceeded {self.timeout_ms} ms; simplify it"
            ) from None
        except (psycopg.OperationalError, psycopg.InterfaceError):
            raise  # the reader is unreachable or broken: fail the turn
        except psycopg.Error as error:
            raise ValueError(f"SQL_ERROR: {self._error_message(error)}") from None
        finally:
            try:
                connection.rollback()
            except psycopg.Error:
                pass
            finally:
                connection.close()

        return {
            "columns": columns,
            "rows": [
                [self._cell(value) for value in row] for row in rows[: self.row_limit]
            ],
            "truncated": len(rows) > self.row_limit,
        }

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

    @staticmethod
    def _error_message(error: psycopg.Error) -> str:
        diag = getattr(error, "diag", None)
        primary = getattr(diag, "message_primary", None) or str(error)
        return primary.splitlines()[0][:200]

    @classmethod
    def _cell(cls, value):
        if isinstance(value, str):
            if len(value) > cls.MAX_CELL_CHARS:
                return value[: cls.MAX_CELL_CHARS] + "…"
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
        return cls._cell(str(value))
