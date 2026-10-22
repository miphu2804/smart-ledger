# Voice-order evaluation

Everything that measures the voice-order resolver: the bake-offs and auto-research that chose its retrievers, rerank and gate, tests of the proposed parts that are not in the app yet, and a step-by-step trace of one spoken order through the real parser and resolver. The resolver itself lives in `frontend/mobile/src/lib/resolver/` because it runs on the phone; this directory imports it and never changes it.

Everything here runs on synthetic data: fixture and generated catalogs, synthetic ASR noise, simulated users. No recorded speech, no real shop, no phone.

## Findings

| Part | Result (test seeds, read once) | Recommendation |
|---|---|---|
| Learned alias table | Correct AUTO 56.8% → 71.2% with trust after 2 confirmations; FAR 0.10% (95% upper bound 0.20%); taps per line 0.58 → 0.43 | Ship with `aliasMinConfirmations: 2` |
| Offline outbox for new products | Re-reading the catalog before retrying a timed-out create: 0 duplicates, 0 lost, 14 wrong merges in 6016 creates. Blind retry: 625 duplicates | Works on today's Core; `Idempotency-Key` on `POST /products` is the clean fix (a Core change) |
| Haiku correcting the draft | Not re-run. `reports/escalation_v1.md`: auto-applying ASK lines raises FAR 0.5% → 9.0%, p50 1.3 s | Do not let it auto-apply |
| One sentence through the pipeline | `reports/pipeline-walkthrough.html` (seed 4180) | Two parser bugs found, below |

### Alias table

Each shop speaks an 800-line stream (Zipf popularity, one habitual spoken form per item used half the time, 10% of items missing from the catalog). The user picks the gold item on ASK lines (mis-tap 2%) and corrects half of the wrong AUTO lines; each pick goes through `upsertAlias`. Only lines 401–800 are scored, against the same stream without learning. Resolver: the auto-research v3 winner (`pipeline.ts`), no seed aliases. Dev seeds 20261401–03, test 20261411–13, five catalogs each.

| Arm (test, habitual form 50%) | Correct AUTO | FAR (95% UB) | Wrong AUTO via alias | ASK | Taps/line |
|---|---|---|---|---|---|
| No learning | 56.8% | 0.03% (0.10%) | 0 | 43.2% | 0.58 |
| Trust after 1 (PREREG pick) | 71.3% | 0.10% (0.20%) | 4 | 28.6% | 0.43 |
| Trust after 2 | 71.2% | 0.10% (0.20%) | 0 | 28.7% | 0.43 |
| Trust after 3 | 71.0% | 0.08% (0.18%) | 0 | 28.9% | 0.43 |

The gain holds on every seed (56.5→67.4, 49.4→66.4, 64.6→80.2 for trust after 1) and grows with how often a shop repeats its own wording: +8.5 points at 20% habitual, +21.3 at 80%. Almost all of it comes from indexing the learned phrase into the retrievers, not from letting a trusted alias skip the gate, which is why trust after 2 costs only 0.1 point. Not measured: storing aliases in PostgreSQL and merging corrections from several devices.

### Offline outbox

`POST /products` takes no `Idempotency-Key` and product names are not unique ([API contract](../../../../docs/contracts/api-contracts.md), section 0 and barcode CORE-012). The simulation fakes Core with those rules, loses 10% of requests before Core and 10% of responses after Core applied them, adds offline windows, and runs two devices of one shop for 500 actions each over 10 seeds.

| Strategy | Duplicates from retries | Lost actions | Wrong merges | Same item from two devices merged |
|---|---|---|---|---|
| S0 today: direct call, one manual retry | 424 | 1725 | 0 | 0 |
| S1 outbox, blind retry | 625 | 0 | 0 | 0 |
| S2 outbox, read back by normalized name before retrying | 0 | 0 | 14 | 11 |
| S3 outbox with `Idempotency-Key` on product create (needs Core) | 0 | 0 | 0 | 0 |

S2 adopts a product only if its id was not in the local replica when the action was queued; every wrong merge is another device creating a different product with the same name in that window. Expenses already carry a key, so none was written twice. `docs/product` has no offline requirement yet.

