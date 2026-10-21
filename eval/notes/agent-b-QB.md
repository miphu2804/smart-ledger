# Agent B notes — trigram retrievers Q (two scorers), syllable BM25 retriever B, and the AND control

## What I built

Leaf modules of the on-device Vietnamese product-matching library, all under
`frontend/mobile/src/lib/resolver/`:

- `trigramIndex.ts` — the padded-trigram inverted index (`trigram → docId[]` +
  `df`) and the Ukkonen **count filter** candidate generator, shared by Q and
  the AND control. Also the helpers `spaceRemovedFold`, `paddedTrigrams`,
  `trigramsOf`, `countThreshold`.
- `retrieverQ.ts` — `RetrieverQ`, one class implementing `Retriever` with a
  scorer chosen by option (`'cos'` = IDF-weighted cosine, `'bm25'` = Okapi BM25
  over trigram tokens).
- `syllableBm25.ts` — `SyllableBm25`, a reusable BM25 scorer over folded
  syllables with an optional unit-word stoplist.
- `retrieverB.ts` — `RetrieverB`, a `Retriever` over `syllableBm25.ts`.
- `retrieverAnd.ts` — `RetrieverAnd`, the historical exact-AND control.
- `unit_stopwords.vi.ts` — the unit-word stoplist as a plain `.ts` data const.

Tests: `frontend/mobile/tests/resolverQ.test.ts`,
`frontend/mobile/tests/resolverB.test.ts` (35 tests, 13 suites).

## Decisions and why

- **Candidate generation is a count filter, never an AND.** For the query's
  distinct trigram set, I walk each trigram's posting list and accumulate a
  per-document `shared` count, then keep documents with
  `shared ≥ τ = max(|q|,|d|) − 3 + 1 − 3K` (`countThreshold`). Posting lists are
  walked, never intersected. When `τ ≤ 0` every document sharing at least one
  trigram is kept automatically, because accumulated documents already have
  `shared ≥ 1 > 0 ≥ τ` — no special case needed. `|q|`, `|d|` are the
  **unpadded, space-removed** folded lengths.
- **One shared `TrigramIndex`** for both Q scorers and for the AND control, so
  the layout, IDF, and freshness logic live in one place. Q scores candidate
  documents; AND intersects.
- **`avg_len` from the catalog.** `TrigramIndex.avgTrigramCount` is
  `Σ trigramCount / N` where `trigramCount = |d| + 1` (the number of padded
  trigrams). `SyllableBm25.avgLength` is the mean token count. Both are
  maintained incrementally from a running total; neither is a corpus default.
- **IDF is recomputed lazily.** `TrigramIndex.idf` caches a `trigram → idf`
  table and rebuilds it only once the document count has moved more than 5%
  since the last build; `addDocument` updates postings and `df` synchronously.
- **Scoring formulas.** Q-cos: `dot / (‖q‖·‖d‖)` over IDF-weighted trigram tf
  vectors, where each term weight is `tf·idf(t)`. Q-bm25: standard Okapi
  per-term saturation `idf(t)·tf·(k1+1)/(tf + k1·(1−b+b·dl/avg_len))`, summed
  over the query's distinct trigrams, `k1 = 1.2`, `b = 0.75`.
- **AND is implemented faithfully and cheaply.** A document must contain every
  distinct query trigram; I count how many of them each document holds and keep
  the ones whose count equals the query's distinct-trigram count — exactly the
  intersection of the posting lists. Every survivor ties, so the ranking is by
  `productId` ascending. Not "fixed".
- **B tokens are folded syllables**; the unit stoplist is a switch (pass a
  `ReadonlySet` to enable, omit to disable), and the list is data in
  `unit_stopwords.vi.ts`, already in folded form. It is deliberately
  conservative: `bó` is excluded because it folds to `bo`, the same token as
  `bò` (beef).
- **Determinism everywhere:** score descending, then `productId` ascending
  (string compare).
- **`import type` for type-only exports.** Under Node's type stripping a value
  import of a type-only export (`IndexedDoc`) fails at runtime with
  `does not provide an export named 'IndexedDoc'`; type-only exports must be
  imported with `import type`. (Found and fixed during the build.)
