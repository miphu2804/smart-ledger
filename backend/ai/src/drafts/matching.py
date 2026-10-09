"""Turn the model's proposed lines into draft items the owner can trust (AI-008, #60).

Pure rules, no I/O. The model only proposes: a product id is kept only when it is an
ACTIVE product of the shop's own catalog, matched clearly and with enough confidence;
name, unit and price then come from that catalog row. Anything else becomes an open
line with `product_id = None` and a Vietnamese warning, so the owner picks the product
instead of the draft silently choosing one.
"""

from dataclasses import dataclass

from src.drafts.catalog import CatalogProduct

# Below this the match is a guess, so the line stays open for the owner to choose.
# Provisional default for the MVP test set; tune it with real transcripts.
MIN_MATCH_CONFIDENCE = 0.7


@dataclass(frozen=True)
class ProposedLine:
    """One line as the model returned it, before any check."""

    text: str
    qty: float
    product_id: int | None
    confidence: float
    ambiguous: bool
    amount_vnd: int | None


@dataclass(frozen=True)
class DraftItem:
    """One `DraftView.items[]` entry.

    For SALE, `unit_price` is the catalog `selling_price_vnd`, or None when the line has
    no product. For EXPENSE, `name` is the expense description, `qty` is 1 and
    `unit_price` is the amount, or None when no amount was said.
    """

    product_id: int | None
    name: str
    unit: str | None
    qty: float
    unit_price: int | None
    confidence: float


@dataclass(frozen=True)
class MatchResult:
    items: list[DraftItem]
    warnings: list[str]


def match_sale(lines: list[ProposedLine], catalog: list[CatalogProduct]) -> MatchResult:
    """Keep catalog matches and open every other line with a warning."""
    products = {product.id: product for product in catalog}
    items: list[DraftItem] = []
    warnings: list[str] = []
    for line in lines:
        if line.qty <= 0:
            warnings.append(f"Bỏ qua '{line.text}': số lượng không hợp lệ.")
            continue
        product = products.get(line.product_id) if line.product_id is not None else None
        warning = _sale_warning(line, product)
        if warning is not None:
            warnings.append(warning)
            items.append(_open_line(line))
            continue
        items.append(
            DraftItem(
                product_id=product.id,
                name=product.name,
                unit=product.unit,
                qty=line.qty,
                unit_price=product.selling_price_vnd,
                confidence=_clamp(line.confidence),
            )
        )
    if not lines:
        warnings.append("Chưa nhận ra món nào, hãy nhập lại hoặc chọn món.")
    return MatchResult(items=items, warnings=warnings)


def match_expense(lines: list[ProposedLine]) -> MatchResult:
    """Map each expense to a one-quantity line; a missing amount stays open."""
    items: list[DraftItem] = []
    warnings: list[str] = []
    for line in lines:
        amount = line.amount_vnd if line.amount_vnd and line.amount_vnd > 0 else None
        if amount is None:
            warnings.append(f"Chưa rõ số tiền của '{line.text}', hãy nhập số tiền.")
        items.append(
            DraftItem(
                product_id=None,
                name=line.text,
                unit=None,
                qty=1,
                unit_price=amount,
                confidence=_clamp(line.confidence),
            )
        )
    if not lines:
        warnings.append("Chưa nhận ra khoản chi nào, hãy nhập lại.")
    return MatchResult(items=items, warnings=warnings)


def _sale_warning(line: ProposedLine, product: CatalogProduct | None) -> str | None:
    # Order matters: a foreign id is reported as such even when the model also
    # flagged it as ambiguous, so the warning names the real reason.
    if line.product_id is not None and product is None:
        return (
            f"'{line.text}' không khớp sản phẩm nào trong danh mục của cửa hàng, "
            "hãy chọn món."
        )
    if line.ambiguous:
        return f"'{line.text}' khớp nhiều sản phẩm, hãy chọn đúng món."
    if product is None:
        return f"Không tìm thấy '{line.text}' trong danh mục, hãy chọn hoặc thêm món."
    if line.confidence < MIN_MATCH_CONFIDENCE:
        return f"Chưa chắc '{line.text}' là '{product.name}', hãy kiểm tra lại."
    return None


def _open_line(line: ProposedLine) -> DraftItem:
    # Price only ever comes from the catalog, so a line without a product has none.
    return DraftItem(
        product_id=None,
        name=line.text,
        unit=None,
        qty=line.qty,
        unit_price=None,
        confidence=_clamp(line.confidence),
    )


def _clamp(confidence: float) -> float:
    return min(max(confidence, 0.0), 1.0)
