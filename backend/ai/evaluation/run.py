"""Run one evaluation suite through the shared pipeline, gate it and report it.

A suite is its cases and thresholds under `suites/`; a target in `targets/` runs each
case against the real service, the metrics in `metrics/` score what it returned, and
`core/` gates, reports and syncs the scores. For `agent_chat` the agent runs here with
tracing off and every answer is scored here, with metrics built on HoneyHive's
evaluator templates. Nothing leaves the machine unless `--sync` asks for it: then each
case is logged to HoneyHive as one session of an experiment run, with its inputs,
outputs and scores but no spans, as in "Sync Offline Evaluations" in HoneyHive's docs.
"""

import argparse
import asyncio
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

# Running this file puts `evaluation/` first on the path, where its `core` or `metrics`
# folders would shadow other modules; the project root takes its place.
ROOT = Path(__file__).resolve().parents[1]
sys.path[0] = str(ROOT)

from src.app_config import app_config  # noqa: E402

# The app must not start its own tracer: the run sends scores, not spans. Memory is on
# for recall only; `WithoutMemoryWrites` stops what a turn would store, because that
# would change the next run's answers.
HONEYHIVE_KEY = app_config.HH_API_KEY
app_config.HH_API_KEY = None
app_config.AGENT_MEMORY_ENABLED = True

from evaluation.core.gate import gate_failures, load_thresholds  # noqa: E402
from evaluation.core.honeyhive import print_sync_plan, sync_scores  # noqa: E402
from evaluation.core.pipeline import run_cases  # noqa: E402
from evaluation.core.report import (  # noqa: E402
    LAYER_OF,
    averages,
    markdown_report,
    report,
)
from evaluation.core.schema import Case, MetricResult, Output  # noqa: E402
from evaluation.metrics.judge import judge, judged_scores, rate  # noqa: E402
from evaluation.metrics.memory import recall_scores, recalled_expected  # noqa: E402
from evaluation.metrics.performance import seconds  # noqa: E402
from evaluation.metrics.safety import no_internal_leak, vietnamese_answer  # noqa: E402
from evaluation.metrics.task import correct, question_of  # noqa: E402
from evaluation.metrics.tool_use import tool_calls, tool_choice  # noqa: E402
from evaluation.targets import agent, memory  # noqa: E402
from honeyhive import HoneyHive  # noqa: E402


@dataclass
class Suite:
    cases: list[Case]
    # Entered once, then called with each case for its output; see `run_cases`.
    target: object
    score: Callable[[Case, Output], object]
    thresholds: Path
    # Metrics whose passes the console prints per case, as `correct` does for a
    # question asked 3 times.
    summary: tuple[str, ...]
    show_plan: Callable[[str], None]
    # Called after the run is reported, to fail a run whose answers cannot be trusted.
    check: Callable[[], None]


def agent_chat_suite(arguments: argparse.Namespace) -> Suite:
    started_on = agent.shop_today()
    cases = agent.load_cases(arguments.repeats)

    async def score(case: Case, output: Output) -> list[MetricResult]:
        outputs, inputs, truth = output.values, case.inputs, case.truth
        if truth["judge"]:
            outputs["verdict"] = await judge(
                question_of(inputs),
                outputs["answer"],
                truth["judge"],
                arguments.judge,
                truth["shop_id"],
            )
        verdict = correct(outputs, inputs, truth)
        metrics = [
            metric_of(case, "correct", verdict["score"], verdict["explanation"]),
            metric_of(case, "tool_choice", tool_choice(outputs, inputs, truth)),
            metric_of(case, "tool_calls", tool_calls(outputs, inputs, truth)),
            metric_of(case, "seconds", seconds(outputs, inputs, truth)),
            metric_of(
                case, "recalled_expected", recalled_expected(outputs, inputs, truth)
            ),
            metric_of(
                case, "no_internal_leak", no_internal_leak(outputs, inputs, truth)
            ),
            metric_of(
                case, "vietnamese_answer", vietnamese_answer(outputs, inputs, truth)
            ),
        ]
        judged = await judged_scores(
            outputs,
            inputs,
            truth,
            lambda prompt: rate(prompt, arguments.judge, truth["shop_id"]),
        )
        metrics += [
            metric_of(case, name, value, outputs["judge_reasons"][name])
            for name, value in judged.items()
        ]
        # A case a metric does not apply to has no value for it.
        return [metric for metric in metrics if metric.score is not None]

    def check() -> None:
        # The expected answers were computed before midnight; after it, "yesterday"
        # moved.
        if agent.shop_today() != started_on:
            raise SystemExit("the run crossed midnight shop time; run it again")

    return Suite(
        cases,
        agent.AgentTarget(cases[0].inputs["owner_id"]),
        score,
        agent.SUITE / "thresholds.toml",
        ("correct", "tool_choice"),
        lambda name: print_sync_plan(name, cases),
        check,
    )


