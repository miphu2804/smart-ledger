"""Every prompt the AI service sends to a model, one module per purpose."""

from src.prompt_templates.chat_summary import (
    CHAT_SUMMARY_CONTEXT,
    CHAT_SUMMARY_EMPTY,
    CHAT_SUMMARY_INPUT,
    CHAT_SUMMARY_PROMPT,
)
from src.prompt_templates.restock import RESTOCK_PROMPT, RESTOCK_RESULT_HEADER
from src.prompt_templates.shop_agent import SHOP_AGENT_SYSTEM_PROMPT
from src.prompt_templates.sql_agent import QUERY_RESULT_HEADER, SQL_AGENT_PROMPT

__all__ = [
    "CHAT_SUMMARY_CONTEXT",
    "CHAT_SUMMARY_EMPTY",
    "CHAT_SUMMARY_INPUT",
    "CHAT_SUMMARY_PROMPT",
    "QUERY_RESULT_HEADER",
    "RESTOCK_PROMPT",
    "RESTOCK_RESULT_HEADER",
    "SHOP_AGENT_SYSTEM_PROMPT",
    "SQL_AGENT_PROMPT",
]
