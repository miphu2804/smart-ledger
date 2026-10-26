"""Builds run-metadata.json from the GitHub API run attempt and its jobs.

Usage: run_metadata.py RUN_JSON JOBS_NDJSON, with WORKFLOW, ENVIRONMENT and JOB_NAME in the environment.
The job running this script is still in progress, so it is left out of the jobs and the status.
"""

import json
import os
import sys
from datetime import datetime, timezone


def main(run_path: str, jobs_path: str) -> None:
    with open(run_path) as f:
        run = json.load(f)
    with open(jobs_path) as f:
        jobs = [json.loads(line) for line in f if line.strip()]
    jobs = [job for job in jobs if job["status"] == "completed"]

    finished_at = datetime.now(timezone.utc)
    started_at = _parse(run["run_started_at"])
    metadata = {
        "workflow": os.environ["WORKFLOW"],
        "environment": os.environ["ENVIRONMENT"],
        "run_id": run["id"],
        "run_attempt": run["run_attempt"],
        "run_url": run["html_url"],
        "event": run["event"],
        "branch": run["head_branch"],
        "sha": run["head_sha"],
        "actor": run["actor"]["login"],
        "triggering_actor": run["triggering_actor"]["login"],
        "started_at": _format(started_at),
        "finished_at": _format(finished_at),
        "duration_s": int((finished_at - started_at).total_seconds()),
        "status": _status(jobs),
        "jobs": [_job(job) for job in jobs],
    }
    json.dump(metadata, sys.stdout, indent=2)
    sys.stdout.write("\n")


def _status(jobs: list[dict]) -> str:
    """One word for the run: refused when CD's gate stopped it, else the worst job result."""
    conclusions = {job["name"]: job["conclusion"] for job in jobs}
    if conclusions.get("gate") == "failure":
        return "refused"
    values = set(conclusions.values())
    for status in ("failure", "timed_out", "cancelled", "action_required"):
        if status in values:
            return status
    if values and values <= {"skipped"}:
        return "skipped"
    return "success"


def _job(job: dict) -> dict:
    started, completed = job.get("started_at"), job.get("completed_at")
    duration = int((_parse(completed) - _parse(started)).total_seconds()) if started and completed else None
    return {
        "name": job["name"],
        "conclusion": job["conclusion"],
        "runner": job.get("runner_name"),
        "started_at": started,
        "completed_at": completed,
        "duration_s": duration,
    }


def _parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _format(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
