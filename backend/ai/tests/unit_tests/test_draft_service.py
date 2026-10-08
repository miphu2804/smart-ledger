import pytest
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from src.drafts.catalog import CatalogProduct, CatalogUnavailableError
from src.drafts.service import (
    DraftLineOutput,
    DraftOutput,
    DraftService,
    DraftUnavailableError,
)

CATALOG = [
    CatalogProduct(id=12, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
    CatalogProduct(id=20, name="Bánh mì thịt", unit="ổ", selling_price_vnd=15000),
]


class FakeStructuredModel:
    """Stands in for a chat model's `with_structured_output(..., include_raw=True)`."""

    model_name = "gpt-test"

    def __init__(self, parsed=None, error: Exception | None = None) -> None:
        self.parsed = parsed
        self.error = error
        self.seen_messages: list = []

    def with_structured_output(self, schema, include_raw=False):
        assert schema is DraftOutput
        assert include_raw is True
        return RunnableLambda(self._respond)

    def _respond(self, messages):
        self.seen_messages = messages
        if self.error is not None:
            raise self.error
        return {
            "raw": AIMessage(
                content="", response_metadata={"model_name": "gpt-test-2026-01-01"}
            ),
            "parsed": self.parsed,
            "parsing_error": None,
        }


class FakeCatalog:
    def __init__(self, products=None, error: Exception | None = None) -> None:
        self.products = products if products is not None else CATALOG
        self.error = error
        self.seen_shops: list[int] = []

    def list_active_products(self, shop_id):
        self.seen_shops.append(shop_id)
        if self.error is not None:
            raise self.error
        return self.products


def output(*lines: DraftLineOutput) -> DraftOutput:
    return DraftOutput(lines=list(lines))


def sale_line(text: str, product_id: int | None, qty: float = 1) -> DraftLineOutput:
    return DraftLineOutput(
        text=text,
        qty=qty,
        product_id=product_id,
        confidence=0.9,
        ambiguous=False,
        amount_vnd=None,
    )


def test_sale_draft_uses_the_shop_catalog_and_reports_the_model() -> None:
    model = FakeStructuredModel(output(sale_line("2 cf sua", 12, qty=2)))
    catalog = FakeCatalog()

    draft = DraftService(model, catalog).parse(7, "SALE", "ban 2 cf sua")

    assert catalog.seen_shops == [7]
    assert draft.transcript == "ban 2 cf sua"
    assert draft.mode == "SALE"
    assert [(item.product_id, item.unit_price) for item in draft.items] == [(12, 25000)]
    assert draft.warnings == []
    assert draft.model == "gpt-test"
    assert draft.model_version == "gpt-test-2026-01-01"


def test_sale_prompt_lists_only_the_shop_catalog_and_the_text() -> None:
    model = FakeStructuredModel(output())

    DraftService(model, FakeCatalog()).parse(7, "SALE", "ban 1 banh mi")

    system, user = model.seen_messages
    assert system["role"] == "system"
    assert "ban 1 banh mi" not in system["content"]
    assert "12 | Cà phê sữa | ly" in user["content"]
    assert "20 | Bánh mì thịt | ổ" in user["content"]
    assert user["content"].endswith("ban 1 banh mi")


def test_model_id_outside_the_catalog_is_rejected() -> None:
    model = FakeStructuredModel(output(sale_line("tra sua", 999)))

    draft = DraftService(model, FakeCatalog()).parse(7, "SALE", "1 tra sua")

    assert draft.items[0].product_id is None
    assert draft.items[0].unit_price is None
    assert len(draft.warnings) == 1


def test_expense_draft_skips_the_catalog() -> None:
    model = FakeStructuredModel(
        output(
            DraftLineOutput(
                text="tien dien",
                qty=1,
                product_id=None,
                confidence=0.9,
                ambiguous=False,
                amount_vnd=350000,
            )
        )
    )
    catalog = FakeCatalog()

    draft = DraftService(model, catalog).parse(7, "EXPENSE", "tra tien dien 350k")

    assert catalog.seen_shops == []
    assert "Catalog" not in model.seen_messages[1]["content"]
    assert [(item.name, item.unit_price) for item in draft.items] == [
        ("tien dien", 350000)
    ]


def test_model_failure_is_a_draft_error() -> None:
    model = FakeStructuredModel(error=TimeoutError("slow"))

    with pytest.raises(DraftUnavailableError):
        DraftService(model, FakeCatalog()).parse(7, "SALE", "ban 1 banh mi")


def test_unparseable_model_output_is_a_draft_error() -> None:
    model = FakeStructuredModel(parsed=None)

    with pytest.raises(DraftUnavailableError):
        DraftService(model, FakeCatalog()).parse(7, "EXPENSE", "mua da")


def test_catalog_failure_is_a_draft_error_without_calling_the_model() -> None:
    model = FakeStructuredModel(output())
    catalog = FakeCatalog(error=CatalogUnavailableError("down"))

    with pytest.raises(DraftUnavailableError):
        DraftService(model, catalog).parse(7, "SALE", "ban 1 banh mi")
    assert model.seen_messages == []


def test_missing_model_is_a_draft_error() -> None:
    with pytest.raises(DraftUnavailableError):
        DraftService(None, FakeCatalog()).parse(7, "SALE", "ban 1 banh mi")
