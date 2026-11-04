# Evaluation

One pipeline scores the AI service's behaviour. An evaluation is a class that holds its cases, a target and a list of evaluators; the target runs each case against the real service; each evaluator scores what came back; `core/` gates, reports and syncs. Run it from `backend/ai` with `uv run evaluation/run.py <evaluation> ...`.

## Layout

| Folder | What it holds |
|---|---|
| `run.py` | The command line, and `EVALS`, a dispatch table from each evaluation's name to the function that builds it from the options it uses |
| `core/` | `schema.py` (`Case`, `Output`, `MetricResult`, `CaseResult`), `pipeline.py` (`EvaluationPipeline`: each case through the target, then through every evaluator), `gate.py` (`thresholds.toml` `[minimum]` and `[maximum]`; a gated metric no row scored fails), `report.py` (console, `results/<evaluation>-<name>.json`, means by layer, markdown) and `honeyhive.py` (the `--sync` exporter) |
| `targets/` | One class per file, wrapping the real services with no re-implementation of them: `agent.py` starts the app's lifespan and runs `app.state.agent`, reading the tool calls from spans; `memory.py` calls `AgentMemoryService.with_memories` on the local database. `database.py` is the localhost guard both use |
| `metrics/` | One evaluator class per layer, as the report groups them: `task.py`, `tool_use.py`, `memory.py`, `recall.py`, `response_quality.py`, `safety.py` and `performance.py`, plus `judge.py`, the model grader that rates the HoneyHive template prompts the evaluators define |
| `agent_chat/`, `memory/` | One evaluation each: its class (`agent_chat_eval.py`, `memory_eval.py`), its cases, seed or generator, `thresholds.toml` and a README with its own commands |
| `results/` | One JSON per run, `<evaluation>-<name>.json`; ignored by Git |

| Evaluation | Scores | README |
|---|---|---|
| `agent_chat` | The chat agent on a made-up shop: figures, tool choice, memory recall, leaks, language, judged quality | [agent_chat](agent_chat/README.md) |
| `memory` | Recall of `AgentMemoryService` on 48 synthetic shops | [memory](memory/README.md) |

## Run

```bash
export LOG_LEVEL=WARNING

# plan only: no model call, nothing sent
uv run evaluation/run.py agent_chat --dry-run

# full runs, gated, with a markdown report
uv run evaluation/run.py agent_chat --gate evaluation/agent_chat/thresholds.toml --report /tmp/agent-chat.md
uv run evaluation/run.py memory --gate evaluation/memory/thresholds.toml

# also send the agent_chat scores to HoneyHive
uv run evaluation/run.py agent_chat --name baseline --sync
```

A run without `--sync` stays on the machine: it scores with the HoneyHive templates copied into `metrics/`, prints to the terminal and writes `results/`, so it spends no HoneyHive events (an `agent_chat` sync costs one per case, about 69). `agent_chat` still pays for its chat and judge model calls; `memory` asks no model, and makes no network call once its embedding cache is filled.

| Option | Meaning |
|---|---|
| `--name` | The run's label in the results file and in HoneyHive (`baseline` by default) |
| `--repeats` | Times each `agent_chat` question runs (3 by default); `memory` runs each query once |
| `--judge` | Model alias of the `agent_chat` judge (`chat` by default) |
| `--gate PATH` | A thresholds file; a metric outside its bound exits 1 |
| `--report PATH` | Writes the run as markdown |
| `--sync` | Sends the `agent_chat` scores to HoneyHive and needs `HH_API_KEY` |
| `--dry-run` | Builds the cases and prints the plan; no target runs, no model is asked and HoneyHive is not called |

Both evaluations refuse a database that is not on `localhost`, `127.0.0.1` or `::1`.

## How a run flows

1. `run.py` builds the evaluation class: its cases (`Case`: id, inputs, truth, expected), its target and its evaluators.
2. `EvaluationPipeline.run` enters the target once, then for each case calls `output = await target.ask(case)` and gives the case and output to every evaluator in turn. A case that raises is logged and left out, and the run then fails because it has fewer rows than cases.
3. `core/report.py` turns the results into rows, prints them, writes `results/` and averages each metric over the rows it applies to.
4. `core/gate.py` compares the means with `thresholds.toml`.

An evaluator has a `layer` and `async evaluate(case, output)`, which returns a list of metric results. A metric result carries its layer, its name, a score, its case and an optional reason. A metric that does not apply to a case has no result, so it does not count in the mean. A metric name must be listed in `LAYERS` in `core/report.py`, or the report does not show it.

The two evaluation classes share no base class: each has `name`, `cases`, `target`, `evaluators`, `thresholds` (the path of its TOML file), `summary` (the metrics whose passes the console prints per case), `check()` and `show_plan(name)`, which is all `run.py` and the pipeline read.

## Add an evaluation

1. Create `<name>/` with the cases, a `thresholds.toml` and a README.
2. Add a target in `targets/` that wraps the real service as an async context manager (set up in `__aenter__`, clean up in `__aexit__`) and returns an `Output` from `ask(case)`.
3. Add the evaluators it needs to `metrics/`, one class per file, and any new metric name to `LAYERS`.
4. Write `<name>/<name>_eval.py`: a class with the attributes above, which builds its cases, its target and its list of evaluators.
5. Add one line to `EVALS` in `run.py` that builds the class from the options it uses.
6. Add unit tests for the evaluators on hand-built records; they need no database or network.
