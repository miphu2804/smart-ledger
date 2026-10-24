# DISCOVERY — open questions

Plan section 4 rule 8 sends contradictions between plan and code here, and
rule 6 sends justifications for a new runtime dependency here. Neither the file
nor this directory existed before 2026-10-21, although both rules reference it.

"The plan" is PLAN v3.1, Voice Order Product Resolution, which the owner keeps
outside the repo. The eval harness files and reports cited below arrive with the
stacked eval pull requests (#345, moved under `backend/ai/evaluation/voice_order/`
by #347); until those merge, the paths below do not exist on `staging`.

## Open question 1 — the gate tuning objective contradicts the plan

**Plan says.** Section 5.6, "Objective for both": *minimize ask_rate subject to
false_auto_rate ≤ FAR_MAX*. Section 9B.1 repeats it as the loop contract:
*Minimize `ask_rate` subject to FAR ≤ `FAR_MAX` on calibration; tie-break by
`recall@3`.*

**Code does.** `eval/lib/gateFit.ts`, `tuneGateRules` over `scoreRules`,
minimizes `nonAutoRate = askRate + newRate`, which counts a `NEW` as a failure to
answer. The function's own comment gives the reason: minimizing `ask_rate` alone
lets `NEW` absorb everything, so the search returns a gate that sends every line
to `NEW` with zero asks and zero false autos.

**Both are wrong, in opposite directions.**

- The plan's literal objective has a degenerate optimum. A gate that answers
  `NEW` to every line has `ask_rate = 0` and `FAR = 0`, and nothing in the
  section 8.3 rule excludes it.
- The code's objective rewards turning a `NEW` into an `AUTO`, so the search
  lowers `sFloor` until the FAR budget stops it. On `bakeoff_v2` it stopped at
  `sFloor = -0.01`, below every score the retriever can produce. The `NEW`
  branch became unreachable and the budget was spent auto-applying
  out-of-catalog lines, the one class of auto that is guaranteed wrong.

**Measured consequence.** `eval/reports/bakeoff_v2.md`, R2: `new_P` and `new_R`
both 0.0%, 1103 autos of which 16 wrong, FAR 1.1% (95% CI 0.6–1.6%). Against
`bakeoff_v1`: 700 autos, 2 wrong, FAR 0.1%. Every resolver row now breaches the
1% budget, so section 8.3 excludes all of them and the rule selects R0, the
existing `parseOrder` matcher.

**Why it surfaced only now.** In v1 the `margin` bug in
`frontend/mobile/src/lib/resolver/index.ts` gave a lone candidate `margin = 0`,
which stopped it clearing `mMin`. That accident, not the tuner, is what kept
v1's `sFloor` above zero. The v1 numbers were propped up by a bug, so this is a
correction rather than a regression.

**Not recorded anywhere.** `eval/runner/run.ts`'s `deviationsOf` does not
mention the objective, and neither report does. Section 4 rule 5 requires a
justified change to be recorded as a deviation with its reason.

**Proposed resolution (owner decision).** Count a `NEW` as a failure only when
the gold item was in the catalog: `cost = (asks + inCatalogNews) / lines`,
subject to `FAR ≤ FAR_MAX`. A correct `NEW` on an out-of-catalog line then costs
nothing, so the search has no reason to spend the budget auto-applying those
lines, and all-`NEW` stops being degenerate because every in-catalog line would
count. This is a deviation from the plan's literal text, so it needs the owner's
sign-off and a plan amendment rather than an agent's silent change.

**Blocked on.** The owner's decision on the objective. Section 4 rule 8 says
stop here.

**Resolved 2026-10-21.** The owner took the proposal above: count a refusal as a
failure only when the gold item was in the catalog. `eval/lib/gateFit.ts` now
minimizes `unansweredRate = (asks + newsInCatalog) / lines` for both G1 and G2,
with `FAR <= FAR_MAX` unchanged as the constraint and the tie-break order kept.
Plan sections 5.6 and 9B.1 still read "minimize ask_rate"; this file is the
record of the approved deviation, and amending the plan text is the owner's call.

Confirming the change needs a holdout the earlier runs never read, so
`eval/data/splits_lockbox2.json` was added, drawn by
`buildSplits(records, LOCKBOX2_SEED)` in `eval/lib/corpus.ts`. It re-draws D1 and
D2, where 55% and 56% of the old test lines change side, and leaves D3 alone:
D3's four catalogs are atomic source sets, and largest-first is the only order
that does not leave its test side nearly empty or holding the whole 20 000-item
catalog. D3's numbers in the next run are therefore a re-measurement, not fresh
evidence, and `--splits` selects the file.

## Open question 2 — no rule bounds how often the held-out split may be read

Section 9B.3 states "Lockbox evaluated exactly once" and explains why: repeated
adaptive reads of a holdout are the adaptive data analysis problem. That rule is
written for the section 9B optimization loop. Section 8's bake-off has no
equivalent statement, and the bake-off has now run against the same held-out
split twice (`bakeoff_v1`, `bakeoff_v2`).

v2 was run because PR #335 changed the resolver, which is a legitimate reason to
re-measure. But any hypothesis formed by reading v2 needs a fresh split before it
can be confirmed, and `eval/data/**` is protected. This is a gap in section 8
rather than a violation of section 9B.3.
