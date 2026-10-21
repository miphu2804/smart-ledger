# Task: eval datasets (D2, D3), the corpus builder, and the R0 baseline adapter

You are building the data layer of an offline evaluation harness for a
Vietnamese voice-order resolver. Repository root:
`/Users/miphu/Projects/smart-ledger`.

## Read first, in this order

1. `eval/notes/CONTRACT.md` — frozen interfaces, the eval record schema, the tag
   vocabulary, toolchain rules, file ownership. Follow it exactly.
2. `.plans/stt-optimization-plan.md` — §7.1 (datasets D1–D3 and splits), §8.1
   (the R0 baseline), §5.2 (how E consumes candidates).
3. `frontend/mobile/src/lib/resolver/types.ts` — `CatalogItem`, `QueryLine`,
   `ResolveResult`, `Decision`.
4. `frontend/mobile/src/lib/parseOrder.ts` — the current matcher. Read its
   `ParsedOrder` shape. **Do not modify it.**
5. `eval/data/prior_catalogs.json` and the four `eval/data/prior_*.jsonl` files.

## Background you need

`eval/data/prior_*.jsonl` is a corpus of written Vietnamese order utterances
with gold product ids, extracted from branch
`claude/voice-parser-llm-benchmark-11fe77`. Fields: `id`, `split`, `catalog`,
`category`, `text`, `lines` (`product_id`, `qty`), `expenses`, sometimes `note`.
The catalogs are `tap_hoa` (30 items), `ca_phe` (20), `quan_com` (18), with
numeric ids.

There is **no recorded audio and no real ASR transcript** in this repository, so
the plan's D1 (real audio) cannot be built. D1-text here means: the written
reference transcripts, segmented by the real `parseOrder`, as the clean-text
condition. D2 is the noisy condition. Never present D1-text as real ASR data.

## Deliverable 1 — `eval/lib/synth.ts`

A deterministic Vietnamese ASR confusion simulator. Rules live in a `.ts` data
module, not inline in the logic (see `CONTRACT.md` on why not `.json`):

- tone loss (drop the tone mark), tone swap (swap for another tone),
- initial merges: `x/s`, `ch/tr`, `d/gi/r/v`, `l/n`,
- final merges: `n/ng`, `t/c`,
- syllable split (`"sting"` → `"xi ting"`) and syllable merge,
- loanword Vietnamization (`"sting"` → `"xì ting"`),
- random character edit at probability `p` (plan start value 0.05).

Requirements:

- **Deterministic given a seed.** Use a small seeded PRNG implemented in the
  module. `Math.random` is forbidden: a rerun must reproduce the dataset byte
  for byte.
- Each generated record reports which rules fired, so the harness can break
  results down by error type.
- The rule *weights* are data. Add an exported function that fits the weights
  from an observed (heard, reference) pair list, so a later phase can fit them
  to real ASR output. With no such list available now, keep documented start
  weights and say in your notes that they are unfitted — that is a known
  deviation from the plan's §7.1, not something to paper over.
- Never let a rule produce an empty span. If every rule would, return the input
  unchanged.

## Deliverable 2 — `eval/lib/d3.ts`

Synthetic catalog generator for the stress set:

- `N ∈ {100, 1000, 5000, 20000}` items.
- Build **near-duplicate families**: same brand × flavour × size, e.g.
  `"Sting dâu 330ml"` / `"Sting dâu 500ml"` / `"Sting nhân sâm 330ml"`. A family
  is a set of items that differ only in one slot, so they are each other's hard
  negatives. Set `CatalogItem.family` to the family key.
- Deterministic given a seed.
- Emit the catalogs as `.ts`-loadable data? No — catalogs are data, and
  `eval/data/catalogs.json` is the registry the harness reads. Write a
  generator function that *returns* the catalog; a separate script writes JSON.
- Also emit D3 eval records: one per item, with the item's own name lightly
  noised by `synth.ts`, so confusion-under-crowding is measurable.

