from dataclasses import dataclass

from langchain.tools import ToolRuntime, tool
from langchain_core.tools import BaseTool

from src.agent.history_search import NO_MATCH, format_clusters, search_messages
from src.agent.repository import AgentConversationRepository


@dataclass(frozen=True)
class AgentContext:
    """Scope of one chat request, injected into tools instead of chosen by the model."""

    user_id: int
    shop_id: int
    conversation_id: int | None = None


def get_all_tools(conversations: AgentConversationRepository) -> list[BaseTool]:
    @tool
    def search_chat_history(query: str, runtime: ToolRuntime[AgentContext]) -> str:
        """Search earlier messages that the memory summary only condenses.

        Use it when the user refers to an exact figure, name, date or wording that the
        memory summary does not state. Query with key words, for example a customer
        name and the item.
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
