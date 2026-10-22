# Resolver auto-research — autoresearch_v2

Generated 2026-10-21T19:27:33.255Z by `backend/ai/evaluation/voice_order/search/autoresearch.ts` on Node v22.22.0, linux 6.18.44-fc-v139, Intel(R) Xeon(R) Processor @ 2.80GHz.
Protocol: `backend/ai/evaluation/voice_order/configs/autoresearch_protocol_v2.json` v2, frozen 2026-10-21. FAR budget 1.0%, LTT delta 0.05.

## Winner

**Q-bm25 + B → pool 10 → E 0.25, P 0.20, T 0.55**, gate sAuto 0.7234, mMin 0.1284, agreeMin 1, sFloor 0.5633.

Chosen from 369 configs (324 on the grid, the rest by coordinate ascent) by the protocol's objective on the dev test side. Re-run through `buildResolver`: dev-test correct AUTO 39.3% against 39.3% in the search.

## Lockbox (scored once)

Fresh D2 noise (seed 20261023), fresh D3 catalogs (seed 20261023) and out-of-catalog lines (seed 20261023, 10.0% of each catalog removed). Gate thresholds are the dev-calibration ones, unchanged. D1 is not here: it cannot be regenerated.

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line | ms/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Winner | 2100 | 30.6% | 31.0% | 0.33% (7) | 0.63% | 62.3% | 6.8% | 4.1% | 85.6% | 90.8% | 1.0% | 1.18 | 4.63 |
| R4 (bakeoff_v3 pick, its own tuner) | 2100 | 0.0% | 0.0% | 0.00% (0) | 0.14% | 0.0% | 100.0% | 66.7% | 76.4% | 88.5% | 0.0% | 2.33 | 6.26 |

By dataset:

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Winner, d2 | 700 | 73.7% | 73.7% | 0.00% (0) | 0.43% | 19.0% | 7.3% | 7.3% | 99.4% | 99.7% | 0.0% | 0.41 |
| Winner, d3 | 700 | 18.1% | 18.1% | 0.00% (0) | 0.43% | 76.7% | 5.1% | 5.1% | 71.7% | 81.9% | 0.0% | 1.23 |
| Winner, ooc | 700 | 0.0% | 1.0% | 1.00% (7) | 1.87% | 91.1% | 7.9% | 0.0% | 0.0% | 0.0% | 1.0% | 1.90 |
| R4, d2 | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 100.0% | 97.4% | 99.4% | 0.0% | 3.00 |
| R4, d3 | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 100.0% | 55.4% | 77.6% | 0.0% | 3.00 |
| R4, ooc | 700 | 0.0% | 0.0% | 0.00% (0) | 0.43% | 0.0% | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 1.00 |

R4's harness evaluation on the same lines, for cross-checking: FAR 0.00%, ask rate 0.0%, recall@3 88.5%.

