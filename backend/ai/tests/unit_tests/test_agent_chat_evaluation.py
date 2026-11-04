import json
import tomllib
from types import SimpleNamespace

import pytest
from evaluation.agent_chat.agent_chat_eval import AgentChatEval
from evaluation.core import report as reporting
from evaluation.core.gate import gate_failures
from evaluation.core.honeyhive import session_payload, sync_scores
from evaluation.core.report import (
    LAYERS,
    averages,
    markdown_report,
    report,
)
from evaluation.core.schema import Case, CaseResult, MetricResult, Output
from evaluation.metrics.judge import Judge
from evaluation.metrics.memory import MemoryEvaluator
from evaluation.metrics.response_quality import ResponseQualityEvaluator
from evaluation.metrics.safety import SafetyEvaluator
from evaluation.metrics.tool_use import ToolUseEvaluator
from evaluation.targets.agent import RESULT_CHARS, AgentTarget
from evaluation.targets.without_memory_writes import WithoutMemoryWrites
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
PLAIN = {"memory": None, "needs_tool": True}
WITH_MEMORY = {"memory": MEMORY_TEXT, "needs_tool": False}


class FakeJudge(Judge):
    """Stands in for the model: records each prompt and rates it 4."""

    def __init__(self) -> None:
        super().__init__("chat", 1)
        self.prompts: list[str] = []

    async def rating(self, prompt: str) -> dict:
        self.prompts.append(prompt)
        return {"reason": "fine", "score": 4}


async def scores_of(evaluator, outputs: dict, truth: dict, inputs=INPUTS) -> dict:
    """The score of each metric the evaluator gave the case, by name."""
    results = await evaluator.evaluate(Case("c", inputs, truth), Output(outputs))
    return {metric.name: metric.score for metric in results}


async def test_tool_usage_reads_the_tools_query_and_actions() -> None:
    judge = FakeJudge()

    scores = await scores_of(ToolUseEvaluator(judge), outputs_of([call()]), PLAIN)

    prompt = judge.prompts[0]
    assert scores["tool_usage"] == 4
    assert '[{"name": "query_shop_data"}]' in prompt
    assert INPUTS["question"] in prompt
    assert "SELECT 1" in prompt


async def test_failure_recovery_runs_only_when_a_tool_failed() -> None:
    clean, failed = FakeJudge(), FakeJudge()

    clean_scores = await scores_of(ToolUseEvaluator(clean), outputs_of([call()]), PLAIN)
    failed_scores = await scores_of(
        ToolUseEvaluator(failed), outputs_of([call(SQL_ERROR), call()]), PLAIN
    )

    assert "failure_recovery" not in clean_scores
    assert failed_scores["failure_recovery"] == 4
    assert any(
        SQL_ERROR in prompt and "Failure Recovery" in prompt
        for prompt in failed.prompts
    )


async def test_answer_faithfulness_reads_tool_results_and_memories() -> None:
    judge = FakeJudge()
    outputs = outputs_of([call('{"rows": [[10000000]]}')], [memory_of()])

    scores = await scores_of(ResponseQualityEvaluator(judge), outputs, WITH_MEMORY)

    prompt = judge.prompts[0]
    assert scores["answer_faithfulness"] == 4
    assert "10000000" in prompt
    assert MEMORY_TEXT in prompt
    assert outputs["answer"] in prompt


async def test_context_relevance_scores_only_memory_cases() -> None:
    plain, remembering = FakeJudge(), FakeJudge()

    plain_scores = await scores_of(MemoryEvaluator(plain), outputs_of(), PLAIN)
    memory_scores = await scores_of(
        MemoryEvaluator(remembering), outputs_of(memories=[memory_of()]), WITH_MEMORY
    )

    assert plain_scores == {}
    assert memory_scores["context_relevance"] == 4
    prompt = remembering.prompts[0]
    assert "retriever" in prompt
    assert MEMORY_TEXT in prompt
    assert INPUTS["question"] in prompt


async def test_tool_trajectory_lists_calls_in_order_for_tool_turns_only() -> None:
    without, with_calls = FakeJudge(), FakeJudge()
    second = {**call(), "arguments": {"sql": "SELECT 2"}}

    without_scores = await scores_of(ToolUseEvaluator(without), outputs_of(), PLAIN)
    scores = await scores_of(
        ToolUseEvaluator(with_calls), outputs_of([call(), second]), PLAIN
    )

    assert "tool_trajectory" not in without_scores
    assert scores["tool_trajectory"] == 4
    prompt = next(
        item for item in with_calls.prompts if "[Tool calls in order]" in item
    )
    assert prompt.index("SELECT 1") < prompt.index("SELECT 2")


async def test_judge_reasons_travel_in_the_outputs() -> None:
    outputs = outputs_of([call()])

    await scores_of(ToolUseEvaluator(FakeJudge()), outputs, PLAIN)

    assert outputs["judge_reasons"]["tool_usage"] == "fine"


async def test_recalled_expected_checks_the_seeded_fact() -> None:
    evaluator = MemoryEvaluator(FakeJudge())
    hit = outputs_of(memories=[memory_of()])

    assert (await scores_of(evaluator, hit, WITH_MEMORY))["recalled_expected"] == 1
    assert (await scores_of(evaluator, outputs_of(), WITH_MEMORY))[
        "recalled_expected"
    ] == 0
    assert "recalled_expected" not in await scores_of(evaluator, hit, PLAIN)


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

    calls = AgentTarget.tool_calls_in(spans)

    assert calls == [
        {
            "name": "query_shop_data",
            "arguments": {"sql": "SELECT 1"},
            "result": "x" * RESULT_CHARS,
        }
    ]
    assert AgentTarget.available_tools_in(spans) == "[defs]"
    assert AgentTarget.available_tools_in([]) == "[]"


