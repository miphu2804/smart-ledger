# Pre-registration: testing the proposed (dashed) parts of the pipeline

Written 2026-10-22 before any of these experiments was run. Nothing below is changed after a test number is read; any later change is reported as a deviation.

## A. Learned alias table (voice resolver)

Question: how much does learning aliases from the shop's own corrections raise correct AUTO, and at what FAR, under the v3 winner resolver?

- Resolver: autoresearch v3 winner (E + Q-bm25 + B, RRF k 60, pool 10, rerank E 0.45 / P 0.05 / T 0.50, topK 5), G1 sAuto 0.72, mMin 0.1217, agreeMin 1, sFloor -inf. No seed aliases, so every alias is learned.
- Shop simulation: catalogs = the 3 prior catalogs + D3 100 + D3 1000 from `lockboxData(seed)`. Per catalog, 10% of items (seeded hash) are out of catalog: the shop asks for them but the resolver's catalog lacks them. Item popularity is Zipf (s = 1) over a seeded shuffle. Each item has one habitual spoken form, `synthesize(name)` with a per-item seed; each utterance uses the habitual form with probability `pHabit`, otherwise a fresh `synthesize` draw. 800 utterances per catalog.
- User model (fixed): ASK → the user picks the gold item (from top-3 if there, else by search) and that pick is confirmed as an alias; with probability 0.02 the user mis-taps a different top-3 candidate, and that wrong pick is confirmed instead. Wrong AUTO → noticed with probability 0.5, corrected to gold and confirmed. Out-of-catalog lines never teach an alias. Correct AUTO teaches nothing.
- Arms: L0 no learning; L1 / L2 / L3 = existing `AliasTable` with `aliasMinConfirmations` 1 / 2 / 3.
- Metrics on the held-out tail (utterances 401-800 of each stream; the first 400 are warm-up): correct AUTO share, FAR = wrong AUTO / lines with a one-sided 95% Clopper-Pearson upper bound, taps per line (AUTO 0, ASK with gold in top-3 1, ASK otherwise 2, NEW 2, wrong AUTO noticed 2 / unnoticed 0 but counted in FAR), and wrong AUTO through an alias.
- Primary `pHabit` = 0.5; sensitivity 0.2 and 0.8, reported but not used to choose.
- Dev seeds 20261401-20261403. Choose the arm with the most correct AUTO subject to FAR upper bound ≤ 1% (pooled over dev seeds, `pHabit` 0.5); ties go to the larger minimum.
- Test seeds 20261411-20261413, read once: chosen arm vs L0, pooled and per seed.
- Success: chosen arm gains ≥ 5 points of correct AUTO over L0 on test with FAR upper bound ≤ 1%.

Part B (memory recall in `backend/ai`) moved to `../memory_recall/`.

## C. Local catalog replica + offline outbox (simulation, Core unchanged)

Question: can product creation queued offline be replayed without duplicate products, given that `POST /products` has no `Idempotency-Key` and product names are not unique (verified in `docs/contracts/api-contracts.md`)?

- Fake Core implementing the contract's relevant behavior: product create is not idempotent; names are not unique; expense create honours `Idempotency-Key`. Faults per request: 10% lost before Core, 10% applied but response lost, plus offline windows.
- Workload: 2 devices of one shop, 500 intents each (new product from a NEW voice line, an order line referencing that product, expense), 5% of new-product intents on device 2 share a name with a concurrent device-1 intent (a real second product the shop wants, or the same one: half each, labelled).
- Strategies: S0 today (direct call; on error the user retries by hand, modelled as one retry); S1 outbox with client temp ids and blind retry; S2 outbox + before retrying an ambiguous create, read `GET /products?q=` and adopt a product whose normalized name matches and whose id was not in the local replica when the intent was queued; S3 outbox + `Idempotency-Key` on product create (needs a Core change; reference only).
- Metrics: duplicate products, lost intents, order lines pointing at a temp id that never resolved, false merges (S2 adopting another device's product that was meant to be distinct).
- Success: S2 has 0 duplicates and 0 lost intents; false merges are reported, not hidden.
- 10 seeds (1-10); there is nothing tuned, so no dev/test split.

## D. Haiku correction branch

`backend/ai/evaluation/voice_order/reports/escalation_v1.md` (PR #345) already measured Haiku auto-applying ASK lines on a fresh lockbox: FAR 0.5% → 9.0%, p50 1.3 s. Re-ranking the top-3 instead needs the per-line LLM picks; if that output file still exists it is re-scored offline (top-1-of-ASK accuracy, gate order vs LLM pick first), otherwise this part is reported as not run.

## Deviations, recorded after the test read

- A: the rule picked L1 (trust after 1 confirmation). The report recommends L2: it loses 0.1 point of correct AUTO and has no wrong AUTO through an alias, while all 4 of L1's came from one mis-tap being trusted at once.
- D: the per-line LLM picks were not found, so the re-ranking variant was not run.
- C: the first scoring missed one kind of duplicate. When S2 adopts another device's product after its own timed-out create had landed, its own copy is left orphaned; the per-intent count did not see it. Rescored with `orphaned_by_adoption` (code unchanged otherwise): S2 has 9 orphaned copies in 6016 creates, so the success rule "S2 has 0 duplicates" is not met. Other numbers are unchanged.
