# LLM escalation of ASK lines — escalation_v1

Measured 2026-10-22 with `eval/escalation/run.ts` on `claude-haiku-5-5` through the AI service's gateway (OpenCode Go, Anthropic Messages API). Resolver: the auto-research v3 winner (E + Q-bm25 + B → pool 10 → E 0.45, P 0.05, T 0.50; G1 sAuto 0.72, mMin 0.1217, agreeMin 1).

## Rule

The gate's AUTO and NEW stand. An ASK line goes to the LLM with its top-5 candidates. A shortlisted id at confidence ≥ 0.8 becomes AUTO, `NONE` becomes NEW, anything else stays ASK. The threshold was fixed before the lockbox was read.

## Lockbox (scored once)

Fresh seed 20261122 for D2 noise, D3 catalogs and out-of-catalog lines (10% of each catalog removed), 700 lines per dataset, resolved in-process with `buildResolver`. 1448 lines escalated, 0 call errors, 1 unparsed reply.

| Set | Mode | correct AUTO | wrong AUTO (FAR) | FAR 95% upper | ASK | NEW | in-catalog → NEW | OOC → NEW | taps/line |
|---|---|---|---|---|---|---|---|---|---|
| all (2100) | gate only | 30.6% | 10 (0.5%) | 0.81% | 69.0% | 0.0% | 0 | 0/700 | 1.13 |
| all (2100) | LLM @0.8 | 55.7% | 190 (9.0%) | 10.14% | 11.1% | 24.2% | 146 | 362/700 | 0.87 |
| d2 (700) | gate only | 72.7% | 0 (0.0%) | 0.43% | 27.3% | 0.0% | 0 | – | 0.27 |
| d2 (700) | LLM @0.8 | 98.0% | 3 (0.4%) | 1.10% | 0.6% | 1.0% | 7 | – | 0.05 |
| d3 (700) | gate only | 19.0% | 0 (0.0%) | 0.43% | 81.0% | 0.0% | 0 | – | 1.11 |
| d3 (700) | LLM @0.8 | 69.0% | 22 (3.1%) | 4.46% | 8.0% | 19.9% | 139 | – | 0.84 |
| ooc (700) | gate only | 0.0% | 10 (1.4%) | 2.41% | 98.6% | 0.0% | 0 | 0/700 | 2.01 |
| ooc (700) | LLM @0.8 | 0.0% | 165 (23.6%) | 26.36% | 24.7% | 51.7% | 0 | 362/700 | 1.72 |

Escalation breaks the 1% FAR budget. The LLM auto-applies the in-catalog sibling of an out-of-catalog item, and picks a size or flavour the speaker never said on D3, at self-reported confidence 0.8–0.97, so confidence is not a usable threshold.

## Latency

| | p50 | p90 | p99 | ≤ 1000 ms |
|---|---|---|---|---|
| thinking off, all 1448 calls | 1327 ms | 2251 ms | 3744 ms | 2.1% |
| thinking off, the 150 sampled lines | 1255 ms | 1686 ms | 2411 ms | 4.0% |
| thinking on (model default), 150 lines | 1527 ms | 2665 ms | 4290 ms | 2.7% |

With thinking off every call reported 0 thinking tokens; with the default 86 of 150 calls used thinking. Picks agreed on 141 of 150 lines. Wall-clock from a dev machine at concurrency 4, not a phone.

## Conclusion

Do not let the LLM auto-apply. A synchronous call does not fit the 1000 ms voice budget either. Reordering the top-3 of an ASK line in the background, or suggesting NEW, would keep the gate's FAR; that is untested.

## Caveats

- A dev-side run on the three fixture catalogs (D1/D2 plus 65 hand-written spoken lines) looked better (dev correct AUTO 84% → 95.7%, FAR 0.2%); that set had been read before and is mostly D2-like, which the lockbox confirms is the only set where escalation holds.
- No recorded speech; the noise is synthetic.
