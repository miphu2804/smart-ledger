"""Live Locust numbers pushed to Grafana Cloud during a run.

A load run is only readable next to the server side (database connections, Core
latency), so the run's own numbers go to the same Grafana stack. This uses Grafana
Cloud's Influx line-protocol endpoint: `locust,<tags> rps=1.0` is stored as the
Prometheus series `locust_rps{...}`, with the tags as labels. The push is
best-effort: a failed push is logged and never fails the run."""

from __future__ import annotations

import logging
import time

import gevent
import requests

from slo import GROUP_PATTERN

logger = logging.getLogger("loadtest.grafana")
PUSH_TIMEOUT_SECONDS = 10


class GrafanaPusher:
    """Sends the current per-request and total stats every `interval` seconds."""

    def __init__(
        self, url: str, user: str, token: str, labels: dict[str, str], interval: float = 5
    ) -> None:
        self._url = url
        self._auth = (user, token)
        self._tags = ",".join(f"{key}={_escape(value)}" for key, value in labels.items())
        self._interval = interval
        self._http = requests.Session()

    def start(self, environment) -> None:
        gevent.spawn(self._loop, environment)

    def _loop(self, environment) -> None:
        while True:
            gevent.sleep(self._interval)
            self.push(environment.stats, environment.runner.user_count)

    def push(self, stats, running_users: int) -> None:
        body = "\n".join(self._lines(stats, running_users, time.time_ns()))
        try:
            response = self._http.post(
                self._url, data=body, auth=self._auth, timeout=PUSH_TIMEOUT_SECONDS
            )
        except requests.RequestException as error:
            logger.warning("Grafana push failed: %s", error)
            return
        if response.status_code >= 300:
            logger.warning(
                "Grafana push rejected: HTTP %s %s", response.status_code, response.text[:200]
            )

    def _lines(self, stats, running_users: int, timestamp_ns: int) -> list[str]:
        total = stats.total
        lines = [
            f"locust,{self._tags},name=all {_fields(total)},users={running_users}i {timestamp_ns}"
        ]
        for entry in stats.entries.values():
            match = GROUP_PATTERN.match(entry.name)
            group = match.group(1) if match else "other"
            lines.append(
                f"locust,{self._tags},group={group},name={_escape(entry.name)},method={entry.method}"
                f" {_fields(entry)} {timestamp_ns}"
            )
        return lines


def _fields(entry) -> str:
    rps = entry.current_rps or 0.0
    fails = entry.current_fail_per_sec or 0.0
    fields = [f"rps={rps:.3f}", f"fail_ratio={fails / rps if rps else 0.0:.4f}"]
    p95 = entry.get_current_response_time_percentile(0.95)
    if p95 is not None:
        fields.append(f"p95_ms={p95:.1f}")
    return ",".join(fields)


def _escape(value: str) -> str:
    """Influx tag values escape commas, equals signs and spaces with a backslash."""
    return value.replace(",", r"\,").replace("=", r"\=").replace(" ", r"\ ")
