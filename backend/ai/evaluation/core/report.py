import json
from pathlib import Path

from evaluation.core.schema import CaseResult

RESULTS = Path(__file__).resolve().parents[1] / "results"

# Groups the metrics as the report shows them; a metric missing here is not shown.
LAYERS = {
    "task": ["correct"],
    "tool_use": [
        "tool_choice",
        "tool_calls",
        "tool_usage",
        "tool_trajectory",
        "failure_recovery",
    ],
    "memory": [
        "recalled_expected",
        "context_relevance",
        "recall",
        "recall_lex",
        "recall_unacc",
        "recall_sem",
        "top1",
        "stale_only",
    ],
    "response_quality": ["answer_faithfulness"],
    "safety": ["no_internal_leak", "vietnamese_answer"],
    "performance": ["seconds"],
}
LAYER_OF = {name: layer for layer, names in LAYERS.items() for name in names}


def rows_of(results: list[CaseResult]) -> list[dict]:
    """One flat row per result: the case, what the target recorded and each score."""
    return [
        {
            "case": result.case.id,
            "expected": result.case.expected,
            # The metrics go last: the outputs of the agent have their own
            # `tool_calls`, the list of calls, which would otherwise replace the
            # metric of the same name.
            **{
                ("tool_call_log" if key == "tool_calls" else key): value
                for key, value in result.output.values.items()
            },
            **{metric.name: metric.score for metric in result.metrics},
        }
        for result in results
    ]


def report(
    name: str, results: list[CaseResult], summary: tuple[str, ...] = ()
) -> list[dict]:
    """Prints each case's passes of the `summary` metrics across its repeats, then each
    layer's means, and keeps every row locally so a run can be read without opening
    HoneyHive."""
    rows = rows_of(results)
    if summary:
        print_cases(rows, summary)
    means = averages(rows)
    for layer, metrics in LAYERS.items():
        shown = [
            f"{metric} {means[metric][0]:.2f}" for metric in metrics if metric in means
        ]
        if shown:
            print(f"{layer}: " + ", ".join(shown))
    first = rows[0]
    if "model" in first:
        print(
            f"model {first['model']}, prompt {first['prompt_version']}, "
            f"suite {first['suite_version']}"
        )
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"{name}.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1) + "\n"
    )
    return rows


def print_cases(rows: list[dict], summary: tuple[str, ...]) -> None:
    by_case: dict[str, list[dict]] = {}
    for row in rows:
        by_case.setdefault(row["case"], []).append(row)
    for case, attempts in by_case.items():
        tallies = " ".join(
            f"{sum(row[metric] for row in attempts)}/{len(attempts)}"
            for metric in summary
        )
        slowest = max(row["seconds"] for row in attempts)
        print(f"{tallies} {slowest:>6}s {case}")


def averages(rows: list[dict]) -> dict[str, tuple[float, int]]:
    """Each metric's mean over the rows it applies to, with that row count."""
    values: dict[str, list[float]] = {}
    for row in rows:
        for metric in (name for names in LAYERS.values() for name in names):
            if row.get(metric) is not None:
                values.setdefault(metric, []).append(row[metric])
    return {
        metric: (sum(scores) / len(scores), len(scores))
        for metric, scores in values.items()
    }


def markdown_report(
    suite: str,
    rows: list[dict],
    means: dict[str, tuple[float, int]],
    thresholds: dict[str, dict[str, float]],
    failures: list[str],
    expected_rows: int,
) -> str:
    """The run as markdown for a job summary or a pull request comment: the gate, every
    metric by layer, then the cases that missed a gated minimum."""
    minimums, maximums = thresholds["minimum"], thresholds["maximum"]
    first = rows[0]
    verdict = "failed" if failures else "passed"
    versions = (
        f"Model `{first['model']}`, prompt `{first['prompt_version']}`, "
        f"suite `{first['suite_version']}`, "
        if "model" in first
        else ""
    )
    lines = [
        f"## {suite} eval: gate {verdict}",
        "",
        f"{versions}{len(rows)}/{expected_rows} rows.",
        "",
        "| Layer | Metric | Mean | Rows | Minimum | |",
        "|---|---|---|---|---|---|",
    ]
    for layer, metrics in LAYERS.items():
        for metric in metrics:
            if metric not in means:
                continue
            mean, count = means[metric]
            minimum, maximum = minimums.get(metric), maximums.get(metric)
            mark = ""
            shown = ""
            if minimum is not None:
                mark, shown = ("ok" if mean >= minimum else "fail"), f"{minimum:g}"
            elif maximum is not None:
                mark, shown = ("ok" if mean <= maximum else "fail"), f"max {maximum:g}"
            lines.append(
                f"| {layer} | `{metric}` | {mean:.2f} | {count} | {shown} | {mark} |"
            )
    if failures:
        lines += ["", "### Gate failures", ""] + [f"- {item}" for item in failures]
    missed = sorted(
        {
            f"`{row['case']}` missed `{metric}`"
            for row in rows
            for metric, minimum in minimums.items()
            if row.get(metric) is not None and row[metric] < minimum
        }
    )
    if missed:
        lines += ["", "### Cases below a minimum", ""] + [
            f"- {item}" for item in missed
        ]
    return "\n".join(lines) + "\n"
