"""Score the shipped memory ranking on synthetic shops and gate it on minimums.

Each query and memory is embedded by the app's configured memory embedder, ranked by
`src/memory/ranking.py` exactly as `AgentMemoryRepository.search` ranks it, and
scored on whether the memory the query needs is in the top `LIMIT`. Vectors are
cached in `cache/`, so only the first run with a given model calls the provider.
"""

import asyncio
import json
import math
import sys
import tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))

from evaluation.memory.data import Query, Shop, build  # noqa: E402

from src.app_config import app_config  # noqa: E402
from src.main import build_memory_embedder  # noqa: E402
from src.memory import ranking  # noqa: E402

# The memories a chat turn injects (`AgentMemoryService` asks `search` for 5).
LIMIT = 5
# The split held out while the ranking was chosen (ADR-0002): seeds 1001-1008 on the
# half B lexicon, so a run compares with the ADR's numbers.
SHOPS = [
    build(seed, "B", size, max_age=age)
    for seed in range(1001, 1009)
    for size in (15, 40, 120)
    for age in (30.0, 180.0)
]
FORMS = ("lex", "unacc", "sem")
BATCH = 50


def main() -> None:
    vectors = asyncio.run(embed_all())
    results = [
        (query, recall(shop, query, vectors))
        for shop in SHOPS
        for query in shop.queries
        if query.gold is not None
    ]
    scores = metrics(results)
    print(json.dumps(scores, indent=1))
    thresholds = tomllib.loads((HERE / "thresholds.toml").read_text())
    failures = gate_failures(scores, thresholds)
    for failure in failures:
        print(f"gate: {failure}", file=sys.stderr)
    sys.exit(1 if failures else 0)


async def embed_all() -> dict[str, list[float]]:
    """Unit vectors keyed "q|<query>" and "d|<memory>", embedded once per model."""
    model = app_config.AGENT_MEMORY_EMBEDDING_MODEL
    cache = HERE / "cache" / f"{model.replace('/', '_').lstrip('@')}.json"
    vectors = json.loads(cache.read_text()) if cache.exists() else {}
    wanted = {f"d|{m.content}" for shop in SHOPS for m in shop.memories}
    wanted |= {f"q|{q.text}" for shop in SHOPS for q in shop.queries}
    missing = sorted(wanted - vectors.keys())
    if not missing:
        return vectors
    embedder = build_memory_embedder()
    if embedder is None:
        raise SystemExit("no memory embedder: check AGENT_MEMORY_EMBEDDING_* in .env")
    for kind, embed in (("d", embedder.embed_documents), ("q", embedder.embed_query)):
        keys = [key for key in missing if key[0] == kind]
        for start in range(0, len(keys), BATCH):
            batch = keys[start : start + BATCH]
            result = await embed([key[2:] for key in batch])
            for key, vector in zip(batch, result.embeddings):
                vectors[key] = unit(vector)
            print(f"embedded {len(vectors)}/{len(wanted)}", file=sys.stderr)
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps(vectors))
    return vectors


def recall(shop: Shop, query: Query, vectors: dict[str, list[float]]) -> list[int]:
    """The ids `search` would return for `query`, as `_searched` computes them."""
    question = vectors[f"q|{query.text}"]
    relevance = {
        memory.id: sum(a * b for a, b in zip(question, vectors[f"d|{memory.content}"]))
        for memory in shop.memories
    }
    lexical = ranking.bm25(query.text, ((m.id, m.content) for m in shop.memories))
    return ranking.rank(relevance, lexical)[:LIMIT]


def metrics(results: list[tuple[Query, list[int]]]) -> dict[str, float]:
    """Recall@LIMIT overall and by query form, top-1, and the stale-only rate.

    Stale-only counts the queries whose fact has two live versions and that got the
    older one without the newer, so the agent would answer from outdated memory.
    """
    scores = {"queries": len(results)}
    scores["recall"] = share(query.gold in found for query, found in results)
    for form in FORMS:
        scores[f"recall_{form}"] = share(
            query.gold in found for query, found in results if query.form == form
        )
    scores["top1"] = share(found[:1] == [query.gold] for query, found in results)
    scores["stale_only"] = share(
        query.stale in found and query.gold not in found
        for query, found in results
        if query.stale is not None
    )
    return scores


def gate_failures(scores: dict[str, float], thresholds: dict) -> list[str]:
    """Each metric below its minimum or above its maximum in `thresholds.toml`."""
    failures = [
        f"{name} {scores[name]:.3f} < {limit}"
        for name, limit in thresholds.get("minimum", {}).items()
        if scores[name] < limit
    ]
    failures += [
        f"{name} {scores[name]:.3f} > {limit}"
        for name, limit in thresholds.get("maximum", {}).items()
        if scores[name] > limit
    ]
    return failures


def share(flags) -> float:
    flags = list(flags)
    return sum(flags) / len(flags) if flags else math.nan


def unit(vector: list[float]) -> list[float]:
    """`vector` scaled to length 1, so a dot product is the cosine pgvector uses."""
    norm = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / norm for x in vector]


if __name__ == "__main__":
    main()
