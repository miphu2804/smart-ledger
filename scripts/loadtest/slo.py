"""Pass/fail gate checked when the run ends.

Request names start with a group tag such as `[read]`; each group has its own p95
limit. The defaults are starting points for a first baseline, not agreed SLOs:
see docs/development/load-testing-and-monitoring.md."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass

DEFAULT_P95_MS = {
    "auth": 1000,
    "read": 500,
    "report": 1000,
    "write": 1000,
    "chat": 20000,
}
GROUP_PATTERN = re.compile(r"^\[(\w+)\]")


@dataclass(frozen=True)
class Verdict:
    name: str
    method: str
    requests: int
    fail_ratio: float
    p95_ms: float | None
    limit_ms: int | None
    status: str  # pass | fail | few-samples


def p95_limits() -> dict[str, int]:
    limits = dict(DEFAULT_P95_MS)
    for group in limits:
        raw = os.getenv(f"SLO_P95_{group.upper()}_MS", "").strip()
        if raw:
            limits[group] = int(raw)
    return limits


def evaluate(stats) -> tuple[list[Verdict], bool]:
    max_fail_ratio = float(os.getenv("SLO_MAX_FAIL_RATIO", "0.01"))
    min_samples = int(os.getenv("SLO_MIN_SAMPLES", "20"))
    limits = p95_limits()
    verdicts: list[Verdict] = []
    passed = True

    for entry in sorted(stats.entries.values(), key=lambda e: (e.name, e.method)):
        match = GROUP_PATTERN.match(entry.name)
        limit = limits.get(match.group(1)) if match else None
        requests = entry.num_requests
        fail_ratio = entry.num_failures / requests if requests else 0.0
        p95 = entry.get_response_time_percentile(0.95) if requests else None
        if requests < min_samples:
            status = "few-samples"
        elif fail_ratio > max_fail_ratio or (limit is not None and p95 is not None and p95 > limit):
            status = "fail"
            passed = False
        else:
            status = "pass"
        verdicts.append(Verdict(entry.name, entry.method, requests, fail_ratio, p95, limit, status))

    total = stats.total
    if total.num_requests and total.num_failures / total.num_requests > max_fail_ratio:
        passed = False
    return verdicts, passed


def report(verdicts: list[Verdict], passed: bool, total) -> str:
    lines = [
        "",
        "SLO gate (limits are provisional baselines, not an SLA)",
        f"{'status':<12} {'reqs':>7} {'fail%':>7} {'p95 ms':>8} {'limit':>7}  name",
    ]
    for v in verdicts:
        p95 = "n/a" if v.p95_ms is None else f"{v.p95_ms:.0f}"
        limit = "-" if v.limit_ms is None else str(v.limit_ms)
        lines.append(
            f"{v.status:<12} {v.requests:>7} {v.fail_ratio * 100:>6.2f}% {p95:>8} {limit:>7}"
            f"  {v.method} {v.name}"
        )
    fail_pct = total.num_failures / total.num_requests * 100 if total.num_requests else 0.0
    lines.append(
        f"total: {total.num_requests} requests, {fail_pct:.2f}% failed,"
        f" {total.total_rps:.1f} req/s average"
    )
    lines.append(f"result: {'PASS' if passed else 'FAIL'}")
    return "\n".join(lines)
