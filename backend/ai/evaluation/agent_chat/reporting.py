import json
from pathlib import Path

RESULTS = Path(__file__).parent / "results"


def report(name: str, results: list[dict]) -> list[dict]:
    """Prints each case's passes across its repeats, then the totals, and keeps every
    row locally so a run can be read without opening HoneyHive."""
    rows = [
        {
            "case": result["datapoint"]["ground_truth"]["case"],
            "correct": result["metrics"]["correct"],
            "tool_choice": result["metrics"]["tool_choice"],
            "expected": result["datapoint"]["ground_truth"]["numbers"]
            + result["datapoint"]["ground_truth"]["names"],
            # The metrics go last: `outputs` has its own `tool_calls`, the list of
            # calls, which would otherwise replace the metric of the same name.
            **{
                ("tool_call_log" if key == "tool_calls" else key): value
                for key, value in result["outputs"].items()
            },
            **result["metrics"],
        }
        for result in results
    ]
    by_case: dict[str, list[dict]] = {}
    for row in rows:
        by_case.setdefault(row["case"], []).append(row)
    for case, attempts in by_case.items():
        passed = sum(row["correct"] for row in attempts)
        chose = sum(row["tool_choice"] for row in attempts)
        slowest = max(row["seconds"] for row in attempts)
        print(f"{passed}/{len(attempts)} {chose}/{len(attempts)} {slowest:>6}s {case}")
    first = rows[0]
    print(
        f"correct {sum(r['correct'] for r in rows)}/{len(rows)}, "
        f"tool choice {sum(r['tool_choice'] for r in rows)}/{len(rows)}, "
        f"model {first['model']}, prompt {first['prompt_version']}, "
        f"suite {first['suite_version']}"
    )
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / f"{name}.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1) + "\n"
    )
    return rows


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
    "memory": ["recalled_expected", "context_relevance"],
    "response_quality": ["answer_faithfulness"],
    "safety": ["no_internal_leak", "vietnamese_answer"],
    "performance": ["seconds"],
}


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


def gate_failures(
    means: dict[str, tuple[float, int]], minimums: dict[str, float]
) -> list[str]:
    """Each gated metric whose mean is below its minimum; one with no row fails too,
    because a gate that measured nothing passed nothing."""
    failures = []
    for metric, minimum in minimums.items():
        if metric not in means:
            failures.append(f"{metric}: no row scored it")
        elif means[metric][0] < minimum:
            failures.append(f"{metric}: {means[metric][0]:.2f} < {minimum:g}")
    return failures


def markdown_report(
    rows: list[dict],
    means: dict[str, tuple[float, int]],
    minimums: dict[str, float],
    failures: list[str],
    expected_rows: int,
) -> str:
    """The run as markdown for a job summary or a pull request comment: the gate, every
    metric by layer, then the cases that missed a gated minimum."""
    first = rows[0]
    verdict = "failed" if failures else "passed"
    lines = [
        f"## agent_chat eval: gate {verdict}",
        "",
        f"Model `{first['model']}`, prompt `{first['prompt_version']}`, "
        f"suite `{first['suite_version']}`, {len(rows)}/{expected_rows} rows.",
        "",
        "| Layer | Metric | Mean | Rows | Minimum | |",
        "|---|---|---|---|---|---|",
    ]
    for layer, metrics in LAYERS.items():
        for metric in metrics:
            if metric not in means:
                continue
            mean, count = means[metric]
            minimum = minimums.get(metric)
            mark = "" if minimum is None else ("ok" if mean >= minimum else "fail")
            shown = "" if minimum is None else f"{minimum:g}"
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
