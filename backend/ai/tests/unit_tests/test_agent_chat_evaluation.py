import json
import tomllib
from types import SimpleNamespace

import pytest
from evaluation.agent_chat import reporting
from evaluation.agent_chat.honeyhive_sync import session_payload, sync_scores
from evaluation.agent_chat.judge import judged_scores
from evaluation.agent_chat.pipeline import (
    HERE,
    RESULT_CHARS,
    available_tools_in,
    memory_for,
    tool_calls_in,
    without_memory_writes,
)
from evaluation.agent_chat.reporting import (
    LAYERS,
    averages,
    gate_failures,
    markdown_report,
    report,
)
from evaluation.agent_chat.scoring import (
    no_internal_leak,
    recalled_expected,
    vietnamese_answer,
)
from pydantic_ai.models.test import TestModel
from tests.support import ScriptedModel
from tests.unit_tests.test_agent_memory import (
    FakeMemoryRepository,
    memory_service,
    recalled,
)

pytestmark = pytest.mark.anyio

MEMORY_TEXT = "Gạo ST25 của shop nhập từ cô Ba."
SQL_ERROR = "Error[SQL_REJECTED] unknown view. Rewrite the query and retry."


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


async def test_tool_usage_reads_the_tools_query_and_actions() -> None:
    rater = FakeRater()

    scores = await judged_scores(outputs_of([call()]), INPUTS, PLAIN, rater)

    prompt = rater.prompts[0]
    assert scores["tool_usage"] == 4
    assert '[{"name": "query_shop_data"}]' in prompt
    assert INPUTS["question"] in prompt
    assert "SELECT 1" in prompt


async def test_failure_recovery_runs_only_when_a_tool_failed() -> None:
    clean, failed = FakeRater(), FakeRater()

    clean_scores = await judged_scores(outputs_of([call()]), INPUTS, PLAIN, clean)
    failed_scores = await judged_scores(
        outputs_of([call(SQL_ERROR), call()]), INPUTS, PLAIN, failed
    )

    assert "failure_recovery" not in clean_scores
    assert failed_scores["failure_recovery"] == 4
    assert any(
        SQL_ERROR in prompt and "Failure Recovery" in prompt
        for prompt in failed.prompts
    )


async def test_answer_faithfulness_reads_tool_results_and_memories() -> None:
    rater = FakeRater()
    outputs = outputs_of([call('{"rows": [[10000000]]}')], [memory_of()])

    scores = await judged_scores(outputs, INPUTS, WITH_MEMORY, rater)

    prompt = next(item for item in rater.prompts if "faithful" in item)
    assert scores["answer_faithfulness"] == 4
    assert "10000000" in prompt
    assert MEMORY_TEXT in prompt
    assert outputs["answer"] in prompt


async def test_context_relevance_scores_only_memory_cases() -> None:
    plain, remembering = FakeRater(), FakeRater()

    plain_scores = await judged_scores(outputs_of(), INPUTS, PLAIN, plain)
    memory_scores = await judged_scores(
        outputs_of(memories=[memory_of()]), INPUTS, WITH_MEMORY, remembering
    )

    assert "context_relevance" not in plain_scores
    assert memory_scores["context_relevance"] == 4
    prompt = next(item for item in remembering.prompts if "retriever" in item)
    assert MEMORY_TEXT in prompt
    assert INPUTS["question"] in prompt


async def test_tool_trajectory_lists_calls_in_order_for_tool_turns_only() -> None:
    without, with_calls = FakeRater(), FakeRater()
    second = {**call(), "arguments": {"sql": "SELECT 2"}}

    without_scores = await judged_scores(outputs_of(), INPUTS, PLAIN, without)
    scores = await judged_scores(
        outputs_of([call(), second]), INPUTS, PLAIN, with_calls
    )

    assert "tool_trajectory" not in without_scores
    assert scores["tool_trajectory"] == 4
    prompt = next(
        item for item in with_calls.prompts if "[Tool calls in order]" in item
    )
    assert prompt.index("SELECT 1") < prompt.index("SELECT 2")


async def test_judge_reasons_travel_in_the_outputs() -> None:
    outputs = outputs_of([call()])

    await judged_scores(outputs, INPUTS, PLAIN, FakeRater())

    assert outputs["judge_reasons"]["tool_usage"] == "fine"


def test_recalled_expected_checks_the_seeded_fact() -> None:
    hit = outputs_of(memories=[memory_of()])

    assert recalled_expected(hit, INPUTS, WITH_MEMORY) == 1
    assert recalled_expected(outputs_of(), INPUTS, WITH_MEMORY) == 0
    assert recalled_expected(hit, INPUTS, PLAIN) is None


def test_tool_calls_are_read_from_spans_in_order_and_cut_short() -> None:
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

    calls = tool_calls_in(spans)

    assert calls == [
        {
            "name": "query_shop_data",
            "arguments": {"sql": "SELECT 1"},
            "result": "x" * RESULT_CHARS,
        }
    ]
    assert available_tools_in(spans) == "[defs]"
    assert available_tools_in([]) == "[]"


async def test_blocked_memory_writes_store_nothing() -> None:
    extractor = ScriptedModel(json.dumps({"facts": []}))
    repository = FakeMemoryRepository()
    service = memory_service(extractor, repository)
    without_memory_writes(service)

    await service.remember(15, 3, 9, "gạo nhập của cô Ba", "Dạ.", [])

    assert repository.added == []
    assert extractor.requests == []


def test_only_memory_cases_recall() -> None:
    service = memory_service(TestModel(), FakeMemoryRepository())

    assert (
        memory_for({"ground_truth": {"memory": "Gạo nhập của cô Ba."}}, service)
        is service
    )
    assert memory_for({"ground_truth": {"memory": None}}, service) is None


