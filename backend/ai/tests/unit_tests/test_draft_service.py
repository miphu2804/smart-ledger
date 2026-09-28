import pytest

from src.drafts.catalog import CatalogProduct
from src.drafts.schemas import DraftWarning, LlmDraft, LlmDraftItem
from src.drafts.service import DraftService, resolve_items


class FakeCatalog:
    def __init__(self, products: list[CatalogProduct]) -> None:
        self.products = products
        self.last_shop_id = None

    def list_active(self, shop_id: int) -> list[CatalogProduct]:
        self.last_shop_id = shop_id
        return self.products


class FakeModel:
    model_name = "fake-model"

    def __init__(self, llm_draft: LlmDraft) -> None:
        self.llm_draft = llm_draft
        self.seen_messages = None

    def with_structured_output(self, schema):
        return self

    def invoke(self, messages):
        self.seen_messages = messages
        return self.llm_draft


def test_parse_valid_sale_item_uses_catalog_name_and_price() -> None:
    catalog = FakeCatalog(
        [
            CatalogProduct(id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
            CatalogProduct(id=2, name="Bạc xỉu", unit="ly", selling_price_vnd=30000),
        ]
    )
    llm_draft = LlmDraft(
        items=[
            LlmDraftItem(
                product_id=1,
                name="coffee",
                qty=2,
                confidence=0.9,
            )
        ]
    )
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="SALE", text="2 cà phê sữa")

    assert len(result.items) == 1
    assert result.items[0].product_id == 1
    assert result.items[0].name == "Cà phê sữa"
    assert result.items[0].qty == 2
    assert result.items[0].unit_price == 25000
    assert result.items[0].confidence == 0.9
    assert len(result.warnings) == 0


def test_parse_foreign_id_sets_null_and_warns() -> None:
    product = CatalogProduct(
        id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000
    )
    catalog = FakeCatalog([product])
    llm_draft = LlmDraft(
        items=[
            LlmDraftItem(
                product_id=999,
                name="unknown item",
                qty=1,
                confidence=0.8,
            )
        ]
    )
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="SALE", text="xyz")

    assert len(result.items) == 1
    assert result.items[0].product_id is None
    assert result.items[0].unit_price is None
    assert result.items[0].name == "unknown item"
    assert result.warnings == [DraftWarning(code="PRODUCT_NOT_FOUND", item_index=0)]


def test_parse_null_id_sets_null_and_warns() -> None:
    product = CatalogProduct(
        id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000
    )
    catalog = FakeCatalog([product])
    llm_draft = LlmDraft(
        items=[
            LlmDraftItem(
                product_id=None,
                name="some item",
                qty=1,
                confidence=0.9,
            )
        ]
    )
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="SALE", text="xyz")

    assert len(result.items) == 1
    assert result.items[0].product_id is None
    assert result.items[0].unit_price is None
    assert result.warnings == [DraftWarning(code="PRODUCT_NOT_FOUND", item_index=0)]


def test_parse_low_confidence_sets_null_and_warns() -> None:
    product = CatalogProduct(
        id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000
    )
    catalog = FakeCatalog([product])
    llm_draft = LlmDraft(
        items=[
            LlmDraftItem(
                product_id=1,
                name="Cà phê sữa",
                qty=1,
                confidence=0.5,
            )
        ]
    )
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="SALE", text="xyz")

    assert len(result.items) == 1
    assert result.items[0].product_id is None
    assert result.items[0].unit_price is None
    assert result.items[0].name == "Cà phê sữa"
    assert result.warnings == [DraftWarning(code="PRODUCT_AMBIGUOUS", item_index=0)]


def test_parse_catalog_asked_with_correct_shop_id() -> None:
    product = CatalogProduct(
        id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000
    )
    catalog = FakeCatalog([product])
    llm_draft = LlmDraft(items=[])
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    service.parse(shop_id=42, mode="SALE", text="xyz")

    assert catalog.last_shop_id == 42


def test_parse_system_prompt_contains_only_catalog_lines() -> None:
    catalog = FakeCatalog(
        [
            CatalogProduct(id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
            CatalogProduct(id=2, name="Bạc xỉu", unit="ly", selling_price_vnd=30000),
        ]
    )
    llm_draft = LlmDraft(items=[])
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    service.parse(shop_id=5, mode="SALE", text="xyz")

    system_msg = model.seen_messages[0]["content"]
    assert "1 | Cà phê sữa | ly" in system_msg
    assert "2 | Bạc xỉu | ly" in system_msg
    assert "25000" not in system_msg
    assert "30000" not in system_msg


def test_parse_expense_does_not_call_catalog() -> None:
    product = CatalogProduct(
        id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000
    )
    catalog = FakeCatalog([product])
    llm_draft = LlmDraft(
        items=[
            LlmDraftItem(
                product_id=None,
                name="xăng",
                qty=1,
                amount_vnd=150000,
                confidence=0.9,
            )
        ]
    )
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    service.parse(shop_id=5, mode="EXPENSE", text="xăng 150k")

    assert catalog.last_shop_id is None


def test_parse_expense_maps_amount_to_unit_price() -> None:
    catalog = FakeCatalog([])
    llm_draft = LlmDraft(
        items=[
            LlmDraftItem(
                product_id=None,
                name="xăng",
                qty=1,
                amount_vnd=150000,
                confidence=0.9,
            )
        ]
    )
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="EXPENSE", text="xăng 150k")

    assert len(result.items) == 1
    assert result.items[0].product_id is None
    assert result.items[0].name == "xăng"
    assert result.items[0].qty == 1
    assert result.items[0].unit_price == 150000


