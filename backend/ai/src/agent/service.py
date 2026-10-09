import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from pydantic_ai import (
    Agent,
    AgentRunResult,
    UnexpectedModelBehavior,
    UsageLimitExceeded,
)
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models import Model

from src.agent.guardrails import AgentGuardrails, GuardrailError, GuardrailLimits
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


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class Reset:
    """Discard the text streamed so far; a new model response follows."""


@dataclass(frozen=True)
class Done:
    result: AgentChatResult


AgentStreamEvent = TextDelta | Reset | Done


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
        self.guardrails = AgentGuardrails(guardrail_limits)
        # Each turn stores the owner's message and the reply, so a turn is two messages.
        self.history_messages = 2 * history_turns
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
                # The limits arrive from the composition root, so this module reads no
                # global settings and guardrails cannot be switched off by a caller.
                retries=self.guardrails.retries,
                capabilities=self.guardrails.capabilities,
            )
            if model is not None
            else None
        )
        if self.agent is not None:
            self.agent.output_validator(self.guardrails.check_answer)

    async def chat(
        self,
        user_id: int,
        shop_id: int,
        message: str,
        conversation_id: int | None = None,
    ) -> AgentChatResult:
        context = AgentContext(user_id=user_id, shop_id=shop_id)
        question, history = await self._prepare_turn(context, message, conversation_id)
        answer, version = await self._answer(question, history, context)
        return await self._save_turn(
            context, conversation_id, question, answer, version
        )

    async def stream_chat(
        self,
        user_id: int,
        shop_id: int,
        message: str,
        conversation_id: int | None = None,
    ) -> AsyncIterator[AgentStreamEvent]:
        """Refuse a turn now, so the caller can answer with a status code; the returned
        iterator runs the model and yields the events."""
        context = AgentContext(user_id=user_id, shop_id=shop_id)
        question, history = await self._prepare_turn(context, message, conversation_id)
        return self._stream_events(question, history, context, conversation_id)

    async def _prepare_turn(
        self, context: AgentContext, message: str, conversation_id: int | None
    ) -> tuple[str, list[dict]]:
        """Check the turn before any model call; return the question and the history."""
        if self.agent is None:
            raise RuntimeError("agent model unavailable")

        # Read first, so a conversation outside the owner's scope fails before any model
        # call. Owners rarely reach the window, so it bounds the prompt for the odd long
        # conversation without summarizing anything.
        history = (
            await asyncio.to_thread(
                self.conversations.recent_messages,
                conversation_id,
                context.user_id,
                context.shop_id,
                self.history_messages,
            )
            if conversation_id is not None
            else []
        )
        # Stored as the model sees it, so a pasted key is not replayed with the history
        # on later turns.
        question = self.guardrails.check_input(message)
        return question, history

    async def _answer(
        self, question: str, history: list[dict], context: AgentContext
    ) -> tuple[str, str]:
        """Run the agent; return the screened answer and the model version."""
        async with self._run_limits():
            result = await self.agent.run(
                question,
                message_history=self._model_messages(history),
                deps=context,
                usage_limits=self.guardrails.usage_limits,
            )
        # Token counts per turn, to size AGENT_TURN_TOKEN_LIMIT from real traffic.
        logger.info("agent turn usage: %s", result.usage)
        return result.output, result.response.model_name or self.model_name

    async def _stream_events(
        self,
        question: str,
        history: list[dict],
        context: AgentContext,
        conversation_id: int | None,
    ) -> AsyncIterator[AgentStreamEvent]:
        events: asyncio.Queue[AgentStreamEvent | Exception] = asyncio.Queue()
        producer = asyncio.create_task(
            self._produce_turn(question, history, context, conversation_id, events)
        )
        try:
            while True:
                event = await events.get()
                if isinstance(event, Exception):
                    raise event
                yield event
                if isinstance(event, Done):
                    return
        finally:
            # A closed or disconnected caller cancels the run before it is saved.
            producer.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await producer

    async def _produce_turn(
        self,
        question: str,
        history: list[dict],
        context: AgentContext,
        conversation_id: int | None,
        events: asyncio.Queue[AgentStreamEvent | Exception],
    ) -> None:
        # The run gets its own task: pydantic-ai binds its run state to the task that
        # opened it, so a generator suspended mid-run cannot be closed from outside.
        try:
            delivered, result = await self._stream_run(
                question, history, context, events
            )
            answer = result.output
            if not answer.startswith(delivered):
                events.put_nowait(Reset())
                delivered = ""
            if answer[len(delivered) :]:
                events.put_nowait(TextDelta(answer[len(delivered) :]))
            logger.info("agent turn usage: %s", result.usage)
            version = result.response.model_name or self.model_name
            saved = await self._save_turn(
                context, conversation_id, question, answer, version
            )
            events.put_nowait(Done(saved))
        except Exception as error:
            # The consumer re-raises it, so the caller sees the same error as chat().
            events.put_nowait(error)

    async def _stream_run(
        self,
        question: str,
        history: list[dict],
        context: AgentContext,
        events: asyncio.Queue[AgentStreamEvent | Exception],
    ) -> tuple[str, AgentRunResult[str]]:
        """Queue the text each model response releases; return the text the owner was
        sent since the last Reset, and the run result."""
        delivered = ""
        async with (
            self._run_limits(),
            self.agent.iter(
                question,
                message_history=self._model_messages(history),
                deps=context,
                usage_limits=self.guardrails.usage_limits,
            ) as run,
        ):
            async for node in run:
                if not Agent.is_model_request_node(node):
                    continue
                response_text = ""
                released = ""
                async with node.stream(run.ctx) as stream:
                    async for delta in stream.stream_text(delta=True, debounce_by=None):
                        response_text += delta
                        safe = self.guardrails.screened_prefix(response_text)
                        # The prefix can shrink when a view name at the end gets
                        # extended (`v_products` then `_x`); only growth is sent.
                        if len(safe) <= len(released):
                            continue
                        # Text an earlier response sent is replaced, not extended: a
                        # preamble before a tool call, or an answer the screen rejected.
                        if not released and delivered:
                            events.put_nowait(Reset())
                            delivered = ""
                        fresh = safe[len(released) :]
                        released = safe
                        delivered += fresh
                        events.put_nowait(TextDelta(fresh))
            result = run.result
        return delivered, result

    async def _save_turn(
        self,
        context: AgentContext,
        conversation_id: int | None,
        question: str,
        answer: str,
        version: str,
    ) -> AgentChatResult:
        saved_conversation_id, message_id = await asyncio.to_thread(
            self.conversations.save_exchange,
            user_id=context.user_id,
            shop_id=context.shop_id,
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

    @asynccontextmanager
    async def _run_limits(self) -> AsyncIterator[None]:
        """Stop a run at the turn timeout or a model limit, as a guardrail code."""
        try:
            async with asyncio.timeout(self.guardrails.turn_timeout_seconds):
                yield
        except TimeoutError as error:
            # Stopped before Core stops waiting, so the turn is not stored behind an
            # error the owner already saw.
            logger.warning("agent run passed the turn timeout")
            raise GuardrailError("answer_timeout") from error
        except (UsageLimitExceeded, UnexpectedModelBehavior) as error:
            # The model used up its requests or never gave an answer the screen
            # accepts. Provider errors are neither, so they still propagate and the
            # router answers 503.
            logger.warning("agent run ended without an answer: %s", error)
            raise GuardrailError("answer_unavailable") from error

    @staticmethod
    def _model_messages(history: list[dict]) -> list[ModelMessage]:
        # History follows verbatim; the agent adds the instructions to the new request.
        return [
            ModelRequest(parts=[UserPromptPart(entry["content"])])
            if entry["role"] == "USER"
            else ModelResponse(parts=[TextPart(entry["content"])])
            for entry in history
        ]
