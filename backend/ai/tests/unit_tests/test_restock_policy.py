from decimal import Decimal

from src.restock.policy import SoldProduct, suggest


def product(
    product_id: int,
    *,
    sold: str = "7",
    stock: str = "0",
    name: str = "Gạo",
    unit: str = "kg",
) -> SoldProduct:
    return SoldProduct(
        product_id=product_id,
        name=name,
        unit=unit,
        sold_qty=Decimal(sold),
        stock_qty=Decimal(stock),
    )


def test_stock_covering_the_period_needs_no_restock() -> None:
    assert suggest([product(1, sold="7", stock="100")], "last_7_days") == []


def test_empty_stock_suggests_the_rounded_up_cover_needs() -> None:
    # 10 sold over 30 days needs 10/30*7 = 2.33 kg for 7 days of cover, rounded up to 3.
    suggestions = suggest([product(1, sold="10", stock="0")], "last_30_days")
    assert [s.suggested_qty for s in suggestions] == [3]


def test_fractional_unit_is_rounded_up() -> None:
    suggestions = suggest([product(1, sold="2.5", stock="0")], "last_7_days")
    assert [s.suggested_qty for s in suggestions] == [3]


def test_negative_stock_is_treated_as_zero() -> None:
    suggestions = suggest([product(1, sold="7", stock="-5")], "last_7_days")
    assert [s.suggested_qty for s in suggestions] == [7]
    assert suggestions[0].reason == "Bán 7 kg trong 7 ngày qua, còn 0 kg"


def test_most_urgent_first_then_lowest_product_id() -> None:
    products = [
        product(2, sold="7", stock="1"),  # 1 day of cover
        product(3, sold="14", stock="0"),  # 0 days of cover
        product(1, sold="7", stock="0"),  # 0 days of cover
    ]
    assert [s.product_id for s in suggest(products, "last_7_days")] == [1, 3, 2]


def test_last_30_days_uses_thirty_days() -> None:
    suggestions = suggest([product(1, sold="30", stock="0")], "last_30_days")
    assert [s.suggested_qty for s in suggestions] == [7]
    assert suggestions[0].reason == "Bán 30 kg trong 30 ngày qua, còn 0 kg"


def test_reason_formats_quantities_with_a_decimal_comma() -> None:
    suggestions = suggest([product(1, sold="17.5", stock="12.000")], "last_7_days")
    assert suggestions[0].reason == "Bán 17,5 kg trong 7 ngày qua, còn 12 kg"
