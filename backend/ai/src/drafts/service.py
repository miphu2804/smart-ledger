"""Parse an owner's text or transcript into a draft (AI-008, #60).

The service is the only drafts module that does I/O: it reads the shop catalog, asks
the model for proposed lines, and hands both to `matching`, which keeps only lines the
catalog confirms. It never writes a sale, an expense or stock. Every model or catalog
failure becomes `DraftUnavailableError`, so the endpoint (#3) can answer
`503 ai_unavailable` and Core can fall back to manual text or POS entry.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel
from pydantic_ai import Agent, NativeOutput
from pydantic_ai.models import Model

from src.drafts import matching
from src.drafts.catalog import (
    CatalogProduct,
    CatalogUnavailableError,
    ProductCatalogRepository,
)
from src.drafts.matching import DraftItem, ProposedLine
from src.prompt_templates import (
    DRAFT_EMPTY_CATALOG,
    DRAFT_EXPENSE_INPUT,
    DRAFT_EXPENSE_PROMPT,
    DRAFT_SALE_INPUT,
    DRAFT_SALE_PROMPT,
)

logger = logging.getLogger(__name__)

DraftMode = Literal["SALE", "EXPENSE"]


class DraftUnavailableError(Exception):
    """The draft could not be built; the caller falls back to manual entry."""


class DraftLineOutput(BaseModel):
    """Structured output schema of one proposed line."""

    text: str
    qty: float
    product_id: int | None
    confidence: float
    ambiguous: bool
    amount_vnd: int | None


class DraftOutput(BaseModel):
    """Structured output schema the model must return."""

    lines: list[DraftLineOutput]


@dataclass(frozen=True)
class DraftResult:
    """`DraftView` without `request_id`, which the endpoint assigns."""

    transcript: str
    mode: DraftMode
    items: list[DraftItem]
    warnings: list[str]
    model: str
    model_version: str


class DraftService:
    """Build a SALE or EXPENSE draft for one shop already authenticated by Core."""

    def __init__(self, model: Model | None, catalog: ProductCatalogRepository) -> None:
        self.model_name = model.model_name if model is not None else ""
        self.catalog = catalog
        # Native structured output: the provider constrains the reply to the schema,
        # like the JSON-schema mode the parser used before.
        self.agent = (
            Agent(model, output_type=NativeOutput(DraftOutput))
            if model is not None
            else None
        )

    async def parse(self, shop_id: int, mode: DraftMode, text: str) -> DraftResult:
        """Return the draft for `text`; nothing is saved or confirmed."""
        if self.agent is None:
            raise DraftUnavailableError("draft model unavailable")
        products = await self._load_catalog(shop_id) if mode == "SALE" else []
        lines, version = await self._propose(mode, text, products)
        result = (
            matching.match_sale(lines, products)
            if mode == "SALE"
            else matching.match_expense(lines)
        )
        logger.info(
            "draft parsed: shop=%s mode=%s lines=%d items=%d warnings=%d",
            shop_id,
            mode,
            len(lines),
            len(result.items),
            len(result.warnings),
        )
        return DraftResult(
            transcript=text,
            mode=mode,
            items=result.items,
            warnings=result.warnings,
            model=self.model_name,
            model_version=version,
        )

    async def _load_catalog(self, shop_id: int) -> list[CatalogProduct]:
        try:
            return await asyncio.to_thread(self.catalog.list_active_products, shop_id)
        except CatalogUnavailableError as error:
            raise DraftUnavailableError("catalog unavailable") from error

    async def _propose(
        self, mode: DraftMode, text: str, products: list[CatalogProduct]
    ) -> tuple[list[ProposedLine], str]:
        instructions, user_input = self._prompt(mode, text, products)
        # Output that never fits the schema ends in UnexpectedModelBehavior after the
        # agent's retries, so every model failure takes this one path.
        try:
            result = await self.agent.run(user_input, instructions=instructions)
        except Exception as error:
            logger.warning("draft model failed", exc_info=True)
            raise DraftUnavailableError("draft model failed") from error
        lines = [ProposedLine(**line.model_dump()) for line in result.output.lines]
        return lines, result.response.model_name or self.model_name

    @staticmethod
    def _prompt(
        mode: DraftMode, text: str, products: list[CatalogProduct]
    ) -> tuple[str, str]:
        """Return the instructions and the owner's input for `mode`."""
        if mode == "EXPENSE":
            return DRAFT_EXPENSE_PROMPT, DRAFT_EXPENSE_INPUT.format(text=text)
        catalog = "\n".join(
            f"{product.id} | {product.name} | {product.unit}" for product in products
        )
        return DRAFT_SALE_PROMPT, DRAFT_SALE_INPUT.format(
            catalog=catalog or DRAFT_EMPTY_CATALOG, text=text
        )
