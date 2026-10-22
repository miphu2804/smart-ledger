# Resolver auto-research — autoresearch_v1

Generated 2026-10-21T19:21:36.566Z by `eval/search/autoresearch.ts` on Node v22.22.0, linux 6.18.44-fc-v139, Intel(R) Xeon(R) Processor @ 2.80GHz.
Protocol: `eval/configs/autoresearch_protocol.json` v1, frozen 2026-10-21. FAR budget 1.0%, LTT delta 0.05.

## Winner

**E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.50**, gate sAuto 0.7200, mMin 0.1217, agreeMin 1, sFloor 0.7200.

Chosen from 573 configs (540 on the grid, the rest by coordinate ascent) by the protocol's objective on the dev test side. Re-run through `buildResolver`: dev-test correct AUTO 39.8% against 40.0% in the search.

## Lockbox (scored once)

Fresh D2 noise (seed 20261022), fresh D3 catalogs (seed 20261022) and out-of-catalog lines (seed 20261022, 10.0% of each catalog removed). Gate thresholds are the dev-calibration ones, unchanged. D1 is not here: it cannot be regenerated.

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | ms/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Winner | 2100 | 31.0% | 31.3% | 0.29% (6) | 0.56% | 44.6% | 24.1% | 14.4% | 86.9% | 92.4% | 0.9% | 24.92 |
| R4 (bakeoff_v3 pick, its own tuner) | 2100 | 0.0% | 0.0% | 0.00% (0) | 0.14% | 0.0% | 100.0% | 66.7% | 77.4% | 87.8% | 0.0% | 5.84 |

By dataset:

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Winner, d2 | 700 | 75.9% | 75.9% | 0.00% (0) | 0.43% | 1.9% | 22.3% | 22.3% | 99.6% | 100.0% | 0.0% |
| Winner, d3 | 700 | 17.3% | 17.3% | 0.00% (0) | 0.43% | 61.7% | 21.0% | 21.0% | 74.1% | 84.7% | 0.0% |
| Winner, ooc | 700 | 0.0% | 0.9% | 0.86% (6) | 1.68% | 70.1% | 29.0% | 0.0% | 0.0% | 0.0% | 0.9% |
| R4, d2 | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 100.0% | 97.9% | 99.6% | 0.0% |
| R4, d3 | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 100.0% | 57.0% | 76.0% | 0.0% |
| R4, ooc | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% |

R4's harness evaluation on the same lines, for cross-checking: FAR 0.00%, ask rate 0.0%, recall@3 87.8%.

## Dev test side: top 10 configs

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.50 | 2244 | 40.0% | 40.6% | 0.62% (14) | 0.97% | 38.1% | 21.3% | 11.1% | 92.1% | 98.5% | 1.9% |
| E + Q-bm25 + B → pool 10 → E 0.45, T 0.50, R 0.05 | 2244 | 39.8% | 40.5% | 0.62% (14) | 0.97% | 38.3% | 21.2% | 10.9% | 92.0% | 98.5% | 1.9% |
| E + Q-bm25 + B → pool 10 → E 0.40, P 0.05, T 0.50, R 0.05 | 2244 | 39.8% | 40.4% | 0.62% (14) | 0.97% | 38.1% | 21.5% | 11.1% | 92.0% | 98.5% | 1.9% |
| E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.45, R 0.05 | 2244 | 39.7% | 40.3% | 0.58% (13) | 0.92% | 38.1% | 21.7% | 11.1% | 92.1% | 98.5% | 1.8% |
| E + Q-bm25 + B → pool 10 → E 0.50, T 0.45, R 0.05 | 2244 | 39.6% | 40.2% | 0.58% (13) | 0.92% | 38.1% | 21.7% | 11.1% | 92.1% | 98.5% | 1.8% |
| E + Q-bm25 + B → pool 10 → E 0.50, T 0.50 | 2244 | 39.5% | 40.1% | 0.58% (13) | 0.92% | 34.3% | 25.6% | 12.6% | 92.0% | 98.5% | 1.8% |
| E + Q-bm25 + B → pool 10 → E 0.05, P 0.20, T 0.50, R 0.25 | 2244 | 39.4% | 40.1% | 0.62% (14) | 0.97% | 36.2% | 23.8% | 11.8% | 89.9% | 97.5% | 1.9% |
| E + Q-bm25 + B → pool 10 → E 0.10, P 0.15, T 0.50, R 0.25 | 2244 | 39.4% | 40.1% | 0.62% (14) | 0.97% | 36.3% | 23.7% | 11.8% | 90.0% | 97.5% | 1.9% |
| E + Q-bm25 + B → pool 10 → P 0.25, T 0.50, R 0.25 | 2244 | 39.4% | 40.1% | 0.62% (14) | 0.97% | 36.3% | 23.7% | 11.8% | 89.9% | 97.5% | 1.9% |
| E + Q-bm25 + B → pool 5 → E 0.50, T 0.50 | 2244 | 39.3% | 39.8% | 0.49% (11) | 0.81% | 34.7% | 25.6% | 12.6% | 91.8% | 97.8% | 1.5% |

Best per shortlist retriever set:

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-bm25 + B → pool 10 → E 0.25, P 0.25, T 0.50 | 2244 | 39.3% | 39.8% | 0.58% (13) | 0.92% | 34.4% | 25.8% | 12.8% | 91.1% | 97.3% | 1.8% |
| Q-cos + B → pool 10 → E 0.50, T 0.50 | 2244 | 39.0% | 39.4% | 0.45% (10) | 0.75% | 34.6% | 26.0% | 12.7% | 91.1% | 97.2% | 1.4% |
| Q-bm25 → pool 5 → E 0.25, P 0.25, T 0.50 | 2244 | 36.8% | 37.3% | 0.58% (13) | 0.92% | 31.2% | 31.5% | 15.2% | 89.3% | 94.4% | 1.6% |
| E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.50 | 2244 | 40.0% | 40.6% | 0.62% (14) | 0.97% | 38.1% | 21.3% | 11.1% | 92.1% | 98.5% | 1.9% |
| Q-bm25 + B + P → pool 20 → T 0.50, R 0.50 | 2244 | 38.1% | 38.7% | 0.58% (13) | 0.92% | 34.9% | 26.4% | 12.9% | 88.7% | 97.0% | 1.8% |

Best config without a rerank: Q-bm25 → pool 5 → no rerank (RRF score).

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-bm25 → pool 5 → no rerank (RRF score) | 2244 | 0.0% | 0.0% | 0.00% (0) | 0.13% | 93.5% | 6.5% | 2.6% | 87.7% | 94.3% | 0.0% |

## Shortlist cost

- Q-bm25 + B: 3.33 ms/line to fuse a 20-candidate shortlist
- Q-cos + B: 3.50 ms/line to fuse a 20-candidate shortlist
- Q-bm25: 1.08 ms/line to fuse a 20-candidate shortlist
- E + Q-bm25 + B: 17.24 ms/line to fuse a 20-candidate shortlist
- Q-bm25 + B + P: 12.45 ms/line to fuse a 20-candidate shortlist

Node wall-clock on the machine above, not the plan's low-end Android budget.

## Caveats

- The dev test side was read by bakeoff_v3 and is read by every config here; it is a dev set. Only the lockbox is a holdout, and only for synthetic noise: D2 reuses the real catalogs' names with new noise, D3 and OOC use catalogs generated from a new seed. Neither is recorded speech.
- No line carries a spoken unit, so `unit_ok` never fires, and no shop alias exists, so alias learning is not exercised.
- Out-of-catalog lines here are the hardest kind: a sibling of the asked-for item is always in the catalog.
