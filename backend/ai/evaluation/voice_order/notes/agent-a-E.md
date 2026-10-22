# Agent A notes — edit distance, retriever E, retriever P

## What I built

Four new files, no others touched:

- `frontend/mobile/src/lib/resolver/editDistance.ts`
  - `damerauLevenshtein(a, b, maxDistance?)` — **optimal string alignment (OSA)**
    Damerau-Levenshtein, banded DP. With a bound it returns `maxDistance + 1`
    as a sentinel once the bound is exceeded.
  - `similarity(a, b, maxDistance?)` — `1 − DL / max(|a|,|b|)` clamped to `[0,1]`.
- `frontend/mobile/src/lib/resolver/retrieverE.ts` — `class RetrieverE implements Retriever`, `name = 'E'`.
- `frontend/mobile/src/lib/resolver/retrieverP.ts` — `class RetrieverP implements Retriever`, `name = 'P'`.
- `frontend/mobile/tests/resolverE.test.ts`, `frontend/mobile/tests/resolverP.test.ts`.

No class for `editDistance.ts` (pure functions only). E and P are separate
files and separate classes as the bake-off enables them independently.

## Decisions and why

- **OSA, not the "unrestricted" Damerau-Levenshtein.** The plan only needs a
  per-candidate similarity score, not a metric space, so the cheaper OSA
  recurrence (which forbids editing a substring more than once) is sufficient
  and stated in the module docstring as required.
- **Banded DP + row-minimum early exit.** With a bound the DP only fills cells
  with `|i − j| ≤ maxDistance` and abandons a row as soon as its minimum
  exceeds the bound. Both are safe: any alignment of cost ≤ `maxDistance` keeps
  the cursor within `maxDistance` of the diagonal, and DP values are
  non-decreasing row to row. When the true distance is within the bound the
  returned value is exact (pinned by a test).