- **`topK` option.** `RetrieverQOptions.topK` is stored as the retriever's
  configured default. `retrieve(line, k)` honours the explicit `k` argument of
  the frozen `Retriever` contract ("at most `k` hits"), which is what the
  harness supplies.

## Verified

- `node --test tests/resolverQ.test.ts tests/resolverB.test.ts` → 35 tests, 13
  suites, **0 failures** (full output below).
- `npx tsc --noEmit` → exit 0, no output (no new errors).
- The plan's hand-computed value, asserted verbatim: `trigramsOf('stink')` =
  `##s #st sti tin ink nk#`, `trigramsOf('sting')` = `##s #st sti tin ing ng#`,
  `shared = 4`, `countThreshold(5,5,2) = -3 < 0` → the pair is retained.
- **Count filter is lossless at K = 2** tested directly on 14 hand-built pairs
  whose OSA edit distance is 0, 1, or 2 (substitutions, insertions, deletions,
  two-edit pairs, one transposition): the target document is never pruned. A
  companion test shows the filter is not a no-op (a long document that shares
  too few trigrams is pruned).
- A single mis-heard character: both `Q-cos` and `Q-bm25` still retrieve
  `Sting dâu chai 330ml` from the heard span `stink dau chai 330ml`, while the
  AND control returns `[]` for the same span — both sides asserted.
- `avg_len` comes from the catalog: short-name and long-name catalogs give
  different `avgTrigramCount` (5.5 vs 10.5) / `avgLength` (1.5 vs 2.5) and
  different scores for the same product; a hand-computed case pins
  `avgTrigramCount = |d| + 1` (3 for `ab`) and `avgLength = 1` for a one-syllable
  name.
- Empty catalog → `[]`; query sharing no trigram/token → `[]`; empty span →
  `[]`; `k ≤ 0` → `[]`.
- `addDocument` makes a new alias retrievable immediately; IDF drifts without
  throwing after 40 inserts.
- Ranking determinism and ascending-`productId` tie-break for both Q and B.
- Word order: `dâu sting` and `sting dâu` produce identical rankings for B; an
  extra word does not change the ranking.
- Unit-stoplist switch: `chai` matches with the stoplist off, returns `[]` with
  it on, and a real name still matches with it on.

### Verbatim acceptance output

`cd frontend/mobile && node --test tests/resolverQ.test.ts tests/resolverB.test.ts`

