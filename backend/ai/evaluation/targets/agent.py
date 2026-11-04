import asyncio
import hashlib
import json
import time
from contextlib import AsyncExitStack
from datetime import date
from pathlib import Path
from string import Template

import yaml
from evaluation.core.schema import Case, Output
from evaluation.targets.database import require_local_database
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
    ToolStarted,
)
from src.app_config import app_config
from src.infra.postgre_db_client import PostgreDBClient

# `run.py` switches the app config before it imports this module, so `src.main` below
# is imported with tracing off and memory on.
from src.main import app, lifespan
from src.memory.repository import NewMemory
from src.memory.service import AgentMemoryService

SUITE = Path(__file__).resolve().parents[1] / "suites" / "agent_chat"
# The most a tool result or a memory takes in a prompt to the judge or in the outputs.
RESULT_CHARS = 500


def load_definition() -> dict:
    """The suite's `cases.yaml` with each `${name}` filled in: its `shop_id`, its
    `time_zone`, its SQL `fragments` and the `cases` and `memories` built from them.

    A fragment may use the ones above it, so the file states each piece of SQL once.
    """
    raw = yaml.safe_load((SUITE / "cases.yaml").read_text())
    values = {"shop_id": raw["shop_id"], "time_zone": raw["time_zone"]}
    for name, fragment in raw["fragments"].items():
        values[name] = Template(fragment).substitute(values)

    def filled(node):
        if isinstance(node, str):
            return Template(node).substitute(values)
        if isinstance(node, list):
            return [filled(item) for item in node]
        if isinstance(node, dict):
            return {key: filled(item) for key, item in node.items()}
        return node

    return {
        **values,
        "cases": filled(raw["cases"]),
        "memories": filled(raw["memories"]),
    }


class WithoutMemoryWrites:
    """The memory service as the agent sees it, with recall but no writes.

    A turn would otherwise store what it learned and change the next run's answers.
    Every attribute but `remember` is the service's own.
    """

    def __init__(self, memory: AgentMemoryService) -> None:
        self.memory = memory

    def __getattr__(self, name: str):
        return getattr(self.memory, name)

    async def remember(self, *arguments, **keywords) -> None:
        return None


def memory_for(case: Case, memory: WithoutMemoryWrites | AgentMemoryService):
    """Recall runs only in the memory cases.

    The seeded facts would otherwise lead every other case's prompt, because recall
    has no score cut-off, and their results would stop matching earlier runs.
    """
    return memory if case.truth["memory"] else None


class AgentTarget:
    """The real chat agent, started the way the app starts it, on the seeded shop.

    Enter it before the first case and leave it after the last: that starts and stops
    the app's lifespan and stores the made-up memories for the shop.
    """

    def __init__(self, owner_id: int) -> None:
        self.owner_id = owner_id
        self.definition = load_definition()
        self.shop_id = self.definition["shop_id"]
        self.stack = AsyncExitStack()

    async def __aenter__(self) -> "AgentTarget":
        self.exporter = self._trace_tools()
        await self.stack.enter_async_context(lifespan(app))
        self.agent = app.state.agent
        self.memory = WithoutMemoryWrites(app.state.memory)
        await self._seed_memories()
        return self

    async def __aexit__(self, *error) -> None:
        await self.stack.aclose()

    async def __call__(self, case: Case) -> Output:
        """Asks the question, then the follow-up in the same conversation if there is
        one; the outputs describe the last turn."""
        self.agent.memory = memory_for(case, self.memory)
        inputs = case.inputs
        turns = (
            [inputs["question"], inputs["follow_up"]]
            if inputs["follow_up"]
            else [inputs["question"]]
        )
        conversation_id = None
        for question in turns:
            self.exporter.clear()
            reply = ""
            model = ""
            tools: list[str] = []
            memories: list[dict] = []
            started = time.monotonic()
            events = await self.agent.stream_chat(
                inputs["owner_id"], self.shop_id, question, conversation_id
            )
            async for event in events:
                if isinstance(event, ToolStarted):
                    tools.append(event.name)
                elif isinstance(event, MemoryRecalled):
                    memories = [
                        {
                            "id": memory.id,
                            "content": memory.content,
                            "memory_type": memory.memory_type,
                            "score": memory.relevance,
                        }
                        for memory in event.memories
                    ]
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
        # The model, prompt and suite version travel with every row, so two runs in
        # HoneyHive or in results/ show what changed between them.
        return Output(
            {
                "answer": reply,
                "tools": tools,
                "tool_calls": tool_calls_in(spans),
                "available_tools": available_tools_in(spans),
                "memories": memories,
                "seconds": round(time.monotonic() - started, 2),
                "model": model,
                "prompt_version": self.agent.prompt_version,
                "suite_version": inputs["suite_version"],
            }
        )

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
        facts = list(self.definition["memories"].values())
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


