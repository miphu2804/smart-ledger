import asyncio
import logging
import uuid
from collections.abc import AsyncGenerator
from contextlib import suppress
from dataclasses import dataclass

from pydantic_ai import Agent, AgentRunResult
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models import Model

from src.agent.guardrails import GuardrailLimits, GuardrailService
from src.agent.repository import AgentConversationRepository
from src.agent.tools import (
    AgentContext,
    build_restock_tool,
    build_shop_data_tool,
)
from src.memory.repository import RecalledMemory
from src.memory.service import AgentMemoryService
from src.prompt_templates import (
    CURRENT_TIME,
    MEMORY_PROMPT,
    RESTOCK_PROMPT,
    SHOP_AGENT_SYSTEM_PROMPT,
    SQL_AGENT_PROMPT,
)
from src.providers.factory import session_settings
from src.restock.service import RestockService
from src.sql.repository import ShopDataRepository
from src.utils import get_time

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AgentChatResult:
    conversation_id: int
    message_id: int
    answer: str
    model: str
    model_version: str


@dataclass(frozen=True)
class MemoryRecalled:
    """The memories the reply draws on; sent before the first text."""

    memories: list[RecalledMemory]


@dataclass(frozen=True)
class TextDelta:
    text: str


@dataclass(frozen=True)
class Reset:
    """Discard the text streamed so far; a new model response follows."""


@dataclass(frozen=True)
class Done:
    result: AgentChatResult


AgentStreamEvent = MemoryRecalled | TextDelta | Reset | Done


