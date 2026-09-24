from dataclasses import dataclass

from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel

from src.agent.prompt_template import SHOP_AGENT_SYSTEM_PROMPT
from src.agent.repository import AgentConversationRepository
from src.agent.tools import get_all_tools


@dataclass(frozen=True)
class AgentChatResult:
    conversation_id: int
    message_id: int
    answer: str
    model: str
    model_version: str


class AgentService:
    context_message_limit = 20

    def __init__(
        self,
        model: BaseChatModel | None,
        conversations: AgentConversationRepository,
    ) -> None:
        self.model = model
        self.conversations = conversations
        self.agent = (
            create_agent(model=model, tools=get_all_tools())
            if model is not None
            else None
        )

    def chat(
        self,
        user_id: int,
        shop_id: int,
        message: str,
        conversation_id: int | None = None,
    ) -> AgentChatResult:
        if self.agent is None or self.model is None:
            raise RuntimeError("agent model unavailable")

        history = (
            self.conversations.recent_messages(
                conversation_id,
                user_id,
                shop_id,
                self.context_message_limit,
            )
            if conversation_id is not None
            else []
        )
        result = self.agent.invoke(
            {
                "messages": [
                    {
                        "role": "system",
                        "content": SHOP_AGENT_SYSTEM_PROMPT.format(shop_id=shop_id),
                    },
                    *[
                        {"role": entry["role"].lower(), "content": entry["content"]}
                        for entry in history
                    ],
                    {"role": "user", "content": message},
                ],
            }
        )
        last = result["messages"][-1]
        model_name = getattr(self.model, "model_name", "")
        version = (getattr(last, "response_metadata", None) or {}).get(
            "model_name", model_name
        )
        saved_conversation_id, message_id = self.conversations.save_exchange(
            user_id=user_id,
            shop_id=shop_id,
            conversation_id=conversation_id,
            user_message=message,
            assistant_message=last.text,
        )
        return AgentChatResult(
            conversation_id=saved_conversation_id,
            message_id=message_id,
            answer=last.text,
            model=model_name,
            model_version=version,
        )

    def list_conversations(self, user_id: int, shop_id: int) -> list[dict]:
        return self.conversations.list_conversations(user_id, shop_id)

    def get_conversation(
        self, conversation_id: int, user_id: int, shop_id: int
    ) -> dict:
        return self.conversations.get_conversation(conversation_id, user_id, shop_id)

    def rename_conversation(
        self, conversation_id: int, user_id: int, shop_id: int, title: str
    ) -> dict:
        return self.conversations.rename_conversation(
            conversation_id, user_id, shop_id, title
        )

    def delete_conversation(
        self, conversation_id: int, user_id: int, shop_id: int
    ) -> None:
        self.conversations.delete_conversation(conversation_id, user_id, shop_id)
