from dataclasses import dataclass
from typing import Any

from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AnyMessage

from src.agent.guardrails import AgentGuardrails, GuardrailLimits
from src.agent.repository import AgentConversationRepository
from src.agent.sql_executor import ReadOnlySqlExecutor
from src.agent.tools import AgentContext, AgentTools
from src.agent.utils import get_latest_human_message
from src.prompt_templates import (
    SHOP_AGENT_SYSTEM_PROMPT,
    SQL_AGENT_PROMPT,
)


@dataclass(frozen=True)
class AgentChatResult:
    conversation_id: int
    message_id: int
    answer: str
    model: str
    model_version: str


class AgentService:
    """One chat turn: load context, run the agent, persist the reply."""

    def __init__(
        self,
        model: BaseChatModel | None,
        conversations: AgentConversationRepository,
        guardrail_limits: GuardrailLimits,
        sql_executor: ReadOnlySqlExecutor | None = None,
    ) -> None:
        self.model = model
        self.conversations = conversations
        tools = AgentTools(sql_executor).get_all_tools()
        # The system prompt is static so providers can cache it; the shop scope arrives
        # per request through AgentContext and never appears in the prompt.
        system_prompt = SHOP_AGENT_SYSTEM_PROMPT
        if sql_executor is not None:
            system_prompt = f"{SHOP_AGENT_SYSTEM_PROMPT}\n\n{SQL_AGENT_PROMPT}"
        self.agent = (
            create_agent(
                model=model,
                tools=tools,
                system_prompt=system_prompt,
                context_schema=AgentContext,
                # The limits arrive from the composition root, so this module reads no
                # global settings and guardrails cannot be switched off by a caller.
                middleware=AgentGuardrails(guardrail_limits).get_all_guardrails(),
            )
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
        if self.agent is None:
            raise RuntimeError("agent model unavailable")

        history = (
            self.conversations.context_for(conversation_id, user_id, shop_id)
            if conversation_id is not None
            else {"messages": []}
        )
        result = self.agent.invoke(
            {"messages": self._build_messages(history, message)},
            context=AgentContext(
                user_id=user_id, shop_id=shop_id, conversation_id=conversation_id
            ),
        )
        last = result["messages"][-1]
        # Store the owner's message as the model saw it, after secret redaction, so a
        # pasted key is not replayed to the model with the history on later turns.
        sent = get_latest_human_message(result["messages"])
        user_message = sent.text if sent is not None and sent.text else message
        model_name = getattr(self.model, "model_name", "")
        version = (getattr(last, "response_metadata", None) or {}).get(
            "model_name", model_name
        )
        saved_conversation_id, message_id = self.conversations.save_exchange(
            user_id=user_id,
            shop_id=shop_id,
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_message=last.text,
        )
        return AgentChatResult(
            conversation_id=saved_conversation_id,
            message_id=message_id,
            answer=last.text,
            model=model_name,
            model_version=version,
        )

    @staticmethod
    def _build_messages(
        history: dict, message: str
    ) -> list[AnyMessage | dict[str, Any]]:
        # The static system prompt is added by the agent; then every stored message,
        # oldest first, then the new one.
        messages: list[AnyMessage | dict[str, Any]] = []
        messages.extend(
            {"role": entry["role"].lower(), "content": entry["content"]}
            for entry in history["messages"]
        )
        messages.append({"role": "user", "content": message})
        return messages
