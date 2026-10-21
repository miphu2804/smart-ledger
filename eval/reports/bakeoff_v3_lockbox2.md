# Voice-order resolver bake-off — bakeoff_v3_lockbox2

Generated 2026-10-21T04:32:09.157Z by `eval/runner/run.ts`.

- Config hash: `263947fb763de61c`
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
| R0 | current parseOrder matcher | G1 | 49.4% | 49.4% | 0.494 | 0.1% | 0.0%–0.3% | 747 | 6.6% | 3.3% | 63.9% | 0.329 | 0.000 |
| R1 | E only | G1 | 95.6% | 91.3% | 0.936 | 2.0% | 1.4%–2.7% | 1250 | 2.8% | 14.4% | 100.0% | 0.016 | 0.000 |
| R2 | Q-cos | G1 | 93.9% | 87.8% | 0.906 | 0.6% | 0.3%–1.1% | 1102 | 14.1% | 13.8% | 86.1% | 0.031 | 0.000 |
| R3 | Q-bm25 | G1 | 94.3% | 87.7% | 0.908 | 0.8% | 0.4%–1.2% | 986 | 36.1% | 0.0% | 0.0% | 0.115 | 0.000 |
| R4 | Q + B, RRF | G1 | 95.6% | 84.2% | 0.899 | 0.5% | 0.2%–0.9% | 501 | 43.6% | 5.4% | 55.6% | 0.047 | 0.000 |
| R5 | E + Q + B, RRF | G1 | 97.9% | 89.9% | 0.938 | 2.1% | 1.4%–2.8% | 1143 | 0.0% | 5.7% | 63.9% | 0.038 | 0.000 |
| R5w | E + Q + B, weighted RRF | G1 | 97.9% | 89.9% | 0.938 | 2.1% | 1.4%–2.8% | 1143 | 0.0% | 5.7% | 63.9% | 0.038 | 0.000 |
| R6 | R5 + P | G1 | 97.3% | 91.0% | 0.941 | 2.1% | 1.4%–2.8% | 1168 | 18.9% | 14.3% | 33.3% | 0.037 | 0.000 |
| Rx | AND-trigram control | G1 | 49.9% | 49.7% | 0.498 | 0.2% | 0.0%–0.5% | 753 | 51.2% | 0.0% | 0.0% | 0.166 | 0.000 |
| R1-G2 | E only, logistic gate | G2 | 95.6% | 91.3% | 0.936 | 3.3% | 2.5%–4.2% | 1352 | 0.8% | 18.3% | 91.7% | 0.016 | 0.045 |
| R3-G2 | Q-bm25, logistic gate | G2 | 94.3% | 87.7% | 0.908 | 4.0% | 3.0%–4.9% | 1303 | 8.7% | 26.2% | 77.8% | 0.115 | 0.036 |
| R5-G2 | E + Q + B, RRF, logistic gate | G2 | 97.9% | 89.9% | 0.938 | 2.1% | 1.4%–2.8% | 1153 | 0.0% | 6.1% | 66.7% | 0.038 | 0.060 |
| R6-G2 | R5 + P, logistic gate | G2 | 97.3% | 91.0% | 0.941 | 2.6% | 1.8%–3.4% | 1156 | 0.0% | 5.9% | 63.9% | 0.037 | 0.066 |

FAR is wrong autos over all lines; the CI is a 95% percentile bootstrap of that rate.

## Selection

- Best held-out recall@3 (R*): **R4** at 95.6%.
- Chosen by the pre-registered rule (simplest within 2 pp recall@3 and 2 pp ask rate of R*): **R4** — Q + B, RRF.
- Its held-out numbers: recall@3 95.6%, top-1 84.2%, FAR 0.5% (95% CI 0.2%–0.9%), ask rate 43.6%, 501 autos.
- Rule-of-three bound on FAR from 501 autos: 0.6%.

Latency: Plan section 7.4 states latency budgets for a low-end Android device. This harness measured Node wall-clock on a developer machine, so no row was excluded for latency; the device budgets remain unmeasured.

Excluded by the false-auto budget:

