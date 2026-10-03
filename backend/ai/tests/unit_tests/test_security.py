import pytest
from fastapi import HTTPException

from src.app_config import app_config
from src.security import require_internal_token


def test_configured_token_is_accepted() -> None:
    require_internal_token(app_config.INTERNAL_API_TOKEN)


def test_wrong_token_is_rejected() -> None:
    with pytest.raises(HTTPException) as rejected:
        require_internal_token("not-the-token")

    assert rejected.value.status_code == 401


def test_missing_token_is_rejected() -> None:
    with pytest.raises(HTTPException) as rejected:
        require_internal_token(None)

    assert rejected.value.status_code == 401


def test_blank_configured_token_rejects_everything(monkeypatch) -> None:
    monkeypatch.setattr(app_config, "INTERNAL_API_TOKEN", "   ")

    with pytest.raises(HTTPException) as rejected:
        require_internal_token("   ")

    assert rejected.value.status_code == 401


def test_unconfigured_token_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(app_config, "INTERNAL_API_TOKEN", None)

    with pytest.raises(HTTPException) as rejected:
        require_internal_token("anything")

    assert rejected.value.status_code == 401


def test_non_ascii_token_is_rejected_instead_of_raising() -> None:
    # hmac.compare_digest refuses non-ASCII str, so a caller must not reach it as str.
    with pytest.raises(HTTPException) as rejected:
        require_internal_token("tokén-không-hợp-lệ")

    assert rejected.value.status_code == 401
