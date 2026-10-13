from src.drafts.catalog import CatalogProduct
from src.drafts.matching import (
    MIN_MATCH_CONFIDENCE,
    ProposedLine,
    match_expense,
    match_sale,
)

CATALOG = [
    CatalogProduct(id=12, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
    CatalogProduct(id=13, name="Cà phê đen", unit="ly", selling_price_vnd=20000),
    CatalogProduct(id=20, name="Bánh mì thịt", unit="ổ", selling_price_vnd=15000),
]


def line(
    text: str = "cf sua",
    qty: float = 2,
    product_id: int | None = 12,
    confidence: float = 0.95,
    ambiguous: bool = False,
    amount_vnd: int | None = None,
) -> ProposedLine:
    return ProposedLine(
        text=text,
        qty=qty,
        product_id=product_id,
        confidence=confidence,
        ambiguous=ambiguous,
        amount_vnd=amount_vnd,
    )


def test_clear_match_takes_name_unit_and_price_from_catalog() -> None:
    result = match_sale([line(text="2 cf sua")], CATALOG)

    assert result.warnings == []
    [item] = result.items
    assert item.product_id == 12
    assert item.name == "Cà phê sữa"
    assert item.unit == "ly"
    assert item.qty == 2
    assert item.unit_price == 25000
    assert item.confidence == 0.95


def test_product_outside_the_shop_catalog_is_dropped_with_warning() -> None:
    result = match_sale([line(text="tra sua", product_id=999)], CATALOG)

    [item] = result.items
    assert item.product_id is None
    assert item.unit_price is None
    assert item.name == "tra sua"
    assert "không khớp sản phẩm nào trong danh mục" in result.warnings[0]


def test_foreign_id_wins_over_the_ambiguous_flag() -> None:
    result = match_sale([line(product_id=999, ambiguous=True)], CATALOG)

    assert result.items[0].product_id is None
    assert "không khớp sản phẩm nào trong danh mục" in result.warnings[0]


def test_ambiguous_match_is_not_chosen_even_with_a_valid_id() -> None:
    result = match_sale([line(text="ca phe", product_id=12, ambiguous=True)], CATALOG)

    assert result.items[0].product_id is None
    assert result.items[0].unit_price is None
    assert "khớp nhiều sản phẩm" in result.warnings[0]


def test_no_match_stays_open_with_warning() -> None:
    result = match_sale([line(text="nuoc ngot", product_id=None)], CATALOG)

    assert result.items[0].product_id is None
    assert "Không tìm thấy 'nuoc ngot'" in result.warnings[0]


def test_low_confidence_match_is_not_chosen() -> None:
    result = match_sale(
        [line(text="banh", product_id=20, confidence=MIN_MATCH_CONFIDENCE - 0.01)],
        CATALOG,
    )

    assert result.items[0].product_id is None
    assert "Chưa chắc 'banh' là 'Bánh mì thịt'" in result.warnings[0]


def test_confidence_at_the_threshold_is_kept() -> None:
    result = match_sale([line(confidence=MIN_MATCH_CONFIDENCE)], CATALOG)

    assert result.items[0].product_id == 12
    assert result.warnings == []


def test_non_positive_quantity_is_skipped_with_warning() -> None:
    result = match_sale([line(qty=0), line(text="banh mi", product_id=20)], CATALOG)

    assert [item.product_id for item in result.items] == [20]
    assert "số lượng không hợp lệ" in result.warnings[0]


def test_mixed_sale_keeps_matches_and_opens_the_rest() -> None:
    result = match_sale(
        [
            line(text="2 cf sua", product_id=12),
            line(text="1 banh mi", qty=1, product_id=20),
            line(text="1 nuoc suoi", qty=1, product_id=None),
        ],
        CATALOG,
    )

    assert [item.product_id for item in result.items] == [12, 20, None]
    assert len(result.warnings) == 1


def test_empty_catalog_opens_every_line() -> None:
    result = match_sale([line(product_id=12)], [])

    assert result.items[0].product_id is None
    assert len(result.warnings) == 1


def test_sale_without_lines_warns() -> None:
    result = match_sale([], CATALOG)

    assert result.items == []
    assert result.warnings == ["Chưa nhận ra món nào, hãy nhập lại hoặc chọn món."]


def test_confidence_is_clamped_to_unit_range() -> None:
    result = match_sale([line(confidence=1.7)], CATALOG)

    assert result.items[0].confidence == 1.0


def test_expense_maps_amount_to_a_single_line() -> None:
    result = match_expense(
        [line(text="tien dien", qty=1, product_id=None, amount_vnd=350000)]
    )

    assert result.warnings == []
    [item] = result.items
    assert item.product_id is None
    assert item.name == "tien dien"
    assert item.unit is None
    assert item.qty == 1
    assert item.unit_price == 350000


def test_expense_without_amount_stays_open_with_warning() -> None:
    result = match_expense([line(text="mua da", product_id=None, amount_vnd=None)])

    assert result.items[0].unit_price is None
    assert "Chưa rõ số tiền của 'mua da'" in result.warnings[0]


def test_expense_never_keeps_a_product_id() -> None:
    result = match_expense([line(text="nhap hang", product_id=12, amount_vnd=10000)])

    assert result.items[0].product_id is None


def test_expense_without_lines_warns() -> None:
    result = match_expense([])

    assert result.items == []
    assert result.warnings == ["Chưa nhận ra khoản chi nào, hãy nhập lại."]
