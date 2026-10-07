"""Load one shop's confirmed sales and ask the policy what to restock.

The service is the only restock module that does I/O: it runs one fixed query through
the read-only executor (which scopes it to the shop and caps time and rows) and hands
the rows to `policy.suggest`. Rejected queries raise `ValueError("CODE: reason")`, which
the agent tool turns back into model-facing text.
"""

from dataclasses import dataclass
from decimal import Decimal

from src.restock import policy
from src.restock.policy import PERIOD_DAYS, SoldProduct
from src.sql.executor import ReadOnlySqlExecutor


@dataclass(frozen=True)
class RestockResult:
    """The ranked suggestions and the period they were computed for."""

    suggestions: list[policy.RestockSuggestion]
    period: str
    days: int
    truncated: bool


class RestockService:
    """Suggest restock quantities for one shop from its confirmed sales."""

    def __init__(self, executor: ReadOnlySqlExecutor) -> None:
        self.executor = executor

    def suggest(self, shop_id: int, period: str) -> RestockResult:
        """Return the products worth restocking for `period`, most urgent first."""
        days = PERIOD_DAYS[period]
        rows, truncated = self._load(shop_id, days)
        products = [self._to_sold_product(row) for row in rows]
        return RestockResult(
            suggestions=policy.suggest(products, period),
            period=period,
            days=days,
            truncated=truncated,
        )

    def _load(self, shop_id: int, days: int) -> tuple[list[list], bool]:
        result = self.executor.run(shop_id, self._query(days))
        return result["rows"], result["truncated"]

    @staticmethod
    def _query(days: int) -> str:
        # The guard rejects bind parameters, so the period length is interpolated into
        # the SQL. `days` comes only from `PERIOD_DAYS`, never from the caller, so no
        # request text can reach the query.
        return f"""WITH sold AS (
    SELECT product_id, sum(quantity) AS sold_qty
    FROM v_sale_items
    WHERE sale_status = 'CONFIRMED' AND product_id IS NOT NULL
      AND sold_at >= now() - interval '{days} days'
    GROUP BY product_id
)
SELECT p.id, p.name, p.unit, s.sold_qty, p.stock_quantity
FROM v_products p JOIN sold s ON s.product_id = p.id
WHERE p.status = 'ACTIVE' AND p.tracked
ORDER BY s.sold_qty DESC"""

    @staticmethod
    def _to_sold_product(row: list) -> SoldProduct:
        # The executor renders a Decimal as an int or a str, so both go through str().
        product_id, name, unit, sold_qty, stock_qty = row
        return SoldProduct(
            product_id=int(product_id),
            name=str(name),
            unit=str(unit),
            sold_qty=Decimal(str(sold_qty)),
            stock_qty=Decimal(str(stock_qty)),
        )
