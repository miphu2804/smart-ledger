# Agent chat evaluation

Whether the real chat agent answers shop questions correctly, picks the right tools, recalls memory and keeps internals out of its answers, on a made-up shop. A run is scored on this machine, can be gated on minimum scores and written as a markdown report, and is synced to HoneyHive only when asked. The [Eval regression](../../../../docs/development/ci-cd.md#eval-regression) workflow runs it by hand in CI.

## Files

| File | What it does |
|---|---|
| `seed.sql` | Rebuilds shop 9001: 8 products on sale and 1 archived, 4 customers, about 380 sales over the last 95 days at 00:30, 10:00, 16:00 and 23:30 shop time, discounts, voided sales, debts that are open, partly repaid or settled, weekly stock purchases and rent paid at 00:30 on the 1st |
| `run.py` | The command line: switches the app config to tracing off and long-term memory recall on, then builds the dataset, runs it, reports, gates and optionally syncs the scores |
| `cases.py` | The 23 questions, each with the SQL on the base tables that gives its expected answer, and the two made-up memories |
| `pipeline.py` | Builds the dataset from the cases, asks each question 3 times through `AgentService` and scores every answer |
| `scoring.py` | The regex and number graders: correct figures, tool choice, memory recall, internal leaks and Vietnamese answers |
| `judge.py` | The model grader for the cases a regex cannot judge and the HoneyHive template prompts that rate the tool use |
| `reporting.py` | Prints each case, writes `results/`, averages the metrics by layer, applies the gate and writes the markdown report |
| `honeyhive_sync.py` | Logs each case as a session of an experiment run, or prints what a dry run would send |
| `thresholds.toml` | The minimum mean of each gated metric; `--gate` exits 1 below one |
| `results/` | One JSON per run name, with each answer, tool calls, recalled memories, scores, judge reasons, duration, model, `prompt_version` and `suite_version`; ignored by Git |

## Rerun

From `backend/ai`, with `smartledger-local-db` running, seed the shop on the day of the run:

```bash
docker exec -i smartledger-local-db psql -U smartledger -d smartledger -q -v ON_ERROR_STOP=1 < evaluation/agent_chat/seed.sql
```

```bash
LOG_LEVEL=WARNING uv run python evaluation/agent_chat/run.py --name baseline \
  --gate evaluation/agent_chat/thresholds.toml --report /tmp/agent-chat.md
```

`--repeats` sets how many times each question runs (3 by default) and `--judge` the model alias that grades the judged cases and rates the templates below (`chat` by default, so the chat model grades itself; add a stronger alias to `MODEL_ALIASES` for fairer grades). `--gate` reads `thresholds.toml` and exits 1 when a gated metric's mean is below its minimum or no row scored it. `--report` writes the run as markdown: the gate, every metric by layer, and the cases that missed a minimum. `--sync` also sends the scores to HoneyHive (below) and needs `HH_API_KEY`; without it nothing leaves the machine. `--dry-run` builds the dataset and prints the run and the first session it would send, with no model call and no request to HoneyHive. The output has one line per case with its passes, its correct tool choices and its slowest run, then the totals, the model, `prompt_version` (the first 12 characters of the SHA-256 of the agent's instructions and tool definitions) and `suite_version` (the same for the cases and the seed). Compare two runs only when they share a `suite_version` and differ in one of the others; one failure in three is noise until it repeats.

## What is scored and synced

