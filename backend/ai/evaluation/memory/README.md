# Memory evaluation

Scores the agent's long-term memory apart from the chat agent. Today it measures recall only: whether `AgentMemoryRepository.search` finds the owner memory a chat message needs. Extraction and reconcile are not measured yet; the two `memory_*` cases of [agent_chat](../agent_chat/README.md) check recall end to end. `run.py` embeds synthetic shops with the app's configured memory embedder, ranks them with `src/memory/ranking.py` (cosine + 0.1 × BM25 share, [ADR-0002](../../../../docs/architecture/adr/0002-agent-long-term-memory.md#bổ-sung-xếp-hạng-lai-thay-cho-suy-giảm)) as `search` does, and exits 1 when a metric leaves its bound in `thresholds.toml`.

## Files

| File | What it does |
|---|---|
| `data.py` | Generates shops: 15 / 40 / 120 Vietnamese facts, stale versions, 60 queries per shop in three forms (exact, unaccented, reworded) plus no-memory queries |
| `run.py` | Embeds every memory and query once (cached in `cache/`, ignored by Git), ranks each query, prints the metrics and applies the gate |
| `thresholds.toml` | The minimum or maximum of each gated metric |

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

From `backend/ai`, with `AGENT_MEMORY_EMBEDDING_PROVIDER` and `AGENT_MEMORY_EMBEDDING_MODEL` in `.env` (and `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` for the `cloudflare` provider):

```bash
LOG_LEVEL=WARNING uv run python evaluation/memory/run.py
```

The first run with a model embeds about 1,700 texts (under a minute on Workers AI); later runs read the cache and make no network call.

## Maintaining it

- **Changing the ranking in `src/memory/ranking.py`:** rerun; `run.py` imports it, so there is nothing to mirror. Move a bound in `thresholds.toml` only with the reason in the commit.
- **A new embedding model:** set it in `.env` and rerun; the cache is per model. Changing the production model also means re-embedding `agent_memories` (see the AI README).
- **Changing `data.py`:** any change to the generator or its random draws changes the queries, so the numbers above stop being comparable; record the new ones here.
- The data is synthetic Vietnamese shop facts. No real owner's memories are used; the numbers are not product behaviour until the PO approves long-term memory.
