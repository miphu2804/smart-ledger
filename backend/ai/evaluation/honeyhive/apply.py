"""Create or update the evaluators in `evaluators/` on the `HH_API_KEY` project, and
create the alerts in `alerts/` when `HH_CONTROL_PLANE_API_KEY` is set.

Both match by `name`, so a renamed file creates a new evaluator or alert and leaves the
old one on HoneyHive until it is deleted in the UI. An existing alert is left as it is:
change it in the UI, or delete it there and run this again.
"""

import os
import sys
from pathlib import Path

import httpx
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from honeyhive.api.client import HoneyHive  # noqa: E402
from honeyhive.models import CreateMetricRequest, UpdateMetricRequest  # noqa: E402

from src.app_config import app_config  # noqa: E402

EVALUATORS = Path(__file__).parent / "evaluators"
ALERTS = Path(__file__).parent / "alerts"
CONTROL_PLANE_URL = "https://api.cp.us.honeyhive.ai"


def main() -> None:
    if not app_config.HH_API_KEY:
        raise SystemExit("HH_API_KEY is not set")
    client = HoneyHive(api_key=app_config.HH_API_KEY, server_url=app_config.HH_API_URL)
    apply_evaluators(client)
    control_plane_key = os.environ.get("HH_CONTROL_PLANE_API_KEY")
    if control_plane_key:
        apply_alerts(client, control_plane_key)
    else:
        print("HH_CONTROL_PLANE_API_KEY is not set; alerts skipped")


def apply_evaluators(client: HoneyHive) -> None:
    existing = {metric.name: metric.id for metric in client.metrics.list()}
    for path in sorted(EVALUATORS.glob("*.yaml")):
        definition = yaml.safe_load(path.read_text())
        name = definition["name"]
        if name in existing:
            client.metrics.update(UpdateMetricRequest(id=existing[name], **definition))
            print(f"updated evaluator {name}")
        else:
            client.metrics.create(CreateMetricRequest(**definition))
            print(f"created evaluator {name}")


def apply_alerts(client: HoneyHive, control_plane_key: str) -> None:
    alerts_url = f"{CONTROL_PLANE_URL}/v1/projects/{project_id(client)}/alerts"
    headers = {"Authorization": f"Bearer {control_plane_key}"}
    listed = httpx.get(alerts_url, headers=headers, params={"limit": 100}, timeout=30)
    listed.raise_for_status()
    existing = {alert["name"] for alert in listed.json()["data"]}
    failed = False
    for path in sorted(ALERTS.glob("*.yaml")):
        definition = yaml.safe_load(path.read_text())
        name = definition["name"]
        if name in existing:
            print(f"alert exists, skipped: {name}")
            continue
        created = httpx.post(alerts_url, headers=headers, json=definition, timeout=30)
        if created.is_error:
            print(f"alert {name} failed: {created.status_code} {created.text}")
            failed = True
        else:
            print(f"created alert {name}")
    if failed:
        raise SystemExit(1)


def project_id(client: HoneyHive) -> str:
    """Read the project id off a logged event, since the project key has no endpoint
    that returns its own project."""
    session = {"field": "event_type", "operator": "is", "value": "session"}
    events = client.events.export(filters=[{**session, "type": "string"}], limit=1)
    if not events.events:
        raise SystemExit("no events on the project yet; send a trace first")
    event = events.events[0]
    return event["project_id"] if isinstance(event, dict) else event.project_id


if __name__ == "__main__":
    main()