```
TAP version 13
# (node:6555) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/miphu/Projects/smart-ledger/frontend/mobile/tests/resolverB.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/miphu/Projects/smart-ledger/frontend/mobile/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: retriever B: word order and extra words
    # Subtest: "dâu sting" and "sting dâu" rank alike
    ok 1 - "dâu sting" and "sting dâu" rank alike
      ---
      duration_ms: 2.158709
      type: 'test'
      ...
    # Subtest: an extra word does not change the ranking
    ok 2 - an extra word does not change the ranking
      ---
      duration_ms: 0.285208
      type: 'test'
      ...
    1..2
ok 1 - retriever B: word order and extra words
  ---
  duration_ms: 3.221917
  type: 'suite'
  ...
# Subtest: retriever B: unit-word stoplist is a switch
    # Subtest: off: a bare unit word still matches the name that contains it
    ok 1 - off: a bare unit word still matches the name that contains it
      ---
      duration_ms: 0.258875
      type: 'test'
      ...
    # Subtest: on: the same unit word is dropped, so there is no match
    ok 2 - on: the same unit word is dropped, so there is no match
      ---
      duration_ms: 0.304666
      type: 'test'
      ...
    # Subtest: on: dropping units does not stop a real name from matching
    ok 3 - on: dropping units does not stop a real name from matching
      ---
      duration_ms: 0.144833
      type: 'test'
      ...
    1..3
ok 2 - retriever B: unit-word stoplist is a switch
  ---
  duration_ms: 0.920042
  type: 'suite'
  ...
# Subtest: retriever B: avg_len comes from the catalog
    # Subtest: a catalog of long names and one of short names give different avg_len
    ok 1 - a catalog of long names and one of short names give different avg_len
      ---
      duration_ms: 0.764125
      type: 'test'
      ...
    # Subtest: pins a hand-computed avg_len (mean syllable count)
    ok 2 - pins a hand-computed avg_len (mean syllable count)
      ---
      duration_ms: 0.353792
      type: 'test'
      ...
    # Subtest: the same product scores differently under the two avg_len values
    ok 3 - the same product scores differently under the two avg_len values
      ---
      duration_ms: 0.3095
      type: 'test'
      ...
    # Subtest: SyllableBm25 reports the catalog mean directly
    ok 4 - SyllableBm25 reports the catalog mean directly
      ---
      duration_ms: 0.187458
      type: 'test'
      ...
    1..4
ok 3 - retriever B: avg_len comes from the catalog
  ---
  duration_ms: 1.975709
  type: 'suite'
  ...
# Subtest: retriever B: degenerate cases
    # Subtest: empty catalog → []
    ok 1 - empty catalog → []
      ---
      duration_ms: 0.108916
      type: 'test'
      ...
    # Subtest: a query sharing no token → []
    ok 2 - a query sharing no token → []
      ---
      duration_ms: 0.480792
      type: 'test'
      ...
    # Subtest: an empty span → []
    ok 3 - an empty span → []
      ---
      duration_ms: 0.06425
      type: 'test'
      ...
    # Subtest: k ≤ 0 → []
    ok 4 - k ≤ 0 → []
      ---
      duration_ms: 0.047958
      type: 'test'
      ...
    1..4
ok 4 - retriever B: degenerate cases
  ---
  duration_ms: 0.772541
  type: 'suite'
  ...
# Subtest: retriever B: freshness
    # Subtest: addDocument makes a new alias retrievable immediately
    ok 1 - addDocument makes a new alias retrievable immediately
      ---
      duration_ms: 0.113666
      type: 'test'
      ...
    1..1
ok 5 - retriever B: freshness
  ---
  duration_ms: 0.145833
  type: 'suite'
  ...
# Subtest: retriever B: ranking
    # Subtest: breaks ties by ascending productId
    ok 1 - breaks ties by ascending productId
      ---
      duration_ms: 0.210125
      type: 'test'
      ...
    # Subtest: is deterministic across runs
    ok 2 - is deterministic across runs
      ---
      duration_ms: 0.188542
      type: 'test'
      ...
    1..2
ok 6 - retriever B: ranking
  ---
  duration_ms: 0.456458
  type: 'suite'
  ...
# Subtest: trigram index: hand-computed values (plan §5.3)
    # Subtest: pads and splits "stink" and "sting" exactly as the plan does
    ok 1 - pads and splits "stink" and "sting" exactly as the plan does
      ---
      duration_ms: 2.056917
      type: 'test'
      ...
    # Subtest: the pair shares 4 trigrams and is kept because τ = max(5,5) − 2 − 6 < 0
    ok 2 - the pair shares 4 trigrams and is kept because τ = max(5,5) − 2 − 6 < 0
      ---
      duration_ms: 0.198833
      type: 'test'
      ...
    1..2
ok 7 - trigram index: hand-computed values (plan §5.3)
  ---
  duration_ms: 3.074583
  type: 'suite'
  ...
# Subtest: trigram index: Ukkonen count filter
    # Subtest: retains a document whose only difference is one mis-heard character
    ok 1 - retains a document whose only difference is one mis-heard character
      ---
      duration_ms: 0.30275
      type: 'test'
      ...
    # Subtest: is lossless for edit distance ≤ 2, tested directly on hand-built pairs
    ok 2 - is lossless for edit distance ≤ 2, tested directly on hand-built pairs
      ---
      duration_ms: 1.335291
      type: 'test'
      ...
    # Subtest: does prune a document that shares too few trigrams (the filter is not a no-op)
    ok 3 - does prune a document that shares too few trigrams (the filter is not a no-op)
      ---
      duration_ms: 0.101708
      type: 'test'
      ...
    1..3
ok 8 - trigram index: Ukkonen count filter
  ---
  duration_ms: 2.313
  type: 'suite'
  ...
# Subtest: retriever Q: a mis-heard character — Q keeps the candidate, AND drops it
    # Subtest: Q-cos still retrieves the correct product
    ok 1 - Q-cos still retrieves the correct product
      ---
      duration_ms: 0.520583
      type: 'test'
      ...
    # Subtest: Q-bm25 still retrieves the correct product
    ok 2 - Q-bm25 still retrieves the correct product
      ---
      duration_ms: 0.469042
      type: 'test'
      ...
    # Subtest: the historical AND control drops it entirely
    ok 3 - the historical AND control drops it entirely
      ---
      duration_ms: 0.313708
      type: 'test'
      ...
    1..3
ok 9 - retriever Q: a mis-heard character — Q keeps the candidate, AND drops it
  ---
  duration_ms: 1.502375
  type: 'suite'
  ...
# Subtest: retriever Q: avg_len comes from the catalog
    # Subtest: a catalog of long names and one of short names give different avg_trigram_count
    ok 1 - a catalog of long names and one of short names give different avg_trigram_count
      ---
      duration_ms: 0.239417
      type: 'test'
      ...
    # Subtest: pins a hand-computed avg_trigram_count (mean trigram count = |d| + 1)
    ok 2 - pins a hand-computed avg_trigram_count (mean trigram count = |d| + 1)
      ---
      duration_ms: 0.186375
      type: 'test'
      ...
    # Subtest: the same product scores differently under the two avg_len values
    ok 3 - the same product scores differently under the two avg_len values
      ---
      duration_ms: 0.236584
      type: 'test'
      ...
    1..3
ok 10 - retriever Q: avg_len comes from the catalog
  ---
  duration_ms: 0.74075
  type: 'suite'
  ...
# Subtest: retriever Q: degenerate cases
    # Subtest: empty catalog → []
    ok 1 - empty catalog → []
      ---
      duration_ms: 0.128459
      type: 'test'
      ...
    # Subtest: a query sharing no trigram → []
    ok 2 - a query sharing no trigram → []
      ---
      duration_ms: 0.448
      type: 'test'
      ...
    # Subtest: an empty span → []
    ok 3 - an empty span → []
      ---
      duration_ms: 0.474125
      type: 'test'
      ...
    # Subtest: k ≤ 0 → []
    ok 4 - k ≤ 0 → []
      ---
      duration_ms: 0.099667
      type: 'test'
      ...
    1..4
ok 11 - retriever Q: degenerate cases
  ---
  duration_ms: 1.232083
  type: 'suite'
  ...
# Subtest: retriever Q: freshness
    # Subtest: addDocument makes a new alias retrievable immediately
    ok 1 - addDocument makes a new alias retrievable immediately
      ---
      duration_ms: 0.154583
      type: 'test'
      ...
    # Subtest: IDF drifts without throwing after many inserts
    ok 2 - IDF drifts without throwing after many inserts
      ---
      duration_ms: 0.553959
      type: 'test'
      ...
    1..2
ok 12 - retriever Q: freshness
  ---
  duration_ms: 0.756292
  type: 'suite'
  ...
# Subtest: retriever Q: ranking
    # Subtest: breaks ties by ascending productId
    ok 1 - breaks ties by ascending productId
      ---
      duration_ms: 0.157042
      type: 'test'
      ...
    # Subtest: is deterministic across runs
    ok 2 - is deterministic across runs
      ---
      duration_ms: 0.123666
      type: 'test'
      ...
    1..2
ok 13 - retriever Q: ranking
  ---
  duration_ms: 0.319709
  type: 'suite'
  ...
1..13
# tests 35
# suites 13
# pass 35
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 183.868667
```