### Bugs the trace found

- Seed 3605, “cho năm Bia Sài Gòn ron 330ml với một Gáo támthơm 5kg”: `parseOrder` drops the beer line entirely, probably because “năm” is both a number and part of a product name (inferred, not traced in the parser).
- Seed 12123, “với ba Banh Chocopie hổp 12 cai”: quantity 12 instead of 3; the parser reads the number inside the product name.
- The parser strips the size, so “50ml” and “500ml” of one product become the same span. The gate needs a size check when a shop sells several sizes.

## Files

| File | What it does |
|---|---|
| `lib/` | Corpus and synthetic ASR noise, metrics and Clopper–Pearson bounds, gate fitting, the R0 baseline |
| `runner/` | Bake-off harness, report writer, the real-data runner (`data/real/README.md`) |
| `search/` | Auto-research over the frozen search space in `configs/` |
| `escalation/` | LLM escalation of ASK lines (`reports/escalation_v1.md`) |
| `configs/` | Frozen selection rule and auto-research protocols |
| `data/` | Prior catalogs and labelled lines (tracked), generated splits (git-ignored, see Rerun) |
| `tests/` | Unit tests of the harness (`node --test`) |
| `notes/` | Research notes and the briefs of the earlier rounds |
| `reports/` | Bake-off, auto-research and escalation reports, the resolver explainer and the walkthrough |
| `PREREG.md` | Questions, metrics, seeds and success criteria, written before the runs; deviations at the end |
| `pipeline.ts` | The resolver config and gate the experiments share (auto-research v3 winner) |
| `alias_stream.ts` | Alias learning over simulated shop streams |
| `offline_outbox.py` | Outbox strategies against a fake Core that follows the contract |
| `trace_utterance.ts` | One random spoken order through `parseOrder` and the resolver, every intermediate value |
| `results/` | Raw outputs of the runs above |
| `reports/pipeline-walkthrough.html` | The pipeline diagram with the traced sentence and the source of each method |

## Rerun

From the repository root (Node 22 runs the TypeScript directly; `uv` from `backend/ai`):

```bash
# Once after a fresh checkout: generate the git-ignored data, then test the harness
node -e "import('./backend/ai/evaluation/voice_order/lib/corpus.ts').then((m) => m.writeDatasets())"
node --test 'backend/ai/evaluation/voice_order/tests/*.test.ts'

# Auto-research (writes a report into reports/; read the protocol in configs/ first)
node backend/ai/evaluation/voice_order/search/autoresearch.ts --protocol backend/ai/evaluation/voice_order/configs/autoresearch_protocol_v3.json

# Alias learning: dev, then the test seeds (about 1.5 min each)
node backend/ai/evaluation/voice_order/alias_stream.ts --seeds 20261401,20261402,20261403 --habit 0.5 \
  --out backend/ai/evaluation/voice_order/results/alias_dev_h0.5.json
node backend/ai/evaluation/voice_order/alias_stream.ts --seeds 20261411,20261412,20261413 --habit 0.5 \
  --out backend/ai/evaluation/voice_order/results/alias_test_h0.5.json

# Outbox simulation (seconds)
(cd backend/ai && uv run python evaluation/voice_order/offline_outbox.py)

# Trace: a fixed sentence, or drop --seed for a new random one
node backend/ai/evaluation/voice_order/trace_utterance.ts --seed 4180
```

## Maintaining it

- **The resolver config changes** (a new auto-research winner): update `pipeline.ts`, rerun the alias stream on dev, and regenerate the trace and the walkthrough numbers.
- **New seeds:** the test seeds above have been read. Seeds already used across the voice work: 20261024, 20261101–08, 20261111–13, 20261122, 20261201–03, 20261301–02, 20261401–03, 20261411–13 (as recorded in the reports; check `reports/` before reusing one). Pick unused ones and write the PREREG first.
- **Real data:** when recorded shop speech or real correction logs exist, replace the simulated user (`replay` in `alias_stream.ts`) with the logged picks before trusting the alias numbers.
- **The walkthrough** is static HTML; every number in it is in `results/trace_4180.json`. After a resolver change, rerun the trace and update the step tables.
