from src.restock.service import RestockService


class FakeExecutor:
    """Records the calls and replays one configured result, like the real executor's."""

    def __init__(self, rows: list | None = None, truncated: bool = False) -> None:
        self.rows = rows or []
        self.truncated = truncated
        self.calls: list[tuple[int, str]] = []

    def run(self, shop_id: int, sql: str) -> dict:
        self.calls.append((shop_id, sql))
        return {
            "columns": ["id", "name", "unit", "sold_qty", "stock_quantity"],
            "rows": self.rows,
            "truncated": self.truncated,
        }


def row(
    product_id: int = 1,
    name: str = "Gạo",
    unit: str = "kg",
    sold_qty="7",
    stock_qty="0",
) -> list:
    return [product_id, name, unit, sold_qty, stock_qty]


def test_passes_the_request_shop_and_a_fixed_query() -> None:
    executor = FakeExecutor()
    RestockService(executor).suggest(shop_id=15, period="last_7_days")

    (shop_id, sql) = executor.calls[0]
    assert shop_id == 15
    assert "interval '7 days'" in sql
    assert "sale_status = 'CONFIRMED'" in sql
    assert "FROM v_sale_items" in sql


def test_last_30_days_queries_thirty_days() -> None:
    executor = FakeExecutor()
    result = RestockService(executor).suggest(15, "last_30_days")

    assert "interval '30 days'" in executor.calls[0][1]
    assert (result.period, result.days) == ("last_30_days", 30)


def test_maps_decimal_strings_from_the_executor() -> None:
    executor = FakeExecutor(rows=[row(sold_qty="14.5", stock_qty="0")])
    result = RestockService(executor).suggest(15, "last_7_days")

    # 14.5 sold over 7 days needs 14.5 for 7 days of cover, rounded up to 15.
    assert [s.suggested_qty for s in result.suggestions] == [15]
    assert result.suggestions[0].reason == "Bán 14,5 kg trong 7 ngày qua, còn 0 kg"


def test_truncated_is_passed_through() -> None:
    executor = FakeExecutor(rows=[row()], truncated=True)
    result = RestockService(executor).suggest(15, "last_7_days")

    assert result.truncated is True


def test_empty_sales_mean_no_suggestions() -> None:
    result = RestockService(FakeExecutor()).suggest(15, "last_7_days")

    assert result.suggestions == []
    assert result.truncated is False
