# Agent chat evaluation

Whether the real chat agent answers shop questions correctly and picks the right tools, on a made-up shop. Each run is logged to HoneyHive as an experiment, so two runs can be compared after a prompt or model change.

## Files

| File | What it does |
|---|---|
| `seed.sql` | Rebuilds shop 9001: 8 products on sale and 1 archived, 4 customers, about 380 sales over the last 95 days at 00:30, 10:00, 16:00 and 23:30 shop time, discounts, voided sales, debts that are open, partly repaid or settled, weekly stock purchases and rent paid at 00:30 on the 1st |
| `run.py` | Asks 21 questions through `AgentService`, 3 times each, scores the answers against SQL on the base tables, has a model judge the cases a regex cannot, and logs the run |
| `results/` | One JSON per run name, with each answer, tool list, duration, verdict, model, `prompt_version` and `suite_version`; ignored by Git, since HoneyHive keeps each run |

## Rerun

From `backend/ai`, with `smartledger-local-db` running and `HH_API_KEY` set, seed the shop on the day of the run:

```bash
docker exec -i smartledger-local-db psql -U smartledger -d smartledger -q -v ON_ERROR_STOP=1 < evaluation/agent_chat/seed.sql
```

```bash
LOG_LEVEL=WARNING uv run python evaluation/agent_chat/run.py --name baseline
```

`--repeats` sets how many times each question runs (3 by default) and `--judge` the model alias that grades the judged cases (`chat` by default, so the chat model grades itself; add a stronger alias to `MODEL_ALIASES` for fairer grades). The output has one line per case with its passes, its correct tool choices and its slowest run, then the totals, the model, `prompt_version` (the first 12 characters of the SHA-256 of the agent's instructions and tool definitions) and `suite_version` (the same for the cases and the seed). Compare two runs only when they share a `suite_version` and differ in one of the others; one failure in three is noise until it repeats.

## Maintaining it

- `build_dataset` refuses a database that is not on `localhost`, `127.0.0.1` or `::1`, so a run never scores real shops; keep the seed made up. It also refuses a shop seeded on another day, because the seed dates sales from today.
- A run that crosses midnight shop time ends with an error, because "yesterday" and "this month" moved after the expected answers were computed.
- Inside a Claude Code shell, unset `ANTHROPIC_BASE_URL` first: the shell's own value overrides the gateway the model key belongs to and the model answers 401.
- Long-term memory is off here, because what one run stores would change the next run's answers. Chat history is on, which the follow-up case needs.
- What the seed is built to catch: a window cut in UTC instead of shop time moves the 00:30 and 23:30 sales across a day or month; revenue summed from `subtotal_vnd` misses the discounts; an unfiltered count keeps the voided sales; debt taken as total minus paid ignores repayments, which lower `debts.outstanding_vnd` but not `sales.paid_vnd`, as in Core; a product count without `status` keeps the archived product.
- A case's expected value is SQL, not a number. A number case passes when every expected figure appears exactly in the answer; `approximate` (the average) allows 0.1%, enough for rounding to tens but not for an average that counts voided sales. An expected zero also passes when the answer says there is none ("chưa có đơn"). Signs are ignored, so "giảm 1.715.000" answers a change of -1,715,000.
- `numbers_in` drops dates ("tháng 6/2027", "2026-10-07"), times ("23:30") and list markers ("3. Mì") before reading figures, applies unit words (tỷ, triệu, tr, M, nghìn, ngàn, k), adds up "17 triệu 502 nghìn", and reads a last dot or comma followed by one or two digits as the decimal mark.
- A case with `judge` is graded by a model against its rubric, filled with the expected names: the top product, the low-stock case (the views have no threshold, so the answer must say the minimum is unknown) and the out-of-scope case (the answer must decline without a forecast). Change a rubric only with the case it grades.
- `tool_choice` counts only `query_shop_data`, since `suggest_screen` and `calculate` read no shop data.