class AgentService:
    """One chat turn: load recent history, run the agent, persist the reply."""

    def __init__(
        self,
        model: Model | None,
        conversations: AgentConversationRepository,
        guardrail_limits: GuardrailLimits,
        shop_data: ShopDataRepository | None = None,
        restock: RestockService | None = None,
        memory: AgentMemoryService | None = None,
        history_turns: int = 100,
    ) -> None:
        self.model_name = model.model_name if model is not None else ""
        self.conversations = conversations
        self.guardrails = GuardrailService(guardrail_limits)
        # Each turn stores the owner's message and the reply, so a turn is two messages.
        self.history_messages = 2 * history_turns
        # The instructions are static so providers can cache them; the shop scope
        # arrives per request through AgentContext and never appears in the prompt.
        # Only the current time changes per run, so it comes last.
        # Each optional capability adds its own tool and prompt section.
        tools = []
        prompt_parts = [SHOP_AGENT_SYSTEM_PROMPT]
        if shop_data is not None:
            tools.append(build_shop_data_tool(shop_data))
            prompt_parts.append(SQL_AGENT_PROMPT)
        if restock is not None:
            tools.append(build_restock_tool(restock))
            prompt_parts.append(RESTOCK_PROMPT)
        if memory is not None:
            prompt_parts.append(MEMORY_PROMPT)
        self.memory = memory
        # Memory writes run after the reply; held here so they are not garbage
        # collected mid-run.
        self.memory_writes: set[asyncio.Task] = set()
        self.agent = (
            Agent(
                model,
                deps_type=AgentContext,
                instructions=["\n\n".join(prompt_parts), self._current_time],
                tools=tools,
                # The limits arrive from the composition root, so this module reads no
                # global settings and guardrails cannot be switched off by a caller.
                retries=self.guardrails.retries,
                capabilities=self.guardrails.capabilities,
                # Tags the run's trace, so one shop's turns can be filtered (NFR-007).
                metadata=lambda ctx: {"shop_id": ctx.deps.shop_id},
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
        context = AgentContext(user_id=user_id, shop_id=shop_id)
        question, history = await self._prepare_turn(context, message, conversation_id)
        prompt, recalled = await self._with_memories(context, question)
        answer, version = await self._answer(
            prompt, history, context, self._session_id(conversation_id)
        )
        return await self._save_turn(
            context, conversation_id, question, answer, version, recalled
        )

    async def stream_chat(
        self,
        user_id: int,
        shop_id: int,
        message: str,
        conversation_id: int | None = None,
    ) -> AsyncGenerator[AgentStreamEvent]:
        """Refuse a turn now, so the caller can answer with a status code; the returned
        iterator runs the model and yields the events."""
        context = AgentContext(user_id=user_id, shop_id=shop_id)
        question, history = await self._prepare_turn(context, message, conversation_id)
        prompt, recalled = await self._with_memories(context, question)
        return self._stream_events(
            question, prompt, recalled, history, context, conversation_id
        )

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

    async def _with_memories(
        self, context: AgentContext, question: str
    ) -> tuple[str, list[RecalledMemory]]:
        """The prompt sent to the model, led by recalled memories, and those memories.

        Only the model sees them; the stored message stays the owner's own words, so
        later turns do not replay old memories with the history.
        """
        if self.memory is None:
            return question, []
        return await self.memory.with_memories(
            context.shop_id, context.user_id, question
        )

    async def _answer(
        self,
        prompt: str,
        history: list[dict],
        context: AgentContext,
        session_id: str,
    ) -> tuple[str, str]:
        """Run the agent; return the screened answer and the model version."""
        async with self.guardrails.run_limits():
            result = await self.agent.run(
                prompt,
                message_history=self._model_messages(history),
                deps=context,
                usage_limits=self.guardrails.usage_limits,
                model_settings=session_settings(session_id),
            )
        return self._read_result(result)

    async def _stream_events(
        self,
        question: str,
        prompt: str,
        recalled: list[RecalledMemory],
        history: list[dict],
        context: AgentContext,
        conversation_id: int | None,
    ) -> AsyncGenerator[AgentStreamEvent]:
        events: asyncio.Queue[AgentStreamEvent | Exception] = asyncio.Queue()
        producer = asyncio.create_task(
            self._produce_turn(
                question, prompt, recalled, history, context, conversation_id, events
            )
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
            with suppress(asyncio.CancelledError):
                await producer

    async def _produce_turn(
        self,
        question: str,
        prompt: str,
        recalled: list[RecalledMemory],
        history: list[dict],
        context: AgentContext,
        conversation_id: int | None,
        events: asyncio.Queue[AgentStreamEvent | Exception],
    ) -> None:
        # The run gets its own task: pydantic-ai binds its run state to the task that
        # opened it, so a generator suspended mid-run cannot be closed from outside.
        try:
            if recalled:
                events.put_nowait(MemoryRecalled(recalled))
            delivered, result = await self._stream_run(
                prompt, history, context, self._session_id(conversation_id), events
            )
            answer, version = self._read_result(result)
            if not answer.startswith(delivered):
                events.put_nowait(Reset())
                delivered = ""
            if answer[len(delivered) :]:
                events.put_nowait(TextDelta(answer[len(delivered) :]))
            saved = await self._save_turn(
                context, conversation_id, question, answer, version, recalled
            )
            events.put_nowait(Done(saved))
        except Exception as error:
            # The consumer re-raises it, so the caller sees the same error as chat().
            events.put_nowait(error)

    async def _stream_run(
        self,
        prompt: str,
        history: list[dict],
        context: AgentContext,
        session_id: str,
        events: asyncio.Queue[AgentStreamEvent | Exception],
    ) -> tuple[str, AgentRunResult[str]]:
        """Queue the text each model response releases; return the text the owner was
        sent since the last Reset, and the run result."""
        delivered = ""
        async with (
            self.guardrails.run_limits(),
            self.agent.iter(
                prompt,
                message_history=self._model_messages(history),
                deps=context,
                usage_limits=self.guardrails.usage_limits,
                model_settings=session_settings(session_id),
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

    def _read_result(self, result: AgentRunResult[str]) -> tuple[str, str]:
        """Log the turn's token use; return the answer and the model version."""
        # Token counts per turn, to size AGENT_TURN_TOKEN_LIMIT from real traffic.
        logger.info("agent turn usage: %s", result.usage)
        return result.output, result.response.model_name or self.model_name

    async def _save_turn(
        self,
        context: AgentContext,
        conversation_id: int | None,
        question: str,
        answer: str,
        version: str,
        recalled: list[RecalledMemory],
    ) -> AgentChatResult:
        saved_conversation_id, message_id = await asyncio.to_thread(
            self.conversations.save_exchange,
            user_id=context.user_id,
            shop_id=context.shop_id,
            conversation_id=conversation_id,
            user_message=question,
            assistant_message=answer,
        )
        if self.memory is not None:
            self._remember(context, saved_conversation_id, question, answer, recalled)
        return AgentChatResult(
            conversation_id=saved_conversation_id,
            message_id=message_id,
            answer=answer,
            model=self.model_name,
            model_version=version,
        )

    def _remember(
        self,
        context: AgentContext,
        conversation_id: int,
        question: str,
        answer: str,
        recalled: list[RecalledMemory],
    ) -> None:
        """Store what the turn taught without making the owner wait for it."""
        task = asyncio.create_task(
            self.memory.remember(
                context.shop_id,
                context.user_id,
                conversation_id,
                question,
                answer,
                recalled,
            )
        )
        self.memory_writes.add(task)
        task.add_done_callback(self.memory_writes.discard)

    @staticmethod
    def _current_time() -> str:
        """Lets the model resolve "today" or "last week" without asking."""
        return CURRENT_TIME.format(time=get_time().strftime("%A %Y-%m-%d %H:%M"))

    @staticmethod
    def _model_messages(history: list[dict]) -> list[ModelMessage]:
        # History follows verbatim; the agent adds the instructions to the new request.
        return [
            ModelRequest(parts=[UserPromptPart(entry["content"])])
            if entry["role"] == "USER"
            else ModelResponse(parts=[TextPart(entry["content"])])
            for entry in history
        ]

    @staticmethod
    def _session_id(conversation_id: int | None) -> str:
        # A new conversation gets its id only when the turn is saved, so its first turn
        # runs under a one-off session.
        if conversation_id is None:
            return uuid.uuid4().hex
        return f"conversation-{conversation_id}"