- `R1`: held-out FAR 95% upper bound 0.0272 > 0.01
- `R2`: held-out FAR 95% upper bound 0.0110 > 0.01
- `R3`: held-out FAR 95% upper bound 0.0123 > 0.01
- `R5`: held-out FAR 95% upper bound 0.0278 > 0.01
- `R5w`: held-out FAR 95% upper bound 0.0278 > 0.01
- `R6`: held-out FAR 95% upper bound 0.0285 > 0.01
- `R1-G2`: held-out FAR 95% upper bound 0.0421 > 0.01
- `R3-G2`: held-out FAR 95% upper bound 0.0492 > 0.01
- `R5-G2`: held-out FAR 95% upper bound 0.0279 > 0.01
- `R6-G2`: held-out FAR 95% upper bound 0.0337 > 0.01

## Breakdowns

### R4 — Q + B, RRF
| Dataset | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| d1 | 440 | 100.0% | 100.0% | 1.4% | 49.8% |
| d2 | 404 | 99.3% | 97.3% | 0.5% | 40.8% |
| d3 | 700 | 91.0% | 67.6% | 0.0% | 41.3% |
| Tag | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| clean | 222 | 100.0% | 100.0% | 0.0% | 72.5% |
| dialect | 194 | 83.0% | 66.0% | 1.0% | 20.1% |
| loanword | 75 | 86.7% | 66.7% | 0.0% | 6.7% |
| near_duplicate | 13 | 0.0% | 0.0% | 15.4% | 53.8% |
| out_of_catalog | 23 | 0.0% | 0.0% | 17.4% | 13.0% |

### R4 — Q + B, RRF
| Dataset | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| d1 | 440 | 100.0% | 100.0% | 1.4% | 49.8% |
| d2 | 404 | 99.3% | 97.3% | 0.5% | 40.8% |
| d3 | 700 | 91.0% | 67.6% | 0.0% | 41.3% |
| Tag | lines | recall@3 | top-1 | FAR | ask rate |
|---|---|---|---|---|---|
| clean | 222 | 100.0% | 100.0% | 0.0% | 72.5% |
| dialect | 194 | 83.0% | 66.0% | 1.0% | 20.1% |
| loanword | 75 | 86.7% | 66.7% | 0.0% | 6.7% |
| near_duplicate | 13 | 0.0% | 0.0% | 15.4% | 53.8% |
| out_of_catalog | 23 | 0.0% | 0.0% | 17.4% | 13.0% |


## Paired comparisons

Discordant counts over the held-out lines both rows resolved. `R0 only` means R0 got the line right and the other row did not.

| Comparison | Metric | R0 only | Other only | McNemar p |
|---|---|---|---|---|
| R1 vs R0 | top-1 correct | 2 | 634 | 0.0000 |
| R1 vs R0 | AUTO correct | 26 | 500 | 0.0000 |
| R2 vs R0 | top-1 correct | 2 | 581 | 0.0000 |
| R2 vs R0 | AUTO correct | 5 | 352 | 0.0000 |
| R3 vs R0 | top-1 correct | 2 | 580 | 0.0000 |
| R3 vs R0 | AUTO correct | 103 | 332 | 0.0000 |
| R4 vs R0 | top-1 correct | 0 | 525 | 0.0000 |
| R4 vs R0 | AUTO correct | 450 | 198 | 0.0000 |
| R5 vs R0 | top-1 correct | 0 | 611 | 0.0000 |
| R5 vs R0 | AUTO correct | 4 | 370 | 0.0000 |
| R5w vs R0 | top-1 correct | 0 | 611 | 0.0000 |
| R5w vs R0 | AUTO correct | 4 | 370 | 0.0000 |
| R6 vs R0 | top-1 correct | 0 | 628 | 0.0000 |
| R6 vs R0 | AUTO correct | 2 | 393 | 0.0000 |
| Rx vs R0 | top-1 correct | 28 | 33 | 0.6089 |
| Rx vs R0 | AUTO correct | 28 | 33 | 0.6089 |
| R1-G2 vs R0 | top-1 correct | 2 | 634 | 0.0000 |
| R1-G2 vs R0 | AUTO correct | 14 | 570 | 0.0000 |
| R3-G2 vs R0 | top-1 correct | 2 | 580 | 0.0000 |
| R3-G2 vs R0 | AUTO correct | 4 | 501 | 0.0000 |
| R5-G2 vs R0 | top-1 correct | 0 | 611 | 0.0000 |
| R5-G2 vs R0 | AUTO correct | 12 | 388 | 0.0000 |
| R6-G2 vs R0 | top-1 correct | 0 | 628 | 0.0000 |
| R6-G2 vs R0 | AUTO correct | 30 | 401 | 0.0000 |