## Dev test side: top 10 configs

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-bm25 + B → pool 10 → E 0.25, P 0.20, T 0.55 | 2244 | 39.3% | 39.9% | 0.62% (14) | 0.97% | 53.2% | 6.9% | 3.2% | 91.0% | 97.3% | 1.9% | 0.97 |
| Q-bm25 + B → pool 10 → E 0.20, P 0.25, T 0.55 | 2244 | 39.3% | 39.9% | 0.62% (14) | 0.97% | 53.2% | 6.9% | 3.2% | 91.0% | 97.2% | 1.9% | 0.97 |
| Q-bm25 + B → pool 10 → E 0.25, P 0.25, T 0.50 | 2244 | 39.3% | 39.8% | 0.58% (13) | 0.92% | 53.1% | 7.1% | 3.2% | 91.1% | 97.3% | 1.8% | 0.97 |
| Q-bm25 + B → pool 10 → E 0.30, P 0.20, T 0.50 | 2244 | 39.3% | 39.8% | 0.58% (13) | 0.92% | 53.1% | 7.1% | 3.2% | 91.1% | 97.3% | 1.8% | 0.97 |
| Q-bm25 + B → pool 10 → E 0.35, P 0.15, T 0.50 | 2244 | 39.2% | 39.8% | 0.58% (13) | 0.92% | 53.1% | 7.1% | 3.3% | 91.1% | 97.3% | 1.8% | 0.97 |
| Q-bm25 + B → pool 10 → E 0.40, P 0.10, T 0.50 | 2244 | 39.1% | 39.7% | 0.53% (12) | 0.86% | 53.1% | 7.3% | 3.4% | 91.0% | 97.3% | 1.6% | 0.97 |
| Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.50 | 2244 | 39.1% | 39.7% | 0.53% (12) | 0.86% | 52.9% | 7.4% | 3.5% | 91.0% | 97.3% | 1.6% | 0.97 |
| Q-bm25 + B → pool 10 → E 0.50, T 0.50 | 2244 | 39.1% | 39.6% | 0.49% (11) | 0.81% | 53.1% | 7.3% | 3.4% | 91.0% | 97.3% | 1.5% | 0.97 |
| Q-cos + B → pool 10 → E 0.45, P 0.05, T 0.50 | 2244 | 39.0% | 39.5% | 0.49% (11) | 0.81% | 53.1% | 7.4% | 3.5% | 91.2% | 97.3% | 1.5% | 0.98 |
| Q-cos + B → pool 10 → E 0.50, T 0.50 | 2244 | 39.0% | 39.4% | 0.45% (10) | 0.75% | 53.3% | 7.2% | 3.4% | 91.1% | 97.2% | 1.4% | 0.98 |

Best per shortlist retriever set:

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-bm25 + B → pool 10 → E 0.25, P 0.20, T 0.55 | 2244 | 39.3% | 39.9% | 0.62% (14) | 0.97% | 53.2% | 6.9% | 3.2% | 91.0% | 97.3% | 1.9% | 0.97 |
| Q-cos + B → pool 10 → E 0.45, P 0.05, T 0.50 | 2244 | 39.0% | 39.5% | 0.49% (11) | 0.81% | 53.1% | 7.4% | 3.5% | 91.2% | 97.3% | 1.5% | 0.98 |
| Q-bm25 → pool 5 → E 0.25, P 0.25, T 0.50 | 2244 | 36.8% | 37.3% | 0.58% (13) | 0.92% | 52.0% | 10.7% | 4.7% | 89.3% | 94.4% | 1.6% | 1.00 |
| E + Q-bm25 + B: over the latency budget, not searched |
| Q-bm25 + B + P: over the latency budget, not searched |

Best config without a rerank: Q-bm25 → pool 5 → no rerank (RRF score).

| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied | taps/line |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q-bm25 → pool 5 → no rerank (RRF score) | 2244 | 0.0% | 0.0% | 0.00% (0) | 0.13% | 93.5% | 6.5% | 2.6% | 87.7% | 94.3% | 0.0% | 1.37 |

## Shortlist cost

- Q-bm25 + B: 3.46 ms/line to fuse a 20-candidate shortlist
- Q-cos + B: 3.31 ms/line to fuse a 20-candidate shortlist
- Q-bm25: 0.88 ms/line to fuse a 20-candidate shortlist
- E + Q-bm25 + B: 17.05 ms/line to fuse a 20-candidate shortlist
- Q-bm25 + B + P: 11.83 ms/line to fuse a 20-candidate shortlist

Node wall-clock on the machine above, not the plan's low-end Android budget.

## Caveats

- The dev test side was read by bakeoff_v3 and is read by every config here; it is a dev set. Only the lockbox is a holdout, and only for synthetic noise: D2 reuses the real catalogs' names with new noise, D3 and OOC use catalogs generated from a new seed. Neither is recorded speech.
- No line carries a spoken unit, so `unit_ok` never fires, and no shop alias exists, so alias learning is not exercised.
- Out-of-catalog lines here are the hardest kind: a sibling of the asked-for item is always in the catalog.
