import asyncio
import logging
from dataclasses import dataclass

from pydantic_ai import Agent, UnexpectedModelBehavior, UsageLimitExceeded, UsageLimits
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models import Model

from src.agent.guardrails import (
    EMPTY_ANSWER_REPLY,
    INPUT_TOO_LONG_REPLY,
    GuardrailLimits,
    ToolCallLimit,
    redact_input,
    screen_answer,
)
from src.agent.repository import AgentConversationRepository
from src.agent.tools import AgentContext, build_restock_tool, build_shop_data_tool
from src.prompt_templates import (
    RESTOCK_PROMPT,
    SHOP_AGENT_SYSTEM_PROMPT,
    SQL_AGENT_PROMPT,
)
from src.restock.service import RestockService
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
    """One chat turn: load recent history, run the agent, persist the reply."""

    def __init__(
        self,
        model: Model | None,
        conversations: AgentConversationRepository,
        guardrail_limits: GuardrailLimits,
        sql_executor: ReadOnlySqlExecutor | None = None,
        restock: RestockService | None = None,
        history_turns: int = 100,
    ) -> None:
        self.model_name = model.model_name if model is not None else ""
        self.conversations = conversations
        self.limits = guardrail_limits
        # Each turn stores the owner's message and the reply, so a turn is two messages.
        self.history_messages = 2 * history_turns
        self.usage_limits = UsageLimits(request_limit=guardrail_limits.model_call_limit)
        # The instructions are static so providers can cache them; the shop scope
        # arrives per request through AgentContext and never appears in the prompt.
        # Each optional capability adds its own tool and prompt section.
        tools = []
        prompt_parts = [SHOP_AGENT_SYSTEM_PROMPT]
        if sql_executor is not None:
            tools.append(build_shop_data_tool(sql_executor))
            prompt_parts.append(SQL_AGENT_PROMPT)
        if restock is not None:
            tools.append(build_restock_tool(restock))
            prompt_parts.append(RESTOCK_PROMPT)
        self.agent = (
            Agent(
                model,
                deps_type=AgentContext,
                instructions="\n\n".join(prompt_parts),
                tools=tools,
                # Pydantic AI ends the run on a tool's second invalid call by default;
                # the request limit already bounds the run, so it bounds retries too.
                retries=guardrail_limits.model_call_limit,
                # The limits arrive from the composition root, so this module reads no
                # global settings and guardrails cannot be switched off by a caller.
                capabilities=[ToolCallLimit(guardrail_limits.tool_call_limit)],
            )
            if model is not None
            else None
        )

    async def chat(
        self,
        user_id: int,
        shop_id: int,
        message: str,
        conversation_id: int | None = None,
    ) -> AgentChatResult:
        if self.agent is None:
            raise RuntimeError("agent model unavailable")

        # Read first, so a conversation outside the owner's scope fails before any model
        # call. Owners rarely reach the window, so it bounds the prompt for the odd long
        # conversation without summarizing anything.
        history = (
            await asyncio.to_thread(
                self.conversations.recent_messages,
                conversation_id,
                user_id,
                shop_id,
                self.history_messages,
            )
            if conversation_id is not None
            else []
        )
        # Stored as the model sees it, so a pasted key is not replayed with the history
        # on later turns.
        question = redact_input(message)
        if len(message) > self.limits.max_input_chars:
            answer = INPUT_TOO_LONG_REPLY.format(limit=self.limits.max_input_chars)
            version = self.model_name
        else:
            answer, version = await self._answer(
                question, history, AgentContext(user_id=user_id, shop_id=shop_id)
            )
        saved_conversation_id, message_id = await asyncio.to_thread(
            self.conversations.save_exchange,
            user_id=user_id,
            shop_id=shop_id,
            conversation_id=conversation_id,
            user_message=question,
            assistant_message=answer,
        )
        return AgentChatResult(
            conversation_id=saved_conversation_id,
            message_id=message_id,
            answer=answer,
            model=self.model_name,
            model_version=version,
        )

    async def _answer(
        self, question: str, history: list[dict], context: AgentContext
    ) -> tuple[str, str]:
        """Run the agent; return the screened answer and the model version."""
        try:
            result = await self.agent.run(
                question,
                message_history=self._model_messages(history),
                deps=context,
                usage_limits=self.usage_limits,
            )
        except (UsageLimitExceeded, UnexpectedModelBehavior) as error:
            # The model used up its requests or gave no usable answer. Provider errors
            # are neither, so they still propagate and the router answers 503.
            logger.warning("agent run ended without an answer: %s", error)
            return EMPTY_ANSWER_REPLY, self.model_name
        return screen_answer(
            result.output
        ), result.response.model_name or self.model_name

    @staticmethod
    def _model_messages(history: list[dict]) -> list[ModelMessage]:
        # History follows verbatim; the agent adds the instructions to the new request.
        return [
            ModelRequest(parts=[UserPromptPart(entry["content"])])
            if entry["role"] == "USER"
            else ModelResponse(parts=[TextPart(entry["content"])])
            for entry in history
        ]