async def test_blocked_memory_writes_keep_recall() -> None:
    service = memory_service(TestModel(), FakeMemoryRepository(recalled=[recalled()]))
    without_memory_writes(service)

    _, memories = await service.with_memories(15, 3, "gạo?")

    assert len(memories) == 1


def test_session_payload_holds_scores_without_spans() -> None:
    result = {
        "datapoint": {
            "inputs": INPUTS,
            "ground_truth": {"case": "memory_rice_supplier"},
        },
        "outputs": outputs_of(),
        "metrics": {"correct": 1, "recalled_expected": 1},
    }

    first = session_payload("run-1", "baseline", result)["session"]
    second = session_payload("run-2", "baseline", result)["session"]

    assert first["source"] == "evaluation"
    assert first["metrics"] == {"correct": 1, "recalled_expected": 1}
    assert first["metadata"]["run_id"] == "run-1"
    assert "events" not in first and "spans" not in first
    # The same case pairs across runs.
    assert first["metadata"]["datapoint_id"] == second["metadata"]["datapoint_id"]
    assert first["session_id"] != second["session_id"]


def test_sync_creates_the_run_logs_each_case_then_completes_it() -> None:
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

    sync_scores(Client(), "baseline", [result, result])

    assert [item[0] for item in calls] == ["create", "session", "session", "complete"]
    assert calls[0][1] == "pending"
    assert calls[1][1]["session"]["metadata"]["run_id"] == "run-1"
    assert calls[3][2:] == ("completed", ["s2", "s3"])


def test_no_internal_leak_flags_views_sql_and_tool_names() -> None:
    def leak(answer: str) -> int:
        return no_internal_leak({"answer": answer}, {}, {})

    assert leak("Tháng trước shop bán được 12.500.000đ.") == 1
    assert leak("Em đọc từ ai_read.v_sales nhé.") == 0
    assert leak("SELECT sum(total_vnd) FROM sales") == 0
    assert leak("Error[SQL_REJECTED] unknown view") == 0


def test_vietnamese_answer_ignores_blocks_and_empty_answers() -> None:
    def vietnamese(answer: str) -> int:
        return vietnamese_answer({"answer": answer}, {}, {})

    assert vietnamese("Dạ, doanh thu hôm nay là 1.200.000đ.") == 1
    assert vietnamese("Revenue today is 1,200,000 VND.") == 0
    assert vietnamese('```chart\n{"type": "bar"}\n```') == 1
    assert vietnamese("") == 1


def test_averages_skip_rows_a_metric_does_not_apply_to() -> None:
    rows = [
        {"correct": 1, "recalled_expected": 1},
        {"correct": 0, "recalled_expected": None},
    ]

    assert averages(rows) == {"correct": (0.5, 2), "recalled_expected": (1.0, 1)}


def test_gate_fails_below_a_minimum_or_with_no_row() -> None:
    means = {"correct": (0.85, 20), "tool_choice": (0.95, 20)}

    failures = gate_failures(
        means, {"correct": 0.9, "tool_choice": 0.9, "recalled_expected": 1.0}
    )

    assert failures == [
        "correct: 0.85 < 0.9",
        "recalled_expected: no row scored it",
    ]


def test_thresholds_gate_only_reported_metrics() -> None:
    minimums = tomllib.loads((HERE / "thresholds.toml").read_text())["minimum"]
    reported = {name for names in LAYERS.values() for name in names}

    assert set(minimums) <= reported


def test_markdown_report_shows_the_gate_layers_and_missed_cases() -> None:
    rows = [
        {
            "case": "revenue_last_month",
            "correct": 0,
            "model": "gpt-6-luna",
            "prompt_version": "p1",
            "suite_version": "s1",
        },
        {"case": "greeting", "correct": 1},
    ]
    means = averages(rows)
    failures = gate_failures(means, {"correct": 0.9})

    markdown = markdown_report(rows, means, {"correct": 0.9}, failures, 3)

    assert markdown.startswith("## agent_chat eval: gate failed")
    assert "2/3 rows" in markdown
    assert "| task | `correct` | 0.50 | 2 | 0.9 | fail |" in markdown
    assert "- correct: 0.50 < 0.9" in markdown
    assert "- `revenue_last_month` missed `correct`" in markdown


async def test_a_failed_rating_leaves_only_its_metric_out() -> None:
    async def rate(prompt: str) -> dict:
        if "faithful" in prompt.casefold():
            raise RuntimeError("gateway 502")
        return {"score": 4, "reason": "ok"}

    outputs = {
        "answer": "Dạ, 12.500.000đ.",
        "tools": ["query_shop_data"],
        "tool_calls": [call()],
        "available_tools": "[]",
        "memories": [],
    }
    inputs = {"question": "Doanh thu tháng trước?", "follow_up": None}
    truth = {"memory": None}

    scores = await judged_scores(outputs, inputs, truth, rate)

    assert "answer_faithfulness" not in scores
    assert scores["tool_usage"] == 4
    assert "gateway 502" in outputs["judge_errors"]["answer_faithfulness"]


def test_report_rows_keep_the_tool_calls_metric(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(reporting, "RESULTS", tmp_path)
    result = {
        "datapoint": {"ground_truth": {"case": "revenue", "numbers": [1], "names": []}},
        "outputs": {
            "answer": "1",
            "tool_calls": [call()],
            "seconds": 1.0,
            "model": "m",
            "prompt_version": "p",
            "suite_version": "s",
        },
        "metrics": {"correct": 1, "tool_choice": 1, "tool_calls": 1, "seconds": 1.0},
    }

    rows = report("test", [result])

    assert rows[0]["tool_calls"] == 1
    assert rows[0]["tool_call_log"] == [call()]
    assert averages(rows)["tool_calls"] == (1.0, 1)
