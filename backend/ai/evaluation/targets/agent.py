import asyncio
import json
import time
from contextlib import AsyncExitStack

from evaluation.core.schema import Case, Output
from evaluation.targets.without_memory_writes import WithoutMemoryWrites
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)
from pydantic_ai import Agent
from pydantic_ai.models.instrumented import InstrumentationSettings
from sqlalchemy import text

from src.agent.service import (
    Done,
    MemoryRecalled,
    Reset,
    TextDelta,
)
from src.agent.tool_events import ToolStarted
from src.app_config import app_config

# `run.py` switches the app config before it imports this module, so `src.main` below
# is imported with tracing off and memory on.
from src.main import app, lifespan
from src.memory.repository import NewMemory
from src.memory.service import AgentMemoryService

# The most a tool result or a memory takes in a prompt to the judge or in the outputs.
RESULT_CHARS = 500


class AgentTarget:
    """The real chat agent, started the way the app starts it, on the seeded shop.

    Enter it before the first case and leave it after the last: that starts and stops
    the app's lifespan and stores the made-up `memories` for the shop.
    """

    def __init__(
        self,
        owner_id: int,
        shop_id: int,
        memories: dict[str, dict],
        model_alias: str | None = None,
    ) -> None:
        if model_alias is not None and model_alias not in app_config.MODEL_ALIASES:
            known = ", ".join(sorted(app_config.MODEL_ALIASES))
            raise SystemExit(f"unknown --model {model_alias!r}; known aliases: {known}")
        self.owner_id = owner_id
        self.shop_id = shop_id
        self.memories = memories
        self.model_alias = model_alias
        self.stack = AsyncExitStack()

    async def __aenter__(self) -> "AgentTarget":
        self.exporter = self._trace_tools()
        await self._start_app()
        self.agent = app.state.agent
        self.memory = WithoutMemoryWrites(app.state.memory)
        await self._seed_memories()
        return self

    async def __aexit__(self, *error) -> None:
        await self.stack.aclose()

    async def _start_app(self) -> None:
        """Starts the app's lifespan, which builds the agent from the `chat` alias.

        With `model_alias`, `chat` points at that alias only while the agent is built.
        The judge reads `chat` on every grade, so it must find the original back.
        """
        aliases = app_config.MODEL_ALIASES
        original = aliases["chat"]
        if self.model_alias is not None:
            aliases["chat"] = aliases[self.model_alias]
        try:
            await self.stack.enter_async_context(lifespan(app))
        finally:
            aliases["chat"] = original

    async def ask(self, case: Case) -> Output:
        """Asks the question, then the follow-up in the same conversation if there is
        one; the output describes the last turn."""
        self.agent.memory = self.select_memory(case, self.memory)
        inputs = case.inputs
        questions = [inputs["question"], inputs["follow_up"]]
        conversation_id = None
        for question in filter(None, questions):
            values, conversation_id = await self._ask_once(question, conversation_id)
        # The model, prompt and suite version travel with every row, so two runs in
        # HoneyHive or in results/ show what changed between them.
        values["prompt_version"] = self.agent.prompt_version
        values["suite_version"] = inputs["suite_version"]
        return Output(values)

    @staticmethod
    def select_memory(case: Case, memory: WithoutMemoryWrites | AgentMemoryService):
        """Recall runs only in the memory cases.

        The seeded facts would otherwise lead every other case's prompt, because recall
        has no score cut-off, and their results would stop matching earlier runs.
        """
        return memory if case.truth["memory"] else None

    async def _ask_once(
        self, question: str, conversation_id: int | None
    ) -> tuple[dict, int | None]:
        """One turn: what the agent said, called and recalled, and the id of the
        conversation it belongs to."""
        self.exporter.clear()
        reply, model = "", ""
        tools: list[str] = []
        memories: list[dict] = []
        started = time.monotonic()
        events = await self.agent.stream_chat(
            self.owner_id, self.shop_id, question, conversation_id
        )
        async for event in events:
            if isinstance(event, ToolStarted):
                tools.append(event.name)
            elif isinstance(event, MemoryRecalled):
                memories = self._extract_recalled_memories(event)
            elif isinstance(event, TextDelta):
                reply += event.text
            elif isinstance(event, Reset):
                reply = ""
            elif isinstance(event, Done):
                reply = event.result.answer
                model = event.result.model_version
                conversation_id = event.result.conversation_id
        spans = sorted(
            self.exporter.get_finished_spans(), key=lambda span: span.start_time
        )
        values = {
            "answer": reply,
            "tools": tools,
            "tool_calls": self.extract_tool_calls(spans),
            "available_tools": self.extract_available_tools(spans),
            "memories": memories,
            "seconds": round(time.monotonic() - started, 2),
            "model": model,
        }
        return values, conversation_id

    @staticmethod
    def _extract_recalled_memories(event: MemoryRecalled) -> list[dict]:
        return [
            {
                "id": memory.id,
                "content": memory.content,
                "memory_type": memory.memory_type,
                "score": memory.relevance,
            }
            for memory in event.memories
        ]

    @staticmethod
    def _trace_tools() -> InMemorySpanExporter:
        """Records every agent's spans in memory, which is where the arguments and
        results of a turn's tool calls are read from; nothing leaves the process."""
        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        Agent.instrument_all(
            InstrumentationSettings(
                tracer_provider=provider,
                include_content=True,
                include_binary_content=False,
            )
        )
        return exporter

    async def _seed_memories(self) -> None:
        """Replaces the shop's memories with `memories`, stored under a new
        conversation."""
        repository = self.memory.repository
        with repository.postgres.session() as session:
            session.execute(
                text("DELETE FROM agent_memories WHERE shop_id = :shop"),
                {"shop": self.shop_id},
            )
            conversation_id = session.execute(
                text(
                    "INSERT INTO chat_conversations (user_id, shop_id, title) "
                    "VALUES (:owner, :shop, 'memory seed') RETURNING id"
                ),
                {"owner": self.owner_id, "shop": self.shop_id},
            ).scalar_one()
        facts = list(self.memories.values())
        vectors = await self.memory.embedder.embed_documents(
            [fact["content"] for fact in facts]
        )
        await asyncio.to_thread(
            repository.add,
            self.shop_id,
            self.owner_id,
            conversation_id,
            [
                NewMemory(fact["memory_type"], fact["content"], 0.8, list(vector))
                for fact, vector in zip(facts, vectors.embeddings, strict=True)
            ],
        )

    @staticmethod
    def extract_tool_calls(spans: list) -> list[dict]:
        """The tool calls of the turn in order, each result cut short."""
        return [
            {
                "name": span.attributes["gen_ai.tool.name"],
                "arguments": json.loads(span.attributes["gen_ai.tool.call.arguments"]),
                "result": str(span.attributes["gen_ai.tool.call.result"])[
                    :RESULT_CHARS
                ],
            }
            for span in spans
            if span.name.startswith("execute_tool ")
        ]

    @staticmethod
    def extract_available_tools(spans: list) -> str:
        """The tool definitions the model was given, as its first request had them."""
        return next(
            (
                span.attributes["gen_ai.tool.definitions"]
                for span in spans
                if "gen_ai.tool.definitions" in span.attributes
            ),
            "[]",
        )
