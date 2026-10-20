"""Every prompt the AI service sends to a model, one module per purpose."""

from src.prompt_templates.app_guide import APP_GUIDE_PROMPT
from src.prompt_templates.calculation import (
    CALC_PROMPT,
    CALC_RESULT_HEADER,
    RUN_CODE_PROMPT,
)
from src.prompt_templates.draft_parse import (
    DRAFT_EMPTY_CATALOG,
    DRAFT_EXPENSE_INPUT,
    DRAFT_EXPENSE_PROMPT,
    DRAFT_SALE_INPUT,
    DRAFT_SALE_PROMPT,
)
from src.prompt_templates.memory import (
    MEMORY_CONTEXT,
    MEMORY_EXTRACT_INPUT,
    MEMORY_EXTRACT_PROMPT,
    MEMORY_PROMPT,
    MEMORY_RECONCILE_INPUT,
    MEMORY_RECONCILE_PROMPT,
    MEMORY_SUMMARY_INPUT,
    MEMORY_SUMMARY_PROMPT,
)
from src.prompt_templates.restock import (
    RESTOCK_PROMPT,
    RESTOCK_RESULT_HEADER,
)
from src.prompt_templates.shop_agent import CURRENT_TIME, SHOP_AGENT_SYSTEM_PROMPT
from src.prompt_templates.sql_agent import (
    QUERY_RESULT_HEADER,
    SQL_AGENT_PROMPT,
)

__all__ = [
    "APP_GUIDE_PROMPT",
    "CALC_PROMPT",
    "CALC_RESULT_HEADER",
    "CURRENT_TIME",
    "DRAFT_EMPTY_CATALOG",
    "DRAFT_EXPENSE_INPUT",
    "DRAFT_EXPENSE_PROMPT",
    "DRAFT_SALE_INPUT",
    "DRAFT_SALE_PROMPT",
    "MEMORY_CONTEXT",
    "MEMORY_EXTRACT_INPUT",
    "MEMORY_EXTRACT_PROMPT",
    "MEMORY_PROMPT",
    "MEMORY_RECONCILE_INPUT",
    "MEMORY_RECONCILE_PROMPT",
    "MEMORY_SUMMARY_INPUT",
    "MEMORY_SUMMARY_PROMPT",
    "QUERY_RESULT_HEADER",
    "RESTOCK_PROMPT",
    "RESTOCK_RESULT_HEADER",
    "RUN_CODE_PROMPT",
    "SHOP_AGENT_SYSTEM_PROMPT",
    "SQL_AGENT_PROMPT",
]
