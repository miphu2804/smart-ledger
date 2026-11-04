# Memory evaluation

Scores the agent's long-term memory apart from the chat agent. Today it measures recall only: whether `AgentMemoryService.with_memories` returns the owner memory a chat message needs. Extraction and reconcile are not measured yet; the two `memory_*` cases of [agent_chat](../agent_chat/README.md) check recall end to end. The run calls the shipped service on the local database, so the ranking (`src/memory/ranking.py`, cosine + 0.1 × BM25 share, [ADR-0002](../../../../docs/architecture/adr/0002-agent-long-term-memory.md#bổ-sung-xếp-hạng-lai-thay-cho-suy-giảm)) is the one the app runs, and exits 1 when a metric leaves its bound in `thresholds.toml`. `MemoryEval` in `memory_eval.py` holds this evaluation. The pipeline, targets and metrics are described in the [evaluation README](../README.md).

## Files

| File | What it does |
|---|---|
| `memory_eval.py` | `MemoryEval`: reads `cases.jsonl`, builds one case per query and scores each with `RecallEvaluator` |
| `generate.py` | Generates the shops: 15 / 40 / 120 Vietnamese facts, stale versions, 60 queries per shop in three forms (exact, unaccented, reworded) plus no-memory queries, and writes `cases.jsonl` |
| `cases.jsonl` | The frozen output of `generate.py`, one JSON line per shop (48 shops, 3025 memories) with the 2374 queries that need a memory; the run reads only this file |
| `thresholds.toml` | The minimum or maximum of each gated metric |
| `cache/` | The embedding vectors of every memory and query, one file per model; ignored by Git |

The run creates a made-up owner and shop in the local database for each of the 48 shops (new `users` and `shops` rows), stores the memories through `AgentMemoryRepository.add`, calls `with_memories` for each query and deletes every row it created, also when it fails. It refuses a database that is not on `localhost`, `127.0.0.1` or `::1`. The model is a `TestModel`, because recall makes no model call.

## Metrics

Over the 2374 queries that need a memory, on 48 shops (seeds 1001–1008, lexicon half B):

| Metric | Meaning | 2026-11-04, embeddinggemma-300m |
|---|---|---|
| `recall` | The needed memory is in the top 5 | 0.860 |
| `recall_lex`, `recall_unacc`, `recall_sem` | The same by query form: shares words, typed without diacritics, reworded | 0.951, 0.899, 0.627 |
| `top1` | The needed memory ranks first | 0.504 |
| `stale_only` | The older of two live versions returned without the newer | 0.039 |

These match the numbers ADR-0002 recorded when the ranking was chosen. The old ranking (relevance × importance × decay × use count) scored 0.283 on the same queries and plain cosine 0.807; the grid search that compared them is in PR #346.

## Rerun

From `backend/ai`, with `smartledger-local-db` running and `POSTGRES_URL` in `.env` pointing at it:

```bash
LOG_LEVEL=WARNING uv run python evaluation/run.py memory --gate evaluation/memory/thresholds.toml
```

The vectors come from `cache/`, so a run with a cached model makes no network call. Without a cache file the run embeds about 1,700 texts through the app's configured memory embedder (`AGENT_MEMORY_EMBEDDING_PROVIDER` and `AGENT_MEMORY_EMBEDDING_MODEL` in `.env`, and `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` for the `cloudflare` provider), under a minute on Workers AI, and saves them. Each query is one row of `evaluation/results/memory-<name>.json`.

## Maintaining it

- **Changing the ranking in `src/memory/ranking.py`:** rerun; the service imports it, so there is nothing to mirror. Move a bound in `thresholds.toml` only with the reason in the commit.
- **A new embedding model:** set it in `.env` and rerun; the cache is per model. Changing the production model also means re-embedding `agent_memories` (see the AI README).
- **Changing `generate.py`:** any change to the generator or its random draws changes the queries, so the numbers above stop being comparable; run it, commit the new `cases.jsonl` and record the new numbers here.
- The data is synthetic Vietnamese shop facts. No real owner's memories are used; the numbers are not product behaviour until the PO approves long-term memory.
