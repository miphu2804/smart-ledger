"""Run one evaluation through the shared pipeline, gate it and report it.

An evaluation is a class in its own folder (`agent_chat/`, `memory/`) that holds its
cases, its target and the evaluators that score what the target returned; `core/`
gates, reports and syncs the scores. For `agent_chat` the agent runs here with tracing
off and every answer is scored here, with metrics built on HoneyHive's evaluator
templates. Nothing leaves the machine unless `--sync` asks for it: then each case is
logged to HoneyHive as one session of an experiment run, with its inputs, outputs and
scores but no spans, as in "Sync Offline Evaluations" in HoneyHive's docs.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Running this file puts `evaluation/` first on the path, where its `core` or `metrics`
# folders would shadow other modules; the project root takes its place.
ROOT = Path(__file__).resolve().parents[1]
sys.path[0] = str(ROOT)

# `src.main` sets the log level when it is imported, before the options are parsed, so
# `--verbose` is read from the raw arguments. The results are what a run is for: the
# app's INFO lines (every HTTP request, every tool call) bury them. A `LOG_LEVEL` set in
# the environment still wins.
if "--verbose" not in sys.argv:
    os.environ.setdefault("LOG_LEVEL", "WARNING")

from src.app_config import app_config  # noqa: E402

# The app must not start its own tracer: the run sends scores, not spans. Memory is on
# for recall only; `WithoutMemoryWrites` stops what a turn would store, because that
# would change the next run's answers.
HONEYHIVE_KEY = app_config.HH_API_KEY
app_config.HH_API_KEY = None
app_config.AGENT_MEMORY_ENABLED = True

from evaluation.agent_chat.agent_chat_eval import AgentChatEval  # noqa: E402
from evaluation.core.gate import find_gate_failures, load_thresholds  # noqa: E402
from evaluation.core.honeyhive import sync_scores  # noqa: E402
from evaluation.core.pipeline import EvaluationPipeline  # noqa: E402
from evaluation.core.report import (  # noqa: E402
    build_markdown_report,
    compute_averages,
    print_report,
)
from evaluation.memory.memory_eval import MemoryEval  # noqa: E402
from honeyhive import HoneyHive  # noqa: E402

# A dispatch table: the command line names an evaluation, and its entry builds it from
# the options it uses. A new evaluation adds a line here and a folder next to
# `agent_chat/`.
EVALS = {
    "agent_chat": lambda arguments: AgentChatEval(
        arguments.repeats, arguments.judge, arguments.model, arguments.limit
    ),
    "memory": lambda arguments: MemoryEval(),
}


def main() -> None:
    arguments = parse_arguments()
    if arguments.evaluation != "agent_chat":
        for option in ("sync", "model", "limit"):
            if getattr(arguments, option):
                raise SystemExit(f"--{option} is for agent_chat only")
    evaluation = EVALS[arguments.evaluation](arguments)
    if arguments.dry_run:
        evaluation.show_plan(arguments.name)
        return
    if arguments.sync and not HONEYHIVE_KEY:
        raise SystemExit("--sync needs HH_API_KEY")
    # Read before the run, so a bad gate file fails before any model is asked.
    thresholds = load_thresholds(arguments.gate or evaluation.thresholds)
    results = asyncio.run(EvaluationPipeline().run(evaluation))
    if not results:
        raise SystemExit("no answers were recorded")
    run_name = f"{evaluation.name}-{arguments.name}"
    rows = print_report(run_name, results, evaluation.summary, thresholds)
    failures = gate_and_write(arguments, evaluation, rows, thresholds)
    if arguments.sync:
        sync_scores(
            HoneyHive(api_key=HONEYHIVE_KEY, server_url=app_config.HH_API_URL),
            arguments.name,
            results,
        )
    # A case that raised has no row, so a short run fails instead of scoring only the
    # rest.
    if len(rows) < len(evaluation.cases):
        raise SystemExit(
            f"{len(evaluation.cases) - len(rows)} cases failed; see the log"
        )
    evaluation.check()
    if failures:
        raise SystemExit("gate failed: " + "; ".join(failures))


def gate_and_write(
    arguments, evaluation, rows: list[dict], thresholds: dict[str, dict[str, float]]
) -> list[str]:
    """Compares the means with the bounds, writes the `--report` markdown and
    returns the gate's failures."""
    means = compute_averages(rows)
    failures = find_gate_failures(means, thresholds["minimum"], thresholds["maximum"])
    if arguments.report:
        arguments.report.write_text(
            build_markdown_report(
                evaluation.name,
                rows,
                means,
                thresholds,
                failures,
                len(evaluation.cases),
            )
        )
    return failures


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("evaluation", choices=EVALS)
    parser.add_argument("--name", default="baseline")
    parser.add_argument(
        "--repeats", type=int, default=3, help="times each agent_chat question runs"
    )
    # The chat model grades itself by default; a stronger alias gives fairer grades.
    parser.add_argument(
        "--judge", default="chat", help="model alias for the agent_chat judge"
    )
    parser.add_argument(
        "--model",
        help="model alias the agent_chat agent uses instead of `chat`; the judge keeps "
        "`chat`",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="ask only the first N agent_chat questions, for a quick check",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="keep the app's log level (INFO by default) instead of WARNING",
    )
    parser.add_argument(
        "--sync",
        action="store_true",
        help="also sync the agent_chat scores to HoneyHive as an experiment run",
    )
    parser.add_argument(
        "--gate",
        type=Path,
        help="TOML of metric bounds instead of the evaluation's own thresholds.toml; "
        "a miss exits 1",
    )
    parser.add_argument("--report", type=Path, help="write the run as markdown here")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="build the cases and show the plan, running no target, asking no model "
        "and calling no HoneyHive",
    )
    return parser.parse_args()


if __name__ == "__main__":
    main()