- **Two views for E, one for P.** E scores `folded(span)` with spaces and
  `folded(span)` with spaces removed, taking the max; the same two views are
  precomputed per indexed string. That is what makes "xi ting" ↔ "sting"
  reachable. P scores a single `phon` view (the brief specifies "the same
  similarity but on the phon view" and does not ask for a space-removed view).
- **Per-product best across documents.** A product's score is the max over all
  its indexed strings (catalog name plus every `addDocument`), so an alias
  upsert is immediately retrievable.
- **Candidate injection.** `RetrieverE`/`RetrieverP` score the whole catalog at
  or below `eBruteMax`/`pBruteMax`; above it they call `options.candidates`
  (requesting 50 ids) and fall back to brute force when no provider is given.
  No import of Q — the harness wires it in. The fallback cost is noted below.
- **Determinism.** Every result is sorted by `score` descending, then
  `productId` ascending (string compare). Ties therefore resolve identically on
  every run.

## Verified

- `node --test tests/resolverE.test.ts tests/resolverP.test.ts` → **24 tests,
  24 pass, 0 fail** (run from `frontend/mobile`).
- `npx tsc --noEmit` from `frontend/mobile` → **no output, exit code 0**.
- Plan hand value pinned verbatim: `damerauLevenshtein("xiting","sting") === 2`,
  `similarity("xiting","sting").toFixed(3) === "0.667"`.
- Space-removal path pinned: on the spaced view `similarity(folded("xi ting"),
  folded("Sting")) === 0.571` and `similarity(folded("xi ting"), folded("Xì lanh"))
  === 0.571` (a tie); on the space-removed view `0.667` vs `0.500`, which is what
  ranks `sting` first.
- P phonetic path pinned: `phon("xì ting") === phon("sì ting")`, and a catalog
  `Sì ting` / `Sting` ranks `Sì ting` first with score `1` for the span `"xì ting"`.
- Boundary cases: both empty → 1, one empty → 0, identical → 1; empty catalog →
  `[]`; a no-match span returns hits best-first without throwing; `addDocument`
  makes a new alias retrievable at score `1`; two identical names tie-break to
  `["a","b"]`.
- The `MODULE_TYPELESS_PACKAGE_JSON` lines in the output are Node's standard
  warning about `package.json` having no `"type": "module"`; they are not test
  failures and predate this work (any `.ts` test emits them).

### Verbatim gate output

```
$ cd frontend/mobile
$ node --test tests/resolverE.test.ts tests/resolverP.test.ts
TAP version 13
# (node:3580) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/miphu/Projects/smart-ledger/frontend/mobile/tests/resolverE.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/miphu/Projects/smart-ledger/frontend/mobile/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: editDistance: damerauLevenshtein
    # Subtest: pins the plan hand-computed value: "xiting" vs "sting" is DL 2
    ok 1 - pins the plan hand-computed value: "xiting" vs "sting" is DL 2
    # Subtest: counts a transposition of adjacent characters as one edit (OSA)
    ok 2 - counts a transposition of adjacent characters as one edit (OSA)
    # Subtest: handles the trivial cases
    ok 3 - handles the trivial cases
    # Subtest: the maxDistance early exit never changes a result within the bound
    ok 4 - the maxDistance early exit never changes a result within the bound
    1..4
ok 1 - editDistance: damerauLevenshtein
# Subtest: editDistance: similarity
    # Subtest: pins the plan hand-computed value: similarity("xiting","sting") = 0.667
    ok 1 - pins the plan hand-computed value: similarity("xiting","sting") = 0.667
    # Subtest: both empty -> 1
    ok 2 - both empty -> 1
    # Subtest: one empty, the other not -> 0
    ok 3 - one empty, the other not -> 0
    # Subtest: identical strings -> 1
    ok 4 - identical strings -> 1
    # Subtest: is clamped to [0, 1]
    ok 5 - is clamped to [0, 1]
    1..5
ok 2 - editDistance: similarity
# Subtest: RetrieverE
    # Subtest: scores the plan hand-computed value through retrieve
    ok 1 - scores the plan hand-computed value through retrieve
    # Subtest: the space-removed view is what lets "xi ting" match "sting"
    ok 2 - the space-removed view is what lets "xi ting" match "sting"
    # Subtest: returns [] on an empty catalog
    ok 3 - returns [] on an empty catalog
    # Subtest: a span with no plausible match still returns hits, best-first, without throwing
    ok 4 - a span with no plausible match still returns hits, best-first, without throwing
    # Subtest: addDocument makes a newly inserted alias retrievable immediately
    ok 5 - addDocument makes a newly inserted alias retrievable immediately
    # Subtest: is deterministic and breaks score ties by ascending productId
    ok 6 - is deterministic and breaks score ties by ascending productId
    # Subtest: uses the injected candidate provider above eBruteMax, else brute-forces
    ok 7 - uses the injected candidate provider above eBruteMax, else brute-forces
    1..7
ok 3 - RetrieverE
# (node:3581) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/miphu/Projects/smart-ledger/frontend/mobile/tests/resolverP.test.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /Users/miphu/Projects/smart-ledger/frontend/mobile/package.json.
# (Use `node --trace-warnings ...` to show where the warning was created)
# Subtest: RetrieverP: phonetic key
    # Subtest: phon collapses the confused pair so "xì ting" and "sì ting" are identical
    ok 1 - phon collapses the confused pair so "xì ting" and "sì ting" are identical
    # Subtest: ranks the product "Sì ting" first for the span "xì ting"
    ok 2 - ranks the product "Sì ting" first for the span "xì ting"
    # Subtest: scores the same similarity function as E, on the phon view
    ok 3 - scores the same similarity function as E, on the phon view
    1..3
ok 4 - RetrieverP: phonetic key
# Subtest: RetrieverP: boundary and degenerate cases
    # Subtest: returns [] on an empty catalog
    ok 1 - returns [] on an empty catalog
    # Subtest: a span with no plausible match still returns hits, best-first, without throwing
    ok 2 - a span with no plausible match still returns hits, best-first, without throwing
    # Subtest: addDocument makes a newly inserted alias retrievable immediately
    ok 3 - addDocument makes a newly inserted alias retrievable immediately
    # Subtest: is deterministic and breaks score ties by ascending productId
    ok 4 - is deterministic and breaks score ties by ascending productId
    # Subtest: uses the injected candidate provider above pBruteMax, else brute-forces
    ok 5 - uses the injected candidate provider above pBruteMax, else brute-forces
    1..5
ok 5 - RetrieverP: boundary and degenerate cases
1..5
# tests 24
# suites 5
# pass 24
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 173.895666

$ npx tsc --noEmit
(no output, exit code 0)
```

## Unverified / assumed

- **Brute-force fallback cost.** Above `eBruteMax` with no `candidates`
  provider, E/P score the whole catalog. At N = 5000, L ≈ 15, the plan
  (section 5.2) estimates ~70–340 ms on a low-end device, which would blow the
  section 7.4 budget (≤ 15 ms p95). The fallback exists only so the class never
  throws; the harness is expected to inject Q. **Not measured here** — the
  latency budget is not exercised by these unit tests.
- **`eBruteMax` default = 5000**, per the brief ("the plan's start value") and
  `ResolverConfig.eBruteMax` in `types.ts`. The plan's section 5.2 prose says
  start 500; the brief and the frozen config type say 5000. I followed the
  brief/type.
- **P option name `pBruteMax`.** The brief says "same constructor shape" but
  does not name P's fields; I mirrored E with `pBruteMax` (default 5000) and the
  same optional `candidates`. The harness should use this exact name.
- **E candidate request count = 50** (`E_CANDIDATES`), the plan's `E_CANDIDATES`
  start value; P uses `P_CANDIDATES = 50` by symmetry. Not configurable via
  options (the brief only lists `eBruteMax`/`candidates`).
- **No perf/benchmark test.** The banded DP and early exit are correctness-
  tested, not timed.
- The pre-existing failure in `tests/parseOrder.test.ts` was not touched.

## Handoff

Exact exported signatures the harness imports next.

`frontend/mobile/src/lib/resolver/editDistance.ts`

```ts
export function damerauLevenshtein(a: string, b: string, maxDistance?: number): number;
export function similarity(a: string, b: string, maxDistance?: number): number;
```

`frontend/mobile/src/lib/resolver/retrieverE.ts`

```ts
export interface RetrieverEOptions {
  eBruteMax?: number;                                       // default 5000
  candidates?: (line: QueryLine, k: number) => string[];    // ids to score above eBruteMax
}

export class RetrieverE implements Retriever {
  readonly name: 'E';
  constructor(catalog: CatalogItem[], options?: RetrieverEOptions);
  retrieve(line: QueryLine, k: number): RetrievalHit[];
  addDocument(text: string, productId: string): void;
}
```

`frontend/mobile/src/lib/resolver/retrieverP.ts`

```ts
export interface RetrieverPOptions {
  pBruteMax?: number;                                       // default 5000
  candidates?: (line: QueryLine, k: number) => string[];    // ids to score above pBruteMax
}

export class RetrieverP implements Retriever {
  readonly name: 'P';
  constructor(catalog: CatalogItem[], options?: RetrieverPOptions);
  retrieve(line: QueryLine, k: number): RetrievalHit[];
  addDocument(text: string, productId: string): void;
}
```

Both classes are constructed once from `(catalog, options?)` per the frozen
`Retriever` contract, return at most `k` hits best-first, and never throw on an
empty catalog, an empty span, or a span with no match. Relative imports carry
explicit `.ts` extensions.