## Deliverable 3 — `eval/lib/corpus.ts`

Loaders and dataset builders, all pure functions returning the `CONTRACT.md`
record shape:

- `loadCatalogs()` — read `eval/data/prior_catalogs.json`, stringify ids, and
  return the registry. Also write `eval/data/catalogs.json` with the three real
  catalogs plus the four D3 catalogs, in that registry shape.
- `buildD1Text()` — for every prior record, run `parseOrder(text, catalog)`
  against its catalog and turn each resulting order item into an eval record:
  `line.rawProductSpan` from what `parseOrder` segmented, `goldProductId` from
  the record's `lines`. Records where `parseOrder` finds no item are dropped and
  **counted**; report that count in your notes, because it is a real property of
  the current pipeline. A record whose gold line is absent from the catalog
  becomes `goldProductId: null` with tag `out_of_catalog`.
- `buildD2()` — take the clean product spans (the gold product's `name`, which
  is what D2 is meant to isolate from segmentation) and apply `synth.ts`.
  Tag each record with the rules that fired, plus `loanword` when the
  Vietnamization rule fired.
- `buildSplits(records)` — `{ calibration, test }` at roughly 60/40, grouped so
  that **no product family and no source set appears on both sides**. Use the
  `catalog`/`category` fields as the source-set key. Write
  `eval/data/splits.json`.
- Tagging: apply the closed vocabulary from `CONTRACT.md`. `clean` means no
  rule fired.

## Deliverable 4 — `eval/lib/baselineR0.ts`

An adapter that scores the plan's R0 baseline (the current `parseOrder`
matching) on the same `QueryLine`s every resolver sees, so the bake-off compares
like with like.

- `parseOrder` takes a whole utterance, so reconstruct a minimal one from the
  line: quantity word, unit, then the span. Document that reconstruction
  honestly in the module docstring — it is an approximation and it is the reason
  R0's numbers are indicative rather than exact.
- Map the result onto `Decision`: exactly one item found and no disambiguation →
  `AUTO` with its `productId`; `disambiguations` non-empty → `ASK`; nothing
  found → `NEW`.
- Return the frozen `ResolveResult` shape, filling the `GateFeatures` fields you
  can compute and using `0` / `null` / `'unknown'` for the ones R0 has no notion
  of. Add a `// R0 has no gate features` comment where you do that, so nobody
  later mistakes a zero for a measurement.

## Deliverable 5 — tests

Under `eval/tests/`, run from `frontend/mobile` with
`node --test <path>`. Note the path: the tests live at the repository root, so
run them from the root with `node --test eval/tests/*.test.ts`, and import the
harness modules by relative path with explicit `.ts` extensions.

Must include: determinism (same seed → identical output, twice), the rule
weights being data, D3 family construction producing real near-duplicates,
splits never leaking a family across the boundary, D2 records never having an
empty span, and the R0 mapping hitting all three decisions on hand-built
examples.

## Acceptance gate

Run and paste the real output into your notes:

```
node --test eval/tests/<your files>.test.ts
```

All tests must pass. Then report, in your notes, the actual counts your builders
produce: how many D1-text records, how many were dropped because `parseOrder`
found nothing, how many D2 records, the D3 catalog sizes, and the split sizes.

## Forbidden

- Editing any file listed as frozen in `CONTRACT.md`, including `parseOrder.ts`.
- Creating files owned by another agent (anything in
  `frontend/mobile/src/lib/resolver/` except reading it, and
  `frontend/mobile/tests/resolver*.test.ts`).
- Adding a dependency, or fetching anything from the network.
- `git commit`, `git push`, `git checkout`, or any state-changing git command.
- Reporting a count you did not actually measure. If a builder throws, fix it or
  say so plainly with the real error output.

## Notes

Write `eval/notes/agent-c-data.md` in English with the sections named in
`CONTRACT.md`. `## Handoff` must list the exact exported signatures and the
measured dataset counts, because the harness and the report consume them next.
