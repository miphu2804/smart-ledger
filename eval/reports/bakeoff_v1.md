# Voice-order resolver bake-off — bakeoff_v1

Generated 2026-10-21T00:55:24.181Z by `eval/runner/run.ts`.

- Config hash: `fdffbcc6bc47b2e1`
- Selection rule: `eval/configs/selection_rule.json` v1 frozen 2026-10-21, FAR budget 1.0%
- Environment: Node v22.23.3 on darwin 25.4.0, Apple M4 Pro

## Datasets

| Dataset | lines | note |
|---|---|---|
| d1 | 1087 | written reference transcripts segmented by parseOrder; **not recorded audio** |
| d2 | 1015 | synthetic ASR noise over catalog names |
| d3 | 26100 | catalog-stress families, 100–20 000 items |

parseOrder recognised no order line in 0 prior records, and matched no in-catalog item in 174.

## Headline

| Row | Resolver | Gate | recall@3 | top-1 | MRR | FAR | FAR 95% CI | autos | ask rate | NEW P | NEW R | AURC | ECE |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R0 | current parseOrder matcher | G1 | 48.3% | 48.3% | 0.483 | 0.1% | 0.0%–0.3% | 700 | 7.8% | 5.1% | 54.7% | 0.354 | 0.000 |
| R1 | E only | G1 | 95.4% | 91.1% | 0.934 | 7.2% | 6.0%–8.6% | 1375 | 8.8% | 0.0% | 0.0% | 0.019 | 0.000 |
| R2 | Q-cos | G1 | 93.6% | 87.5% | 0.903 | 0.1% | 0.0%–0.3% | 700 | 24.3% | 13.2% | 90.6% | 0.036 | 0.000 |
| R3 | Q-bm25 | G1 | 94.0% | 87.4% | 0.905 | 0.3% | 0.1%–0.5% | 656 | 56.5% | 0.0% | 0.0% | 0.116 | 0.000 |
| R4 | Q + B, RRF | G1 | 95.4% | 83.5% | 0.894 | 3.4% | 2.6%–4.4% | 1116 | 26.0% | 0.0% | 0.0% | 0.054 | 0.000 |
| R5 | E + Q + B, RRF | G1 | 96.3% | 89.3% | 0.928 | 2.8% | 2.0%–3.6% | 1108 | 26.5% | 0.0% | 0.0% | 0.038 | 0.000 |
| R5w | E + Q + B, weighted RRF | G1 | 96.3% | 89.3% | 0.928 | 2.8% | 2.0%–3.6% | 1108 | 26.5% | 0.0% | 0.0% | 0.038 | 0.000 |
| R6 | R5 + P | G1 | 95.8% | 89.7% | 0.927 | 2.7% | 1.9%–3.5% | 1104 | 26.8% | 0.0% | 0.0% | 0.037 | 0.000 |
| Rx | AND-trigram control | G1 | 48.5% | 48.3% | 0.484 | 0.1% | 0.0%–0.3% | 700 | 53.6% | 0.0% | 0.0% | 0.183 | 0.000 |
| R1-G2 | E only, logistic gate | G2 | 95.4% | 91.1% | 0.934 | 4.2% | 3.2%–5.2% | 1329 | 11.9% | 0.0% | 0.0% | 0.019 | 0.037 |
| R3-G2 | Q-bm25, logistic gate | G2 | 94.0% | 87.4% | 0.905 | 3.1% | 2.2%–3.9% | 860 | 36.4% | 38.4% | 59.4% | 0.116 | 0.096 |
| R5-G2 | E + Q + B, RRF, logistic gate | G2 | 96.3% | 89.3% | 0.928 | 5.0% | 3.9%–6.1% | 1213 | 7.3% | 15.1% | 43.8% | 0.038 | 0.070 |
| R6-G2 | R5 + P, logistic gate | G2 | 95.8% | 89.7% | 0.927 | 6.7% | 5.4%–8.0% | 1314 | 2.1% | 17.9% | 45.3% | 0.037 | 0.074 |

