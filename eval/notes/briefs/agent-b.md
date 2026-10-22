# Task: trigram retrievers Q (two scorers), syllable BM25 retriever B, and the AND control

You are implementing three leaf modules of an on-device Vietnamese
product-matching library. Repository root: `/Users/miphu/Projects/smart-ledger`.

## Read first, in this order

1. `eval/notes/CONTRACT.md` — frozen interfaces, toolchain rules, file ownership.
   Follow it exactly; it overrides your habits.
2. `.plans/stt-optimization-plan.md` — §5.3 (retriever Q), §5.4 (retriever B),
   §2 (why AND-trigram is only a historical control), §7.4 (latency budget).
3. `frontend/mobile/src/lib/resolver/types.ts` — the frozen interface seam.
4. `frontend/mobile/src/lib/resolver/normalizer.ts` — exports `folded`. Use it.

## Deliverable 1 — `frontend/mobile/src/lib/resolver/trigramIndex.ts`

The index and candidate generation, shared by both Q scorers.

- **Documents.** For each indexed string: take `folded(text)`, remove all
  spaces, pad as `"##" + s + "#"`, and take the set of character trigrams.
  `"stink"` → `##s #st sti tin ink nk#`; `"sting"` → `##s #st sti tin ing ng#`.
- **Postings.** `trigram → docId[]` plus `df(trigram)`. One document per
  (productId, string) pair; a product may own several documents (its name, and
  every alias inserted later). A product's score is the best over its documents.
- **IDF.** `idf(t) = ln((N_docs − df + 0.5) / (df + 0.5) + 1)`. Non-negative.
- **Candidate generation — Ukkonen count filter, never an AND.** For query
  trigram set `Tq`, accumulate per-document `shared = |Tq ∩ Td|` by walking the
  posting lists. Keep documents with
  `shared ≥ τ = max(|q|, |d|) − 3 + 1 − 3K`
  where `K` is `qMaxEditDistance` (start value 2) and `|q|`, `|d|` are the
  **unpadded, space-removed** lengths. When `τ ≤ 0`, fall back to every document
  sharing at least one trigram.
  Do **not** intersect posting lists. Do **not** use a bloom filter or an
  approximation: the plan needs the bound to be provably lossless for `k ≤ K`.
- **Freshness.** `addDocument` updates postings and `df` synchronously. IDF is
  recomputed lazily when the document count has moved more than 5%.

## Deliverable 2 — `frontend/mobile/src/lib/resolver/retrieverQ.ts`

One class implementing `Retriever` with a scorer chosen by option, so the
bake-off can pit the two against each other:

- `Q-cos`: IDF-weighted cosine between the query's and the document's trigram
  term-frequency vectors.
- `Q-bm25`: BM25 over trigram "tokens", `k1 = 1.2`, `b = 0.75`, and
  `avg_len` = the mean trigram count of the indexed documents. Compute that
  mean from the catalog — never substitute a corpus default such as 256.

Constructor: `new RetrieverQ(catalog: CatalogItem[], options)` where options
carry `scorer: 'cos' | 'bm25'`, `qMaxEditDistance` (default 2) and `topK`.
Determinism: score descending, then `productId` ascending. Recompute `avg_len`
incrementally as documents are added.

## Deliverable 3 — `frontend/mobile/src/lib/resolver/syllableBm25.ts`

A reusable BM25 scorer over **syllable tokens**, used by retriever B:

- Tokens are whitespace-separated syllables of `folded(text)`. No stemming, no
  stopwords.
- Standard BM25, `k1 = 1.2`, `b = 0.75`, `avg_len` from the catalog.
- An optional unit-word stoplist (`chai`, `lon`, `gói`, `hộp`, …) supplied as
  data, not hard-coded in the scorer's logic. The bake-off evaluates it on and
  off, so it must be a switch, and the list itself must live in a small `.ts`
  data module (see `CONTRACT.md` on why not `.json`).

## Deliverable 4 — `frontend/mobile/src/lib/resolver/retrieverB.ts`

A class implementing `Retriever` on top of `syllableBm25.ts`. It must handle
word order and extra words: `"dâu sting"` and `"sting dâu"` score alike, which
is the whole reason B exists alongside E.

## Deliverable 5 — `frontend/mobile/src/lib/resolver/retrieverAnd.ts`

The historical control, expected to fail on noisy names. Exact AND of query
trigram posting lists: a document must contain **every** query trigram. Implement
it faithfully and cheaply; do not "fix" it. It exists so the bake-off can show
what the rejected design costs.

## Deliverable 6 — tests

`frontend/mobile/tests/resolverQ.test.ts` and
`frontend/mobile/tests/resolverB.test.ts`, run from `frontend/mobile` with
`node --test tests/resolverQ.test.ts tests/resolverB.test.ts`.

Must include, at minimum:

- The plan's hand-computed value, verbatim: `"stink"` → `##s #st sti tin ink nk#`,
  `"sting"` → `##s #st sti tin ing ng#`, `shared = 4`, and with `K = 2`
  `τ = max(5,5) − 2 − 6 < 0`, so the pair is retained.
- The count filter is lossless at `K = 2`: for a set of hand-built pairs whose
  true edit distance is ≤ 2, the correct document is never pruned. This is the
  property the plan relies on, so test it directly rather than trusting the
  formula.
- A single mis-heard character does not remove the correct candidate
  (`"stink"` still retrieves `"sting"`) while the AND control drops it. Assert
  both sides of that contrast.
- `avg_len` comes from the catalog: a catalog of long names and a catalog of
  short names give different `avg_len` and different scores.
- Empty catalog → `[]`; a query sharing no trigram → `[]`.
- `addDocument` makes a new alias retrievable immediately, and IDF drifts
  without throwing.
- Ranking determinism and ascending-`productId` tie-break.
- For B: word order does not change the ranking of `"dâu sting"` vs
  `"sting dâu"`.

## Acceptance gate

Run and paste the real output into your notes:

```
cd frontend/mobile
node --test tests/resolverQ.test.ts tests/resolverB.test.ts
npx tsc --noEmit
```

Both test files must pass with zero failures. `npx tsc --noEmit` must show no
new error. One pre-existing failure exists in `tests/parseOrder.test.ts` — leave
it alone, it is not yours.

## Forbidden

- Editing any file listed as frozen in `CONTRACT.md`.
- Creating files owned by another agent (`editDistance.ts`, `retrieverE.ts`,
  `retrieverP.ts`, anything under `eval/lib/`).
- Adding a dependency, or fetching anything from the network.
- `git commit`, `git push`, `git checkout`, or any state-changing git command.
- Leaving a test failing and describing it as a known limitation. If a test
  cannot pass, say so plainly in your notes with the real error output.

## Notes

Write `eval/notes/agent-b-QB.md` in English with the sections named in
`CONTRACT.md`. `## Handoff` must list the exact exported signatures and option
types, because the harness imports them next.