def tool_calls_in(spans: list) -> list[dict]:
    """The tool calls of the turn in order, each result cut short."""
    return [
        {
            "name": span.attributes["gen_ai.tool.name"],
            "arguments": json.loads(span.attributes["gen_ai.tool.call.arguments"]),
            "result": str(span.attributes["gen_ai.tool.call.result"])[:RESULT_CHARS],
        }
        for span in spans
        if span.name.startswith("execute_tool ")
    ]


def available_tools_in(spans: list) -> str:
    """The tool definitions the model was given, as its first request carried them."""
    return next(
        (
            span.attributes["gen_ai.tool.definitions"]
            for span in spans
            if "gen_ai.tool.definitions" in span.attributes
        ),
        "[]",
    )


def suite_version(definition: dict) -> str:
    """Changes when a case or the seed changes, so runs on different suites are not
    compared as if only the prompt had moved."""
    cases = json.dumps(
        [definition["cases"], definition["memories"]],
        sort_keys=True,
        ensure_ascii=False,
    )
    seed = (SUITE / "seed.sql").read_text()
    return hashlib.sha256(f"{cases}\n{seed}".encode()).hexdigest()[:12]


def load_cases(repeats: int) -> list[Case]:
    """Refuses a remote database or a shop seeded on another day, so a run only scores
    the seeded shop with today's dates."""
    require_local_database(app_config.POSTGRES_URL, app_config.AI_SQL_READER_URL)
    definition = load_definition()
    shop_id = definition["shop_id"]
    version = suite_version(definition)
    with PostgreDBClient(app_config.POSTGRES_URL).engine.connect() as connection:
        owner_id, seeded_today = connection.execute(
            text(
                f"SELECT owner_id, (created_at AT TIME ZONE {definition['time_zone']})"
                f"::date = {definition['shop_today']} FROM shops WHERE id = {shop_id}"
            )
        ).one_or_none() or (None, False)
        if owner_id is None:
            raise SystemExit(
                "seed the shop first; see evaluation/suites/agent_chat/README.md"
            )
        if not seeded_today:
            raise SystemExit("the seed is from another day; run seed.sql again")
        cases = []
        for case in definition["cases"]:
            names = column(connection, case.get("names"))
            numbers = column(connection, case.get("numbers"))
            rubric = case.get("judge")
            inputs = {
                "question": case["question"],
                "follow_up": case.get("follow_up"),
                "owner_id": owner_id,
                "suite_version": version,
            }
            truth = {
                "shop_id": shop_id,
                "numbers": numbers,
                "names": names,
                "judge": rubric
                and rubric.format(names=", ".join(names), numbers=numbers),
                "approximate": case.get("approximate", False),
                "needs_tool": case.get("needs_tool", True),
                "memory": definition["memories"][case["memory"]]["content"]
                if "memory" in case
                else None,
            }
            # The attempt keeps the repeats apart, since HoneyHive keys a datapoint
            # by its content.
            cases += [
                Case(
                    case["id"],
                    {**inputs, "attempt": attempt},
                    truth,
                    expected=numbers + names,
                )
                for attempt in range(1, repeats + 1)
            ]
        return cases


def column(connection, query: str | None) -> list:
    """The query's values; a sum over no rows is NULL, which means zero here."""
    if query is None:
        return []
    values = connection.execute(text(query)).scalars().all()
    return [value if isinstance(value, str) else float(value or 0) for value in values]


def shop_today() -> date:
    definition = load_definition()
    with PostgreDBClient(app_config.POSTGRES_URL).engine.connect() as connection:
        return connection.execute(text(f"SELECT {definition['shop_today']}")).scalar()
