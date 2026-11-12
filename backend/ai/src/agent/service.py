import asyncio
import hashlib
import json
import logging
import re
import time
import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import asdict, dataclass

from pydantic_ai import Agent, AgentRun, Tool
from pydantic_ai.messages import (
    CachePoint,
    ModelMessage,
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models import Model

from src.agent.errors import GuardrailError
from src.agent.guardrails import GuardrailLimits, GuardrailService
from src.agent.repository import AgentConversationRepository
from src.agent.tool_events import (
    ToolFinished,
    ToolStarted,
    log_tool_event,
    tool_progress,
)
from src.agent.tools import (
    AgentContext,
    build_calculation_tool,
    build_restock_tool,
    build_shop_data_tool,
    suggest_screen,
)
from src.agent.turn_context import current_turn
from src.calculation.service import CalculationService
from src.llm_router.service import LLMRouterService, ModelSelection
from src.memory.repository import RecalledMemory
from src.memory.service import AgentMemoryService
from src.observability import Observability
from src.prompt_templates import (
    APP_GUIDE_PROMPT,
    CALC_PROMPT,
    CURRENT_TIME,
    MEMORY_PROMPT,
    RESTOCK_PROMPT,
    RUN_CODE_PROMPT,
    SHOP_AGENT_SYSTEM_PROMPT,
    SQL_AGENT_PROMPT,
)
from src.providers.session_settings import session_settings
from src.restock.service import RestockService
from src.sandbox.wrapper import Sandbox
from src.sql.repository import ShopDataRepository
from src.utils import get_time

logger = logging.getLogger(__name__)

# A reply links to at most this many screens, so the buttons fit under it on a phone.
MAX_SCREEN_BUTTONS = 2
# The screen-button block _with_screen_buttons appends to a stored answer.
SCREEN_BUTTONS = re.compile(r"\n*```actions\n.*?\n```\s*$", re.DOTALL)


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


AgentStreamEvent = (
    MemoryRecalled | ToolStarted | ToolFinished | TextDelta | Reset | Done
)


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
        calculation: CalculationService | None = None,
        sandbox: Sandbox | None = None,
        history_turns: int = 100,
        observability: Observability | None = None,
        llm_router: LLMRouterService | None = None,
    ) -> None:
        self.model_name = model.model_name if model is not None else ""
        self.conversations = conversations
        self.observability = observability or Observability()
        self.guardrails = GuardrailService(guardrail_limits)
        # Each turn stores the owner's message and the reply, so a turn is two messages.
        self.history_messages = 2 * history_turns
        # The instructions are static so providers can cache them; the shop scope
        # arrives per request through AgentContext and never appears in the prompt.
        # The current time travels with the new message instead (_with_current_time),
        # so the instructions and the history both stay a cacheable prefix.
        # Each optional capability adds its own tool and prompt section.
        tools = []
        prompt_parts = [SHOP_AGENT_SYSTEM_PROMPT, APP_GUIDE_PROMPT]
        if shop_data is not None:
            tools.append(build_shop_data_tool(shop_data))
            prompt_parts.append(SQL_AGENT_PROMPT)
        if restock is not None:
            tools.append(build_restock_tool(restock))
            prompt_parts.append(RESTOCK_PROMPT)
        if calculation is not None:
            tools.append(build_calculation_tool(calculation))
            prompt_parts.append(CALC_PROMPT)
        if memory is not None:
            prompt_parts.append(MEMORY_PROMPT)
        tools.append(Tool(suggest_screen))
        # The sandbox option runs model-written code from one run_code tool; every
        # registered tool stays native, so a read-only data question or a plain
        # calculation never starts Monty. Its prompt section is appended only here,
        # so a model never reads run_code guidance when the tool is not registered:
        # an unusable sandbox (no codemode extra) or SANDBOX_ENABLED=false arrives
        # as None, so it turns off without failing the service.
        if sandbox is not None:
            prompt_parts.append(RUN_CODE_PROMPT)
        capabilities = [
            *self.guardrails.capabilities,
            *([sandbox.capability] if sandbox is not None else []),
        ]
        self.memory = memory
        # None runs every turn on `model`; otherwise each turn picks a tier model.
        self.llm_router = llm_router
        instructions = "\n\n".join(prompt_parts)
        # Short and stable, so traces and evaluation runs can be grouped by prompt. The
        # tool definitions count too: the model reads their descriptions and schemas.
        tool_definitions = json.dumps(
            [asdict(tool.tool_def) for tool in tools],
            sort_keys=True,
            ensure_ascii=False,
        )
        self.prompt_version = hashlib.sha256(
            f"{instructions}\n{tool_definitions}".encode()
        ).hexdigest()[:12]
        self.agent = (
            Agent(
                model,
                name="chat",
                deps_type=AgentContext,
                instructions=instructions,
                tools=tools,
                # The limits arrive from the composition root, so this module reads no
                # global settings and guardrails cannot be switched off by a caller.
                retries=self.guardrails.retries,
                capabilities=capabilities,
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
        async with self._marks_failure():
            prompt, recalled, selection = await self._recall_and_select(
                context, conversation_id, question, history
            )
            answer, version = await self._answer(
                prompt, history, context, self._session_id(conversation_id), selection
            )
            return await self._save_turn(
                context, conversation_id, question, answer, version, recalled, selection
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
        started = time.monotonic()
        context = AgentContext(user_id=user_id, shop_id=shop_id)
        question, history = await self._prepare_turn(context, message, conversation_id)
        async with self._marks_failure():
            prompt, recalled, selection = await self._recall_and_select(
                context, conversation_id, question, history
            )
        return self._stream_events(
            question,
            prompt,
            recalled,
            history,
            context,
            conversation_id,
            selection,
            started,
        )

    async def _prepare_turn(
        self, context: AgentContext, message: str, conversation_id: int | None
    ) -> tuple[str, list[dict]]:
        """Check the turn before any model call; return the question and the history."""
        if self.agent is None:
            raise RuntimeError("agent model unavailable")

        # Stored as the model sees it, so a pasted key is not replayed with the history
        # on later turns.
        question = self.guardrails.check_input(message)
        # After the redaction, so the session opens with the question the model sees,
        # and before the history read, so HoneyHive creates the session while the
        # database answers.
        await self.observability.start_turn_session(
            context.shop_id,
            context.user_id,
            conversation_id,
            question,
            {"model": self.model_name, "prompt_version": self.prompt_version},
        )
        async with self._marks_failure():
            # Read before any model call, so a conversation outside the owner's scope
            # fails first. Owners rarely reach the window, so it bounds the prompt for
            # the odd long conversation without summarizing anything.
            history_started = time.monotonic()
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
            # No span covers the read, so its time rides in the session's metadata.
            self.observability.tag_turn(
                history_ms=round(1000 * (time.monotonic() - history_started))
            )
        # The turn's first span comes next; it must not reach HoneyHive before the
        # session does.
        await self.observability.wait_for_session()
        return question, history

    @asynccontextmanager
    async def _marks_failure(self) -> AsyncIterator[None]:
        """Mark the turn's session with what ended the turn early, then re-raise.

        A cancelled stream is marked too: the owner closed the app or lost the
        connection, and the session would otherwise look like a turn still running.
        """
        try:
            yield
        except asyncio.CancelledError:
            self.observability.fail_turn("cancelled")
            raise
        except Exception as error:
            self.observability.fail_turn(
                error.code
                if isinstance(error, GuardrailError)
                else type(error).__name__
            )
            raise

    async def _recall_and_select(
        self,
        context: AgentContext,
        conversation_id: int | None,
        question: str,
        history: list[dict],
    ) -> tuple[str, list[RecalledMemory], ModelSelection | None]:
        """Recall memories and pick the turn's model together, so the classifier call
        adds no wait while recall is still running."""
        (prompt, recalled), selection = await asyncio.gather(
            self._with_memories(context, question),
            self._select_model(conversation_id, question, history),
        )
        return prompt, recalled, selection

    async def _select_model(
        self, conversation_id: int | None, question: str, history: list[dict]
    ) -> ModelSelection | None:
        """The tier model of this turn, or None to run on the default model."""
        if self.llm_router is None:
            return None
        user_messages = self._user_messages(question, history)
        # The classifier calls Bifrost over plain HTTP, which no agent instrumentation
        # sees, so its time and verdict would otherwise be missing from the turn.
        with self.observability.span(
            "llm router", inputs={"user_messages": user_messages}
        ):
            selection = await self.llm_router.route(conversation_id, user_messages)
            self.observability.enrich_span(
                outputs={"tier": selection.tier.name, "alias": selection.alias},
                metadata={"mechanism": str(selection.mechanism)},
            )
        # The session opened with the default model; the tier model replaces it.
        self.observability.tag_turn(
            model=selection.model.model_name,
            tier=selection.tier.name,
            tier_alias=selection.alias,
            tier_mechanism=str(selection.mechanism),
        )
        return selection

    @staticmethod
    def _user_messages(question: str, history: list[dict]) -> list[str]:
        """The new question led by the owner's previous message, which resolves a
        follow-up such as "and last month?". Assistant replies are never sent."""
        previous = [entry["content"] for entry in history if entry["role"] == "USER"]
        return [*previous[-1:], question]

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
        selection: ModelSelection | None,
    ) -> tuple[str, str]:
        """Run the agent; return the screened answer and the model version."""
        async with (
            self.guardrails.run_limits(),
            self.agent.iter(
                self._with_current_time(prompt),
                message_history=self._model_messages(history),
                deps=context,
                usage_limits=self.guardrails.usage_limits,
                model_settings=session_settings(session_id, context.shop_id),
                # One model for every step of the turn, tool calls included.
                model=selection.model if selection is not None else None,
            ) as run,
        ):
            answer = ""
            returns = None
            async for node in run:
                if answer:
                    # The button calls have returned; see _stream_run.
                    returns = node.request
                    break
                if Agent.is_call_tools_node(node):
                    await self._queue_tool_events(node, run, None)
                    answer = self._kept_text(node.model_response)
            return self._read_result(run, answer, returns)

    async def _stream_events(
        self,
        question: str,
        prompt: str,
        recalled: list[RecalledMemory],
        history: list[dict],
        context: AgentContext,
        conversation_id: int | None,
        selection: ModelSelection | None,
        started: float,
    ) -> AsyncGenerator[AgentStreamEvent]:
        events: asyncio.Queue[AgentStreamEvent | Exception] = asyncio.Queue()
        producer = asyncio.create_task(
            self._produce_turn(
                question,
                prompt,
                recalled,
                history,
                context,
                conversation_id,
                selection,
                started,
                events,
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
        selection: ModelSelection | None,
        started: float,
        events: asyncio.Queue[AgentStreamEvent | Exception],
    ) -> None:
        # The run gets its own task: pydantic-ai binds its run state to the task that
        # opened it, so a generator suspended mid-run cannot be closed from outside.
        try:
            async with self._marks_failure():
                if recalled:
                    events.put_nowait(MemoryRecalled(recalled))
                delivered, answer, version = await self._stream_run(
                    prompt,
                    history,
                    context,
                    self._session_id(conversation_id),
                    selection,
                    started,
                    events,
                )
                if not answer.startswith(delivered):
                    events.put_nowait(Reset())
                    delivered = ""
                if answer[len(delivered) :]:
                    events.put_nowait(TextDelta(answer[len(delivered) :]))
                saved = await self._save_turn(
                    context,
                    conversation_id,
                    question,
                    answer,
                    version,
                    recalled,
                    selection,
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
        selection: ModelSelection | None,
        started: float,
        events: asyncio.Queue[AgentStreamEvent | Exception],
    ) -> tuple[str, str, str]:
        """Queue the text each model response releases; return the text the owner
        was sent since the last Reset, the answer with its buttons, and the model
        version."""
        delivered = ""
        # How long the owner waited for the first words since the turn arrived, memory
        # recall included: the latency they feel, even when a preamble is later reset.
        first_text_ms = None
        async with (
            self.guardrails.run_limits(),
            self.agent.iter(
                self._with_current_time(prompt),
                message_history=self._model_messages(history),
                deps=context,
                usage_limits=self.guardrails.usage_limits,
                model_settings=session_settings(session_id, context.shop_id),
                # One model for every step of the turn, tool calls included.
                model=selection.model if selection is not None else None,
            ) as run,
        ):
            # The answer a response wrote alongside screen-button calls only.
            answer = ""
            returns = None
            async for node in run:
                if Agent.is_call_tools_node(node):
                    await self._queue_tool_events(node, run, events)
                    continue
                if answer:
                    # The button calls have returned, so the answer is complete. The
                    # model is not asked again: it would write the answer a second
                    # time, often reworded, and no text check tells the copy apart.
                    returns = node.request
                    break
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
                        if not released and delivered:
                            # Text an earlier response sent is replaced: a preamble
                            # before a data tool call, or an answer the screen rejected.
                            events.put_nowait(Reset())
                            delivered = ""
                        fresh = safe[len(released) :]
                        if first_text_ms is None:
                            first_text_ms = round(1000 * (time.monotonic() - started))
                        delivered += fresh
                        events.put_nowait(TextDelta(fresh))
                        released = safe
                    answer = self._kept_text(stream.response)
            if first_text_ms is None:
                # Nothing passed the screen while streaming; the caller sends the answer
                # as soon as this returns.
                first_text_ms = round(1000 * (time.monotonic() - started))
            return (
                delivered,
                *self._read_result(run, answer, returns, first_text_ms),
            )

    @staticmethod
    async def _queue_tool_events(
        node, run, events: asyncio.Queue[AgentStreamEvent | Exception] | None
    ) -> None:
        """Log each tool call and queue when it starts and ends; the JSON route
        passes no queue. Streaming the node is also what runs its tools, so this
        replaces the plain step of the run loop."""
        async with node.stream(run.ctx) as stream:
            async for event in stream:
                log_tool_event(event)
                progress = tool_progress(event)
                if progress is not None and events is not None:
                    events.put_nowait(progress)

    def _read_result(
        self,
        run: AgentRun,
        answer: str,
        returns: ModelRequest | None,
        first_text_ms: int | None = None,
    ) -> tuple[str, str]:
        """Log the turn's token use; return the answer, with its screen buttons, and
        the model version.

        `answer` is the text a response wrote alongside screen-button calls only, which
        ended the run early; empty when the run ended on its final output. `returns`
        is the request the early end never sent, which holds those calls' returns.
        """
        # Token counts per turn, to size AGENT_TURN_TOKEN_LIMIT from real traffic and
        # to see how much of the prompt the provider served from its cache.
        usage = run.usage
        logger.info(
            "agent turn usage: %s, cache read %d, cache write %d, cache hit %.0f%%",
            usage,
            usage.cache_read_tokens,
            usage.cache_write_tokens,
            100 * usage.cache_hit_ratio,
        )
        messages = run.new_messages()
        if not answer:
            answer = run.result.output
        model_name = next(
            message.model_name
            for message in reversed(messages)
            if isinstance(message, ModelResponse)
        )
        if returns is not None:
            messages = [*messages, returns]
        answer = self._with_screen_buttons(answer, self._screens(messages))
        self.observability.finish_turn(answer, usage, first_text_ms)
        return answer, model_name or self.model_name

    @staticmethod
    def _calls(response: ModelResponse) -> set[str]:
        """The names of the tools a model response calls."""
        return {
            part.tool_name for part in response.parts if isinstance(part, ToolCallPart)
        }

    def _kept_text(self, response: ModelResponse) -> str:
        """The answer text of a response that only adds screen buttons, if the screen
        passes it; otherwise empty.

        A model often writes the whole answer and calls suggest_screen in one response.
        That text is the answer, and the run ends once the calls return. Text before a
        data tool call is a preamble and is dropped. The Harness screens only the final
        output, so this text is screened here.
        """
        if self._calls(response) != {suggest_screen.__name__}:
            return ""
        text = "".join(
            part.content for part in response.parts if isinstance(part, TextPart)
        ).rstrip()
        return text if self.guardrails.allows_answer(text) else ""

    @staticmethod
    def _screens(messages: list[ModelMessage]) -> list[str]:
        """The screens suggest_screen accepted this run, in order, without repeats."""
        screens = []
        for message in messages:
            for part in message.parts:
                if (
                    isinstance(part, ToolReturnPart)
                    and part.tool_name == suggest_screen.__name__
                    and part.metadata["screen"] not in screens
                ):
                    screens.append(part.metadata["screen"])
        return screens[:MAX_SCREEN_BUTTONS]

    @staticmethod
    def _with_screen_buttons(answer: str, screens: list[str]) -> str:
        # Stored with the answer, so the buttons come back with the conversation;
        # the app renders the block as buttons, like a ```ui block as charts and cards.
        if not screens:
            return answer
        return f"{answer}\n\n```actions\n{json.dumps(screens)}\n```"

    async def _save_turn(
        self,
        context: AgentContext,
        conversation_id: int | None,
        question: str,
        answer: str,
        version: str,
        recalled: list[RecalledMemory],
        selection: ModelSelection | None,
    ) -> AgentChatResult:
        with self.observability.span("save turn"):
            execution = current_turn.get()
            if execution is None:
                saved_conversation_id, message_id = await asyncio.to_thread(
                    self.conversations.save_exchange,
                    user_id=context.user_id,
                    shop_id=context.shop_id,
                    conversation_id=conversation_id,
                    user_message=question,
                    assistant_message=answer,
                )
            else:
                saved_conversation_id, message_id = await asyncio.to_thread(
                    self.conversations.save_receipted_exchange,
                    execution,
                    conversation_id,
                    question,
                    answer,
                    selection.model.model_name
                    if selection is not None
                    else self.model_name,
                    version,
                )
        if conversation_id is None:
            self.observability.link_conversation(saved_conversation_id)
        if self.memory is not None:
            self.memory.remember_in_background(
                context.shop_id,
                context.user_id,
                saved_conversation_id,
                question,
                answer,
                recalled,
            )
        if selection is not None:
            # After the save, so a new conversation keeps its tier under its new id.
            self.llm_router.remember(saved_conversation_id, selection)
        return AgentChatResult(
            conversation_id=saved_conversation_id,
            message_id=message_id,
            answer=answer,
            model=(
                selection.model.model_name if selection is not None else self.model_name
            ),
            model_version=version,
        )

    @staticmethod
    def _current_time() -> str:
        """Lets the model resolve "today" or "last week" without asking."""
        return CURRENT_TIME.format(time=get_time().strftime("%A %Y-%m-%d %H:%M"))

    @staticmethod
    def _with_current_time(prompt: str) -> list[str | CachePoint]:
        """The new message, a cache breakpoint, then the current time.

        The time is never stored, so it comes after the message: the next turn's
        history then repeats this request up to the breakpoint, and the provider
        serves the instructions and the whole history from its cache.
        """
        return [prompt, CachePoint(), AgentService._current_time()]

    @staticmethod
    def _model_messages(history: list[dict]) -> list[ModelMessage]:
        # History follows verbatim; the agent adds the instructions to the new request.
        # Stored buttons are dropped, so the model does not learn to write them itself.
        return [
            ModelRequest(parts=[UserPromptPart(entry["content"])])
            if entry["role"] == "USER"
            else ModelResponse(
                parts=[TextPart(SCREEN_BUTTONS.sub("", entry["content"]))]
            )
            for entry in history
        ]

    @staticmethod
    def _session_id(conversation_id: int | None) -> str:
        # A new conversation gets its id only when the turn is saved, so its first turn
        # runs under a one-off session.
        if conversation_id is None:
            return uuid.uuid4().hex
        return f"conversation-{conversation_id}"
