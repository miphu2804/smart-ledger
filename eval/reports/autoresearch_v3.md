# Resolver auto-research — autoresearch_v3

Generated 2026-10-22T02:15:10.782Z by `eval/search/autoresearch.ts` on Node v22.22.0, linux 6.18.44-fc-v139, Intel(R) Xeon(R) Processor @ 2.80GHz.
Protocol: `eval/configs/autoresearch_protocol_v3.json` v3, frozen 2026-10-22. FAR budget 1.0%, LTT delta 0.05.

## Winner

**E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.50**, gate sAuto 0.7200, mMin 0.1217, agreeMin 1, sFloor -inf.

Chosen from 573 configs (540 on the grid, the rest by coordinate ascent) by the protocol's objective on the dev test side. Re-run through `buildResolver`: dev-test correct AUTO 39.8% against 40.0% in the search.

## Lockbox (scored once)

Fresh D2 noise (seed 20261024), fresh D3 catalogs (seed 20261024) and out-of-catalog lines (seed 20261024, 10.0% of each catalog removed). Gate thresholds are the dev-calibration ones, unchanged. D1 is not here: it cannot be regenerated.

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line | ms/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Winner | 2100 | 31.0% | 31.5% | 0.43% (9) | 0.75% | 68.5% | 0.0% | 0.0% | 89.8% | 94.6% | 1.3% | 1.09 | 28.53 |
| R4 (bakeoff_v3 pick, its own tuner) | 2100 | 0.0% | 0.0% | 0.00% (0) | 0.14% | 0.0% | 100.0% | 66.7% | 80.4% | 90.6% | 0.0% | 2.33 | 7.13 |

By dataset:

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Winner, d2 | 700 | 74.7% | 74.7% | 0.00% (0) | 0.43% | 25.3% | 0.0% | 0.0% | 99.6% | 100.0% | 0.0% | 0.25 |
| Winner, d3 | 700 | 18.4% | 18.4% | 0.00% (0) | 0.43% | 81.6% | 0.0% | 0.0% | 80.0% | 89.1% | 0.0% | 1.03 |
| Winner, ooc | 700 | 0.0% | 1.3% | 1.29% (9) | 2.23% | 98.7% | 0.0% | 0.0% | 0.0% | 0.0% | 1.3% | 1.97 |
| R4, d2 | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 100.0% | 97.3% | 99.0% | 0.0% | 3.00 |
| R4, d3 | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 100.0% | 63.6% | 82.3% | 0.0% | 3.00 |
| R4, ooc | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 1.00 |

R4's harness evaluation on the same lines, for cross-checking: FAR 0.00%, ask rate 0.0%, recall@3 90.6%.

## Dev test side: top 10 configs

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.50 | 2244 | 40.0% | 40.6% | 0.62% (14) | 0.97% | 59.4% | 0.0% | 0.0% | 92.1% | 98.5% | 1.9% | 0.94 |
| E + Q-bm25 + B → pool 10 → E 0.45, T 0.50, R 0.05 | 2244 | 39.8% | 40.5% | 0.62% (14) | 0.97% | 59.5% | 0.0% | 0.0% | 92.0% | 98.5% | 1.9% | 0.94 |
| E + Q-bm25 + B → pool 10 → E 0.40, P 0.05, T 0.50, R 0.05 | 2244 | 39.8% | 40.4% | 0.62% (14) | 0.97% | 59.6% | 0.0% | 0.0% | 92.0% | 98.5% | 1.9% | 0.94 |
| E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.45, R 0.05 | 2244 | 39.7% | 40.3% | 0.58% (13) | 0.92% | 52.5% | 7.2% | 3.4% | 92.1% | 98.5% | 1.8% | 0.96 |
| E + Q-bm25 + B → pool 10 → E 0.50, T 0.45, R 0.05 | 2244 | 39.6% | 40.2% | 0.58% (13) | 0.92% | 52.6% | 7.2% | 3.3% | 92.1% | 98.5% | 1.8% | 0.96 |
| E + Q-bm25 + B → pool 10 → E 0.50, T 0.50 | 2244 | 39.5% | 40.1% | 0.58% (13) | 0.92% | 59.9% | 0.0% | 0.0% | 92.0% | 98.5% | 1.8% | 0.94 |
| E + Q-bm25 + B → pool 10 → E 0.05, P 0.20, T 0.50, R 0.25 | 2244 | 39.4% | 40.1% | 0.62% (14) | 0.97% | 59.9% | 0.0% | 0.0% | 89.9% | 97.5% | 1.9% | 0.95 |
| E + Q-bm25 + B → pool 10 → E 0.10, P 0.15, T 0.50, R 0.25 | 2244 | 39.4% | 40.1% | 0.62% (14) | 0.97% | 59.9% | 0.0% | 0.0% | 90.0% | 97.5% | 1.9% | 0.95 |
| E + Q-bm25 + B → pool 10 → P 0.25, T 0.50, R 0.25 | 2244 | 39.4% | 40.1% | 0.62% (14) | 0.97% | 59.9% | 0.0% | 0.0% | 89.9% | 97.5% | 1.9% | 0.95 |
| E + Q-bm25 + B → pool 5 → E 0.50, T 0.50 | 2244 | 39.3% | 39.8% | 0.49% (11) | 0.81% | 60.2% | 0.0% | 0.0% | 91.8% | 97.8% | 1.5% | 0.95 |

