import json
from pathlib import Path

from evaluation.core.render import Table, markdown_table, print_table
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


def build_rows(results: list[CaseResult]) -> list[dict]:
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


def print_report(
    name: str,
    results: list[CaseResult],
    summary: tuple[str, ...] = (),
    thresholds: dict[str, dict[str, float]] | None = None,
) -> list[dict]:
    """Prints each case's passes of the `summary` metrics across its repeats, then each
    layer's means against the `thresholds` bounds, and keeps every row locally so a run
    can be read without opening HoneyHive."""
    rows = build_rows(results)
    if summary:
        print_table(build_cases_table(rows, summary))
    print_table(build_layers_table(compute_averages(rows), thresholds))
    if versions := describe_versions(rows[0]):
        print(versions)
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"{name}.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1) + "\n"
    )
    return rows


def describe_versions(row: dict) -> str:
    """The model, prompt and suite a row was produced with; empty for an evaluation
    that has none."""
    if "model" not in row:
        return ""
    return (
        f"model {row['model']}, prompt {row['prompt_version']}, "
        f"suite {row['suite_version']}"
    )


def build_cases_table(rows: list[dict], summary: tuple[str, ...]) -> Table:
    """Per case, the passes of each `summary` metric over its repeats, and the slowest
    repeat."""
    by_case: dict[str, list[dict]] = {}
    for row in rows:
        by_case.setdefault(row["case"], []).append(row)
    table_rows = []
    for case, attempts in by_case.items():
        tallies = [
            f"{sum(row[metric] for row in attempts)}/{len(attempts)}"
            for metric in summary
        ]
        slowest = max(row["seconds"] for row in attempts)
        table_rows.append([*tallies, f"{slowest:.2f}", case])
    return Table("Cases", [*summary, "slowest (s)", "case"], table_rows)


def build_layers_table(
    means: dict[str, tuple[float, int]],
    thresholds: dict[str, dict[str, float]] | None = None,
) -> Table:
    """One row per scored metric, grouped by layer, with its bound and PASS or FAIL
    when the metric is gated."""
    minimums = (thresholds or {}).get("minimum", {})
    maximums = (thresholds or {}).get("maximum", {})
    table_rows = []
    for layer, metrics in LAYERS.items():
        for metric in (name for name in metrics if name in means):
            mean, count = means[metric]
            bound, status = _describe_bound(
                mean, minimums.get(metric), maximums.get(metric)
            )
            table_rows.append([layer, metric, f"{mean:.2f}", str(count), bound, status])
    return Table(
        "Metrics by layer",
        ["layer", "metric", "mean", "rows", "bound", "status"],
        table_rows,
    )


def _describe_bound(
    mean: float, minimum: float | None, maximum: float | None
) -> tuple[str, str]:
    """The bound as text and PASS or FAIL against it; empty for an ungated metric."""
    if minimum is not None:
        return f">= {minimum:.2f}", "PASS" if mean >= minimum else "FAIL"
    if maximum is not None:
        return f"<= {maximum:.2f}", "PASS" if mean <= maximum else "FAIL"
    return "", ""


def compute_averages(rows: list[dict]) -> dict[str, tuple[float, int]]:
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


def build_markdown_report(
    evaluation: str,
    rows: list[dict],
    means: dict[str, tuple[float, int]],
    thresholds: dict[str, dict[str, float]],
    failures: list[str],
    expected_rows: int,
) -> str:
    """The run as markdown for a job summary or a pull request comment: the gate, every
    metric by layer, then the cases that missed a gated minimum."""
    first = rows[0]
    verdict = "failed" if failures else "passed"
    versions = (
        f"Model `{first['model']}`, prompt `{first['prompt_version']}`, "
        f"suite `{first['suite_version']}`, "
        if "model" in first
        else ""
    )
    lines = [
        f"## {evaluation} eval: gate {verdict}",
        "",
        f"{versions}{len(rows)}/{expected_rows} rows.",
        "",
        markdown_table(build_layers_table(means, thresholds)),
    ]
    if failures:
        lines += ["", "### Gate failures", ""] + [f"- {item}" for item in failures]
    missed = find_cases_below_minimum(rows, thresholds["minimum"])
    if missed:
        lines += ["", "### Cases below a minimum", ""] + [
            f"- {item}" for item in missed
        ]
    return "\n".join(lines) + "\n"


def find_cases_below_minimum(rows: list[dict], minimums: dict[str, float]) -> list[str]:
    return sorted(
        {
            f"`{row['case']}` missed `{metric}`"
            for row in rows
            for metric, minimum in minimums.items()
            if row.get(metric) is not None and row[metric] < minimum
        }
    )
