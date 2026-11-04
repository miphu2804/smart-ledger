# Evaluation

One pipeline scores the AI service's behaviour. A suite is only data and thresholds; a target runs each case against the real service; metrics score what came back; `core/` gates, reports and syncs. Run it from `backend/ai` with `uv run python evaluation/run.py <suite> ...`.

## Layout

| Folder | What it holds |
|---|---|
| `run.py` | The command line and the one place that wires a suite to its target, its scoring and its thresholds (`SUITES`, a dict literal) |
| `core/` | `schema.py` (`Case`, `Output`, `MetricResult`, `CaseResult`), `pipeline.py` (each case through the target, then the metrics), `gate.py` (`thresholds.toml` `[minimum]` and `[maximum]`; a gated metric no row scored fails), `report.py` (console, `results/<suite>-<name>.json`, means by layer, markdown) and `honeyhive.py` (the `--sync` exporter) |
| `targets/` | Wrappers of the real services, with no re-implementation of them: `agent.py` starts the app's lifespan and runs `app.state.agent`, reading the tool calls from spans; `memory.py` calls `AgentMemoryService.with_memories` on the local database. `database.py` is the localhost guard both use |
| `metrics/` | One module per layer, as the report groups them: `task`, `tool_use`, `memory`, `response_quality`, `safety` and `performance`, plus `judge.py`, the model grader that runs the HoneyHive template prompts the other modules define |
| `suites/<suite>/` | The data of a suite: cases, seed or generator, `thresholds.toml` and a README with its own commands |
| `results/` | One JSON per run, `<suite>-<name>.json`; ignored by Git |

| Suite | Scores | README |
|---|---|---|
| `agent_chat` | The chat agent on a made-up shop: figures, tool choice, memory recall, leaks, language, judged quality | [suites/agent_chat](suites/agent_chat/README.md) |
| `memory` | Recall of `AgentMemoryService` on 48 synthetic shops | [suites/memory](suites/memory/README.md) |

## Run

```bash
LOG_LEVEL=WARNING uv run python evaluation/run.py agent_chat --name baseline --gate evaluation/suites/agent_chat/thresholds.toml --report /tmp/agent-chat.md
LOG_LEVEL=WARNING uv run python evaluation/run.py memory --gate evaluation/suites/memory/thresholds.toml
```

| Option | Meaning |
|---|---|
| `--name` | The run's label in the results file and in HoneyHive (`baseline` by default) |
| `--repeats` | Times each `agent_chat` question runs (3 by default); `memory` runs each query once |
| `--judge` | Model alias of the `agent_chat` judge (`chat` by default) |
| `--gate PATH` | A thresholds file; a metric outside its bound exits 1 |
| `--report PATH` | Writes the run as markdown |
| `--sync` | Sends the `agent_chat` scores to HoneyHive and needs `HH_API_KEY` |
| `--dry-run` | Builds the cases and prints the plan; no target runs, no model is asked and HoneyHive is not called |

Both suites refuse a database that is not on `localhost`, `127.0.0.1` or `::1`.

## How a run flows

1. `run.py` builds the suite: its cases (`Case`: id, inputs, truth, expected), its target and its scoring function.
2. `core/pipeline.py` enters the target once, then for each case calls `output = await target(case)` and `await score(case, output)`. A case that raises is logged and left out, and the run then fails because it has fewer rows than cases.
3. `core/report.py` turns the results into rows, prints them, writes `results/` and averages each metric over the rows it applies to.
4. `core/gate.py` compares the means with `thresholds.toml`.

A metric result carries its layer, its name, a score, its case and an optional reason. A case a metric does not apply to has no result for it, so it does not count in the mean. A metric name must be listed in `LAYERS` in `core/report.py`, or the report does not show it.

## Add a suite

1. Create `suites/<name>/` with the cases, a `thresholds.toml` and a README.
2. Add a target in `targets/` that wraps the real service as an async context manager (set up in `__aenter__`, clean up in `__aexit__`) and returns an `Output` when called with a `Case`.
3. Add the metrics it needs to the module of their layer in `metrics/`, and any new metric name to `LAYERS`.
4. Add a builder function and one line to `SUITES` in `run.py`.
5. Add unit tests for the metrics on hand-built records; they need no database or network.
