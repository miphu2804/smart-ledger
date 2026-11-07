# HoneyHive config as code

Evaluators, charts and alerts that watch Bobi, the shop agent of the AI service, kept as files in the layout of HoneyHive's [Config as Code](https://docs.honeyhive.ai/v2/cli-reference/config-as-code) guide, so a change goes through review like code and follows their docs.

## What Bobi is checked against

Bobi answers one shop owner in Vietnamese, from tool results only, and cannot change records (`backend/ai/src/prompt_templates/shop_agent.py`). Each evaluator checks one rule of that prompt, or one tool, on traffic HoneyHive receives.

| File | Scores | True when |
|---|---|---|
| `evaluators/query-error.yaml` | each `execute_tool query_shop_data` event | the tool answered `Error[CODE]`, so the model wrote SQL the guard or the database refused |
| `evaluators/internal-leak.yaml` | each `agent-chat` session | the answer shows a view name, SQL, an id column, a tool name or a tool error code (rule 8) |
| `evaluators/unsupported-figure.yaml` | each `agent-chat` session | the turn called no tool and answers with an amount, a quantity with a unit or a percentage the question does not contain (rules 2 to 4) |
| `evaluators/format-violation.yaml` | each `agent-chat` session | the answer uses bullets, headings, quotes or a code block other than `chart`, `ui` and the service's `actions` (rule 10) |
| `evaluators/invalid-chart.yaml` | each `agent-chat` session | a chart or ui block fails the checks of `readChart` in `frontend/mobile/src/lib/chatMarkdown.ts` or `readUi` in `frontend/mobile/src/lib/chatUi.ts`, is not closed, or is not the only one (rule 11) |
| `evaluators/non-vietnamese-answer.yaml` | each `agent-chat` session | the answer has text but no Vietnamese letter with a diacritic |
| `evaluators/sql-parse-check.yaml` | each `execute_tool query_shop_data` event | the SQL in `inputs.tool_arguments.sql` parses as PostgreSQL, by HoneyHive's SQL Parse Check template; false means a syntax error before the guard or the database saw it |

All seven are Python, run at 100% sampling and cost no model calls. Session evaluators read `outputs.answer`, which includes the `actions` block the service appends for screen buttons, rather than the `invoke_agent chat` span, because a turn that ends early on screen buttons has no output on that span; HoneyHive scores the session again when the answer arrives after it opened. `unsupported-figure` reads `metrics.tool_calls`, the session metric the AI service writes with the answer. The AI service also records a `memory recall` event per turn (the question, the memories recalled with their scores, and `metrics.recalled_count`) in the same session; no evaluator reads it online. `backend/ai/evaluation/agent_chat` runs send scores and no spans, so these online evaluators do not score them; their model-graded scores come from the templates in that folder.

The charts show the wait for the first words, tool calls per turn, the query error rate and the unsupported figure rate per day, split by `source`, so staging, production and evaluation runs stay apart. The alerts fire on `production` traffic only and email every project member: a daily p95 above 20 seconds for `invoke_agent chat`, a daily `query-error` rate above 20%, and more than five failed turns a day, cancelled ones aside.

## Layout

| Path | CLI namespace | Applied by |
|---|---|---|
| `evaluators/` | `honeyhive metrics` | `scripts/honeyhive/sync-evaluators.sh` with a project key |
| `state.json` | | the evaluator IDs `scripts/honeyhive/sync-evaluators.sh` updates by; commit it after a run that creates one |
| `charts/` | `honeyhive charts` | `scripts/honeyhive/sync-dashboards.sh`, created or updated by `name` |
| `alerts/` | `honeyhive alerts` | `scripts/honeyhive/sync-dashboards.sh`, created when no alert has the `name` |
| `projects.yaml` | | the projects `scripts/honeyhive/sync-dashboards.sh` covers; staging and production share one and differ by `source` |

The two scripts sit at the repository root and the workflows `.github/workflows/honeyhive-sync.yml` and `honeyhive-dashboards.yml` run them on pushes to `main` that match each workflow's path filters, or on manual dispatch. Datasets and datapoints have no folder: the offline evaluation in `backend/ai/evaluation/agent_chat` keeps its cases and seed in files (`cases.yaml`, `seed.sql`) and hashes them into `suite_version`.

## Apply

Applying these files changes an external service. Use the private operations knowledge base for approved access, credential scopes, target selection and execution; this repository does not publish environment mappings or provisioning commands.

Review configuration changes against the installed CLI schema before applying. A newly created evaluator needs its returned ID recorded in `state.json`; the workflow refuses to sync an evaluator without that ID. Repository configuration and passing tests do not establish live ingestion, access controls or retention approval.

## Limits

- The CLI has no alert update: to change an alert, edit it in the UI, or delete it there and run the script again.
- HoneyHive refuses an alert whose fields no logged event has yet, and it refused `metrics.query-error` filtered on `event_name`, so `query-errors.yaml` filters on `event_type`. `failed-turns.yaml` filters on `metadata.error` with `exists`, which the API accepts only with an empty `value`.
- A chart of a session metric (`first_text_ms`, `tool_calls`, `unsupported-figure`) must filter on `event_type` `session`, as HoneyHive's own session charts do; filtered on `event_name` `agent-chat`, HoneyHive looks for the metric on events other than sessions and shows no data.
- A renamed evaluator, chart or alert is created again and the old one stays on HoneyHive until it is deleted in the UI.
- Chart names allow only letters, numbers, spaces and `_ - ' &`.

## Why no LLM evaluator

An online LLM judge would send each owner's question and answer through HoneyHive to a model provider configured in the workspace, a data flow `NFR-008` does not cover. The model-graded cases and the LLM templates (Tool Usage, Failure Recovery, Answer Faithfulness, Context Relevance, Tool Trajectory) stay in `backend/ai/evaluation/agent_chat`, which runs on a made-up shop and rates them client-side, so no model key is needed in HoneyHive.
