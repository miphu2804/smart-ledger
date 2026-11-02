import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic_ai.models.test import TestModel
from tests.support import ScriptedModel
from tests.unit_tests.test_agent_memory import (
    FakeMemoryRepository,
    memory_service,
    recalled,
)

from src.app_config import app_config

pytestmark = pytest.mark.anyio

RUN = Path(__file__).parents[2] / "evaluation" / "agent_chat" / "run.py"
MEMORY_TEXT = "Gạo ST25 của shop nhập từ cô Ba."
SQL_ERROR = "Error[SQL_REJECTED] unknown view. Rewrite the query and retry."


@pytest.fixture(scope="module")
def run():
    """Loads the script, which switches the app config for its own run, and puts the
    config back so the other tests see it unchanged."""
    saved = (app_config.HH_API_KEY, app_config.AGENT_MEMORY_ENABLED)
    spec = importlib.util.spec_from_file_location("agent_chat_run", RUN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app_config.HH_API_KEY, app_config.AGENT_MEMORY_ENABLED = saved
    return module


def call(result: str = '{"row_count": 1}') -> dict:
    return {
        "name": "query_shop_data",
        "arguments": {"sql": "SELECT 1"},
        "result": result,
    }


def outputs_of(calls=(), memories=()) -> dict:
    return {
        "answer": "Tháng trước bán 10 triệu.",
        "tools": [item["name"] for item in calls],
        "tool_calls": list(calls),
        "available_tools": '[{"name": "query_shop_data"}]',
        "memories": list(memories),
        "seconds": 1.5,
        "model": "m",
        "prompt_version": "p",
        "suite_version": "s",
    }


def memory_of(content: str = MEMORY_TEXT) -> dict:
    return {"id": 7, "content": content, "memory_type": "semantic", "score": 0.8}


INPUTS = {"question": "Gạo ST25 nhập của ai?", "follow_up": None, "attempt": 1}
PLAIN = {"memory": None}
WITH_MEMORY = {"memory": MEMORY_TEXT}


class FakeRater:
    """Stands in for the judge: records each prompt and rates it 4."""

    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def __call__(self, prompt: str) -> dict:
        self.prompts.append(prompt)
        return {"reason": "fine", "score": 4}


async def test_tool_usage_reads_the_tools_query_and_actions(run) -> None:
    rater = FakeRater()

    scores = await run.judged_scores(outputs_of([call()]), INPUTS, PLAIN, rater)

    prompt = rater.prompts[0]
    assert scores["tool_usage"] == 4
    assert '[{"name": "query_shop_data"}]' in prompt
    assert INPUTS["question"] in prompt
    assert "SELECT 1" in prompt


async def test_failure_recovery_runs_only_when_a_tool_failed(run) -> None:
    clean, failed = FakeRater(), FakeRater()

    clean_scores = await run.judged_scores(outputs_of([call()]), INPUTS, PLAIN, clean)
    failed_scores = await run.judged_scores(
        outputs_of([call(SQL_ERROR), call()]), INPUTS, PLAIN, failed
    )

    assert "failure_recovery" not in clean_scores
    assert failed_scores["failure_recovery"] == 4
    assert any(
        SQL_ERROR in prompt and "Failure Recovery" in prompt
        for prompt in failed.prompts
    )


async def test_answer_faithfulness_reads_tool_results_and_memories(run) -> None:
    rater = FakeRater()
    outputs = outputs_of([call('{"rows": [[10000000]]}')], [memory_of()])

    scores = await run.judged_scores(outputs, INPUTS, WITH_MEMORY, rater)

    prompt = next(item for item in rater.prompts if "faithful" in item)
    assert scores["answer_faithfulness"] == 4
    assert "10000000" in prompt
    assert MEMORY_TEXT in prompt
    assert outputs["answer"] in prompt


async def test_context_relevance_scores_only_memory_cases(run) -> None:
    plain, remembering = FakeRater(), FakeRater()

    plain_scores = await run.judged_scores(outputs_of(), INPUTS, PLAIN, plain)
    memory_scores = await run.judged_scores(
        outputs_of(memories=[memory_of()]), INPUTS, WITH_MEMORY, remembering
    )

    assert "context_relevance" not in plain_scores
    assert memory_scores["context_relevance"] == 4
    prompt = next(item for item in remembering.prompts if "retriever" in item)
    assert MEMORY_TEXT in prompt
    assert INPUTS["question"] in prompt


async def test_tool_trajectory_lists_calls_in_order_for_tool_turns_only(run) -> None:
    without, with_calls = FakeRater(), FakeRater()
    second = {**call(), "arguments": {"sql": "SELECT 2"}}

    without_scores = await run.judged_scores(outputs_of(), INPUTS, PLAIN, without)
    scores = await run.judged_scores(
        outputs_of([call(), second]), INPUTS, PLAIN, with_calls
    )

    assert "tool_trajectory" not in without_scores
    assert scores["tool_trajectory"] == 4
    prompt = next(
        item for item in with_calls.prompts if "[Tool calls in order]" in item
    )
    assert prompt.index("SELECT 1") < prompt.index("SELECT 2")


async def test_judge_reasons_travel_in_the_outputs(run) -> None:
    outputs = outputs_of([call()])

    await run.judged_scores(outputs, INPUTS, PLAIN, FakeRater())

    assert outputs["judge_reasons"]["tool_usage"] == "fine"


def test_recalled_expected_checks_the_seeded_fact(run) -> None:
    hit = outputs_of(memories=[memory_of()])

    assert run.recalled_expected(hit, INPUTS, WITH_MEMORY) == 1
    assert run.recalled_expected(outputs_of(), INPUTS, WITH_MEMORY) == 0
    assert run.recalled_expected(hit, INPUTS, PLAIN) is None


def test_tool_calls_are_read_from_spans_in_order_and_cut_short(run) -> None:
    def span(name, **attributes):
        return SimpleNamespace(name=name, attributes=attributes)

    spans = [
        span("chat m", **{"gen_ai.tool.definitions": "[defs]"}),
        span(
            "execute_tool query_shop_data",
            **{
                "gen_ai.tool.name": "query_shop_data",
                "gen_ai.tool.call.arguments": '{"sql": "SELECT 1"}',
                "gen_ai.tool.call.result": "x" * 2000,
            },
        ),
    ]

    calls = run.tool_calls_in(spans)

    assert calls == [
        {
            "name": "query_shop_data",
            "arguments": {"sql": "SELECT 1"},
            "result": "x" * run.RESULT_CHARS,
        }
    ]
    assert run.available_tools_in(spans) == "[defs]"
    assert run.available_tools_in([]) == "[]"


async def test_blocked_memory_writes_store_nothing(run) -> None:
    extractor = ScriptedModel(json.dumps({"facts": []}))
    repository = FakeMemoryRepository()
    service = memory_service(extractor, repository)
    run.without_memory_writes(service)

    await service.remember(15, 3, 9, "gạo nhập của cô Ba", "Dạ.", [])

    assert repository.added == []
    assert extractor.requests == []


def test_only_memory_cases_recall(run) -> None:
    service = memory_service(TestModel(), FakeMemoryRepository())

    assert (
        run.memory_for({"ground_truth": {"memory": "Gạo nhập của cô Ba."}}, service)
        is service
    )
    assert run.memory_for({"ground_truth": {"memory": None}}, service) is None


async def test_blocked_memory_writes_keep_recall(run) -> None:
    service = memory_service(TestModel(), FakeMemoryRepository(recalled=[recalled()]))
    run.without_memory_writes(service)

    _, memories = await service.with_memories(15, 3, "gạo?")

    assert len(memories) == 1


def test_session_payload_holds_scores_without_spans(run) -> None:
    result = {
        "datapoint": {
            "inputs": INPUTS,
            "ground_truth": {"case": "memory_rice_supplier"},
        },
        "outputs": outputs_of(),
        "metrics": {"correct": 1, "recalled_expected": 1},
    }

    first = run.session_payload("run-1", "baseline", result)["session"]
    second = run.session_payload("run-2", "baseline", result)["session"]

    assert first["source"] == "evaluation"
    assert first["metrics"] == {"correct": 1, "recalled_expected": 1}
    assert first["metadata"]["run_id"] == "run-1"
    assert "events" not in first and "spans" not in first
    # The same case pairs across runs.
    assert first["metadata"]["datapoint_id"] == second["metadata"]["datapoint_id"]
    assert first["session_id"] != second["session_id"]


def test_sync_creates_the_run_logs_each_case_then_completes_it(run) -> None:
    calls = []

    class Client:
        experiments = SimpleNamespace(
            create_run=lambda request: (
                calls.append(("create", request.status))
                or SimpleNamespace(run_id="run-1")
            ),
            update_run=lambda run_id, request: calls.append(
                ("complete", run_id, request.status, request.event_ids)
            ),
        )
        sessions = SimpleNamespace(
            start=lambda payload: (
                calls.append(("session", payload))
                or SimpleNamespace(session_id=f"s{len(calls)}")
            )
        )

    result = {
        "datapoint": {"inputs": INPUTS, "ground_truth": {"case": "c"}},
        "outputs": outputs_of(),
        "metrics": {"correct": 1},
    }

    run.sync_scores(Client(), "baseline", [result, result])

    assert [item[0] for item in calls] == ["create", "session", "session", "complete"]
    assert calls[0][1] == "pending"
    assert calls[1][1]["session"]["metadata"]["run_id"] == "run-1"
    assert calls[3][2:] == ("completed", ["s2", "s3"])
