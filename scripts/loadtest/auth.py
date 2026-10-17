"""Firebase ID tokens for the load-test accounts.

Each account signs in once, then refreshes its token shortly before it expires,
so a long soak run does not hammer Firebase or fail at the one-hour mark. These
calls go through plain `requests`, not the Locust client, so they never appear in
the Core statistics."""

from __future__ import annotations

import csv
import itertools
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests
from gevent.lock import Semaphore

SIGN_IN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
REFRESH_URL = "https://securetoken.googleapis.com/v1/token"
REFRESH_MARGIN_SECONDS = 300
HTTP_TIMEOUT_SECONDS = 15


class AuthError(RuntimeError):
    pass


@dataclass
class Account:
    label: str
    email: str = ""
    password: str = ""
    id_token: str = ""
    refresh_token: str = ""
    expires_at: float = 0.0
    lock: Semaphore = field(default_factory=Semaphore, repr=False)


class TokenPool:
    """Hands out accounts round-robin and keeps each one's token fresh."""

    def __init__(self, accounts: list[Account], api_key: str = "") -> None:
        if not accounts:
            raise AuthError("no load-test accounts configured")
        self._accounts = accounts
        self._next = itertools.cycle(accounts)
        self._api_key = api_key
        self._http = requests.Session()

    @classmethod
    def from_csv(cls, path: str, api_key: str) -> TokenPool:
        file = Path(path)
        if not file.is_file():
            raise AuthError(
                f"{path} not found; copy accounts.example.csv and fill in test accounts"
            )
        with file.open(newline="", encoding="utf-8") as handle:
            rows = [row for row in csv.DictReader(handle) if row.get("email")]
        accounts = [
            Account(label=f"account-{index}", email=row["email"].strip(), password=row["password"])
            for index, row in enumerate(rows, start=1)
        ]
        return cls(accounts, api_key)

    @classmethod
    def from_static_file(cls, path: str) -> TokenPool:
        """Pre-issued tokens, one per line: for a local Core or the Auth emulator."""
        file = Path(path)
        if not file.is_file():
            raise AuthError(f"{path} not found")
        tokens = [line.strip() for line in file.read_text(encoding="utf-8").splitlines()]
        accounts = [
            Account(label=f"token-{index}", id_token=token, expires_at=float("inf"))
            for index, token in enumerate((t for t in tokens if t), start=1)
        ]
        return cls(accounts)

    def __len__(self) -> int:
        return len(self._accounts)

    def next_account(self) -> Account:
        return next(self._next)

    def token(self, account: Account) -> str:
        if time.time() < account.expires_at - REFRESH_MARGIN_SECONDS:
            return account.id_token
        with account.lock:
            # Another user sharing this account may have refreshed it while we waited.
            if time.time() >= account.expires_at - REFRESH_MARGIN_SECONDS:
                if account.refresh_token:
                    self._refresh(account)
                else:
                    self._sign_in(account)
        return account.id_token

    def _sign_in(self, account: Account) -> None:
        response = self._http.post(
            SIGN_IN_URL,
            params={"key": self._api_key},
            json={"email": account.email, "password": account.password, "returnSecureToken": True},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        body = _json(response)
        if response.status_code != 200:
            message = body.get("error", {}).get("message", response.status_code)
            raise AuthError(f"Firebase sign-in failed for {account.label}: {message}")
        account.id_token = body["idToken"]
        account.refresh_token = body["refreshToken"]
        account.expires_at = time.time() + int(body["expiresIn"])

    def _refresh(self, account: Account) -> None:
        response = self._http.post(
            REFRESH_URL,
            params={"key": self._api_key},
            data={"grant_type": "refresh_token", "refresh_token": account.refresh_token},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        body = _json(response)
        if response.status_code != 200:
            # A revoked refresh token falls back to a fresh password sign-in.
            account.refresh_token = ""
            self._sign_in(account)
            return
        account.id_token = body["id_token"]
        account.refresh_token = body["refresh_token"]
        account.expires_at = time.time() + int(body["expires_in"])


def _json(response: requests.Response) -> dict:
    try:
        return response.json()
    except ValueError:
        return {}