FAR is wrong autos over all lines; the CI is a 95% percentile bootstrap of that rate.

## Selection

- Best held-out recall@3 (R*): **R3** at 94.0%.
- Chosen by the pre-registered rule (simplest within 2 pp recall@3 and 2 pp ask rate of R*): **R2** — Q-cos.
- Its held-out numbers: recall@3 93.6%, top-1 87.5%, FAR 0.1% (95% CI 0.0%–0.3%), ask rate 24.3%, 700 autos.
- Rule-of-three bound on FAR from 700 autos: 0.4%.

Latency: Plan section 7.4 states latency budgets for a low-end Android device. This harness measured Node wall-clock on a developer machine, so no row was excluded for latency; the device budgets remain unmeasured.

Excluded by the false-auto budget:

- `R1`: held-out FAR 95% upper bound 0.0855 > 0.01
- `R4`: held-out FAR 95% upper bound 0.0438 > 0.01
- `R5`: held-out FAR 95% upper bound 0.0365 > 0.01
- `R5w`: held-out FAR 95% upper bound 0.0365 > 0.01
- `R6`: held-out FAR 95% upper bound 0.0351 > 0.01
- `R1-G2`: held-out FAR 95% upper bound 0.0524 > 0.01
- `R3-G2`: held-out FAR 95% upper bound 0.0391 > 0.01
- `R5-G2`: held-out FAR 95% upper bound 0.0610 > 0.01
- `R6-G2`: held-out FAR 95% upper bound 0.0796 > 0.01

## Breakdowns

### R3 — Q-bm25
| Dataset | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| d1 | 436 | 100.0% | 100.0% | 0.0% | 54.4% |
| d2 | 372 | 96.8% | 96.2% | 0.0% | 56.5% |
| d3 | 700 | 89.4% | 76.0% | 0.6% | 57.9% |
| Tag | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| clean | 202 | 100.0% | 100.0% | 0.0% | 29.2% |
| dialect | 182 | 72.5% | 65.4% | 1.1% | 75.8% |
| loanword | 65 | 80.0% | 73.8% | 0.0% | 75.4% |
| near_duplicate | 30 | 0.0% | 0.0% | 0.0% | 100.0% |
| out_of_catalog | 34 | 0.0% | 0.0% | 0.0% | 100.0% |

### R2 — Q-cos
| Dataset | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| d1 | 436 | 100.0% | 100.0% | 0.0% | 1.4% |
| d2 | 372 | 96.8% | 96.5% | 0.0% | 27.4% |
| d3 | 700 | 88.6% | 76.0% | 0.3% | 37.0% |
| Tag | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| clean | 202 | 100.0% | 100.0% | 0.0% | 0.0% |
| dialect | 182 | 70.9% | 63.2% | 0.0% | 31.9% |
| loanword | 65 | 80.0% | 70.8% | 0.0% | 26.2% |
| near_duplicate | 30 | 0.0% | 0.0% | 0.0% | 16.7% |
| out_of_catalog | 34 | 0.0% | 0.0% | 0.0% | 2.9% |


## Paired comparisons

Discordant counts over the held-out lines both rows resolved. `R0 only` means R0 got the line right and the other row did not.