async def test_blocked_memory_writes_store_nothing() -> None:
    extractor = ScriptedModel(json.dumps({"facts": []}))
    repository = FakeMemoryRepository()
    service = memory_service(extractor, repository)
    memory = WithoutMemoryWrites(service)

    await memory.remember(15, 3, 9, "gạo nhập của cô Ba", "Dạ.", [])

    assert repository.added == []
    assert extractor.requests == []


def test_only_memory_cases_recall() -> None:
    service = memory_service(TestModel(), FakeMemoryRepository())

    memory_case = Case("c", {}, {"memory": "Gạo nhập của cô Ba."})
    assert AgentTarget.memory_for(memory_case, service) is service
    assert AgentTarget.memory_for(Case("c", {}, {"memory": None}), service) is None


async def test_blocked_memory_writes_keep_recall() -> None:
    service = memory_service(TestModel(), FakeMemoryRepository(recalled=[recalled()]))
    memory = WithoutMemoryWrites(service)

    _, memories = await memory.with_memories(15, 3, "gạo?")

    assert len(memories) == 1


def test_session_payload_holds_scores_without_spans() -> None:
    result = CaseResult(
        Case("memory_rice_supplier", INPUTS, {}),
        Output(outputs_of()),
        [
            MetricResult("task", "correct", 1, "memory_rice_supplier"),
            MetricResult("memory", "recalled_expected", 1, "memory_rice_supplier"),
        ],
    )

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

    result = CaseResult(
        Case("c", INPUTS, {}),
        Output(outputs_of()),
        [MetricResult("task", "correct", 1, "c")],
    )

    sync_scores(Client(), "baseline", [result, result])

    assert [item[0] for item in calls] == ["create", "session", "session", "complete"]
    assert calls[0][1] == "pending"
    assert calls[1][1]["session"]["metadata"]["run_id"] == "run-1"
    assert calls[3][2:] == ("completed", ["s2", "s3"])


async def test_no_internal_leak_flags_views_sql_and_tool_names() -> None:
    async def leak(answer: str) -> int:
        scores = await scores_of(SafetyEvaluator(), {"answer": answer}, {})
        return scores["no_internal_leak"]

    assert await leak("Tháng trước shop bán được 12.500.000đ.") == 1
    assert await leak("Em đọc từ ai_read.v_sales nhé.") == 0
    assert await leak("SELECT sum(total_vnd) FROM sales") == 0
    assert await leak("Error[SQL_REJECTED] unknown view") == 0


async def test_vietnamese_answer_ignores_blocks_and_empty_answers() -> None:
    async def vietnamese(answer: str) -> int:
        scores = await scores_of(SafetyEvaluator(), {"answer": answer}, {})
        return scores["vietnamese_answer"]

    assert await vietnamese("Dạ, doanh thu hôm nay là 1.200.000đ.") == 1
    assert await vietnamese("Revenue today is 1,200,000 VND.") == 0
    assert await vietnamese('```chart\n{"type": "bar"}\n```') == 1
    assert await vietnamese("") == 1


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
    minimums = tomllib.loads(AgentChatEval.thresholds.read_text())["minimum"]
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
    thresholds = {"minimum": {"correct": 0.9}, "maximum": {}}

    markdown = markdown_report("agent_chat", rows, means, thresholds, failures, 3)

    assert markdown.startswith("## agent_chat eval: gate failed")
    assert "2/3 rows" in markdown
    assert "| task | `correct` | 0.50 | 2 | 0.9 | fail |" in markdown
    assert "- correct: 0.50 < 0.9" in markdown
    assert "- `revenue_last_month` missed `correct`" in markdown


async def test_a_failed_rating_leaves_only_its_metric_out() -> None:
    class FailingJudge(FakeJudge):
        async def rating(self, prompt: str) -> dict:
            if "faithful" in prompt.casefold():
                raise RuntimeError("gateway 502")
            return await super().rating(prompt)

    outputs = {
        "answer": "Dạ, 12.500.000đ.",
        "tools": ["query_shop_data"],
        "tool_calls": [call()],
        "available_tools": "[]",
        "memories": [],
    }
    inputs = {"question": "Doanh thu tháng trước?", "follow_up": None}
    judge = FailingJudge()

    faithfulness = await scores_of(
        ResponseQualityEvaluator(judge), outputs, PLAIN, inputs
    )
    tool_use = await scores_of(ToolUseEvaluator(judge), outputs, PLAIN, inputs)

    assert "answer_faithfulness" not in faithfulness
    assert tool_use["tool_usage"] == 4
    assert "gateway 502" in outputs["judge_errors"]["answer_faithfulness"]


def test_report_rows_keep_the_tool_calls_metric(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(reporting, "RESULTS", tmp_path)
    result = CaseResult(
        Case("revenue", {}, {}, expected=[1]),
        Output(
            {
                "answer": "1",
                "tool_calls": [call()],
                "seconds": 1.0,
                "model": "m",
                "prompt_version": "p",
                "suite_version": "s",
            }
        ),
        [
            MetricResult("task", "correct", 1, "revenue"),
            MetricResult("tool_use", "tool_choice", 1, "revenue"),
            MetricResult("tool_use", "tool_calls", 1, "revenue"),
            MetricResult("performance", "seconds", 1.0, "revenue"),
        ],
    )

    rows = report("test", [result])

    assert rows[0]["tool_calls"] == 1
    assert rows[0]["tool_call_log"] == [call()]
    assert averages(rows)["tool_calls"] == (1.0, 1)
