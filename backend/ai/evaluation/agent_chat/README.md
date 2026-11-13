# Agent chat evaluation

Asks the real chat agent 23 questions about a made-up shop and checks the answers: right figures, right tools, memory recall, no internal names leaked, answered in Vietnamese.

## Run

From `backend/ai`, with `smartledger-local-db` running. Seed the shop first, on the day you run it, because the seed dates sales from today. The seed gives the shop to the first user, so the first command adds a placeholder owner when the disposable database has no user yet, as CI does:

```bash
docker exec smartledger-local-db psql -U smartledger -d smartledger -q -v ON_ERROR_STOP=1 -c "INSERT INTO users (display_name) SELECT 'Eval owner' WHERE NOT EXISTS (SELECT 1 FROM users)"
docker exec -i smartledger-local-db psql -U smartledger -d smartledger -q -v ON_ERROR_STOP=1 < evaluation/agent_chat/seed.sql
uv run evaluation/run.py agent_chat
```

This calls the chat model and the judge model, so it costs money. Try `--dry-run` first (no model call) or `--repeats 1` (each question once instead of 3 times). The other options are in the [evaluation README](../README.md#run).

The output shows one row per question (passes out of the repeats, slowest run), then the metrics table. The last line names the model, `prompt_version` (changes when the agent's prompt or tools change) and `suite_version` (changes when the cases or the seed change). Compare two runs only when they have the same `suite_version`.

## Files

| File | What it does |
|---|---|
| `seed.sql` | Rebuilds shop 9001: products, customers, about 380 sales over 95 days, debts, purchases and rent |
| `cases.yaml` | The questions, the SQL that gives each expected answer, and two made-up memories |
| `agent_chat_eval.py` | `AgentChatEval`: loads the cases, computes the expected answers from the database and lists the evaluators |
| `thresholds.toml` | The minimum score of each checked metric |
| `target.py` | `AgentTarget`: starts the app's lifespan once, stores the two made-up memories and asks each case's question and follow-up |
| `without_memory_writes.py` | `WithoutMemoryWrites`: keeps memory recall on but stores nothing a turn would save |
| `metrics/` | One evaluator class per group of metrics, plus `judge.py`, which asks a model to grade an answer |
| `honeyhive.py` | With `--sync`, logs each case to HoneyHive as one session of an experiment run; with `--dry-run`, prints the run and the first session it would send |

## Metrics

| Metric | Score | Checked on |
|---|---|---|
| `correct` | 1 when every expected figure is in the answer, or the judge passes it | every question |
| `tool_choice` | 1 when the agent queried shop data exactly when the question needs it | every question |
| `tool_calls` | How many tools the turn called | every question |
| `recalled_expected` | 1 when memory returned the seeded fact | the two `memory_*` questions |
| `no_internal_leak` | 1 when the answer shows no SQL, view, id column or tool name | every question |
| `vietnamese_answer` | 1 when the answer is in Vietnamese | every question |
| `no_time_echo` | 1 when the answer states no clock time, which only comes from the prompt's current-time line since no question asks for it | every question |
| `tool_usage`, `tool_trajectory`, `failure_recovery`, `answer_faithfulness`, `context_relevance` | 1 to 5, graded by the judge with HoneyHive's evaluator templates | where they apply |
| `seconds` | Time of the turn | every question |

## Good to know

- Add or change a question in `cases.yaml`. Its expected answer is SQL, not a fixed number, so it stays right when the seed moves its dates.
- Questions with a `judge` rubric are graded by a model instead of by figures. Change a rubric only together with its question.
- The seed has traps on purpose: sales at 00:30 and 23:30 (catches time zone bugs), discounts, voided sales, partly repaid debts and an archived product. Keep them when you edit it.
- The two safety patterns in `metrics/safety.py` are copies of `.honeyhive/evaluators/`; change both together.
- A run that crosses midnight shop time fails, because "today" changed after the expected answers were computed. Just rerun.
- A 401 from the model means `OPENAI_API_KEY` or `OPENAI_BASE_URL` in `.env` does not match the gateway; the [runtime reference](../../docs/runtime-reference.md#configuration) owns both.
- The agent cannot save new memories during a run, so every run starts from the same two facts.