Best per shortlist retriever set:

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-bm25 + B → pool 10 → E 0.25, P 0.25, T 0.50 | 2244 | 39.3% | 39.8% | 0.58% (13) | 0.92% | 53.1% | 7.1% | 3.2% | 91.1% | 97.3% | 1.8% | 0.97 |
| Q-cos + B → pool 10 → E 0.50, T 0.50 | 2244 | 39.0% | 39.4% | 0.45% (10) | 0.75% | 53.3% | 7.2% | 3.4% | 91.1% | 97.2% | 1.4% | 0.98 |
| Q-bm25 → pool 5 → E 0.25, P 0.25, T 0.50 | 2244 | 36.8% | 37.3% | 0.58% (13) | 0.92% | 52.0% | 10.7% | 4.7% | 89.3% | 94.4% | 1.6% | 1.00 |
| E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.50 | 2244 | 40.0% | 40.6% | 0.62% (14) | 0.97% | 59.4% | 0.0% | 0.0% | 92.1% | 98.5% | 1.9% | 0.94 |
| Q-bm25 + B + P → pool 20 → T 0.50, R 0.50 | 2244 | 38.1% | 38.7% | 0.58% (13) | 0.92% | 61.3% | 0.0% | 0.0% | 88.7% | 97.0% | 1.8% | 0.98 |

Best config without a rerank: Q-bm25 → pool 5 → no rerank (RRF score).

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-bm25 → pool 5 → no rerank (RRF score) | 2244 | 0.0% | 0.0% | 0.00% (0) | 0.13% | 93.5% | 6.5% | 2.6% | 87.7% | 94.3% | 0.0% | 1.37 |

## Shortlist cost

- Q-bm25 + B: 4.60 ms/line to fuse a 20-candidate shortlist
- Q-cos + B: 4.39 ms/line to fuse a 20-candidate shortlist
- Q-bm25: 1.22 ms/line to fuse a 20-candidate shortlist
- E + Q-bm25 + B: 22.53 ms/line to fuse a 20-candidate shortlist
- Q-bm25 + B + P: 16.10 ms/line to fuse a 20-candidate shortlist

Node wall-clock on the machine above, not the plan's low-end Android budget.

## Caveats

- The dev test side was read by bakeoff_v3 and is read by every config here; it is a dev set. Only the lockbox is a holdout, and only for synthetic noise: D2 reuses the real catalogs' names with new noise, D3 and OOC use catalogs generated from a new seed. Neither is recorded speech.
- No line carries a spoken unit, so `unit_ok` never fires, and no shop alias exists, so alias learning is not exercised.
- Out-of-catalog lines here are the hardest kind: a sibling of the asked-for item is always in the catalog.
