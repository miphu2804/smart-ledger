#!/usr/bin/env python3
"""Synthetic probe for SmartLedger staging and production.

Checks, per environment whose URLs are set:
  core-liveness   GET  {core}/actuator/health/liveness   -> 200
  core-readiness  GET  {core}/actuator/health/readiness  -> 200 (includes the database)
  core-auth-gate  GET  {core}/api/v1/me without a token  -> 401 (routing and security run)
  web             GET  {web}/                            -> 200

AI has no public domain, so it is not probed here; a chat through Core is the only
end-to-end check of it. Uses the standard library only.

Environment variables: MONITOR_<ENV>_CORE_URL and MONITOR_<ENV>_WEB_URL for ENV in
STAGING and PRODUCTION. An environment without URLs is skipped, not failed.

Exit code 1 when any check fails after one retry. Writes a Markdown table to
$GITHUB_STEP_SUMMARY when set, and one JSON line per check to stdout."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass

ENVIRONMENTS = ("staging", "production")
USER_AGENT = "smart-ledger-synthetic-monitor/1"


@dataclass
class Check:
    environment: str
    name: str
    url: str
    expect: int


@dataclass
class Result:
    environment: str
    name: str
    url: str
    expect: int
    status: int | None
    latency_ms: int | None
    ok: bool
    slow: bool
    attempts: int
    error: str
    checked_at: str


def build_checks(env: dict[str, str]) -> list[Check]:
    checks: list[Check] = []
    for name in ENVIRONMENTS:
        core = env.get(f"MONITOR_{name.upper()}_CORE_URL", "").strip().rstrip("/")
        web = env.get(f"MONITOR_{name.upper()}_WEB_URL", "").strip().rstrip("/")
        if core:
            checks += [
                Check(name, "core-liveness", f"{core}/actuator/health/liveness", 200),
                Check(name, "core-readiness", f"{core}/actuator/health/readiness", 200),
                Check(name, "core-auth-gate", f"{core}/api/v1/me", 401),
            ]
        if web:
            checks.append(Check(name, "web", f"{web}/", 200))
    return checks


def fetch(url: str, timeout: float) -> tuple[int | None, int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read(65536)
            status = response.status
        error = ""
    except urllib.error.HTTPError as http_error:
        status, error = http_error.code, ""
    except (urllib.error.URLError, TimeoutError, OSError) as failure:
        status, error = None, str(getattr(failure, "reason", failure))
    return status, int((time.monotonic() - started) * 1000), error


def run_check(check: Check, timeout: float, slow_ms: int, retry_delay: float) -> Result:
    attempts = 0
    while True:
        attempts += 1
        status, latency, error = fetch(check.url, timeout)
        ok = status == check.expect
        # One retry absorbs a single dropped connection or a cold start; a second
        # failure is reported. Two attempts keep a real outage visible quickly.
        if ok or attempts >= 2:
            break
        time.sleep(retry_delay)
    if not ok and not error:
        error = f"expected HTTP {check.expect}, got {status}"
    return Result(
        environment=check.environment,
        name=check.name,
        url=check.url,
        expect=check.expect,
        status=status,
        latency_ms=latency,
        ok=ok,
        slow=ok and latency > slow_ms,
        attempts=attempts,
        error=error,
        checked_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )


def summary_markdown(results: list[Result], slow_ms: int) -> str:
    lines = [
        "## Synthetic monitor",
        "",
        "| Environment | Check | Result | HTTP | Latency | Attempts | Detail |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        verdict = "fail" if not r.ok else ("slow" if r.slow else "ok")
        lines.append(
            f"| {r.environment} | {r.name} | {verdict} | {r.status or '-'} |"
            f" {r.latency_ms} ms | {r.attempts} | {r.error or ''} |"
        )
    lines += ["", f"`slow` means over {slow_ms} ms; it does not fail the run."]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--timeout", type=float, default=15, help="seconds per request")
    parser.add_argument("--slow-ms", type=int, default=2000, help="flag latency above this")
    parser.add_argument("--retry-delay", type=float, default=5, help="seconds before the retry")
    args = parser.parse_args(argv)

    checks = build_checks(dict(os.environ))
    if not checks:
        print("no MONITOR_*_URL variables set; nothing to probe", file=sys.stderr)
        return 1

    results = [run_check(c, args.timeout, args.slow_ms, args.retry_delay) for c in checks]
    for result in results:
        print(json.dumps(asdict(result), ensure_ascii=False))

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write(summary_markdown(results, args.slow_ms))

    failed = [r for r in results if not r.ok]
    for r in failed:
        print(f"::error title={r.environment} {r.name}::{r.url}: {r.error}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
