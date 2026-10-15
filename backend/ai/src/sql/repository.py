"""Run guarded SQL for one shop through the read-only reader's connection pool.

Each run borrows a pooled connection from its own `PostgreDBClient` (separate from the
chat-history client), runs in one READ ONLY transaction, binds the shop from the
authenticated request and caps run time and rows. The scope, timeout and search path
are transaction-local settings, so they end with the transaction and a connection goes
back to the pool without them. The shop id is supplied by the caller; nothing the model
writes can set it.

The query is sent as the guard rendered it, without bind parameters, so neither
SQLAlchemy nor psycopg reads `:name` or `%` in the model's SQL as a placeholder.

Errors: the guard and the database rejecting or timing out a query raise
`ValueError("CODE: reason")`, which is safe to show the model. Anything else, such as
an unreachable reader database, a full pool or an unconfigured reader, propagates and
fails the turn.
"""

import datetime as dt
from decimal import Decimal

import psycopg
from psycopg import errors
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError

from src.infra.postgre_db_client import PostgreDBClient
from src.sql.guard import SqlGuard


class ShopDataRepository:
    MAX_CELL_CHARS = 200
    # The SQL is the guard's rendering, sent without parameters, and the transaction
    # only reads.
    EXECUTION_OPTIONS = {"postgresql_readonly": True, "no_parameters": True}

    def __init__(
        self,
        reader: PostgreDBClient,
        timeout_ms: int = 3000,
        row_limit: int = 100,
        view_schema: str = SqlGuard.VIEW_SCHEMA,
    ) -> None:
        if timeout_ms < 1 or row_limit < 1:
            raise ValueError("timeout_ms and row_limit must be positive")
        self.reader = reader
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

        try:
            with self.reader.session() as session:
                connection = session.connection(
                    execution_options=self.EXECUTION_OPTIONS
                )
                connection.execute(self._scope(shop_id))
                result = connection.exec_driver_sql(wrapped)
                columns = list(result.keys())
                rows = result.fetchall()
        except DBAPIError as error:
            raise self._query_error(error) from None

        return {
            "columns": columns,
            "rows": [
                [self._cell(value) for value in row] for row in rows[: self.row_limit]
            ],
            "truncated": len(rows) > self.row_limit,
        }

    def _scope(self, shop_id: int):
        # All settings are transaction-local (is_local = true) and end with the
        # transaction, so the next borrower of the connection starts unscoped.
        return select(
            func.set_config("smartledger.shop_id", str(shop_id), True),
            func.set_config("statement_timeout", str(self.timeout_ms), True),
            func.set_config("search_path", self._quoted_schema(), True),
            func.set_config("standard_conforming_strings", "on", True),
        )

    def _quoted_schema(self) -> str:
        return '"' + self.view_schema.replace('"', '""') + '"'

    def _query_error(self, error: DBAPIError) -> Exception:
        """Map a database error to model-facing text, or return it to propagate."""
        cause = error.orig
        if isinstance(cause, errors.QueryCanceled):
            return ValueError(
                f"QUERY_TIMEOUT: query exceeded {self.timeout_ms} ms; simplify it"
            )
        # The reader is unreachable or the connection broke: fail the turn. SQLAlchemy
        # has already dropped the connection from the pool.
        if error.connection_invalidated or isinstance(
            cause, psycopg.OperationalError | psycopg.InterfaceError
        ):
            return error
        if isinstance(cause, psycopg.Error):
            return ValueError(f"SQL_ERROR: {self._error_message(cause)}")
        return error

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
