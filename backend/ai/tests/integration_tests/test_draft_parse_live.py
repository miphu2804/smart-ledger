"""Vietnamese text set for AI-008 (#60) against the configured real model.

Opt-in because it calls the provider and costs tokens: run with
`RUN_LIVE_MODEL_TESTS=1 uv run pytest tests/integration_tests/test_draft_parse_live.py`.
The catalog is a fake, so no database is needed; matching rules still apply in full.
"""

import os

import pytest

from src.app_config import app_config
from src.catalog import CatalogProduct
from src.drafts.service import DraftService
from src.providers.factory import build_chat_model

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_LIVE_MODEL_TESTS") != "1" or not app_config.OPENAI_API_KEY,
    reason="live model test: set RUN_LIVE_MODEL_TESTS=1 and OPENAI_API_KEY",
)

CATALOG = [
    CatalogProduct(id=12, name="Cà phê sữa", unit="ly", selling_price_vnd=25000),
    CatalogProduct(id=13, name="Cà phê đen", unit="ly", selling_price_vnd=20000),
    CatalogProduct(id=20, name="Bánh mì thịt", unit="ổ", selling_price_vnd=15000),
    CatalogProduct(
        id=21, name="Nước suối Aquafina", unit="chai", selling_price_vnd=8000
    ),
    CatalogProduct(
        id=30, name="Mì Hảo Hảo tôm chua cay", unit="gói", selling_price_vnd=5000
    ),
]


class StaticCatalog:
    def list_active_products(self, shop_id):
        return CATALOG


@pytest.fixture(scope="module")
def service() -> DraftService:
    return DraftService(build_chat_model(app_config), StaticCatalog())


def matched(draft) -> list[tuple[int | None, float]]:
    return sorted(
        ((item.product_id, item.qty) for item in draft.items),
        key=lambda pair: (pair[0] is None, pair[0] or 0),
    )


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("bán 2 cà phê sữa", [(12, 2)]),
        ("ban hai cf sua voi 1 banh mi", [(12, 2), (20, 1)]),
        ("3 ly cafe den", [(13, 3)]),
        ("ban 5 goi mi hao hao", [(30, 5)]),
        ("1 chai aquafina, 2 bm thit", [(20, 2), (21, 1)]),
        ("bán 2 cà fê sửa 30k", [(12, 2)]),
    ],
)
def test_sale_text_maps_to_catalog_products(service, text, expected) -> None:
    draft = service.parse(1, "SALE", text)

    assert matched(draft) == expected
    assert draft.warnings == []
    for item in draft.items:
        product = next(p for p in CATALOG if p.id == item.product_id)
        assert item.unit_price == product.selling_price_vnd
    assert draft.model and draft.model_version


def test_ambiguous_sale_is_not_chosen(service) -> None:
    draft = service.parse(1, "SALE", "ban 2 ly ca phe")

    assert [item.product_id for item in draft.items] == [None]
    assert draft.warnings


def test_unknown_product_stays_open(service) -> None:
    draft = service.parse(1, "SALE", "ban 1 lon bia tiger")

    assert [item.product_id for item in draft.items] == [None]
    assert draft.items[0].unit_price is None
    assert draft.warnings


@pytest.mark.parametrize(
    ("text", "amounts"),
    [
        ("trả tiền điện 350k", [350000]),
        ("tra tien nuoc 120 nghin", [120000]),
        ("mua da 50k, tien rac 30k", [30000, 50000]),
        ("chi 1 triệu 2 tiền thuê mặt bằng", [1200000]),
    ],
)
def test_expense_text_maps_to_amounts(service, text, amounts) -> None:
    draft = service.parse(1, "EXPENSE", text)

    assert sorted(item.unit_price for item in draft.items) == amounts
    assert all(item.product_id is None and item.qty == 1 for item in draft.items)
    assert draft.warnings == []


def test_expense_without_amount_warns(service) -> None:
    draft = service.parse(1, "EXPENSE", "mua them bao nilon")

    assert [item.unit_price for item in draft.items] == [None]
    assert draft.warnings
