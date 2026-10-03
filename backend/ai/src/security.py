import hmac
from typing import Annotated

from fastapi import Header, HTTPException

from src.app_config import app_config


def require_internal_token(
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    # Fails closed: an unconfigured token rejects every internal request instead of
    # serving it, so a forgotten secret on staging cannot expose shop data.
    expected = app_config.INTERNAL_API_TOKEN
    if expected is None or not expected.strip():
        raise HTTPException(status_code=401, detail="unauthorized")
    supplied = x_internal_token or ""
    # Compare bytes so a non-ASCII header value cannot raise UnicodeEncodeError.
    if not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="unauthorized")
