# Pre-registration: agent-memory recall search

Written 2026-10-22, before any test-side number was computed.

## Data

- Dev: seeds 1-8, lexicon and query templates half A. Test: seeds 1001-1008, half B (other products, people, phrasings). Each seed makes 6 shops: 15 / 40 / 120 facts, store age 30 or 180 days. 60 scored queries per shop (about 15% need no memory), 200 past turns replayed first so use counts and last-use dates come from the config itself.
- Dense channel: `SimDense` (class-conditional cosines set from ADR-0002's embeddinggemma numbers) in the cloud run; the real run swaps in Cloudflare Workers AI `@cf/google/embeddinggemma-300m` cut to 384 dims, same data, same rule, as a separate result.

## Selection rule (dev only)

1. Feasible: mean memories injected on no-memory queries ≤ 2.0, and stale-only rate (the older of two live versions returned without the newer) ≤ that of plain cosine + 0.02.
2. Among feasible configs, highest Recall@5 on memory queries.
3. Configs within 0.5 points of the best: fewest departures from plain cosine (`Config.parts()`), then higher top-1.

## Test (read once)

Score the winner, main's formula (`BASELINE`), plain cosine, and the best dev config without a floor. Report Recall@5 by form, by size and age, top-1, stale-only, noise, with paired bootstrap 95% CI (2000 resamples over queries) for winner minus baseline and winner minus cosine. No config is changed after test is read.

## Round 2

Written 2026-10-22, before any round-2 number on embeddinggemma; the round-2 grid has only been smoke-tested on `SimDense`.

Round 1 shipped cosine + 0.1 × BM25 share of the best. Open points it left: 0.1 was the lowest weight tried for that config, the floor grid sat above embeddinggemma's cosine scale, and without decay a newer version of a fact relies on reconcile alone.

### Data

- Dev (`dev2`): seeds 2001-2008 with lexicon half A, plus round 1's test shops (seeds 1001-1008, half B), now spent and used for tuning. Test (`test2`): seeds 3001-3008 with a new half C (products, people, phrasings and no-memory questions never seen by any config). Sizes, ages, history and query mix as in round 1.
- Dense channel: Cloudflare Workers AI `@cf/google/embeddinggemma-300m`, 384 dims. `SimDense` runs only check the code.

### Grid (3,675 configs, all with cosine top 20 ∪ BM25 top 20, no importance, no use count)

- BM25 weight 0, 0.025, 0.05, 0.075, 0.1, 0.125, 0.15, 0.2, each normalised by the best match (`max`, shipped) or by the share of the query's IDF mass the memory covers (`cover`, an absolute scale; Bruch et al. 2023, "An Analysis of Fusion Functions for Hybrid Retrieval", found convex combination with a theoretical-bound normalisation beats RRF).
- Recency by creation date, added: none, or w ∈ {0.01, 0.02, 0.04} × exp(-age / τ), τ ∈ {30, 90} days. Creation date, not last use, so it cannot feed back on recalls (round 1's lock-in); it targets the MemCurrent changing-facts case, where reconcile missed a newer version.
- Floor: none; absolute cosine 0.300-0.600 in steps of 0.025; or relative, within 0.05 / 0.10 / 0.15 / 0.20 of the best candidate's cosine. With a floor, a memory covering at least 60% of the query's IDF mass is kept anyway, or never (`lex_cover` 0.6 / 1.01).

### Selection rule (dev2 only)

1. Feasible: stale-only rate ≤ plain cosine's + 0.02.
2. Keep feasible configs within 1 point of the best Recall@5.
3. Among them keep those within 0.1 of the lowest noise (memories injected on queries that need none).
4. Fewest departures from plain cosine (`Config.parts()`), then higher Recall@5, then higher top-1.

### Test (read once)

Score the winner, the shipped config, plain cosine and main's formula on `test2`, with paired bootstrap 95% CI (2,000 resamples over queries). The winner replaces the shipped config only if the lower bound of its Recall@5 minus the shipped config's is at least −0.01; otherwise the shipped config stays. Nothing is changed after the test is read.
