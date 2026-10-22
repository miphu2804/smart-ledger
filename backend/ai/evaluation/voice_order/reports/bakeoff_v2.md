# Voice-order resolver bake-off — bakeoff_v2

Generated 2026-10-21T02:45:52.166Z by `backend/ai/evaluation/voice_order/runner/run.ts`.

- Config hash: `09bd66f64b1c8865`
- Selection rule: `backend/ai/evaluation/voice_order/configs/selection_rule.json` v1 frozen 2026-10-21, FAR budget 1.0%
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
| R2 | Q-cos | G1 | 93.6% | 87.5% | 0.903 | 1.1% | 0.6%–1.6% | 1103 | 26.9% | 0.0% | 0.0% | 0.036 | 0.000 |
| R3 | Q-bm25 | G1 | 94.0% | 87.4% | 0.905 | 1.0% | 0.5%–1.5% | 1114 | 26.1% | 0.0% | 0.0% | 0.116 | 0.000 |
| R4 | Q + B, RRF | G1 | 95.4% | 83.5% | 0.894 | 3.6% | 2.7%–4.6% | 1122 | 25.6% | 0.0% | 0.0% | 0.054 | 0.000 |
| R5 | E + Q + B, RRF | G1 | 97.8% | 89.6% | 0.936 | 2.9% | 2.1%–3.7% | 1122 | 25.6% | 0.0% | 0.0% | 0.038 | 0.000 |
| R5w | E + Q + B, weighted RRF | G1 | 97.8% | 89.6% | 0.936 | 2.9% | 2.1%–3.7% | 1122 | 25.6% | 0.0% | 0.0% | 0.038 | 0.000 |
| R6 | R5 + P | G1 | 97.2% | 90.9% | 0.939 | 3.1% | 2.2%–3.9% | 1124 | 25.5% | 0.0% | 0.0% | 0.036 | 0.000 |
| Rx | AND-trigram control | G1 | 48.5% | 48.3% | 0.484 | 0.1% | 0.0%–0.3% | 700 | 53.6% | 0.0% | 0.0% | 0.183 | 0.000 |
| R1-G2 | E only, logistic gate | G2 | 95.4% | 91.1% | 0.934 | 4.2% | 3.2%–5.2% | 1329 | 11.9% | 0.0% | 0.0% | 0.019 | 0.037 |
| R3-G2 | Q-bm25, logistic gate | G2 | 94.0% | 87.4% | 0.905 | 3.5% | 2.6%–4.4% | 1213 | 10.4% | 41.3% | 89.1% | 0.116 | 0.045 |
| R5-G2 | E + Q + B, RRF, logistic gate | G2 | 97.8% | 89.6% | 0.936 | 4.8% | 3.7%–5.8% | 1215 | 19.4% | 0.0% | 0.0% | 0.038 | 0.073 |
| R6-G2 | R5 + P, logistic gate | G2 | 97.2% | 90.9% | 0.939 | 6.6% | 5.4%–7.8% | 1318 | 12.6% | 0.0% | 0.0% | 0.036 | 0.073 |

FAR is wrong autos over all lines; the CI is a 95% percentile bootstrap of that rate.

## Selection

- Best held-out recall@3 (R*): **Rx** at 48.5%.
- Chosen by the pre-registered rule (simplest within 2 pp recall@3 and 2 pp ask rate of R*): **R0** — current parseOrder matcher.
- Its held-out numbers: recall@3 48.3%, top-1 48.3%, FAR 0.1% (95% CI 0.0%–0.3%), ask rate 7.8%, 700 autos.
- Rule-of-three bound on FAR from 700 autos: 0.4%.

Latency: Plan section 7.4 states latency budgets for a low-end Android device. This harness measured Node wall-clock on a developer machine, so no row was excluded for latency; the device budgets remain unmeasured.

Excluded by the false-auto budget:

- `R1`: held-out FAR 95% upper bound 0.0855 > 0.01
- `R2`: held-out FAR 95% upper bound 0.0159 > 0.01
- `R3`: held-out FAR 95% upper bound 0.0153 > 0.01
- `R4`: held-out FAR 95% upper bound 0.0458 > 0.01
- `R5`: held-out FAR 95% upper bound 0.0371 > 0.01
- `R5w`: held-out FAR 95% upper bound 0.0371 > 0.01
- `R6`: held-out FAR 95% upper bound 0.0391 > 0.01
- `R1-G2`: held-out FAR 95% upper bound 0.0524 > 0.01
- `R3-G2`: held-out FAR 95% upper bound 0.0444 > 0.01
- `R5-G2`: held-out FAR 95% upper bound 0.0584 > 0.01
- `R6-G2`: held-out FAR 95% upper bound 0.0782 > 0.01

## Breakdowns

### Rx — AND-trigram control
| Dataset | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| d1 | 436 | 100.0% | 100.0% | 0.0% | 14.7% |
| d2 | 372 | 48.4% | 48.4% | 0.0% | 51.6% |
| d3 | 700 | 21.1% | 20.9% | 0.3% | 78.9% |
| Tag | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| clean | 202 | 100.0% | 100.0% | 0.0% | 0.0% |
| dialect | 182 | 0.0% | 0.0% | 0.0% | 100.0% |
| loanword | 65 | 4.6% | 4.6% | 0.0% | 95.4% |
| near_duplicate | 30 | 0.0% | 0.0% | 0.0% | 100.0% |
| out_of_catalog | 34 | 0.0% | 0.0% | 0.0% | 100.0% |

### R0 — current parseOrder matcher
| Dataset | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| d1 | 436 | 97.0% | 97.0% | 0.0% | 9.2% |
| d2 | 372 | 49.2% | 49.2% | 0.0% | 1.3% |
| d3 | 700 | 22.0% | 22.0% | 0.3% | 10.4% |
| Tag | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| clean | 202 | 99.0% | 99.0% | 0.0% | 1.0% |
| dialect | 182 | 1.6% | 1.6% | 0.0% | 1.1% |
| loanword | 65 | 3.1% | 3.1% | 0.0% | 7.7% |
| near_duplicate | 30 | 0.0% | 0.0% | 0.0% | 93.3% |
| out_of_catalog | 34 | 0.0% | 0.0% | 0.0% | 2.9% |


## Paired comparisons

Discordant counts over the held-out lines both rows resolved. `R0 only` means R0 got the line right and the other row did not.

| Comparison | Metric | R0 only | Other only | McNemar p |
|---|---|---|---|---|
| R1 vs R0 | top-1 correct | 2 | 620 | 0.0000 |
| R1 vs R0 | AUTO correct | 9 | 577 | 0.0000 |
| R2 vs R0 | top-1 correct | 2 | 567 | 0.0000 |
| R2 vs R0 | AUTO correct | 6 | 395 | 0.0000 |
| R3 vs R0 | top-1 correct | 2 | 566 | 0.0000 |
| R3 vs R0 | AUTO correct | 20 | 421 | 0.0000 |
| R4 vs R0 | top-1 correct | 0 | 508 | 0.0000 |
| R4 vs R0 | AUTO correct | 1 | 371 | 0.0000 |
| R5 vs R0 | top-1 correct | 0 | 596 | 0.0000 |
| R5 vs R0 | AUTO correct | 2 | 383 | 0.0000 |
| R5w vs R0 | top-1 correct | 0 | 596 | 0.0000 |
| R5w vs R0 | AUTO correct | 2 | 383 | 0.0000 |
| R6 vs R0 | top-1 correct | 0 | 614 | 0.0000 |
| R6 vs R0 | AUTO correct | 2 | 382 | 0.0000 |
| Rx vs R0 | top-1 correct | 34 | 34 | 1.0000 |
| Rx vs R0 | AUTO correct | 34 | 34 | 1.0000 |
| R1-G2 vs R0 | top-1 correct | 2 | 620 | 0.0000 |
| R1-G2 vs R0 | AUTO correct | 7 | 575 | 0.0000 |
| R3-G2 vs R0 | top-1 correct | 2 | 566 | 0.0000 |
| R3-G2 vs R0 | AUTO correct | 7 | 469 | 0.0000 |
| R5-G2 vs R0 | top-1 correct | 0 | 596 | 0.0000 |
| R5-G2 vs R0 | AUTO correct | 0 | 445 | 0.0000 |
| R6-G2 vs R0 | top-1 correct | 0 | 614 | 0.0000 |
| R6-G2 vs R0 | AUTO correct | 2 | 523 | 0.0000 |

