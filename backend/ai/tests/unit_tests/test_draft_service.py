import pytest
from pydantic_ai.models.function import FunctionModel
from tests.support import ScriptedModel, transcript

from src.drafts.catalog import CatalogProduct, CatalogUnavailableError
from src.drafts.service import (
    DraftLineOutput,
    DraftOutput,
    DraftService,
    DraftUnavailableError,
)
from src.prompt_templates import DRAFT_SALE_PROMPT

pytestmark = pytest.mark.anyio

CATALOG = [
    CatalogProduct(id=12, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
    CatalogProduct(id=20, name="Bánh mì thịt", unit="ổ", selling_price_vnd=15000),
]


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


def answer(*lines: DraftLineOutput) -> ScriptedModel:
    """A model whose one reply is the structured output with `lines`."""
    return ScriptedModel(DraftOutput(lines=list(lines)).model_dump_json())


def sale_line(text: str, product_id: int | None, qty: float = 1) -> DraftLineOutput:
    return DraftLineOutput(
        text=text,
        qty=qty,
        product_id=product_id,
        confidence=0.9,
        ambiguous=False,
        amount_vnd=None,
    )


def timeout(messages, info):
    raise TimeoutError("slow")


async def test_sale_draft_uses_the_shop_catalog_and_reports_the_model() -> None:
    model = answer(sale_line("2 cf sua", 12, qty=2))
    catalog = FakeCatalog()

    draft = await DraftService(model, catalog).parse(7, "SALE", "ban 2 cf sua")

    assert catalog.seen_shops == [7]
    assert draft.transcript == "ban 2 cf sua"
    assert draft.mode == "SALE"
    assert [(item.product_id, item.unit_price) for item in draft.items] == [(12, 25000)]
    assert draft.warnings == []
    assert (draft.model, draft.model_version) == ("test-model", "test-model")


async def test_sale_prompt_lists_only_the_shop_catalog_and_the_text() -> None:
    model = answer()

    await DraftService(model, FakeCatalog()).parse(7, "SALE", "ban 1 banh mi")

    messages, info = model.requests[0]
    assert info.instructions == DRAFT_SALE_PROMPT
    ((kind, user_input),) = transcript(messages)
    assert kind == "user"
    assert "12 | Cà phê sữa | ly" in user_input
    assert "20 | Bánh mì thịt | ổ" in user_input
    assert user_input.endswith("ban 1 banh mi")


async def test_model_id_outside_the_catalog_is_rejected() -> None:
    model = answer(sale_line("tra sua", 999))

    draft = await DraftService(model, FakeCatalog()).parse(7, "SALE", "1 tra sua")

    assert draft.items[0].product_id is None
    assert draft.items[0].unit_price is None
    assert len(draft.warnings) == 1


async def test_expense_draft_skips_the_catalog() -> None:
    model = answer(
        DraftLineOutput(
            text="tien dien",
            qty=1,
            product_id=None,
            confidence=0.9,
            ambiguous=False,
            amount_vnd=350000,
        )
    )
    catalog = FakeCatalog()

    draft = await DraftService(model, catalog).parse(7, "EXPENSE", "tra tien dien 350k")

    assert catalog.seen_shops == []
    assert "Catalog" not in transcript(model.requests[0][0])[0][1]
    assert [(item.name, item.unit_price) for item in draft.items] == [
        ("tien dien", 350000)
    ]


async def test_model_failure_is_a_draft_error() -> None:
    service = DraftService(FunctionModel(timeout), FakeCatalog())

    with pytest.raises(DraftUnavailableError):
        await service.parse(7, "SALE", "ban 1 banh mi")


async def test_unparseable_model_output_is_a_draft_error() -> None:
    # The agent asks again after output that misses the schema, then gives up.
    model = ScriptedModel(*["not json"] * 5)

    with pytest.raises(DraftUnavailableError):
        await DraftService(model, FakeCatalog()).parse(7, "EXPENSE", "mua da")


async def test_catalog_failure_is_a_draft_error_without_calling_the_model() -> None:
    model = answer()
    catalog = FakeCatalog(error=CatalogUnavailableError("down"))

    with pytest.raises(DraftUnavailableError):
        await DraftService(model, catalog).parse(7, "SALE", "ban 1 banh mi")
    assert model.requests == []


async def test_missing_model_is_a_draft_error() -> None:
    with pytest.raises(DraftUnavailableError):
        await DraftService(None, FakeCatalog()).parse(7, "SALE", "ban 1 banh mi")
