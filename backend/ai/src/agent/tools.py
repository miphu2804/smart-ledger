import json
import re
from dataclasses import dataclass

from langchain.tools import ToolRuntime, tool
from langchain_core.tools import BaseTool

from src.agent.history_search import NO_MATCH, format_clusters, search_messages
from src.agent.repository import AgentConversationRepository
from src.prompt_templates import QUERY_RESULT_HEADER
from src.sql.executor import ReadOnlySqlExecutor

# The guard and the executor raise ValueError("CODE: reason") for a query the model can
# fix. Any other ValueError is a bug and must not reach the model.
MODEL_ERROR = re.compile(r"([A-Z][A-Z_]*): (.*)", re.DOTALL)


@dataclass(frozen=True)
class AgentContext:
    """Scope of one chat request, injected into tools instead of chosen by the model."""

    user_id: int
    shop_id: int
    conversation_id: int | None = None


def build_history_tools(conversations: AgentConversationRepository) -> list[BaseTool]:
    @tool
    def search_chat_history(query: str, runtime: ToolRuntime[AgentContext]) -> str:
        """Search earlier messages by key words when the memory lacks an exact detail.

        Query with key words, for example a customer name and an item.
        """
        # The ids come from the request context, never from the model, so a crafted
        # query cannot read another shop's history.
        scope = runtime.context
        if scope.conversation_id is None:
            return NO_MATCH
        messages = conversations.folded_messages(
            scope.conversation_id, scope.user_id, scope.shop_id
        )
        return format_clusters(search_messages(messages, query))

    return [search_chat_history]


def build_shop_data_tools(executor: ReadOnlySqlExecutor) -> list[BaseTool]:
    """Shop-data tools; the executor is injected here, the shop comes per request.

    `runtime` is filled by LangChain from the invocation context and is not part of the
    schema sent to the model, so the model only supplies `sql` and cannot pick a shop.
    """

    @tool("query_shop_data")
    def query_shop_data(sql: str, runtime: ToolRuntime[AgentContext]) -> str:
        """Run one read-only SELECT on the shop's views. Returns JSON or Error[CODE]."""
        # A rejected or failed query goes back to the model as text so it can rewrite
        # the query. Anything else, such as an unreachable reader database, propagates
        # and the router answers 503 ai_unavailable.
        try:
            result = executor.run(runtime.context.shop_id, sql)
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

    return [query_shop_data]
