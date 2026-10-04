import json
import re
from dataclasses import dataclass

from langchain.tools import ToolRuntime, tool
from langchain_core.tools import BaseTool

from src.agent.sql_executor import ReadOnlySqlExecutor
from src.prompt_templates import QUERY_RESULT_HEADER

# The guard and the executor raise ValueError("CODE: reason") for a query the model can
# fix. Any other ValueError is a bug and must not reach the model.
MODEL_ERROR = re.compile(r"([A-Z][A-Z_]*): (.*)", re.DOTALL)


@dataclass(frozen=True)
class AgentContext:
    """Scope of one chat request, injected into tools instead of chosen by the model."""

    user_id: int
    shop_id: int
    conversation_id: int | None = None


class AgentTools:
    """Tools of the shop assistant, one method per tool.

    `runtime` is filled by LangChain from the invocation context and is not part of the
    schema sent to the model, so the model only supplies its text argument and cannot
    pick a shop or a conversation.
    """

    def __init__(self, sql_executor: ReadOnlySqlExecutor | None = None) -> None:
        self.sql_executor = sql_executor

    def get_all_tools(self) -> list[BaseTool]:
        if self.sql_executor is None:
            return []
        # `tool` wraps the bound methods here: decorating them in the class body would
        # put `self` into the schema sent to the model.
        return [tool(self.query_shop_data)]

    def query_shop_data(self, sql: str, runtime: ToolRuntime[AgentContext]) -> str:
        """Run one read-only SELECT on the shop's views. Returns JSON or Error[CODE]."""
        # A rejected or failed query goes back to the model as text so it can rewrite
        # the query. Anything else, such as an unreachable reader database, propagates
        # and the router answers 503 ai_unavailable.
        try:
            result = self.sql_executor.run(runtime.context.shop_id, sql)
        except ValueError as error:
            match = MODEL_ERROR.fullmatch(str(error))
            if match is None:
                raise
            code, reason = match.groups()
            return f"Error[{code}]: {reason}. Rewrite the query and retry."
        payload = {
            "columns": result["columns"],
            "rows": result["rows"],
            "row_count": len(result["rows"]),
            "truncated": result["truncated"],
        }
        return f"{QUERY_RESULT_HEADER}\n{json.dumps(payload, ensure_ascii=False)}"
