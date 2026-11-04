"""Score the real chat agent on a made-up shop, gate the run and report it.

The agent runs here with tracing off and every answer is scored here, with metrics
built on HoneyHive's evaluator templates. Nothing leaves the machine unless `--sync`
asks for it: then each case is logged to HoneyHive as one session of an experiment run,
with its inputs, outputs and scores but no spans, as in "Sync Offline Evaluations" in
HoneyHive's docs.
"""

import argparse
import asyncio
import sys
import tomllib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.app_config import app_config  # noqa: E402

# The app must not start its own tracer: the run sends scores, not spans. Memory is on
# for recall only; `without_memory_writes` stops what a turn would store, because that
# would change the next run's answers.
HONEYHIVE_KEY = app_config.HH_API_KEY
app_config.HH_API_KEY = None
app_config.AGENT_MEMORY_ENABLED = True

from evaluation.agent_chat.honeyhive_sync import (  # noqa: E402
    print_sync_plan,
    sync_scores,
)
from evaluation.agent_chat.pipeline import (  # noqa: E402
    build_dataset,
    run_all,
    shop_today,
)
from evaluation.agent_chat.reporting import (  # noqa: E402
    averages,
    gate_failures,
    markdown_report,
    report,
)
from honeyhive import HoneyHive  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", default="baseline")
    parser.add_argument("--repeats", type=int, default=3)
    # The chat model grades itself by default; a stronger alias gives fairer grades.
    parser.add_argument("--judge", default="chat", help="model alias for the judge")
    parser.add_argument(
        "--sync",
        action="store_true",
        help="also sync the scores to HoneyHive as an experiment run",
    )
    parser.add_argument(
        "--gate", type=Path, help="TOML of metric minimums; a miss exits 1"
    )
    parser.add_argument("--report", type=Path, help="write the run as markdown here")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="build the dataset and show what would sync, asking no model and "
        "calling no HoneyHive",
    )
    arguments = parser.parse_args()
    started_on = shop_today()
    dataset = build_dataset(arguments.repeats)
    if arguments.dry_run:
        print_sync_plan(arguments.name, dataset)
        return
    if arguments.sync and not HONEYHIVE_KEY:
        raise SystemExit("--sync needs HH_API_KEY")
    minimums = (
        tomllib.loads(arguments.gate.read_text())["minimum"] if arguments.gate else {}
    )
    results = asyncio.run(run_all(dataset, arguments.judge))
    if not results:
        raise SystemExit("no answers were recorded")
    rows = report(arguments.name, results)
    means = averages(rows)
    failures = gate_failures(means, minimums)
    if arguments.report:
        arguments.report.write_text(
            markdown_report(rows, means, minimums, failures, len(dataset))
        )
    if arguments.sync:
        sync_scores(
            HoneyHive(api_key=HONEYHIVE_KEY, server_url=app_config.HH_API_URL),
            arguments.name,
            results,
        )
    # A datapoint that raised has no row, so a short run fails instead of scoring
    # only the rest.
    if len(rows) < len(dataset):
        raise SystemExit(f"{len(dataset) - len(rows)} datapoints failed; see the log")
    # The expected answers were computed before midnight; after it, "yesterday" moved.
    if shop_today() != started_on:
        raise SystemExit("the run crossed midnight shop time; run it again")
    if failures:
        raise SystemExit("gate failed: " + "; ".join(failures))


if __name__ == "__main__":
    main()
