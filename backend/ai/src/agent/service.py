from dataclasses import dataclass

from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool

from src.agent.guardrails import GuardrailLimits, build_guardrails, latest_human
from src.agent.repository import AgentConversationRepository
from src.agent.tools import AgentContext, build_restock_tools, build_shop_data_tools
from src.prompt_templates import (
    RESTOCK_PROMPT,
    SHOP_AGENT_SYSTEM_PROMPT,
    SQL_AGENT_PROMPT,
)
from src.restock.service import RestockService
from src.sql.executor import ReadOnlySqlExecutor


@dataclass(frozen=True)
class AgentChatResult:
    conversation_id: int
    message_id: int
    answer: str
    model: str
    model_version: str


class AgentService:
    """One chat turn: load recent history, run the agent, persist the reply."""

    def __init__(
        self,
        model: BaseChatModel | None,
        conversations: AgentConversationRepository,
        guardrail_limits: GuardrailLimits,
        sql_executor: ReadOnlySqlExecutor | None = None,
        restock: RestockService | None = None,
        history_turns: int = 100,
    ) -> None:
        self.model = model
        self.conversations = conversations
        # Each turn stores the owner's message and the reply, so a turn is two messages.
        self.history_messages = 2 * history_turns
        tools: list[BaseTool] = []
        # The system prompt is static so providers can cache it; the shop scope arrives
        # per request through AgentContext and never appears in the prompt. Each
        # optional capability appends its own tool and prompt section.
        prompt_parts = [SHOP_AGENT_SYSTEM_PROMPT]
        if sql_executor is not None:
            tools = [*tools, *build_shop_data_tools(sql_executor)]
            prompt_parts.append(SQL_AGENT_PROMPT)
        if restock is not None:
            tools = [*tools, *build_restock_tools(restock)]
            prompt_parts.append(RESTOCK_PROMPT)
        system_prompt = "\n\n".join(prompt_parts)
        self.agent = (
            create_agent(
                model=model,
                tools=tools,
                system_prompt=system_prompt,
                context_schema=AgentContext,
                # The limits arrive from the composition root, so this module reads no
                # global settings and guardrails cannot be switched off by a caller.
                middleware=build_guardrails(guardrail_limits),
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

        # Owners rarely reach the window, so it bounds the prompt for the odd long
        # conversation without summarizing anything.
        history = (
            self.conversations.recent_messages(
                conversation_id, user_id, shop_id, self.history_messages
            )
            if conversation_id is not None
            else []
        )
        result = self.agent.invoke(
            {"messages": self._context_messages(history, message)},
            context=AgentContext(user_id=user_id, shop_id=shop_id),
        )
        last = result["messages"][-1]
        # Store the owner's message as the model saw it, after secret redaction, so a
        # pasted key is not replayed to the model with the history on later turns.
        sent = latest_human(result["messages"])
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
    def _context_messages(history: list[dict], message: str) -> list[dict]:
        # The static system prompt is added by the agent; history follows verbatim.
        return [
            *(
                {"role": entry["role"].lower(), "content": entry["content"]}
                for entry in history
            ),
            {"role": "user", "content": message},
        ]
