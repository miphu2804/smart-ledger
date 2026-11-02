# HoneyHive config as code

Evaluators, charts and alerts that watch Bobi, the shop agent of the AI service, kept as files in the layout of HoneyHive's [Config as Code](https://docs.honeyhive.ai/v2/cli-reference/config-as-code) guide, so a change goes through review like code and follows their docs.

## What Bobi is checked against

Bobi answers one shop owner in Vietnamese, from tool results only, and cannot change records (`backend/ai/src/prompt_templates/shop_agent.py`). Each evaluator checks one rule of that prompt, or one tool, on traffic HoneyHive receives.

| File | Scores | True when |
|---|---|---|
| `evaluators/query-error.yaml` | each `execute_tool query_shop_data` event | the tool answered `Error[CODE]`, so the model wrote SQL the guard or the database refused |
| `evaluators/internal-leak.yaml` | each `agent-chat` session | the answer shows a view name, SQL, an id column, a tool name or a tool error code (rule 8) |
| `evaluators/unsupported-figure.yaml` | each `agent-chat` session | the turn called no tool and answers with an amount, a quantity with a unit or a percentage the question does not contain (rules 2 to 4) |
| `evaluators/format-violation.yaml` | each `agent-chat` session | the answer uses bullets, headings, quotes or a code block other than `chart` and the service's `actions` (rule 10) |
| `evaluators/invalid-chart.yaml` | each `agent-chat` session | a chart block fails the checks of `readChart` in `frontend/mobile/src/lib/chatMarkdown.ts`, is not closed, or is not the only one (rule 11) |
| `evaluators/non-vietnamese-answer.yaml` | each `agent-chat` session | the answer has text but no Vietnamese letter with a diacritic |

All six are Python, run at 100% sampling and cost no model calls. Session evaluators read `outputs.answer`, which includes the `actions` block the service appends for screen buttons, rather than the `invoke_agent chat` span, because a turn that ends early on screen buttons has no output on that span; HoneyHive scores the session again when the answer arrives after it opened. `unsupported-figure` reads `metrics.tool_calls`, the session metric the AI service writes with the answer. Online evaluators also score experiment traces, so `backend/ai/evaluation/agent_chat` runs get the `query-error` column; those runs open no `agent-chat` session, so the session evaluators do not score them.

The charts show the wait for the first words, tool calls per turn, the query error rate and the unsupported figure rate per day, split by `source`, so staging, production and evaluation runs stay apart. The alerts fire on `production` traffic only and email every project member: a daily p95 above 20 seconds for `invoke_agent chat`, a daily `query-error` rate above 20%, and more than five failed turns a day, cancelled ones aside.

## Layout

| Path | CLI namespace | Applied by |
|---|---|---|
| `evaluators/` | `honeyhive metrics` | `sync-evaluators.sh` with a project key |
| `state.json` | | the evaluator IDs `sync-evaluators.sh` updates by; commit it after a run that creates one |
| `charts/` | `honeyhive charts` | `sync-dashboards.sh`, created or updated by `name` |
| `alerts/` | `honeyhive alerts` | `sync-dashboards.sh`, created when no alert has the `name` |
| `projects.yaml` | | the projects `sync-dashboards.sh` covers; staging and production share one and differ by `source` |

The two scripts sit at the repository root and the workflows `.github/workflows/honeyhive-sync.yml` and `honeyhive-dashboards.yml` run them on every merge into `main`, as in HoneyHive's guide. Datasets and datapoints have no folder: the offline suite in `backend/ai/evaluation/agent_chat` builds its cases and seed in code and hashes them into `suite_version`.

## Apply

Install the [HoneyHive CLI](https://docs.honeyhive.ai/v2/cli-reference/getting-started) (`brew install honeyhive`), `jq` and `yq` v4, then run from the repository root:

```bash
export HH_DATA_PLANE_URL=https://api.dp1.us.prod.honeyhive.ai
HH_PROJECT_API_KEY=... bash sync-evaluators.sh
HH_DATA_PLANE_API_KEY=... HH_CONTROL_PLANE_API_KEY=... HH_CONTROL_PLANE_URL=https://api.cp.us.honeyhive.ai bash sync-dashboards.sh
```

`HH_PROJECT_API_KEY` is the project key the AI service reads as `HH_API_KEY`. The other two are workspace keys under Settings, Workspace, API Keys: a Data Plane key with `project.chart.list`, `.post` and `.put`, and a Control Plane key with `project.alert.list` and `.post`. The AI service reads neither, so they stay out of `AppConfig`, `.env.example` and Dopbase. The workflows read all three from repository secrets of the same names.

Create a new evaluator locally and commit the `state.json` the run updates: an evaluator created in CI gets an ID the workflow cannot commit, so the workflow fails on a changed `state.json` instead of creating a duplicate on the next run.

Check a file before pushing it against the schema the CLI prints, for example `honeyhive metrics create --show-file-schema`, with `check-jsonschema`. An alert file has no `project_id`, which the script adds per project, so drop it from the schema's `required` first.

## Limits

- The CLI has no alert update: to change an alert, edit it in the UI, or delete it there and run the script again.
- HoneyHive refuses an alert whose fields no logged event has yet, and it refused `metrics.query-error` filtered on `event_name`, so `query-errors.yaml` filters on `event_type`. `failed-turns.yaml` filters on `metadata.error` with `exists`, which the API accepts only with an empty `value`.
- A renamed evaluator, chart or alert is created again and the old one stays on HoneyHive until it is deleted in the UI.
- Chart names allow only letters, numbers, spaces and `_ - ' &`.

## Why no LLM evaluator

An online LLM judge would send each owner's question and answer through HoneyHive to a model provider configured in the workspace, a data flow `NFR-008` does not cover. The model-graded cases stay in `backend/ai/evaluation/agent_chat`, which runs on a made-up shop.
