# HoneyHive online evaluators and alerts

Evaluators that HoneyHive runs on every new trace from the AI service, and alerts on their scores and on latency, kept as files so a change goes through review like code.

## Files

| File | What it does |
|---|---|
| `evaluators/query-error.yaml` | Python evaluator on each `execute_tool query_shop_data` event: true when the tool answered `Error[CODE]`, so the model wrote SQL the guard or the database refused |
| `evaluators/internal-leak.yaml` | Python evaluator on each `agent-chat` session: true when the answer the turn closed with shows the owner a view name, SQL, an id column, a tool name or a tool error code |
| `apply.py` | Creates or updates every evaluator in `evaluators/` on the project of `HH_API_KEY`, and creates the alerts in `alerts/` that do not exist yet when `HH_CONTROL_PLANE_API_KEY` is set; both match by `name` |
| `alerts/*.yaml` | Alerts on `production` traffic only, emailed to every project member: a daily p95 above 20 seconds for `invoke_agent chat`, a daily `query-error` rate above 20%, and more than five failed turns a day, cancelled ones aside |

## Apply

From `backend/ai`, with `HH_API_KEY` set to the project's key:

```bash
uv run python evaluation/honeyhive/apply.py
```

Without `HH_CONTROL_PLANE_API_KEY` the script applies the evaluators and skips the alerts. Alerts live on HoneyHive's control plane, which the project key and the Python SDK do not reach: create a key with `project.alert.list` and `project.alert.post` under Settings, Workspace, API Keys, Control Plane, and export it for the run. `apply.py` calls the US control plane, where this workspace lives; a workspace in another region needs its URL. The AI service never reads it, so it stays out of `AppConfig`, `.env.example` and Dopbase.

Both evaluators run at 100% sampling. They are Python, so they cost no model calls. `query-error` scores the tool span, which carries its result when it lands. `internal-leak` scores the session's `outputs.answer` rather than the `invoke_agent chat` span, because a turn that ends early on screen buttons has no output on that span; HoneyHive scores the session again when the answer arrives after it opened. Online evaluators also score experiment traces, so `evaluation/agent_chat` runs get the `query-error` column; those runs turn the app's tracer off and open no `agent-chat` session, so `internal-leak` does not score them.

The control plane has no alert update here: to change an alert, edit it in the UI, or delete it there and run the script again. HoneyHive refuses an alert whose fields no logged event has yet, and it refused `metrics.query-error` filtered on `event_name`, so `query-errors.yaml` filters on `event_type`. `failed-turns.yaml` filters on `metadata.error` with `exists`, which the API accepts only with an empty `value`.

## Why no LLM evaluator

An online LLM judge would send each owner's question and answer through HoneyHive to a model provider configured in the workspace, a data flow `NFR-008` does not cover. The model-graded cases stay in `evaluation/agent_chat`, which runs on a made-up shop.
