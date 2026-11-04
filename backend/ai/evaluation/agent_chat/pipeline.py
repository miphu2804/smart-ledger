import asyncio
import hashlib
import json
import sys
import time
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

from evaluation.agent_chat.cases import (
    CASES,
    MEMORIES,
    SHOP_ID,
    SHOP_TODAY,
    TIME_ZONE,
)
from evaluation.agent_chat.judge import judge, judged_scores, question_of, rate
from evaluation.agent_chat.scoring import (
    correct,
    no_internal_leak,
    recalled_expected,
    seconds,
    tool_calls,
    tool_choice,
    vietnamese_answer,
)
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

HERE = Path(__file__).parent
LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")
# The most a tool result or a memory takes in a prompt to the judge or in the outputs.
RESULT_CHARS = 500


def trace_tools() -> InMemorySpanExporter:
    """Records every agent's spans in memory, which is where the arguments and results
    of a turn's tool calls are read from; nothing leaves the process."""
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


def without_memory_writes(memory: AgentMemoryService) -> None:
    """Keeps recall but drops what a turn would store."""

    async def skip(*arguments, **keywords) -> None:
        return None

    memory.remember = skip


def memory_for(
    datapoint: dict, memory: AgentMemoryService
) -> AgentMemoryService | None:
    """Recall runs only in the memory cases.

    The seeded facts would otherwise lead every other case's prompt, because recall
    has no score cut-off, and their results would stop matching earlier runs.
    """
    return memory if datapoint["ground_truth"]["memory"] else None


async def seed_memories(memory: AgentMemoryService, owner_id: int) -> None:
    """Replaces the shop's memories with `MEMORIES`, stored under a new conversation."""
    with memory.repository.postgres.session() as session:
        session.execute(
            text("DELETE FROM agent_memories WHERE shop_id = :shop"), {"shop": SHOP_ID}
        )
        conversation_id = session.execute(
            text(
                "INSERT INTO chat_conversations (user_id, shop_id, title) "
                "VALUES (:owner, :shop, 'memory seed') RETURNING id"
            ),
            {"owner": owner_id, "shop": SHOP_ID},
        ).scalar_one()
    facts = list(MEMORIES.values())
    vectors = await memory.embedder.embed_documents([fact["content"] for fact in facts])
    await asyncio.to_thread(
        memory.repository.add,
        SHOP_ID,
        owner_id,
        conversation_id,
        [
            NewMemory(fact["memory_type"], fact["content"], 0.8, list(vector))
            for fact, vector in zip(facts, vectors.embeddings, strict=True)
        ],
    )


