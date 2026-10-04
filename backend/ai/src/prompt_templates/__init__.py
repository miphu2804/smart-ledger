"""Every prompt the AI service sends to a model, one module per purpose."""

from src.prompt_templates.shop_agent import SHOP_AGENT_SYSTEM_PROMPT
from src.prompt_templates.sql_agent import QUERY_RESULT_HEADER, SQL_AGENT_PROMPT

__all__ = [
    "QUERY_RESULT_HEADER",
    "SHOP_AGENT_SYSTEM_PROMPT",
    "SQL_AGENT_PROMPT",
]
