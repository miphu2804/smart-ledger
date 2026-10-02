import json
from dataclasses import dataclass

from langchain.agents.middleware import ToolCallRequest
from langchain.tools import ToolRuntime, tool
from langchain_core.tools import BaseTool

from src.agent.history_search import NO_MATCH, format_clusters, search_messages
from src.agent.repository import AgentConversationRepository
from src.prompt_templates import QUERY_RESULT_HEADER
from src.sql.executor import ReadOnlySqlExecutor, SqlQueryError, SqlResult
from src.sql.guard import UnsafeSqlError


@dataclass(frozen=True)
class AgentContext:
    """Scope of one chat request, injected into tools instead of chosen by the model."""

    user_id: int
    shop_id: int
    conversation_id: int | None = None


def get_all_tools(conversations: AgentConversationRepository) -> list[BaseTool]:
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


def build_tools(executor: ReadOnlySqlExecutor) -> list[BaseTool]:
    """Shop-data tools; the executor is injected here, the shop comes per request.

    `runtime` is filled by LangChain from the invocation context and is not part of the
    schema sent to the model, so the model only supplies `sql` and cannot pick a shop.
    """

    @tool("query_shop_data")
    def query_shop_data(sql: str, runtime: ToolRuntime[AgentContext]) -> str:
        """Run one read-only SELECT on the shop's views. Returns JSON or Error[CODE]."""
        # UnsafeSqlError and SqlQueryError go back to the model through
        # ToolErrorMiddleware (see tool_error_message); SqlUnavailableError fails the
        # turn as ai_unavailable.
        return format_sql_result(executor.run(runtime.context.shop_id, sql))

    return [query_shop_data]


def format_sql_result(result: SqlResult) -> str:
    payload = {
        "columns": result.columns,
        "rows": result.rows,
        "row_count": len(result.rows),
        "truncated": result.truncated,
    }
    return f"{QUERY_RESULT_HEADER}\n{json.dumps(payload, ensure_ascii=False)}"


def tool_error_message(error: Exception, request: ToolCallRequest) -> str | None:
    """Turn a rejected or failed query into text the model can act on.

    Returns None for anything else, which lets the error propagate and fail the turn,
    so connection details or stack traces never reach the model.
    """
    if isinstance(error, UnsafeSqlError):
        return f"Error[{error.code}]: {error.detail}. Rewrite the query and retry."
    if isinstance(error, SqlQueryError):
        return f"Error[{error.code}]: {error.message}. Rewrite the query and retry."
    return None
