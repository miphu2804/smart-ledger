# Coordinator notes — wiring the three agent outputs into one harness

This file records what none of the three agent notes can: the seam. Each agent
built and verified its own part in isolation; the defects below only appeared
when the parts were joined, and every one of them would have produced a
plausible-looking number rather than a crash.

Read `CONTRACT.md` first for the frozen interfaces, then the agent note that
owns the area you are touching: `agent-a-E.md` (edit distance, E, P),
`agent-b-QB.md` (trigram index, Q, B, AND), `agent-c-data.md` (datasets, R0).

## Layout as built

| Path | Owns |
|---|---|
| `frontend/mobile/src/lib/resolver/` | the resolver library: normalizer, retrievers, fusion, gate, alias table, `buildResolver` |
| `eval/lib/` | stats, metrics, gate fitting, corpus, D3 generation, synthesis, R0 baseline |
| `eval/runner/` | `harness.ts` (resolve/tune/evaluate), `bakeoff.ts` (matrix + selection rule), `report.ts` (rendering), `run.ts` (CLI) |
| `eval/data/` | generated datasets and `counts.json`; regenerate with `writeDatasets()` |
| `eval/reports/` | one `.md` and one `.json` per run |

## Integration defects found and fixed

### 1. E and P scored nothing above `eBruteMax` in any config without Q

`buildRetrievers` injected a candidate provider into `RetrieverE` and
`RetrieverP` unconditionally. The provider looked up a Q retriever and returned
`[]` when there was none. `RetrieverE.candidateIds` only falls back to brute
force when `candidates` is `undefined`, so an E-only config above `eBruteMax`
scored zero candidates and reported that as "no match".

The damage was invisible in the headline number: it made every E-only row of the
bake-off look like a weak retriever when it had in fact searched nothing. Fixed
by deciding from the config whether Q exists at all and passing `undefined` when
it does not. Guarded by two tests in `frontend/mobile/tests/resolverIndex.test.ts`.

The agent that first reported this described it as `RetrieverE` refusing to
brute-force above the cap. That is not what the code does — `candidateIds`
returns `this.ids` when there is no provider — and the real cause was in the
wiring, not the retriever. Worth recording because the wrong diagnosis would
have led to raising `eBruteMax` and leaving the bug in place.

### 2. `loadCatalogs()` returned only the three real catalogs

`run.ts` called `loadCatalogs()`, which returned `readPriorCatalogs()` alone.
`resolveAll` then did `catalogs[catalogId] ?? []`, so all four D3 catalogs were
empty and all 26 100 D3 lines resolved to zero candidates under every retriever,
including brute force. Fixed by making it return `buildCatalogRegistry()`.

Symptom as first measured, on a 40-line run: D1 recall@3 100%, D2 100%, D3 0%
with `ranked: []` on all 35 sampled D3 lines. The giveaway was that a
brute-force retriever also found nothing.

### 3. Sampling pooled every dataset together

`--limit` sampled every n-th record from the pooled split, and D3 is 26 100 of
28 202 records. A 40-line sample was therefore 35 D3 lines, and the headline
number described D3 while looking like it described the corpus. Replaced with
`stratifiedSample`, which takes up to `limit` records per dataset. After the fix
the same 40-line run reports R0 57.1%, R1 65.2%, R3 96.4% recall@3, which is the
discrimination the datasets were built to produce.

### 4. The gate tuner learned to answer NEW to everything

`tuneGateRules` and `tuneTheta` both minimized the ask rate subject to
`FAR <= farMax`. Neither counted a NEW decision as a cost, so the search had a
free escape: raise the score floor above every candidate's score and every line
becomes NEW. That gate asks nothing, auto-applies nothing, and writes no wrong
autos, so it satisfied the budget perfectly and scored best on the objective.

Measured on the first bake-off run: R4, R5, R5w and R6 all reported FAR 0.0%
with 0 autos and a 0.0% ask rate, and the selection rule then picked R4 — a
configuration that resolved nothing at all. The tell was `NEW P` 4.2%: almost
none of those NEW decisions were actually out-of-catalog.

Fixed by making the objective the **non-auto rate**, `(asks + news) / lines`.
An ask and a NEW are both failures to answer, so a gate that dodges into NEW now
scores 1.0, the worst possible value, instead of 0.0. The constraint is
unchanged: maximize silent answers subject to the false-auto budget. Guarded by
`does not dodge into NEW when auto-applying is achievable` in
`eval/tests/gateFit.test.ts`, which fails against the old objective.

### 5. The G1 threshold grid assumed one score scale

Even after the NEW fix, R4, R5, R5w and R6 still reported 0 autos. The cause was
the search grid, not the objective: `s1` for `max` fusion is a raw similarity in
0–1, while `s1` for `rrf`/`wrrf` is `1/(rrfK + rank)` ≈ 0.016. The grid's lowest
auto threshold was 0.3, so no RRF score could ever clear it. With no achievable
auto, the tuner fell back to its conservative rule set — which put the score
floor at the top of the grid and sent every line to NEW.

Fixed by deriving the candidate thresholds from the calibration split's own
feature distribution (`quantiles` in `eval/lib/gateFit.ts`) instead of a fixed
0–1 ladder. The same fix applies to G2's score-floor search in
`eval/runner/harness.ts`. Nothing about a fusion's scale is special-cased; the
search simply considers the values the config produces.

The fallback also flipped. It used to fall back to "NEW everything", which is the
one rule set that reports zero false autos and zero asks while answering
nothing. It now falls back to asking about everything.

A tie-break was added at the same time: when coverage and mistakes are equal,
prefer the ask over the NEW. An ask still offers candidates; a NEW refuses
without offering anything.

## The D3 scale finding

`eBruteMax` is 500 for every row, the plan's start value. Above it, E and P score
only the ids Q hands them, so an E-only row scans the whole catalog.

Measured on an Apple M4 Pro: R5 (E + Q + B, so E is pruned) completed a full
26 100-line D3 pass in 93.8 s with recall@3 93.1% and FAR 0.0%. R1 (E alone, so
every query scans 20 000 items) was stopped after 12 minutes without finishing.

This is the plan's own argument for Q-before-E, measured rather than assumed, and
it is why the bake-off caps the lines taken from each dataset. The catalogs are
never sampled: every D3 line still searches a 100-, 1 000-, 5 000- or
20 000-item catalog, which is the axis D3 exists to stress.

## What the numbers can and cannot support

- **D1 is a ceiling, not a result.** An in-catalog D1 span is the catalog name
  `parseOrder` matched, so every resolver scores top1 1.000 and FAR 0 on it. It
  validates the pipeline and catches regressions. D2 carries the discrimination.
- **No STT axis was measured.** There is no recorded audio in this repository,
  so plan P5 (greedy vs beam vs hotwords, silence pad, overlapped processing) was
  not run at all, and the D2 confusion weights are start values rather than
  weights fitted to real ASR output.
- **No device latency was measured.** The plan's budgets are stated for a
  low-end Android device. The report shows Node wall-clock on a developer
  machine and says so; no row was excluded for latency.
- **The selection rule ran as frozen.** `eval/configs/selection_rule.json` was
  written before any number existed. Its step 1 cannot be applied here for the
  reason above, which is recorded as a deviation rather than silently skipped.

## Environment note

`eval/package.json` sets `"type": "module"`. Node was already treating these
files as ESM by syntax detection, which prints a `MODULE_TYPELESS_PACKAGE_JSON`
warning on every run and leaves `tsc` free to compile them as CommonJS and
reject `import.meta`. The file makes both agree. It declares no dependencies: the
harness runs on Node's type stripping, by design.
