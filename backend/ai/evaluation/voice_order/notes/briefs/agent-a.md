# Task: resolver retrievers E (edit distance) and P (phonetic key)

You are implementing two leaf modules of an on-device Vietnamese product-matching
library. Repository root: `/Users/miphu/Projects/smart-ledger`.

## Read first, in this order

1. `backend/ai/evaluation/voice_order/notes/CONTRACT.md` — frozen interfaces, toolchain rules, file ownership.
   Follow it exactly; it overrides your habits.
2. `.plans/stt-optimization-plan.md` — §5.1 (views), §5.2 (retriever E),
   §5.5 (retriever P), §7.4 (the latency budget E must respect).
3. `frontend/mobile/src/lib/resolver/types.ts` — the frozen interface seam.
4. `frontend/mobile/src/lib/resolver/normalizer.ts` — exports `toned`, `folded`,
   `phon`. Use them; do not reimplement normalization.

## Deliverable 1 — `frontend/mobile/src/lib/resolver/editDistance.ts`

Pure functions, no class:

- `damerauLevenshtein(a: string, b: string, maxDistance?: number): number`
  Optimal string alignment is acceptable; say which you implemented in the
  module docstring. When `maxDistance` is given, return a value greater than
  `maxDistance` as soon as the bound is exceeded, so the caller can skip the
  candidate. The early exit must never change the result when the true distance
  is within `maxDistance`.
- `similarity(a: string, b: string, maxDistance?: number): number`
  `1 − DL(a, b) / max(|a|, |b|)`, clamped to `[0, 1]`. Both empty → `1`.
  One empty and the other not → `0`.

## Deliverable 2 — `frontend/mobile/src/lib/resolver/retrieverE.ts`

A class implementing the frozen `Retriever` interface.

- Constructor: `new RetrieverE(catalog: CatalogItem[], options?: RetrieverEOptions)`.
  `RetrieverEOptions` carries `eBruteMax` (default 5000, per the plan's start
  value) and an optional `candidates?: (line: QueryLine, k: number) => string[]`.
- Scoring: for each candidate product, compute `similarity` on **two** views of
  the query span and take the max —
  (i) `folded(span)` with spaces kept,
  (ii) `folded(span)` with all spaces removed.
  The same two views are precomputed for each indexed string, so
  "xi ting" ↔ "sting" is reachable.
- Candidate set: when the catalog has at most `eBruteMax` items, score every
  item. Above it, use `options.candidates` when supplied; when it is absent,
  fall back to brute force and note the cost in your notes. This injection point
  is how the harness wires Q in front of E — do not import Q.
- `addDocument(text, productId)` indexes an extra string for that product
  (catalog insert or alias upsert), including the space-removed view.
- Determinism: score descending, then `productId` ascending.

## Deliverable 3 — `frontend/mobile/src/lib/resolver/retrieverP.ts`

A class implementing `Retriever`, scoring with the same `similarity` but on the
`phon` view. Same constructor shape, same determinism rule, same `addDocument`.
Keep it a separate file and a separate class from E: the bake-off enables and
disables it independently.

## Deliverable 4 — tests

`frontend/mobile/tests/resolverE.test.ts` and
`frontend/mobile/tests/resolverP.test.ts`, run from `frontend/mobile` with
`node --test tests/resolverE.test.ts tests/resolverP.test.ts`.

Must include, at minimum:

- The plan's hand-computed value, verbatim:
  `"xiting"` vs `"sting"` → DL `2`, similarity `0.667` (to three decimals).
- The space-removal path: `"xi ting"` matches `"sting"` better than
  `"xi ting"` matches a different product, and the space-removed view is what
  makes that true.
- `similarity` boundary cases: both empty, one empty, identical strings.
- `retrieve` on an empty catalog returns `[]`; a span with no plausible match
  still returns hits, best-first, without throwing.
- `addDocument` makes a newly inserted alias retrievable immediately.
- Ranking determinism: the same input twice gives the identical id sequence,
  and a score tie breaks by ascending `productId`.
- For P: `phon` collapses the confused pairs, so a span written `"xì ting"`
  ranks the product `"Sì ting"` first.

## Acceptance gate

Run and paste the real output into your notes:

```
cd frontend/mobile
node --test tests/resolverE.test.ts tests/resolverP.test.ts
npx tsc --noEmit
```

Both test files must pass with zero failures. `npx tsc --noEmit` must show no
new error. One pre-existing failure exists in `tests/parseOrder.test.ts` — leave
it alone, it is not yours.

## Forbidden

- Editing any file listed as frozen in `CONTRACT.md`.
- Creating files owned by another agent (`trigramIndex.ts`, `retrieverQ.ts`,
  `syllableBm25.ts`, `retrieverB.ts`, `retrieverAnd.ts`, anything under
  `backend/ai/evaluation/voice_order/lib/`).
- Adding a dependency, or fetching anything from the network.
- `git commit`, `git push`, `git checkout`, or any state-changing git command.
- Leaving a test failing and describing it as a known limitation. If a test
  cannot pass, say so plainly in your notes with the real error output.

## Notes

Write `backend/ai/evaluation/voice_order/notes/agent-a-E.md` in English with the sections named in
`CONTRACT.md`. `## Handoff` must list the exact exported signatures and the
constructor option types, because the harness imports them next.
