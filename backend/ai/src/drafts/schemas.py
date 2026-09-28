from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

DraftText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
DraftMode = Literal["SALE", "EXPENSE"]


class DraftParseRequest(BaseModel):
    shop_id: int = Field(gt=0)
    mode: DraftMode
    text: DraftText


class LlmDraftItem(BaseModel):
    """One line the model extracted; prices and names are re-read from the catalog."""

    product_id: int | None = Field(
        default=None, description="ID from the shop catalog, or null if unsure"
    )
    name: str = Field(description="Item or expense name as the user said it")
    qty: float = Field(default=1, gt=0)
    amount_vnd: int | None = Field(
        default=None, ge=0, description="Only for EXPENSE: amount in VND"
    )
    confidence: float = Field(ge=0, le=1)


class LlmDraft(BaseModel):
    items: list[LlmDraftItem]


class DraftItem(BaseModel):
    product_id: int | None
    name: str
    qty: float
    unit_price: int | None
    confidence: float


DraftWarningCode = Literal[
    "PRODUCT_AMBIGUOUS", "PRODUCT_NOT_FOUND", "AMOUNT_MISSING", "NO_ITEMS"
]


class DraftWarning(BaseModel):
    """Machine-readable warning; the client owns the user-facing wording."""

    code: DraftWarningCode
    item_index: int | None = None


class DraftView(BaseModel):
    request_id: str
    transcript: str
    mode: DraftMode
    items: list[DraftItem]
    warnings: list[DraftWarning]
    model: str
    model_version: str
