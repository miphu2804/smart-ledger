import json
import uuid

from honeyhive import HoneyHive
from honeyhive.models import (
    PostExperimentRunRequest,
    PutExperimentRunRequest,
)


def session_payload(run_id: str, name: str, result: dict) -> dict:
    """One case as a session of the run: inputs, outputs and scores, no spans."""
    datapoint = result["datapoint"]
    case, attempt = datapoint["ground_truth"]["case"], datapoint["inputs"]["attempt"]
    outputs = result["outputs"]
    return {
        "session": {
            "session_name": f"agent-chat-{name}",
            "source": "evaluation",
            "session_id": str(uuid.uuid4()),
            "inputs": datapoint["inputs"],
            "outputs": outputs,
            "metrics": result["metrics"],
            "metadata": {
                "run_id": run_id,
                # The same for a case in every run, so HoneyHive pairs it across runs.
                "datapoint_id": str(
                    uuid.uuid5(uuid.NAMESPACE_URL, f"agent-chat/{case}/{attempt}")
                ),
                "case": case,
                "model": outputs["model"],
                "prompt_version": outputs["prompt_version"],
                "suite_version": outputs["suite_version"],
            },
        }
    }


def sync_scores(client: HoneyHive, name: str, results: list[dict]) -> None:
    """Creates the run, logs each case as a session and completes the run."""
    run = client.experiments.create_run(
        PostExperimentRunRequest(
            name=f"agent-chat-{name}", event_ids=[], status="pending"
        )
    )
    session_ids = [
        client.sessions.start(session_payload(run.run_id, name, result)).session_id
        for result in results
    ]
    client.experiments.update_run(
        run.run_id, PutExperimentRunRequest(event_ids=session_ids, status="completed")
    )
    print(f"synced {len(session_ids)} sessions to run {run.run_id}")


def print_sync_plan(name: str, dataset: list[dict]) -> None:
    """Shows the run and the first session that a real run would send, with the answer
    and the scores empty because a dry run asks no model."""
    first = {
        "datapoint": dataset[0],
        "outputs": {
            "model": "",
            "prompt_version": "",
            "suite_version": dataset[0]["inputs"]["suite_version"],
        },
        "metrics": {},
    }
    cases = {datapoint["ground_truth"]["case"] for datapoint in dataset}
    print(f"{len(dataset)} datapoints from {len(cases)} cases")
    print(f"would create run agent-chat-{name}, then log one session per datapoint:")
    print(
        json.dumps(
            session_payload("<run_id>", name, first), ensure_ascii=False, indent=1
        )
    )
