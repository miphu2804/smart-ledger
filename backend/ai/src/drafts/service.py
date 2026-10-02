from uuid import uuid4

from langchain_core.language_models import BaseChatModel

from src.drafts.catalog import CatalogProduct, ProductCatalogRepository
from src.drafts.schemas import (
    DraftItem,
    DraftMode,
    DraftView,
    DraftWarning,
    LlmDraft,
    LlmDraftItem,
)
from src.prompt_templates import DRAFT_SYSTEM_PROMPT

MIN_CONFIDENCE = 0.7


def resolve_items(
    mode: DraftMode,
    llm_items: list[LlmDraftItem],
    products: list[CatalogProduct],
) -> tuple[list[DraftItem], list[DraftWarning]]:
    """Trust only catalog data for SALE items; unmatched items stay unresolved."""
    catalog = {product.id: product for product in products}
    items: list[DraftItem] = []
    warnings: list[DraftWarning] = []

    for index, llm_item in enumerate(llm_items):
        unresolved = DraftItem(
            product_id=None,
            name=llm_item.name,
            qty=llm_item.qty,
            unit_price=None,
            confidence=llm_item.confidence,
        )
        if mode == "EXPENSE":
            items.append(
                unresolved.model_copy(
                    update={"qty": 1, "unit_price": llm_item.amount_vnd}
                )
            )
            if llm_item.amount_vnd is None:
                warnings.append(DraftWarning(code="AMOUNT_MISSING", item_index=index))
            continue

        product = catalog.get(llm_item.product_id)
        if llm_item.confidence < MIN_CONFIDENCE:
            items.append(unresolved)
            warnings.append(DraftWarning(code="PRODUCT_AMBIGUOUS", item_index=index))
        elif product is None:
            items.append(unresolved)
            warnings.append(DraftWarning(code="PRODUCT_NOT_FOUND", item_index=index))
        else:
            items.append(
                unresolved.model_copy(
                    update={
                        "product_id": product.id,
                        "name": product.name,
                        "unit_price": product.selling_price_vnd,
                    }
                )
            )

    return items, warnings


class DraftService:
    def __init__(
        self,
        model: BaseChatModel | None,
        catalog: ProductCatalogRepository,
    ) -> None:
        self.model = model
        self.catalog = catalog

    def parse(self, shop_id: int, mode: DraftMode, text: str) -> DraftView:
        if self.model is None:
            raise RuntimeError("draft model unavailable")

        products = self.catalog.list_active_products(shop_id) if mode == "SALE" else []
        system_prompt = DRAFT_SYSTEM_PROMPT.format(
            mode=mode,
            shop_id=shop_id,
            catalog_lines="\n".join(f"{p.id} | {p.name} | {p.unit}" for p in products),
        )
        llm_draft = self.model.with_structured_output(LlmDraft).invoke(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ]
        )
        items, warnings = resolve_items(mode, llm_draft.items, products)
        if not items:
            warnings.append(DraftWarning(code="NO_ITEMS"))

        model_name = getattr(self.model, "model_name", "")
        return DraftView(
            request_id=str(uuid4()),
            transcript=text,
            mode=mode,
            items=items,
            warnings=warnings,
            model=model_name,
            model_version=model_name,
        )
