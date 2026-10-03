"""Static check for SQL written by the model before it reaches PostgreSQL.

The guard is one of several layers (read-only role, shop-filtered views, read-only
transaction), so it fails closed: anything it does not recognise is rejected. Functions
are checked against an allowlist rather than a blocklist, because a single missed
function such as `set_config` would let the query change its own shop scope.

The query that runs is sqlglot's rendering of the validated tree, not the model's text,
and that rendering is parsed and checked again, so a construct the parser misread cannot
reach the database unchecked.

A rejected query raises `ValueError("CODE: detail")`; the text is safe to show the
model.
"""

import re

import sqlglot
from sqlglot import exp
from sqlglot.errors import SqlglotError
from sqlglot.optimizer.normalize_identifiers import normalize_identifiers
from sqlglot.optimizer.scope import traverse_scope


class SqlGuard:
    DIALECT = "postgres"
    VIEW_SCHEMA = "ai_read"
    ALLOWED_VIEWS = frozenset({"v_shop_profile", "v_categories", "v_products"})
    MAX_SQL_CHARS = 4000

    # sqlglot maps Postgres functions to typed nodes; `Anonymous` (any function sqlglot
    # does not model, e.g. set_config, current_setting, pg_sleep, dblink) is never
    # allowed.
    ALLOWED_FUNCTIONS: tuple[type[exp.Func], ...] = (
        exp.And,
        exp.Or,
        exp.Case,
        exp.If,
        exp.Exists,
        exp.Count,
        exp.Sum,
        exp.Avg,
        exp.Min,
        exp.Max,
        exp.Lower,
        exp.Upper,
        exp.Coalesce,
        exp.Nullif,
        exp.Greatest,
        exp.Least,
        exp.Round,
        exp.Abs,
        exp.Floor,
        exp.Ceil,
        exp.Length,
        exp.Trim,
        exp.Substring,
        exp.StrPosition,
        exp.Left,
        exp.Right,
        exp.Concat,
        exp.Replace,
        exp.GroupConcat,
        exp.DateTrunc,
        exp.TimestampTrunc,
        exp.CurrentTimestamp,
        exp.CurrentDate,
        exp.Extract,
        exp.Cast,
        exp.RowNumber,
    )

    ALLOWED_CAST_TYPES = frozenset(
        {
            exp.DataType.Type.TEXT,
            exp.DataType.Type.VARCHAR,
            exp.DataType.Type.CHAR,
            exp.DataType.Type.SMALLINT,
            exp.DataType.Type.INT,
            exp.DataType.Type.BIGINT,
            exp.DataType.Type.DECIMAL,
            exp.DataType.Type.DOUBLE,
            exp.DataType.Type.FLOAT,
            exp.DataType.Type.BOOLEAN,
            exp.DataType.Type.DATE,
            exp.DataType.Type.TIMESTAMP,
            exp.DataType.Type.TIMESTAMPTZ,
            exp.DataType.Type.INTERVAL,
        }
    )

    # Statements and clauses that write, lock, change settings or leave the query.
    FORBIDDEN_NODES: tuple[type[exp.Expression], ...] = (
        exp.Insert,
        exp.Update,
        exp.Delete,
        exp.Merge,
        exp.Create,
        exp.Drop,
        exp.Alter,
        exp.TruncateTable,
        exp.Command,
        exp.Set,
        exp.Copy,
        exp.Into,
        exp.Lock,
        exp.Transaction,
        exp.Commit,
        exp.Rollback,
        exp.Grant,
        exp.Revoke,
        exp.Placeholder,
        exp.Parameter,
    )

    # E'', U&'', X'' and B'' strings have their own escape rules; plain and $$ strings
    # do not.
    FORBIDDEN_LITERALS: tuple[type[exp.Expression], ...] = (
        exp.ByteString,
        exp.UnicodeString,
        exp.HexString,
        exp.BitString,
    )

    ALLOWED_ROOTS: tuple[type[exp.Expression], ...] = (exp.Select, exp.SetOperation)

    def __init__(self, row_limit: int) -> None:
        if not isinstance(row_limit, int) or row_limit < 1:
            raise ValueError("row_limit must be a positive integer")
        self.row_limit = row_limit

    def validate_and_wrap(self, sql: str) -> str:
        """Return one read-only SELECT over the allowed views, capped at `row_limit`.

        Raises `ValueError("CODE: detail")` when the query is not exactly one SELECT
        (with optional read-only CTEs and set operations) over `ai_read` views using
        allowed functions.
        """
        if not sql or not sql.strip():
            raise ValueError("EMPTY_SQL: no SQL statement given")
        if len(sql) > self.MAX_SQL_CHARS:
            raise ValueError(f"SQL_TOO_LONG: keep it under {self.MAX_SQL_CHARS} chars")

        rendered = self._render(self._check(self._parse(sql)))
        # Re-check what will actually run, and require the rendering to be stable.
        if self._render(self._check(self._parse(rendered))) != rendered:
            raise ValueError("UNSUPPORTED_SYNTAX: rewrite the query more simply")
        return f"SELECT * FROM ({rendered}) AS q LIMIT {self.row_limit}"

    @classmethod
    def _parse(cls, sql: str) -> exp.Expression:
        try:
            statements = [
                statement
                for statement in sqlglot.parse(sql, dialect=cls.DIALECT)
                if statement is not None
            ]
        except (SqlglotError, RecursionError, ValueError) as error:
            raise ValueError(f"PARSE_ERROR: {cls._plain(str(error))}") from None
        if not statements:
            raise ValueError("EMPTY_SQL: no SQL statement given")
        if len(statements) > 1:
            raise ValueError("MULTIPLE_STATEMENTS: send exactly one SELECT")
        return statements[0]

    @classmethod
    def _check(cls, tree: exp.Expression) -> exp.Expression:
        if not isinstance(tree, cls.ALLOWED_ROOTS):
            raise ValueError("NOT_SELECT: only a single SELECT is allowed")
        # Unquoted identifiers fold to lower case as in Postgres, so `PRODUCTS` equals
        # `products` while a quoted `"V_PRODUCTS"` does not match `v_products`.
        tree = normalize_identifiers(tree, dialect=cls.DIALECT)

        for node in tree.walk():
            if isinstance(node, cls.FORBIDDEN_NODES):
                raise ValueError(
                    f"UNSAFE_CLAUSE: {type(node).__name__.upper()} is not allowed"
                )
            if isinstance(node, cls.FORBIDDEN_LITERALS):
                raise ValueError("UNSAFE_LITERAL: use a plain 'quoted' string")
            if isinstance(node, exp.Func) and not isinstance(
                node, cls.ALLOWED_FUNCTIONS
            ):
                raise ValueError(
                    f"UNSAFE_FUNCTION: {cls._function_name(node)} is not allowed"
                )
            if isinstance(node, exp.Cast):
                cls._check_cast(node)

        cls._check_tables(tree)
        return tree

    @staticmethod
    def _function_name(node: exp.Func) -> str:
        if isinstance(node, exp.Anonymous):
            return str(node.name)
        return node.sql_name().lower()

    @classmethod
    def _check_cast(cls, node: exp.Cast) -> None:
        target = node.to
        if (
            not isinstance(target, exp.DataType)
            or target.this not in cls.ALLOWED_CAST_TYPES
        ):
            raise ValueError(
                f"UNSAFE_CAST: cast to {target.sql(dialect=cls.DIALECT)} is not allowed"
            )

    @classmethod
    def _check_tables(cls, tree: exp.Expression) -> None:
        """Every table must be an allowed view or a CTE visible in its scope."""
        checked: set[int] = set()
        try:
            scopes = list(traverse_scope(tree))
        except (SqlglotError, RecursionError, ValueError) as error:
            raise ValueError(f"UNSUPPORTED_SYNTAX: {cls._plain(str(error))}") from None
        for scope in scopes:
            for table in scope.tables:
                checked.add(id(table))
                if not table.args.get("db") and table.name in scope.cte_sources:
                    continue
                cls._check_view(table)
        for table in tree.find_all(exp.Table):
            # A table the scope walk did not reach (e.g. a table function) is not
            # trusted.
            if id(table) not in checked:
                cls._check_view(table)

    @classmethod
    def _check_view(cls, table: exp.Table) -> None:
        schema = table.args.get("db")
        if (
            not isinstance(table.this, exp.Identifier)
            or table.args.get("catalog") is not None
            or (schema is not None and schema.name != cls.VIEW_SCHEMA)
            or table.name not in cls.ALLOWED_VIEWS
        ):
            views = ", ".join(sorted(cls.ALLOWED_VIEWS))
            raise ValueError(
                f"UNSAFE_TABLE: {table.sql(dialect=cls.DIALECT)} is not allowed; "
                f"use only {views}"
            )
        # The executor resolves the views through its search_path; dropping the
        # qualifier keeps the check and the run independent of the deployed schema name.
        table.set("db", None)

    @classmethod
    def _render(cls, tree: exp.Expression) -> str:
        return tree.sql(dialect=cls.DIALECT, comments=False)

    @staticmethod
    def _plain(text: str) -> str:
        # sqlglot underlines the failing token with ANSI escapes; keep one clean line.
        return re.sub(r"\x1b\[[0-9;]*m", "", text).splitlines()[0][:200]