The `[MODULE_TYPELESS_PACKAGE_JSON]` block is Node's performance notice that
`package.json` has no `"type": "module"`; it appears for every `.ts` test in this
repo and is not a failure.

`cd frontend/mobile && npx tsc --noEmit`

```
(no output; exit code 0)
```

## Unverified / assumed

- **The τ bound for padded trigram sets is implemented to the plan, not
  proved here.** I implemented the formula exactly (`max(|q|,|d|) − 3 + 1 − 3K`
  on unpadded, space-removed lengths, trigrams taken from the padded string) and
  tested losslessness empirically at K = 2 on 14 hand-built pairs. I did not
  prove analytically that the standard q-gram lemma's constant carries over to
  the *set* (not multiset) intersection of *padded* trigrams; the plan asserts it
  does, and my test set did not falsify it. The lemma's constant matches
  `max − q + 1 − kq` with q = 3.
- **"True edit distance" interpreted as OSA.** The repo's `damerauLevenshtein`
  is the optimal-string-alignment variant. My lossless pairs were chosen so OSA
  equals Levenshtein (no pair relies on a transposition to reach distance ≤ 2
  except the single transposition pair, whose OSA distance is 1). The Ukkonen
  bound is classically stated for Levenshtein distance.
- **`topK` semantics assumed.** I treat `retrieve`'s explicit `k` as
  authoritative (frozen contract) and `topK` as the configured default; if the
  harness expects `topK` to cap output below `k`, that is not implemented.
