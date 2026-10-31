# ADR-0007: The code sandbox runs model-written programs, not data tools

- **Status:** Accepted, recorded after the fact; sandbox added in #317 on 2026-10-19, data tools taken out in #331 on 2026-10-20
- **Date:** 2026-10-30
- **Owner:** not assigned

## Context

- Some answers need more than one SQL query or a plain sum, such as a loop over several tool results.
- #317 added `run_code`: the model writes a Python program that runs in the [Monty](https://github.com/pydantic/monty) sandbox through Harness Code Mode. It folded `query_shop_data` and `suggest_restock` into the sandbox, so a program could call them and save model turns.
- With the data tools folded, they left the model-facing tool list. On staging, 18 of 18 plain data questions then went through `run_code`.

## Decision

- `SANDBOX_TOOLS` in `src/main.py` is empty: no tool is folded into the sandbox. The data tools stay direct tools.
- `run_code` is for programs that neither one SQL query nor `calculate` can express. The program calls no tool; it gets its inputs from earlier tool results.
- Monty starts only when a turn calls `run_code`.

## Options considered

| Option | Outcome |
|---|---|
| Fold the data tools into the sandbox (#317) | Reverted in #331: every data question ran in Monty for no gain |
| Direct data tools plus a tool-free sandbox | Chosen |
| No sandbox | Not chosen: `run_code` stays available for multi-step programs |

## Consequences

- Plain data questions use `query_shop_data` or `suggest_restock` directly; on staging, `run_code` use dropped from 18 of 18 turns to 0 of 18.
- Latency did not change (median 6.01 s before, 6.14 s after). Monty costs about 6 ms per warm turn and 24 ms on the first, so model round trips, not the sandbox, set latency.
- A question that one program used to answer may now take several direct calls or one larger SQL query.
- `SANDBOX_MAX_TOOL_CALLS` bounds nothing while no tool is folded. If a tool is folded in again, keep it equal to `AGENT_TOOL_CALL_LIMIT`: the tool-call guardrail counts one `run_code` as one call and does not see calls nested inside it.
- Sandbox limits are provisional until the PO approves them.

## References

- PRs #317 and #331.
- [AI README, Calculation and sandbox](../../../backend/ai/README.md#calculation-and-sandbox) for the current limits.