def test_parse_expense_missing_amount_warns() -> None:
    catalog = FakeCatalog([])
    llm_draft = LlmDraft(
        items=[
            LlmDraftItem(
                product_id=None,
                name="xăng",
                qty=1,
                amount_vnd=None,
                confidence=0.9,
            )
        ]
    )
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="EXPENSE", text="xăng")

    assert [(item.name, item.unit_price) for item in result.items] == [("xăng", None)]
    assert result.warnings == [DraftWarning(code="AMOUNT_MISSING", item_index=0)]


def test_parse_empty_items_adds_warning() -> None:
    catalog = FakeCatalog([])
    llm_draft = LlmDraft(items=[])
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="SALE", text="...")

    assert len(result.items) == 0
    assert result.warnings == [DraftWarning(code="NO_ITEMS")]


def test_parse_model_none_raises_error() -> None:
    catalog = FakeCatalog([])
    service = DraftService(None, catalog)

    with pytest.raises(RuntimeError, match="draft model unavailable"):
        service.parse(shop_id=5, mode="SALE", text="xyz")


def test_parse_response_has_request_id() -> None:
    catalog = FakeCatalog([])
    llm_draft = LlmDraft(items=[])
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="SALE", text="xyz")

    assert result.request_id
    assert len(result.request_id) > 0


def test_parse_response_model_is_fake_model() -> None:
    catalog = FakeCatalog([])
    llm_draft = LlmDraft(items=[])
    model = FakeModel(llm_draft)
    service = DraftService(model, catalog)

    result = service.parse(shop_id=5, mode="SALE", text="xyz")

    assert result.model == "fake-model"
    assert result.model_version == "fake-model"


def test_resolve_items_sale_valid_id_high_confidence() -> None:
    products = [
        CatalogProduct(id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
    ]
    llm_items = [LlmDraftItem(product_id=1, name="cf", qty=2, confidence=0.9)]

    items, warnings = resolve_items("SALE", llm_items, products)

    assert len(items) == 1
    assert items[0].product_id == 1
    assert items[0].name == "Cà phê sữa"
    assert items[0].unit_price == 25000
    assert len(warnings) == 0


def test_resolve_items_sale_valid_id_low_confidence() -> None:
    products = [
        CatalogProduct(id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
    ]
    llm_items = [LlmDraftItem(product_id=1, name="Cà phê sữa", qty=1, confidence=0.5)]

    items, warnings = resolve_items("SALE", llm_items, products)

    assert len(items) == 1
    assert items[0].product_id is None
    assert items[0].unit_price is None
    assert warnings == [DraftWarning(code="PRODUCT_AMBIGUOUS", item_index=0)]


def test_resolve_items_sale_foreign_id() -> None:
    products = [
        CatalogProduct(id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
    ]
    llm_items = [LlmDraftItem(product_id=999, name="unknown", qty=1, confidence=0.8)]

    items, warnings = resolve_items("SALE", llm_items, products)

    assert len(items) == 1
    assert items[0].product_id is None
    assert items[0].unit_price is None
    assert warnings == [DraftWarning(code="PRODUCT_NOT_FOUND", item_index=0)]


def test_resolve_items_sale_null_id() -> None:
    products = [
        CatalogProduct(id=1, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
    ]
    llm_items = [LlmDraftItem(product_id=None, name="some item", qty=1, confidence=0.8)]

    items, warnings = resolve_items("SALE", llm_items, products)

    assert len(items) == 1
    assert items[0].product_id is None
    assert items[0].unit_price is None
    assert warnings == [DraftWarning(code="PRODUCT_NOT_FOUND", item_index=0)]


def test_resolve_items_expense_with_amount() -> None:
    products = []
    llm_items = [
        LlmDraftItem(
            product_id=None,
            name="xăng",
            qty=1,
            amount_vnd=150000,
            confidence=0.9,
        )
    ]

    items, warnings = resolve_items("EXPENSE", llm_items, products)

    assert len(items) == 1
    assert items[0].product_id is None
    assert items[0].unit_price == 150000
    assert items[0].qty == 1
    assert len(warnings) == 0


def test_resolve_items_expense_without_amount() -> None:
    products = []
    llm_items = [
        LlmDraftItem(
            product_id=None,
            name="xăng",
            qty=1,
            amount_vnd=None,
            confidence=0.9,
        )
    ]

    items, warnings = resolve_items("EXPENSE", llm_items, products)

    assert len(items) == 1
    assert items[0].unit_price is None
    assert warnings == [DraftWarning(code="AMOUNT_MISSING", item_index=0)]


def test_resolve_items_sale_ambiguous_without_id_asks_to_choose() -> None:
    products = [
        CatalogProduct(id=13, name="Bạc xỉu nóng", unit="ly", selling_price_vnd=28000),
        CatalogProduct(id=14, name="Bạc xỉu đá", unit="ly", selling_price_vnd=28000),
    ]
    llm_items = [LlmDraftItem(product_id=None, name="bac xiu", qty=1, confidence=0.55)]

    items, warnings = resolve_items("SALE", llm_items, products)

    assert items[0].product_id is None
    assert warnings == [DraftWarning(code="PRODUCT_AMBIGUOUS", item_index=0)]
