"""Run settings read from environment variables, plus the guards that stop a run
from writing to or overloading the wrong environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlparse

TARGET_ENVS = ("local", "staging", "production")
PROFILES = ("manual", "smoke", "load", "stress", "spike", "soak")


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else default


def _float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    return float(raw) if raw else default


def _flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes")


@dataclass(frozen=True)
class Settings:
    target_env: str
    profile: str
    auth_mode: str
    firebase_api_key: str
    accounts_file: str
    tokens_file: str
    think_min: float
    think_max: float
    writes: bool
    chat_users: int
    chat_max: int
    confirm_host: str
    allow_production_stress: bool


def load() -> Settings:
    return Settings(
        target_env=os.getenv("TARGET_ENV", "").strip().lower(),
        profile=os.getenv("LOAD_PROFILE", "manual").strip().lower(),
        auth_mode=os.getenv("AUTH_MODE", "firebase").strip().lower(),
        firebase_api_key=os.getenv("FIREBASE_API_KEY", "").strip(),
        accounts_file=os.getenv("ACCOUNTS_FILE", "accounts.csv"),
        tokens_file=os.getenv("TOKENS_FILE", "tokens.txt"),
        # A real OWNER taps every few seconds; Locust users without think time
        # send far more requests than the same number of people would.
        think_min=_float("THINK_MIN_SECONDS", 3),
        think_max=_float("THINK_MAX_SECONDS", 10),
        writes=_flag("LOADTEST_WRITES"),
        chat_users=_int("CHAT_USERS", 0),
        chat_max=_int("CHAT_MAX_REQUESTS", 0),
        confirm_host=os.getenv("LOADTEST_CONFIRM_HOST", "").strip(),
        allow_production_stress=_flag("LOADTEST_ALLOW_PRODUCTION_STRESS"),
    )


def check(settings: Settings, host: str | None) -> list[str]:
    """Return the reasons this run must not start; empty means it may start."""
    problems: list[str] = []
    if settings.target_env not in TARGET_ENVS:
        problems.append(f"TARGET_ENV must be one of {', '.join(TARGET_ENVS)}")
    if settings.profile not in PROFILES:
        problems.append(f"LOAD_PROFILE must be one of {', '.join(PROFILES)}")
    if settings.auth_mode not in ("firebase", "static"):
        problems.append("AUTH_MODE must be firebase or static")
    if settings.auth_mode == "firebase" and not settings.firebase_api_key:
        problems.append("FIREBASE_API_KEY is required when AUTH_MODE=firebase")
    if settings.think_min < 0 or settings.think_max < settings.think_min:
        problems.append("THINK_MIN_SECONDS/THINK_MAX_SECONDS must satisfy 0 <= min <= max")
    if settings.chat_users > 0 and settings.chat_max <= 0:
        problems.append("CHAT_USERS > 0 needs CHAT_MAX_REQUESTS > 0 to cap model spend")
    if not host:
        problems.append("set the Core base URL with --host")
        return problems

    parsed = urlparse(host)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        problems.append(f"--host must be an http(s) URL, got {host!r}")
    if settings.target_env == "local" and parsed.hostname not in ("localhost", "127.0.0.1"):
        problems.append("TARGET_ENV=local only allows localhost or 127.0.0.1")

    if settings.target_env == "production":
        # Production holds real shops: never write, never call the model, and make
        # the operator type the host so a copied command cannot hit it by accident.
        if settings.confirm_host != host.rstrip("/"):
            problems.append("production needs LOADTEST_CONFIRM_HOST set to the exact --host value")
        if settings.writes:
            problems.append("LOADTEST_WRITES is not allowed on production")
        if settings.chat_users > 0:
            problems.append("CHAT_USERS is not allowed on production")
        if settings.profile in ("stress", "spike") and not settings.allow_production_stress:
            problems.append(
                "stress/spike on production needs LOADTEST_ALLOW_PRODUCTION_STRESS=yes;"
                " run them on a production-like environment instead"
            )
    return problems