| Comparison | Metric | R0 only | Other only | McNemar p |
|---|---|---|---|---|
| R1 vs R0 | top-1 correct | 2 | 620 | 0.0000 |
| R1 vs R0 | AUTO correct | 9 | 577 | 0.0000 |
| R2 vs R0 | top-1 correct | 2 | 567 | 0.0000 |
| R2 vs R0 | AUTO correct | 34 | 34 | 1.0000 |
| R3 vs R0 | top-1 correct | 2 | 566 | 0.0000 |
| R3 vs R0 | AUTO correct | 277 | 231 | 0.0458 |
| R4 vs R0 | top-1 correct | 0 | 508 | 0.0000 |
| R4 vs R0 | AUTO correct | 2 | 368 | 0.0000 |
| R5 vs R0 | top-1 correct | 0 | 592 | 0.0000 |
| R5 vs R0 | AUTO correct | 2 | 370 | 0.0000 |
| R5w vs R0 | top-1 correct | 0 | 592 | 0.0000 |
| R5w vs R0 | AUTO correct | 2 | 370 | 0.0000 |
| R6 vs R0 | top-1 correct | 0 | 597 | 0.0000 |
| R6 vs R0 | AUTO correct | 2 | 368 | 0.0000 |
| Rx vs R0 | top-1 correct | 34 | 34 | 1.0000 |
| Rx vs R0 | AUTO correct | 34 | 34 | 1.0000 |
| R1-G2 vs R0 | top-1 correct | 2 | 620 | 0.0000 |
| R1-G2 vs R0 | AUTO correct | 7 | 575 | 0.0000 |
| R3-G2 vs R0 | top-1 correct | 2 | 566 | 0.0000 |
| R3-G2 vs R0 | AUTO correct | 240 | 356 | 0.0000 |
| R5-G2 vs R0 | top-1 correct | 0 | 592 | 0.0000 |
| R5-G2 vs R0 | AUTO correct | 0 | 440 | 0.0000 |
| R6-G2 vs R0 | top-1 correct | 0 | 597 | 0.0000 |
| R6-G2 vs R0 | AUTO correct | 2 | 517 | 0.0000 |

## Risk–coverage

Risk at each coverage level for `R2`. Lower is better; a resolver whose confident answers are right stays near zero until coverage approaches 1.

| coverage | risk |
|---|---|
| 5.0% | 0.0% |
| 15.1% | 0.0% |
| 25.0% | 0.0% |
| 35.0% | 0.0% |
| 45.0% | 0.3% |
| 55.0% | 4.1% |
| 65.1% | 5.3% |
| 75.0% | 5.8% |
| 85.0% | 8.0% |
| 95.0% | 11.9% |
| 100.0% | 16.2% |

## Latency

Wall-clock milliseconds per line spent resolving, on the machine above. **This is not the plan’s device budget.**

| Row | ms/line |
|---|---|
| R0 | 77.836 |
| R1 | 32.010 |
| R2 | 0.366 |
| R3 | 0.330 |
| R4 | 0.894 |
| R5 | 1.249 |
| R5w | 1.361 |
| R6 | 1.603 |
| Rx | 0.194 |
| R1-G2 | 31.926 |
| R3-G2 | 0.346 |
| R5-G2 | 1.360 |
| R6-G2 | 1.782 |

## Failure gallery

The worst lines for `R2` on the held-out split.

| line | dataset | gold | decision | top-5 ranked |
|---|---|---|---|---|
| d1-fd-01-0 | d1 | (new) | NEW | 101 |
| d1-ho-070-0 | d1 | (new) | NEW | — |
| d1-ho-111-0 | d1 | (new) | NEW | — |
| d1-ho-111-1 | d1 | (new) | NEW | — |
| d1-ho-114-0 | d1 | (new) | NEW | — |
| d1-ho-120-0 | d1 | (new) | NEW | — |
| d1-th-061-0 | d1 | (new) | NEW | — |
| d1-th-062-0 | d1 | (new) | NEW | — |
| d1-th-063-0 | d1 | (new) | NEW | — |
| d1-th-064-0 | d1 | (new) | NEW | — |
| d1-th-065-0 | d1 | (new) | NEW | — |
| d1-th-065-1 | d1 | (new) | NEW | — |
| d1-th-066-0 | d1 | (new) | NEW | — |
| d1-th-067-0 | d1 | (new) | NEW | — |
| d1-th-068-0 | d1 | (new) | NEW | — |
| d1-th-069-0 | d1 | (new) | NEW | — |
| d1-th-070-0 | d1 | (new) | NEW | — |
| d1-th-071-0 | d1 | (new) | NEW | — |
| d1-th-072-0 | d1 | (new) | NEW | — |
| d1-th-073-0 | d1 | (new) | NEW | — |