## Risk–coverage

Risk at each coverage level for `R0`. Lower is better; a resolver whose confident answers are right stays near zero until coverage approaches 1.

| coverage | risk |
|---|---|
| 5.0% | 9.2% |
| 15.1% | 28.2% |
| 25.0% | 31.0% |
| 35.0% | 34.1% |
| 45.0% | 30.3% |
| 55.0% | 33.5% |
| 65.1% | 40.1% |
| 75.0% | 45.4% |
| 85.0% | 49.5% |
| 95.0% | 52.5% |
| 100.0% | 53.7% |

## Latency

Wall-clock milliseconds per line spent resolving, on the machine above. **This is not the plan’s device budget.**

| Row | ms/line |
|---|---|
| R0 | 78.780 |
| R1 | 33.323 |
| R2 | 0.398 |
| R3 | 0.362 |
| R4 | 0.995 |
| R5 | 2.914 |
| R5w | 2.890 |
| R6 | 4.185 |
| Rx | 0.214 |
| R1-G2 | 34.002 |
| R3-G2 | 0.374 |
| R5-G2 | 2.929 |
| R6-G2 | 4.177 |

## Failure gallery

The worst lines for `R0` on the held-out split.

| line | dataset | gold | decision | top-5 ranked |
|---|---|---|---|---|
| d1-fd-01-0 | d1 | (new) | ASK | — |
| d1-fr-061-0 | d1 | 110 | ASK | — |
| d1-ho-070-0 | d1 | (new) | NEW | — |
| d1-ho-111-0 | d1 | (new) | NEW | — |
| d1-ho-111-1 | d1 | (new) | NEW | — |
| d1-ho-114-0 | d1 | (new) | ASK | — |
| d1-ho-120-0 | d1 | (new) | NEW | — |
| d1-th-005-0 | d1 | 109 | ASK | — |
| d1-th-024-0 | d1 | 110 | ASK | — |
| d1-th-029-0 | d1 | 109 | ASK | — |
| d1-th-059-0 | d1 | 109 | ASK | — |
| d1-th-061-0 | d1 | (new) | NEW | — |
| d1-th-062-0 | d1 | (new) | NEW | — |
| d1-th-063-0 | d1 | (new) | NEW | — |
| d1-th-064-0 | d1 | (new) | NEW | — |
| d1-th-065-0 | d1 | (new) | NEW | — |
| d1-th-065-1 | d1 | (new) | NEW | — |
| d1-th-066-0 | d1 | (new) | NEW | — |
| d1-th-067-0 | d1 | (new) | NEW | — |
| d1-th-068-0 | d1 | (new) | NEW | — |

## Deviations from the plan

- D1 is written reference transcripts, not recorded audio. No audio exists in this repository, so plan section 7.1’s D1 and the whole P5 STT axis (greedy vs beam vs hotwords, silence pad, overlapped processing) could not be run.
- Because an in-catalog D1 span is the catalog name `parseOrder` matched, D1 scores at the ceiling for every resolver. It validates the pipeline and detects regressions; it does not discriminate. D2 carries the discrimination.
- D2 confusion-rule weights are start values, not fitted to real ASR output: fitting them needs D1 transcripts, which do not exist. They are data in `backend/ai/evaluation/voice_order/lib/synth_rules.vi.ts` and are the first thing to re-fit when recordings arrive.
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
- No line in any dataset carries a spoken unit: `line.unit` is null on all 28202. The gate's `unit_ok` feature was therefore `unknown` everywhere and the rule that refuses a unit mismatch never fired, so the ask rate and FAR below are measured with the unit check disabled. They are not the app's numbers, where hearing "chai" against a catalog "lon" is a real case.
- D2 is 96 of 1015 lines a spoken span at least four characters shorter than the catalog name, and 41 of those are an exact truncation of it ("Coca-Cola lon 330ml" heard as "Coca-Cola"). The rest are same-length noise. A resolver that fails only on heavy truncation would score well on D2 on little evidence.

