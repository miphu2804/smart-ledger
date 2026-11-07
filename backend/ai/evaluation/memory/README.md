# Memory evaluation

Checks that memory recall (`AgentMemoryService.with_memories`) finds the fact a chat message needs. It runs the real service on the local database, so it scores the ranking the app ships (`src/memory/ranking.py`).

## Run

From `backend/ai`, with `smartledger-local-db` running and `POSTGRES_URL` in `.env` pointing at it:

```bash
uv run evaluation/run.py memory
```

It takes about 30 seconds and asks no model. The first run on a new embedding model embeds about 1,700 texts through the embedder set in `.env` and saves them in `cache/`; later runs make no network call.

The run creates made-up owners and shops in the local database and deletes them at the end, even when it fails.

## Files

| File | What it does |
|---|---|
| `cases.jsonl` | 48 made-up shops with 3025 memories and 2374 queries; the run reads only this file |
| `generate.py` | Writes `cases.jsonl`; run it only when you change the test data |
| `memory_eval.py` | `MemoryEval`: turns each query into a case and scores it with `RecallEvaluator` |
| `thresholds.toml` | The bounds of each checked metric |
| `cache/` | Saved embedding vectors, one file per model; not committed |

## Metrics

| Metric | Meaning | Last result (2026-11-04, embeddinggemma-300m) |
|---|---|---|
| `recall` | The needed memory is in the top 5 | 0.860 |
| `recall_lex` | The same, when the query shares words with the memory | 0.951 |
| `recall_unacc` | The same, when the query is typed without diacritics | 0.899 |
| `recall_sem` | The same, when the query is reworded | 0.627 |
| `top1` | The needed memory ranks first | 0.504 |
| `stale_only` | Only the old version of an updated fact came back (lower is better) | 0.039 |

How the ranking was chosen is in [ADR-0002](../../../../docs/architecture/adr/0002-agent-long-term-memory.md#addition-hybrid-ranking-instead-of-decay).

## Good to know

- **Changed the ranking:** just rerun; the evaluation calls the real service.
- **New embedding model:** set it in `.env` and rerun; the cache is per model.
- **Changed `generate.py`:** run `uv run evaluation/memory/generate.py`, commit the new `cases.jsonl` and update the table above, because the old numbers no longer compare.
- The data is synthetic. These numbers measure retrieval quality on synthetic data, not production behaviour.