def memory_suite(arguments: argparse.Namespace) -> Suite:
    shops = memory.load_shops()
    cases = memory.load_cases(shops)

    async def score(case: Case, output: Output) -> list[MetricResult]:
        scores = recall_scores(output.values, case.inputs, case.truth)
        return [metric_of(case, name, value) for name, value in scores.items()]

    return Suite(
        cases,
        memory.MemoryTarget(shops),
        score,
        memory.SUITE / "thresholds.toml",
        (),
        lambda name: print(f"{len(cases)} queries over {len(shops)} shops"),
        lambda: None,
    )


def metric_of(case: Case, name: str, score, reason: str | None = None) -> MetricResult:
    return MetricResult(LAYER_OF[name], name, score, case.id, reason)


# A dict literal: a new suite adds a line here and a folder under `suites/`.
SUITES = {"agent_chat": agent_chat_suite, "memory": memory_suite}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("suite", choices=SUITES)
    parser.add_argument("--name", default="baseline")
    parser.add_argument(
        "--repeats", type=int, default=3, help="times each agent_chat question runs"
    )
    # The chat model grades itself by default; a stronger alias gives fairer grades.
    parser.add_argument(
        "--judge", default="chat", help="model alias for the agent_chat judge"
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="also sync the agent_chat scores to HoneyHive as an experiment run",
    )
    parser.add_argument(
        "--gate", type=Path, help="TOML of metric bounds; a miss exits 1"
    )
    parser.add_argument("--report", type=Path, help="write the run as markdown here")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="build the cases and show the plan, running no target, asking no model "
        "and calling no HoneyHive",
    )
    arguments = parser.parse_args()
    if arguments.sync and arguments.suite != "agent_chat":
        raise SystemExit("--sync is for agent_chat only")
    suite = SUITES[arguments.suite](arguments)
    if arguments.dry_run:
        suite.show_plan(arguments.name)
        return
    if arguments.sync and not HONEYHIVE_KEY:
        raise SystemExit("--sync needs HH_API_KEY")
    thresholds = (
        load_thresholds(arguments.gate)
        if arguments.gate
        else {"minimum": {}, "maximum": {}}
    )
    results = asyncio.run(run_cases(suite.cases, suite.target, suite.score))
    if not results:
        raise SystemExit("no answers were recorded")
    rows = report(f"{arguments.suite}-{arguments.name}", results, suite.summary)
    means = averages(rows)
    failures = gate_failures(means, thresholds["minimum"], thresholds["maximum"])
    if arguments.report:
        arguments.report.write_text(
            markdown_report(
                arguments.suite,
                rows,
                means,
                thresholds,
                failures,
                len(suite.cases),
            )
        )
    if arguments.sync:
        sync_scores(
            HoneyHive(api_key=HONEYHIVE_KEY, server_url=app_config.HH_API_URL),
            arguments.name,
            results,
        )
    # A case that raised has no row, so a short run fails instead of scoring only the
    # rest.
    if len(rows) < len(suite.cases):
        raise SystemExit(f"{len(suite.cases) - len(rows)} cases failed; see the log")
    suite.check()
    if failures:
        raise SystemExit("gate failed: " + "; ".join(failures))


if __name__ == "__main__":
    main()