The agent runs here with its tracer off and a local in-memory recorder, which is where each tool call's arguments and result come from. With `--sync`, after the run `honeyhive_sync.py` follows HoneyHive's [Sync Offline Evaluations](https://docs.honeyhive.ai/v2/evaluation/sync-offline-results): it creates an experiment run named `agent-chat-<name>`, logs each case as one session with its `inputs`, `outputs`, `metrics`, `metadata.run_id` and `metadata.datapoint_id`, and completes the run. A case costs one event and a run sends no span. HoneyHive's own run comparison and regression check (`compare_runs`) are computed by its backend, so they need a synced run; the gate here works on the local means instead.

The first four metrics keep their names from the earlier `evaluate()` runs, so those runs stay comparable; a suite change still moves `suite_version`.

| Metric | Value | Applies to |
|---|---|---|
| `correct`, `tool_choice`, `tool_calls`, `seconds` | as before | every case |
| `recalled_expected` | 1 when the recall returned the case's seeded fact | the two `memory_*` cases |
| `tool_usage`, `answer_faithfulness` | 1 to 5, from the HoneyHive templates of the same name | every case |
| `tool_trajectory` | 1 to 5, Tool Trajectory template | a turn that called a tool |
| `failure_recovery` | 1 to 5, Failure Recovery template | a turn where a tool answered `Error[CODE]` |
| `context_relevance` | 1 to 5, Context Relevance template, on the recalled memories | the two `memory_*` cases |
| `no_internal_leak` | 1 when the answer shows no view name, SQL, id column, tool name or tool error code; the pattern of the production evaluator `internal-leak` | every case |
| `vietnamese_answer` | 1 unless the answer has words but no Vietnamese diacritic, chart and button blocks left out; the pattern of `non-vietnamese-answer` | every case |

The report groups them into layers: task (`correct`), tool use, memory, response quality (`answer_faithfulness`), safety and performance (`seconds`). The two safety patterns are copied from `.honeyhive/evaluators/`, which run on HoneyHive and cannot import `scoring.py`; change both together.

The prompts are HoneyHive's [evaluator templates](https://docs.honeyhive.ai/v2/evaluators/evaluator-templates) copied into `judge.py` with their fields mapped to the case's `outputs` (`tool_calls`, `memories`, `available_tools`, `answer`), so they run through the same model alias as the other judged cases and need no model key in HoneyHive. Each rating's reason is in `outputs.judge_reasons`. Update the prompts by hand when HoneyHive changes a template.

## Maintaining it

- `build_dataset` refuses a database that is not on `localhost`, `127.0.0.1` or `::1`, so a run never scores real shops; keep the seed made up. It also refuses a shop seeded on another day, because the seed dates sales from today.
- A run that crosses midnight shop time ends with an error, because "yesterday" and "this month" moved after the expected answers were computed.
- Inside a Claude Code shell, unset `ANTHROPIC_BASE_URL` first: the shell's own value overrides the gateway the model key belongs to and the model answers 401.
- Long-term memory recall runs only in the two `memory_*` cases and memory writes are off. `pipeline.py` stores two made-up facts (`MEMORIES` in `cases.py`) for the shop before the run and replaces the service's `remember` with a no-op, so a turn stores nothing and every run recalls the same two facts. Recall has no score cut-off, so the other cases run without memory to keep their prompts as before. Chat history is on, which the follow-up case needs.
- What the seed is built to catch: a window cut in UTC instead of shop time moves the 00:30 and 23:30 sales across a day or month; revenue summed from `subtotal_vnd` misses the discounts; an unfiltered count keeps the voided sales; debt taken as total minus paid ignores repayments, which lower `debts.outstanding_vnd` but not `sales.paid_vnd`, as in Core; a product count without `status` keeps the archived product.
- A case's expected value is SQL, not a number. A number case passes when every expected figure appears exactly in the answer; `approximate` (the average) allows 0.1%, enough for rounding to tens but not for an average that counts voided sales. An expected zero also passes when the answer says there is none ("chưa có đơn"). Signs are ignored, so "giảm 1.715.000" answers a change of -1,715,000.
- `numbers_in` drops dates ("tháng 6/2027", "2026-10-07"), times ("23:30") and list markers ("3. Mì") before reading figures, applies unit words (tỷ, triệu, tr, M, nghìn, ngàn, k), adds up "17 triệu 502 nghìn", and reads a last dot or comma followed by one or two digits as the decimal mark.
- A case with `judge` is graded by a model against its rubric, filled with the expected names: the top product, the low-stock case (the views have no threshold, so the answer must say the minimum is unknown) and the out-of-scope case (the answer must decline without a forecast). Change a rubric only with the case it grades.
- `tool_choice` counts only `query_shop_data`, since `suggest_screen` and `calculate` read no shop data.