- **Unit-stoplist contents are a plausible starting set**, not validated
  against the corpora. The bake-off decides on/off; the list may be tuned.
- **BM25 omits the query-term-frequency factor** (`(qtf·(k1+1))/(qtf+k1)`),
  using the plain per-term saturation summed over distinct query terms. Standard
  and deterministic, but a deliberate simplification.
- **No latency measurement.** The plan's §7.4 budgets were not measured; only
  correctness and the absence of type errors are verified.
- **`eval/data/catalogs.json` does not exist yet** (Agent C owns it); tests use
  inline catalogs with string ids.

## Handoff

Exact exported signatures and option types, for the harness that imports them
next.

`trigramIndex.ts`
```ts
export const TRIGRAM_SIZE = 3;
export function spaceRemovedFold(text: string): string;
export function paddedTrigrams(s: string): string[];
export function trigramsOf(text: string): string[];
export function countThreshold(queryLength: number, docLength: number, maxEditDistance: number): number;
export interface IndexedDoc {
  productId: string;
  length: number;
  tf: Map<string, number>;
  trigramCount: number;
}
export class TrigramIndex {
  addDocument(text: string, productId: string): number;
  readonly size: number;
  readonly avgTrigramCount: number;
  doc(docId: number): IndexedDoc;
  posting(trigram: string): readonly number[] | undefined;
  idf(trigram: string): number;
  candidates(queryTrigrams: Iterable<string>, queryLength: number, maxEditDistance: number): number[];
}
```

`retrieverQ.ts`
```ts
export type QScorer = 'cos' | 'bm25';
export interface RetrieverQOptions {
  scorer: QScorer;
  qMaxEditDistance?: number; // default 2
  topK?: number;             // default 5
}
export class RetrieverQ implements Retriever {
  readonly name: 'Q-cos' | 'Q-bm25';
  readonly topK: number;
  readonly avgTrigramCount: number;
  constructor(catalog: CatalogItem[], options: RetrieverQOptions);
  retrieve(line: QueryLine, k: number): RetrievalHit[];
  addDocument(text: string, productId: string): void;
}
```

`syllableBm25.ts`
```ts
export interface SyllableBm25Options {
  k1?: number;                       // default 1.2
  b?: number;                        // default 0.75
  stopwords?: ReadonlySet<string>;   // absent/empty = keep all
}
export class SyllableBm25 {
  constructor(options?: SyllableBm25Options);
  tokenize(text: string): string[];
  addDocument(text: string, productId: string): number;
  readonly documentCount: number;
  readonly avgLength: number;
  idf(term: string): number;
  search(text: string, k: number): RetrievalHit[];
}
```

`retrieverB.ts`
```ts
export interface RetrieverBOptions {
  useUnitStoplist?: boolean; // default off
  k1?: number;               // default 1.2
  b?: number;                // default 0.75
}
export class RetrieverB implements Retriever {
  readonly name = 'B';
  readonly avgLength: number;
  constructor(catalog: CatalogItem[], options?: RetrieverBOptions);
  retrieve(line: QueryLine, k: number): RetrievalHit[];
  addDocument(text: string, productId: string): void;
}
```

`retrieverAnd.ts`
```ts
export class RetrieverAnd implements Retriever {
  readonly name = 'AND';
  constructor(catalog: CatalogItem[]);
  retrieve(line: QueryLine, k: number): RetrievalHit[];
  addDocument(text: string, productId: string): void;
}
```

`unit_stopwords.vi.ts`
```ts
export const UNIT_STOPWORDS: readonly string[];
```

`RetrieverName` values produced: `'Q-cos'`, `'Q-bm25'`, `'B'`, `'AND'`. All four
classes implement the frozen `Retriever` interface (`retrieve` and
`addDocument`), are deterministic, and never throw on an empty catalog, an empty
span, or a span with no match.