## Risk–coverage

Risk at each coverage level for `R4`. Lower is better; a resolver whose confident answers are right stays near zero until coverage approaches 1.

| coverage | risk |
|---|---|
| 5.1% | 0.0% |
| 15.0% | 3.9% |
| 25.0% | 2.8% |
| 35.0% | 2.2% |
| 45.0% | 2.6% |
| 55.1% | 2.1% |
| 65.0% | 2.4% |
| 75.0% | 4.0% |
| 85.0% | 9.1% |
| 95.0% | 14.4% |
| 100.0% | 17.7% |

## Latency

Wall-clock milliseconds per line spent resolving, on the machine above. **This is not the plan’s device budget.**

| Row | ms/line |
|---|---|
| R0 | 78.506 |
| R1 | 715.329 |
| R2 | 0.612 |
| R3 | 0.513 |
| R4 | 1.401 |
| R5 | 4.174 |
| R5w | 4.098 |
| R6 | 5.931 |
| Rx | 0.305 |
| R1-G2 | 49.129 |
| R3-G2 | 0.496 |
| R5-G2 | 4.084 |
| R6-G2 | 5.839 |

## Failure gallery

The worst lines for `R4` on the held-out split.

| line | dataset | gold | decision | top-5 ranked |
|---|---|---|---|---|
| d1-ho-087-2 | d1 | (new) | NEW | — |
| d1-qc-038-0 | d1 | (new) | ASK | 307, 308 |
| d1-qc-039-0 | d1 | (new) | NEW | 315 |
| d1-qc-040-0 | d1 | (new) | NEW | 307, 305 |
| d1-qc-041-0 | d1 | (new) | NEW | 306, 302 |
| d1-qc-042-0 | d1 | (new) | NEW | 317, 313 |
| d1-qc-043-0 | d1 | (new) | AUTO | 301 |
| d1-qc-044-0 | d1 | (new) | ASK | 306, 305, 315 |
| d1-qc-045-0 | d1 | (new) | ASK | 310, 311, 307, 317 |
| d1-qc-046-0 | d1 | (new) | ASK | 314, 311 |
| d1-qc-047-0 | d1 | (new) | AUTO | 306, 302 |
| d1-qc-048-0 | d1 | (new) | NEW | 307, 305 |
| d1-qc-049-0 | d1 | (new) | ASK | 318, 302, 303, 301, 313 |
| d1-qc-050-0 | d1 | (new) | ASK | 313, 303, 308, 318 |
| d1-h3-030-1 | d1 | (new) | AUTO | 308, 307, 313, 303 |
| d2-h3-013-1 | d2 | 313 | AUTO | 316, 314, 313 |
| d2-h3-031-1 | d2 | 316 | AUTO | 313, 303, 318, 308 |
| d1-ho-070-0 | d1 | (new) | NEW | 109, 110 |
| d1-ho-111-0 | d1 | (new) | NEW | — |
| d1-ho-111-1 | d1 | (new) | NEW | — |

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
- No line in any dataset carries a spoken unit: `line.unit` is null on all 28202. The gate's `unit_ok` feature was therefore `unknown` everywhere and the rule that refuses a unit mismatch never fired, so the ask rate and FAR below are measured with the unit check disabled. They are not the app's numbers, where hearing "chai" against a catalog "lon" is a real case.
- Measured on `eval/data/splits_lockbox2.json`, a second holdout drawn from the same families rather than the frozen `splits.json`. Section 9B.3 evaluates a lockbox once, and the first holdout has now been read by bakeoff_v1 and bakeoff_v2, so confirming anything formed from those runs needs a holdout they never saw. It is a fresh partition of the same data, not fresh data. The split function and its seed are in `eval/lib/corpus.ts`.
- D2 is 96 of 1015 lines a spoken span at least four characters shorter than the catalog name, and 41 of those are an exact truncation of it ("Coca-Cola lon 330ml" heard as "Coca-Cola"). The rest are same-length noise. A resolver that fails only on heavy truncation would score well on D2 on little evidence.

