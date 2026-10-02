import logging
from dataclasses import dataclass

from langchain.agents import create_agent
from langchain.agents.middleware import ToolCallLimitMiddleware
from langchain_core.language_models import BaseChatModel

from src.agent.prompt_template import (
    CHAT_SUMMARY_CONTEXT,
    CHAT_SUMMARY_EMPTY,
    CHAT_SUMMARY_INPUT,
    CHAT_SUMMARY_PROMPT,
    SHOP_AGENT_SYSTEM_PROMPT,
)
from src.agent.repository import AgentConversationRepository, ConversationNotFoundError
from src.agent.summary import plan_fold
from src.agent.tools import AgentContext, build_tools, get_all_tools
from src.sql.executor import ReadOnlySqlExecutor
from src.sql.schema_prompt import SQL_AGENT_PROMPT

logger = logging.getLogger(__name__)

# Tool calls per chat turn; further calls are refused and the model has to answer.
MAX_TOOL_CALLS = 3
# Graph steps per turn, a backstop in case the model keeps calling refused tools.
RECURSION_LIMIT = 25


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
    ) -> None:
        self.model = model
        self.summary_model = summary_model
        self.conversations = conversations
        self.sql_executor = sql_executor

    def _build_agent(self, shop_id: int):
        # Built per request so the shop-data tool closes over this request's shop.
        tools = get_all_tools(self.conversations)
        if self.sql_executor is not None:
            tools = [*tools, *build_tools(shop_id, self.sql_executor)]
        return create_agent(
            model=self.model,
            tools=tools,
            context_schema=AgentContext,
            middleware=[ToolCallLimitMiddleware(run_limit=MAX_TOOL_CALLS)],
        )

    def chat(
        self,
        user_id: int,
        shop_id: int,
        message: str,
        conversation_id: int | None = None,
    ) -> AgentChatResult:
        if self.model is None:
            raise RuntimeError("agent model unavailable")

        context = (
            self.conversations.context_for(conversation_id, user_id, shop_id)
            if conversation_id is not None
            else {"summary": None, "messages": []}
        )
        result = self._build_agent(shop_id).invoke(
            {"messages": self._context_messages(context, message)},
            context=AgentContext(
                user_id=user_id, shop_id=shop_id, conversation_id=conversation_id
            ),
            config={"recursion_limit": RECURSION_LIMIT},
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

    def _context_messages(self, context: dict, message: str) -> list[dict]:
        # Static prompts first so the prefix stays cacheable, then the summary, then
        # every message after the watermark verbatim, so a fold that has not run yet
        # never hides messages from the model.
        messages: list[dict] = [
            {
                "role": "system",
                "content": SHOP_AGENT_SYSTEM_PROMPT,
            }
        ]
        if self.sql_executor is not None:
            messages.append({"role": "system", "content": SQL_AGENT_PROMPT})
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
