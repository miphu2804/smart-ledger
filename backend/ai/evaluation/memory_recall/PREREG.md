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
