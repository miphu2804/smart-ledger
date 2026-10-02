"""Static check for SQL written by the model before it reaches PostgreSQL.

The guard is one of several layers (read-only role, shop-filtered views, read-only
transaction), so it fails closed: anything it does not recognise is rejected. Functions
are checked against an allowlist rather than a blocklist, because a single missed
function such as `set_config` would let the query change its own shop scope.

The query that runs is sqlglot's rendering of the validated tree, not the model's text,
and that rendering is parsed and checked again, so a construct the parser misread cannot
reach the database unchecked.
"""

import sqlglot
from sqlglot import exp
from sqlglot.errors import SqlglotError
from sqlglot.optimizer.normalize_identifiers import normalize_identifiers
from sqlglot.optimizer.scope import traverse_scope

DIALECT = "postgres"
VIEW_SCHEMA = "ai_read"
ALLOWED_VIEWS = frozenset({"v_shop_profile", "v_categories", "v_products"})
MAX_SQL_CHARS = 4000

# sqlglot maps Postgres functions to typed nodes; `Anonymous` (any function sqlglot does
# not model, e.g. set_config, current_setting, pg_sleep, dblink) is never allowed.
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

# E'', U&'', X'' and B'' strings have their own escape rules; plain and $$ strings do.
FORBIDDEN_LITERALS: tuple[type[exp.Expression], ...] = (
    exp.ByteString,
    exp.UnicodeString,
    exp.HexString,
    exp.BitString,
)

ALLOWED_ROOTS: tuple[type[exp.Expression], ...] = (exp.Select, exp.SetOperation)


class UnsafeSqlError(ValueError):
    """The model's SQL was rejected; `code` is safe to show to the model."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


def validate_and_wrap(sql: str, row_limit: int) -> str:
    """Return one read-only SELECT over the allowed views, capped at `row_limit` rows.

    Raises `UnsafeSqlError` when the query is not exactly one SELECT (with optional
    read-only CTEs and set operations) over `ai_read` views using allowed functions.
    """
    if not isinstance(row_limit, int) or row_limit < 1:
        raise ValueError("row_limit must be a positive integer")
    if not sql or not sql.strip():
        raise UnsafeSqlError("empty_sql")
    if len(sql) > MAX_SQL_CHARS:
        raise UnsafeSqlError("sql_too_long", f"limit {MAX_SQL_CHARS} characters")

    rendered = _render(_check(_parse(sql)))
    # Re-check what will actually run, and require the rendering to be stable.
    if _render(_check(_parse(rendered))) != rendered:
        raise UnsafeSqlError("unsupported_syntax", "query does not round-trip")
    return f"SELECT * FROM ({rendered}) AS q LIMIT {row_limit}"


def _parse(sql: str) -> exp.Expression:
    try:
        statements = [
            statement
            for statement in sqlglot.parse(sql, dialect=DIALECT)
            if statement is not None
        ]
    except (SqlglotError, RecursionError, ValueError) as error:
        raise UnsafeSqlError("parse_error", str(error).splitlines()[0][:200]) from None
    if not statements:
        raise UnsafeSqlError("empty_sql")
    if len(statements) > 1:
        raise UnsafeSqlError("multiple_statements")
    return statements[0]


def _check(tree: exp.Expression) -> exp.Expression:
    if not isinstance(tree, ALLOWED_ROOTS):
        raise UnsafeSqlError("not_select", type(tree).__name__)
    # Unquoted identifiers fold to lower case as in Postgres, so `PRODUCTS` equals
    # `products` while a quoted `"V_PRODUCTS"` does not match `v_products`.
    tree = normalize_identifiers(tree, dialect=DIALECT)

    for node in tree.walk():
        if isinstance(node, FORBIDDEN_NODES):
            raise UnsafeSqlError("forbidden_clause", type(node).__name__)
        if isinstance(node, FORBIDDEN_LITERALS):
            raise UnsafeSqlError("forbidden_literal", type(node).__name__)
        if isinstance(node, exp.Func) and not isinstance(node, ALLOWED_FUNCTIONS):
            raise UnsafeSqlError("forbidden_function", _function_name(node))
        if isinstance(node, exp.Cast):
            _check_cast(node)

    _check_tables(tree)
    return tree


def _function_name(node: exp.Func) -> str:
    if isinstance(node, exp.Anonymous):
        return str(node.name)
    return node.sql_name()


def _check_cast(node: exp.Cast) -> None:
    target = node.to
    if not isinstance(target, exp.DataType) or target.this not in ALLOWED_CAST_TYPES:
        raise UnsafeSqlError("forbidden_cast", target.sql(dialect=DIALECT))


def _check_tables(tree: exp.Expression) -> None:
    """Every table reference must be an allowed view or a CTE visible in its scope."""
    checked: set[int] = set()
    try:
        scopes = list(traverse_scope(tree))
    except (SqlglotError, RecursionError, ValueError) as error:
        raise UnsafeSqlError("unsupported_syntax", str(error)[:200]) from None
    for scope in scopes:
        for table in scope.tables:
            checked.add(id(table))
            if not table.args.get("db") and table.name in scope.cte_sources:
                continue
            _check_view(table)
    for table in tree.find_all(exp.Table):
        # A table the scope walk did not reach (e.g. a table function) is not trusted.
        if id(table) not in checked:
            _check_view(table)


def _check_view(table: exp.Table) -> None:
    if not isinstance(table.this, exp.Identifier):
        raise UnsafeSqlError("forbidden_table", table.sql(dialect=DIALECT))
    if table.args.get("catalog") is not None:
        raise UnsafeSqlError("forbidden_table", table.sql(dialect=DIALECT))
    schema = table.args.get("db")
    if schema is not None and schema.name != VIEW_SCHEMA:
        raise UnsafeSqlError("forbidden_table", table.sql(dialect=DIALECT))
    if table.name not in ALLOWED_VIEWS:
        raise UnsafeSqlError("forbidden_table", table.sql(dialect=DIALECT))
    # The executor resolves the views through its search_path; dropping the qualifier
    # keeps the check and the run independent of the deployed schema name.
    table.set("db", None)


def _render(tree: exp.Expression) -> str:
    return tree.sql(dialect=DIALECT, comments=False)