## Deviations from the plan

- D1 is written reference transcripts, not recorded audio. No audio exists in this repository, so plan section 7.1’s D1 and the whole P5 STT axis (greedy vs beam vs hotwords, silence pad, overlapped processing) could not be run.
- Because an in-catalog D1 span is the catalog name `parseOrder` matched, D1 scores at the ceiling for every resolver. It validates the pipeline and detects regressions; it does not discriminate. D2 carries the discrimination.
- D2 confusion-rule weights are start values, not fitted to real ASR output: fitting them needs D1 transcripts, which do not exist. They are data in `eval/lib/synth_rules.vi.ts` and are the first thing to re-fit when recordings arrive.
- Plan section 7.3 requires breakdowns by region, environment, device tier and catalog-size bucket. These datasets carry no speaker, region or environment metadata — D1 has no recorded audio at all — so the report breaks down by dataset and by noise tag instead. The catalog-size axis is still covered, by D3’s four catalogs of 100 to 20 000 items.
- Plan section 7.5’s Qdrant Edge parity oracle was not run. Qdrant Edge is a beta Python/Rust package, and this harness is pure TypeScript with no new dependencies by design; the parity test has no implementation.
- Plan section 8.3 step 1 excludes configs over a latency budget measured on a low-end Android device. This harness measured Node wall-clock instead, so no row was excluded for latency.
- The resolver library lives at `frontend/mobile/src/lib/resolver/`, not the plan’s `packages/resolver/`. This repository is not a monorepo and has no `packages/` directory; `frontend/mobile/src/lib/` is where the frozen `types.ts` already sits.
- `RetrieverE`/`RetrieverP` default `eBruteMax` to 5000, following the frozen type in `types.ts`; plan section 5.2 prose says 500. The value is a config knob and the bake-off sets it explicitly.
- F1 (`max`) fuses raw scores rather than max-normalized ones. Max-normalizing forces every query’s top-1 to exactly 1, which makes `s1` constant and the gate’s score floor unreachable — an unmatched line would look as confident as a perfect one.
- Seed aliases install by unique exact-or-prefix name match, because a seed names a product loosely ("Bia Tiger") while the catalog row spells it out ("Bia Tiger lon 330ml"). An ambiguous seed is dropped rather than guessed.
- `eBruteMax` is 500 for every row, the plan’s start value. It is the catalog size at or below which `RetrieverE` and `RetrieverP` score every item; above it they score only the ids Q hands them. E-only and P-only rows have no Q, so they scan the whole catalog, and that is why their D3 timings are far above the others rather than a retriever-quality difference.
- D3 is sampled. The full catalog of 26 100 records against a 20 000-item catalog makes an unpruned brute-force scan take longer than the whole rest of the matrix, so `--limit` caps the lines taken from each dataset. The catalogs themselves are never sampled: every D3 line still searches a 100-, 1 000-, 5 000- or 20 000-item catalog, which is the axis D3 exists to stress. D1 and D2 are under the cap and are complete.
- `RetrieverE` and `RetrieverP` received a candidate provider even when the config named no Q retriever. That provider returned an empty list, so above `eBruteMax` they scored nothing and reported it as "no match". Fixed in `frontend/mobile/src/lib/resolver/index.ts`; every E-only and P-only row in this report is measured after that fix.
- D2 is 96 of 1015 lines a spoken span at least four characters shorter than the catalog name, and 41 of those are an exact truncation of it ("Coca-Cola lon 330ml" heard as "Coca-Cola"). The rest are same-length noise. A resolver that fails only on heavy truncation would score well on D2 on little evidence.