async def answer(agent, exporter: InMemorySpanExporter, datapoint: dict) -> dict:
    """Asks the question, then the follow-up in the same conversation if there is one;
    the outputs describe the last turn."""
    inputs = datapoint["inputs"]
    turns = (
        [inputs["question"], inputs["follow_up"]]
        if inputs["follow_up"]
        else [inputs["question"]]
    )
    conversation_id = None
    for question in turns:
        exporter.clear()
        reply = ""
        model = ""
        tools: list[str] = []
        memories: list[dict] = []
        started = time.monotonic()
        events = await agent.stream_chat(
            inputs["owner_id"], SHOP_ID, question, conversation_id
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
    spans = sorted(exporter.get_finished_spans(), key=lambda span: span.start_time)
    # The model, prompt and suite version travel with every row, so two runs in
    # HoneyHive or in results/ show what changed between them.
    return {
        "answer": reply,
        "tools": tools,
        "tool_calls": tool_calls_in(spans),
        "available_tools": available_tools_in(spans),
        "memories": memories,
        "seconds": round(time.monotonic() - started, 2),
        "model": model,
        "prompt_version": agent.prompt_version,
        "suite_version": inputs["suite_version"],
    }


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


def suite_version() -> str:
    """Changes when a case or the seed changes, so runs on different suites are not
    compared as if only the prompt had moved."""
    cases = json.dumps([CASES, MEMORIES], sort_keys=True, ensure_ascii=False)
    seed = (HERE / "seed.sql").read_text()
    return hashlib.sha256(f"{cases}\n{seed}".encode()).hexdigest()[:12]


def build_dataset(repeats: int) -> list[dict]:
    """Refuses a remote database or a shop seeded on another day, so a run only scores
    the seeded shop with today's dates."""
    for url in (app_config.POSTGRES_URL, app_config.AI_SQL_READER_URL):
        if urlsplit(url or "").hostname not in LOCAL_HOSTS:
            raise SystemExit("evaluation runs on the local database only")
    version = suite_version()
    with PostgreDBClient(app_config.POSTGRES_URL).engine.connect() as connection:
        owner_id, seeded_today = connection.execute(
            text(
                f"SELECT owner_id, (created_at AT TIME ZONE {TIME_ZONE})::date "
                f"= {SHOP_TODAY} FROM shops WHERE id = {SHOP_ID}"
            )
        ).one_or_none() or (None, False)
        if owner_id is None:
            raise SystemExit("seed the shop first; see evaluation/agent_chat/README.md")
        if not seeded_today:
            raise SystemExit("the seed is from another day; run seed.sql again")
        datapoints = []
        for case in CASES:
            names = column(connection, case.get("names"))
            numbers = column(connection, case.get("numbers"))
            rubric = case.get("judge")
            datapoint = {
                "inputs": {
                    "question": case["question"],
                    "follow_up": case.get("follow_up"),
                    "owner_id": owner_id,
                    "suite_version": version,
                },
                "ground_truth": {
                    "case": case["id"],
                    "numbers": numbers,
                    "names": names,
                    "judge": rubric
                    and rubric.format(names=", ".join(names), numbers=numbers),
                    "approximate": case.get("approximate", False),
                    "needs_tool": case.get("needs_tool", True),
                    "memory": MEMORIES[case["memory"]]["content"]
                    if "memory" in case
                    else None,
                },
            }
            # The attempt keeps the repeats apart, since HoneyHive keys a datapoint
            # by its content.
            datapoints += [
                {**datapoint, "inputs": {**datapoint["inputs"], "attempt": attempt}}
                for attempt in range(1, repeats + 1)
            ]
        return datapoints


def column(connection, query: str | None) -> list:
    """The query's values; a sum over no rows is NULL, which means zero here."""
    if query is None:
        return []
    values = connection.execute(text(query)).scalars().all()
    return [value if isinstance(value, str) else float(value or 0) for value in values]


async def run_all(dataset: list[dict], judge_alias: str) -> list[dict]:
    """Answers and scores every datapoint one after another, so `seconds` measures the
    agent and not a shared rate limit. A datapoint that raises is logged and left
    out."""
    exporter = trace_tools()
    results = []
    async with lifespan(app):
        agent = app.state.agent
        memory = app.state.memory
        without_memory_writes(memory)
        await seed_memories(memory, dataset[0]["inputs"]["owner_id"])
        for datapoint in dataset:
            agent.memory = memory_for(datapoint, memory)
            try:
                results.append(await score(agent, exporter, datapoint, judge_alias))
            except Exception as error:
                print(
                    f"{datapoint['ground_truth']['case']} failed: {error!r}",
                    file=sys.stderr,
                )
    return results


async def score(
    agent, exporter: InMemorySpanExporter, datapoint: dict, judge_alias: str
) -> dict:
    outputs = await answer(agent, exporter, datapoint)
    inputs, truth = datapoint["inputs"], datapoint["ground_truth"]
    if truth["judge"]:
        outputs["verdict"] = await judge(
            question_of(inputs), outputs["answer"], truth["judge"], judge_alias
        )
    metrics = {
        "correct": correct(outputs, inputs, truth)["score"],
        "tool_choice": tool_choice(outputs, inputs, truth),
        "tool_calls": tool_calls(outputs, inputs, truth),
        "seconds": seconds(outputs, inputs, truth),
        "recalled_expected": recalled_expected(outputs, inputs, truth),
        "no_internal_leak": no_internal_leak(outputs, inputs, truth),
        "vietnamese_answer": vietnamese_answer(outputs, inputs, truth),
        **await judged_scores(
            outputs, inputs, truth, lambda prompt: rate(prompt, judge_alias)
        ),
    }
    return {
        "datapoint": datapoint,
        "outputs": outputs,
        # A case a metric does not apply to has no value for it.
        "metrics": {
            name: value for name, value in metrics.items() if value is not None
        },
    }


def shop_today() -> date:
    with PostgreDBClient(app_config.POSTGRES_URL).engine.connect() as connection:
        return connection.execute(text(f"SELECT {SHOP_TODAY}")).scalar()
