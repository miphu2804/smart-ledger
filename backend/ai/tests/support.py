"""Shared data for the AI tests."""

import re
from pathlib import Path

import psycopg

from src.agent.guardrails import GuardrailLimits

# Guardrails stay enabled in tests; these limits are wide enough not to change any case
# that does not target them. Guardrail tests pass their own small limits instead.
TEST_GUARDRAIL_LIMITS = GuardrailLimits(
    max_input_chars=100_000, model_call_limit=100, tool_call_limit=100
)

REPO_ROOT = Path(__file__).resolve().parents[3]
CORE_MIGRATIONS = REPO_ROOT / "backend/core/src/main/resources/db/migration"
# The Core tables the AI baseline reads (users, shops, catalog and sales).
CORE_MIGRATION_FILES = [
    "V1__create_auth_and_shops.sql",
    "V2__add_shop_archive.sql",
    "V3__add_shop_inactive_reason.sql",
    "V4__create_catalog_and_paid_sales.sql",
]
AI_BASELINE = REPO_ROOT / "supabase/migrations/20261005000000_ai_baseline.sql"


def apply_core_migrations(connection: psycopg.Connection) -> None:
    for name in CORE_MIGRATION_FILES:
        connection.execute((CORE_MIGRATIONS / name).read_text(), prepare=False)


def apply_ai_baseline(connection: psycopg.Connection, view_schema: str) -> None:
    # The views go to a per-test schema so parallel runs and a developer's real
    # `ai_read` schema are never touched; the role name is shared across the cluster.
    text = re.sub(r"\bai_read\b", view_schema, AI_BASELINE.read_text())
    connection.execute(text, prepare=False)
