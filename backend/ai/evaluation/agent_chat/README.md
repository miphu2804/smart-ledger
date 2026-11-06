---
type: Guide
title: "Agent chat evaluation"
description: "Asks the real chat agent fixed questions about a made-up shop and checks figures, tools, memory and leaks."
owner: AI owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-05T13:45:47+07:00 }
stale_after: 2027-01-04T13:45:47+07:00
---
# Agent chat evaluation

Asks the real chat agent 23 questions about a made-up shop and checks the answers: right figures, right tools, memory recall, no internal names leaked, answered in Vietnamese.

## Run

From `backend/ai`, with `smartledger-local-db` running. Seed the shop first, on the day you run it, because the seed dates sales from today:

```bash
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
- Inside a Claude Code terminal, run `unset ANTHROPIC_BASE_URL` first, or the model answers 401.
- The agent cannot save new memories during a run, so every run starts from the same two facts.
