"""Pure rules that turn confirmed sales into restock suggestions.

The policy does no I/O: the service loads confirmed sales, and this module decides what
to order and in which order to show it, so the arithmetic is testable without a
database.

`COVER_DAYS` is the only tunable: stock should cover this many days of the average daily
sales measured over the requested period. The value awaits product-owner sign-off.
"""

import math
from dataclasses import dataclass
from decimal import Decimal

PERIOD_DAYS = {"last_7_days": 7, "last_30_days": 30}
COVER_DAYS = 7


@dataclass(frozen=True)
class SoldProduct:
    """One tracked product with its confirmed sales for the period."""

    product_id: int
    name: str
    unit: str
    sold_qty: Decimal
    stock_qty: Decimal


@dataclass(frozen=True)
class RestockSuggestion:
    """One product to restock, with its quantity and Vietnamese explanation."""

    product_id: int
    product_name: str
    unit: str
    suggested_qty: int
    period: str
    reason: str


def suggest(products: list[SoldProduct], period: str) -> list[RestockSuggestion]:
    """Suggest restock quantities for products whose stock is below cover.

    Args:
        products: Tracked products with their confirmed sales for the period.
        period: A key of `PERIOD_DAYS`; an unknown value raises `KeyError`, which the
            tool's `Literal` argument prevents.

    Returns:
        Suggestions for products that need stock, most urgent first: fewest days of
        cover, then lowest product id.
    """
    days = PERIOD_DAYS[period]
    ranked = []
    for product in products:
        stock = max(product.stock_qty, Decimal(0))
        need = product.sold_qty / days * COVER_DAYS - stock
        suggested_qty = math.ceil(need)
        if suggested_qty <= 0:
            continue
        suggestion = RestockSuggestion(
            product_id=product.product_id,
            product_name=product.name,
            unit=product.unit,
            suggested_qty=suggested_qty,
            period=period,
            reason=(
                f"Bán {_format_qty(product.sold_qty)} {product.unit} trong {days} ngày "
                f"qua, còn {_format_qty(stock)} {product.unit}"
            ),
        )
        # Every kept suggestion has sold_qty > 0, so days of cover is well defined.
        cover = stock * days / product.sold_qty
        ranked.append((cover, product.product_id, suggestion))
    ranked.sort(key=lambda item: (item[0], item[1]))
    return [suggestion for _, _, suggestion in ranked]


def _format_qty(value: Decimal) -> str:
    """Render a quantity compactly with a Vietnamese decimal comma.

    For example, 12.000 becomes `12` and 2.500 becomes `2,5`.
    """
    text = format(value.normalize(), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text.replace(".", ",")
