"""Load profiles as stage lists.

Every profile scales from PEAK_USERS, the concurrent-user count being tested.
`stress` climbs in steps past the peak and stops itself once the error ratio or
p95 of a step breaks the limit, so the last healthy step is the measured ceiling.
Chat is left out of the step p95: an Agent answer takes seconds by design and has
its own limit in the SLO gate."""

from __future__ import annotations

import logging
import os
import time
from collections import Counter
from dataclasses import dataclass

from locust.stats import (
    CURRENT_RESPONSE_TIME_PERCENTILE_WINDOW,
    calculate_response_time_percentile,
    diff_response_time_dicts,
)

logger = logging.getLogger("loadtest.shape")


@dataclass(frozen=True)
class Stage:
    until: int  # seconds since start when this stage ends
    users: int
    spawn_rate: float
    label: str


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else default


def build_stages(profile: str) -> list[Stage]:
    peak = max(1, _env_int("PEAK_USERS", 50))
    ramp = _env_int("RAMP_SECONDS", 120)
    # Locust accepts fractional spawn rates; rounding up to 1/s would finish the ramp
    # early whenever PEAK_USERS < RAMP_SECONDS.
    ramp_rate = peak / max(ramp, 1)

    if profile == "smoke":
        return [Stage(_env_int("HOLD_SECONDS", 60), 2, 2, "smoke")]

    if profile == "load":
        hold = _env_int("HOLD_SECONDS", 600)
        return [
            Stage(ramp, peak, ramp_rate, "ramp"),
            Stage(ramp + hold, peak, ramp_rate, f"hold {peak}"),
        ]

    if profile == "stress":
        step_seconds = _env_int("STEP_SECONDS", 300)
        steps = _env_int("STRESS_STEPS", 10)
        step_users = max(1, _env_int("STEP_USERS", max(1, peak // 5)))
        stages, until = [], 0
        for index in range(1, steps + 1):
            until += step_seconds
            users = step_users * index
            stages.append(Stage(until, users, max(1.0, step_users / 10), f"step {users}"))
        return stages

    if profile == "spike":
        base = max(1, peak // 10)
        spike_users = max(base + 1, peak * _env_int("SPIKE_MULTIPLIER", 2))
        return [
            Stage(120, base, max(1.0, base / 10), f"baseline {base}"),
            # Reach the spike in about ten seconds, then watch the recovery.
            Stage(300, spike_users, max(1.0, spike_users / 10), f"spike {spike_users}"),
            Stage(480, base, spike_users, f"recovery {base}"),
        ]

    if profile == "soak":
        users = max(1, int(peak * 0.7))
        hold = _env_int("HOLD_SECONDS", 3600)
        return [
            Stage(ramp, users, users / max(ramp, 1), "ramp"),
            Stage(ramp + hold, users, 1, f"soak {users}"),
        ]

    raise ValueError(f"no stages for profile {profile!r}")


@dataclass
class StepResult:
    label: str
    users: int  # target of the stage
    running_users: int  # users actually running when the stage ended
    rps: float
    fail_ratio: float
    p95_ms: float | None


class StageTracker:
    """Samples the live stats at the end of each stage for the run report."""

    def __init__(self) -> None:
        self.results: list[StepResult] = []
        self.stopped_reason: str = ""

    def sample(self, stage: Stage, stats, running_users: int) -> StepResult:
        total = stats.total
        rps = total.current_rps or 0.0
        fails = total.current_fail_per_sec or 0.0
        p95 = self._current_p95_without_chat(stats)
        result = StepResult(
            stage.label, stage.users, running_users, rps, fails / rps if rps else 0.0, p95
        )
        self.results.append(result)
        logger.info(
            "stage %s: users=%d running=%d rps=%.1f fail=%.2f%% p95 (no chat)=%s ms",
            result.label,
            result.users,
            result.running_users,
            result.rps,
            result.fail_ratio * 100,
            "n/a" if result.p95_ms is None else f"{result.p95_ms:.0f}",
        )
        return result

    @staticmethod
    def _current_p95_without_chat(stats) -> float | None:
        """p95 of roughly the last 10 s over every request except `[chat]`.

        Locust only offers this window per entry or for the aggregate, so the
        per-entry windows are merged the same way Locust builds each one."""
        window_start = int(time.time()) - CURRENT_RESPONSE_TIME_PERCENTILE_WINDOW
        response_times: Counter[int] = Counter()
        count = 0
        for entry in stats.entries.values():
            if entry.name.startswith("[chat]") or not entry.response_times_cache:
                continue
            nearest = min(entry.response_times_cache, key=lambda second: abs(second - window_start))
            if abs(nearest - window_start) > 8:  # Locust's own tolerance
                continue
            cached = entry.response_times_cache[nearest]
            response_times.update(
                diff_response_time_dicts(entry.response_times, cached.response_times)
            )
            count += (entry.num_requests - entry.num_none_requests) - (
                cached.num_requests - cached.num_none_requests
            )
        return calculate_response_time_percentile(response_times, count, 0.95) if count else None


TRACKER = StageTracker()
