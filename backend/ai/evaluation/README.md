# AI evaluation

Offline evaluations of the AI features: what each one measures, where its numbers are, and how to rerun it. The features run elsewhere (the agent and its memory in `backend/ai/src/`, the voice-order resolver on the phone in `frontend/mobile/src/lib/resolver/`); evaluations never change them.

| Feature | Directory | Measures | Rerun (details in its README) |
|---|---|---|---|
| Voice order: resolver bake-offs and auto-research | `eval/` at the repository root | Which retrievers, fusion, rerank and gate turn a spoken line into AUTO / ASK / NEW at FAR ≤ 1% | `node eval/search/autoresearch.ts`; reports in `eval/reports/` |
| Voice order: proposed parts | [`voice_order/`](voice_order/README.md) | Alias learning, offline outbox, one sentence traced through the pipeline | `node backend/ai/evaluation/voice_order/alias_stream.ts …` |
| Agent memory recall | `memory_recall/` (PR #346) | Which ranking finds the memory a chat message needs | `uv run python evaluation/memory_recall/autoresearch.py --dense sim` |

## Rules every evaluation here follows

- **Pre-register.** Write the question, metric, seeds, selection rule and success criterion in a `PREREG.md` before running. Record any change made after a test read as a deviation at the end of that file.
- **Dev, then test once.** Tune on dev seeds; read the test seeds once with the frozen choice. A seed that has been read is spent: the next round uses new ones.
- **Report the bound, not only the rate.** Error rates carry a one-sided 95% Clopper–Pearson upper bound; differences between configs carry a paired bootstrap interval where the protocol asks for one.
- **Keep raw results.** Each run writes JSON under its `results/`; reports quote those files.
- **Say what is synthetic.** Every report states whether speech, catalogs, users or embeddings were real or simulated.

## Data the voice evaluations need

`eval/data/` is partly generated and git-ignored. Regenerate it once after a fresh checkout:

```bash
node -e "import('./eval/lib/corpus.ts').then((m) => m.writeDatasets())"
node --test 'eval/tests/*.test.ts'
```

The `prior_*` files cannot be regenerated and stay tracked.
