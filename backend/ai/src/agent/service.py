import logging
from collections.abc import Sequence
from dataclasses import dataclass

from langchain.agents import create_agent
from langchain.agents.middleware import AgentMiddleware
from langchain_core.language_models import BaseChatModel

from src.agent.guardrails import build_guardrails, latest_human
from src.agent.repository import AgentConversationRepository, ConversationNotFoundError
from src.agent.summary import plan_fold
from src.agent.tools import AgentContext, build_tools, get_all_tools
from src.app_config import app_config
from src.prompt_templates import (
    CHAT_SUMMARY_CONTEXT,
    CHAT_SUMMARY_EMPTY,
    CHAT_SUMMARY_INPUT,
    CHAT_SUMMARY_PROMPT,
    SHOP_AGENT_SYSTEM_PROMPT,
    SQL_AGENT_PROMPT,
)
from src.sql.executor import ReadOnlySqlExecutor

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AgentChatResult:
    conversation_id: int
    message_id: int
    answer: str
    model: str
    model_version: str


class AgentService:
    def __init__(
        self,
        model: BaseChatModel | None,
        conversations: AgentConversationRepository,
        summary_model: BaseChatModel | None = None,
        sql_executor: ReadOnlySqlExecutor | None = None,
        guardrails: Sequence[AgentMiddleware] | None = None,
    ) -> None:
        self.model = model
        self.summary_model = summary_model
        self.conversations = conversations
        self.sql_executor = sql_executor
        tools = get_all_tools(conversations)
        # The system prompt is static so providers can cache it; the shop scope arrives
        # per request through AgentContext and never appears in the prompt.
        system_prompt = SHOP_AGENT_SYSTEM_PROMPT
        if sql_executor is not None:
            tools = [*tools, *build_tools(sql_executor)]
            system_prompt = f"{SHOP_AGENT_SYSTEM_PROMPT}\n\n{SQL_AGENT_PROMPT}"
        self.agent = (
            create_agent(
                model=model,
                tools=tools,
                system_prompt=system_prompt,
                context_schema=AgentContext,
                middleware=list(
                    build_guardrails(app_config) if guardrails is None else guardrails
                ),
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
        if self.agent is None or self.model is None:
            raise RuntimeError("agent model unavailable")

        context = (
            self.conversations.context_for(conversation_id, user_id, shop_id)
            if conversation_id is not None
            else {"summary": None, "messages": []}
        )
        result = self.agent.invoke(
            {"messages": self._context_messages(context, message)},
            context=AgentContext(
                user_id=user_id, shop_id=shop_id, conversation_id=conversation_id
            ),
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
    def _context_messages(context: dict, message: str) -> list[dict]:
        # The static system prompt is added by the agent; then the summary, then every
        # message after the watermark verbatim, so a fold that has not run yet never
        # hides messages from the model.
        messages: list[dict] = []
        if context["summary"]:
            messages.append(
                {
                    "role": "system",
                    "content": CHAT_SUMMARY_CONTEXT.format(summary=context["summary"]),
                }
            )
        messages.extend(
            {"role": entry["role"].lower(), "content": entry["content"]}
            for entry in context["messages"]
        )
        messages.append({"role": "user", "content": message})
        return messages

    def fold_summary(self, conversation_id: int, user_id: int, shop_id: int) -> bool:
        """Fold messages that left the verbatim window into the stored summary.

        Runs as a background task after the reply was already sent, so it never raises:
        a model or database failure leaves the stored summary untouched, and the next
        turn retries it. Returns whether any fold was persisted.
        """
        if self.summary_model is None:
            return False
        try:
            context = self.conversations.context_for(conversation_id, user_id, shop_id)
        except ConversationNotFoundError:
            # The owner deleted the conversation while this task was queued.
            return False

        plan = plan_fold(context["messages"])
        if not plan.messages:
            return False

        summary = context["summary"]
        watermark = context["summary_through_message_id"]
        folded = False
        for batch in plan.batches:
            rewritten = self._rewrite_summary(summary, batch)
            if rewritten is None:
                break
            batch_through_id = batch[-1]["message_id"]
            if not self.conversations.save_summary(
                conversation_id=conversation_id,
                user_id=user_id,
                shop_id=shop_id,
                summary=rewritten,
                through_id=batch_through_id,
                expected_through_id=watermark,
            ):
                # A concurrent fold advanced the watermark first, so this is stale.
                break
            summary = rewritten
            watermark = batch_through_id
            folded = True
        return folded

    def _rewrite_summary(self, summary: str | None, batch: list[dict]) -> str | None:
        if self.summary_model is None:
            return None
        transcript = "\n".join(
            f"{entry['role']}: {entry['content']}" for entry in batch
        )
        try:
            response = self.summary_model.invoke(
                [
                    {"role": "system", "content": CHAT_SUMMARY_PROMPT},
                    {
                        "role": "user",
                        "content": CHAT_SUMMARY_INPUT.format(
                            summary=summary or CHAT_SUMMARY_EMPTY,
                            messages=transcript,
                        ),
                    },
                ]
            )
        except Exception:
            logger.warning("chat summary model failed", exc_info=True)
            return None
        rewritten = response.text.strip()
        return rewritten or None

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
