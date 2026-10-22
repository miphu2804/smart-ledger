# Memory recall benchmark

How well `AgentMemoryRepository.search` finds the owner memory a chat message needs, and the grid search that chose its ranking (cosine + 0.1 × BM25 share, [ADR-0002](../../../../docs/architecture/adr/0002-agent-long-term-memory.md#bổ-sung-xếp-hạng-lai-thay-cho-suy-giảm)).

## Result

Test split, read once, Recall@5 on the 2374 queries that need a memory:

| Ranking | Real embeddinggemma (Workers AI) | Stand-in embedder, real PostgreSQL + `search` |
|---|---|---|
| Before: relevance × importance × decay × (1 + ln use_count) | 0.283 | 0.401 |
| Cosine only | 0.807 | — |
| After: cosine + 0.1 × BM25 / best BM25 | **0.860** | **0.721** |

- With real embeddings the new ranking beats cosine by +0.053 (paired bootstrap 95% CI 0.042–0.064). By query form: exact words 0.951, unaccented 0.899, reworded 0.627; stale-only 0.039 against 0.221 before.
- The old ranking raised `use_count` on every memory it returned, so a few often used memories won every turn: a fact at cosine 0.85 lost to unrelated ones at 0.58 used 30 times.
- `e2e.py` runs the real `search` on PostgreSQL 16 + pgvector 0.8. It returns the same top 5 as the bench's `rank()` on 97.7–98.0% of queries; every other query has the same scores in another order (ties). p95 latency is 18 ms or less per `search` on shops with 120+ memories. Its stand-in embedder (hashed character 3-grams) checks the code, not embedding quality.
- The pre-registered winner (`hybrid rrf k10, floor 0.60`) failed on test (0.230): its floor grid was tuned on simulated cosines, and embeddinggemma's scale is lower. The ranking that shipped is the best dev config without a floor, reported on test beside it as `PREREG.md` required. A floor needs a new round on fresh seeds.

## Files

| File | What it does |
|---|---|
| `PREREG.md` | Splits, selection rule and test protocol, written before any test number |
| `data.py` | Generates shops: 15 / 40 / 120 Vietnamese facts, stale versions, 200 past turns, 60 scored queries in three forms (exact, unaccented, reworded) plus no-memory queries |
| `systems.py` | Dense channels (`SimDense`, `STDense`), BM25 `Lexical`, the `Config` space, `rank()` and metrics |
| `common.py` | The dev/test splits and the evaluator |
| `autoresearch.py` | Grid search (830 configs on the real run: channels, fusion, decay, importance, frequency, additive weights, floor), then coordinate ascent, then the one test read |
| `cloudflare_dense.py` | Real embeddings through Workers AI, cached in `cache/` (git-ignored) |
| `calibrate.py` | Checks `SimDense` against ADR-0002's measured cosines |
| `e2e.py` | The repository's real `search` on PostgreSQL, against the bench |
| `results/` | `sim_*` and `cloudflare_*` (grid search dev and test), `e2e_*` (PostgreSQL runs) |

## Rerun

From `backend/ai`:

```bash
# Grid search on simulated cosines, then the test read (minutes, no network)
uv run python evaluation/memory_recall/autoresearch.py --dense sim
uv run python evaluation/memory_recall/autoresearch.py --dense sim --test

# Real embeddings: needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (env or backend/ai/.env)
uv run python evaluation/memory_recall/autoresearch.py --dense cloudflare
uv run python evaluation/memory_recall/autoresearch.py --dense cloudflare --test

# The real search on PostgreSQL with pgvector, same database as the integration tests
POSTGRES_TEST_URL=postgresql://user:pass@localhost:5432/db \
  uv run python evaluation/memory_recall/e2e.py --hybrid --out evaluation/memory_recall/results/e2e_hybrid.json
```

## Maintaining it

- **Changing the ranking in `src/memory/repository.py`:** mirror it as a `Config` in `systems.py`, run `e2e.py --hybrid` and keep parity at 100% by score, then rerun the grid on `--dense cloudflare`.
- **A new grid round:** the test split (seeds 1001–1008, lexicon half B) has been read. Add fresh seeds and a new lexicon half in `common.SPLITS` and write a new `PREREG.md` before running `--test`.
- **A new embedder:** add a dense class with `scores(query, memories, by_id)` and select it in `autoresearch.make_dense`. Changing the production model also means re-embedding `agent_memories` (see the AI README).
- The data is synthetic Vietnamese shop facts. No real owner's memories were used; the numbers are not product behaviour until the PO approves long-term memory.
