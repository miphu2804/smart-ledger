"""Run `AgentMemoryRepository.search` on real PostgreSQL + pgvector over the bench's
test shops, and check it against the bench's own `rank()`.

    cd backend/ai
    POSTGRES_TEST_URL=postgresql://user:pass@localhost:5432/db \
        uv run python evaluation/memory_recall/e2e.py --hybrid --out results/x.json

`--hybrid` passes the message text to `search` (this branch's signature) and checks
parity with the bench's hybrid config; without it the script runs an older `search`
that takes no text, for a baseline from another checkout. The database needs the
`vector` extension; each run uses a throwaway schema.

Embeddings are a local stand-in (signed hashed character 3-grams), so this checks
the code path and its ranking, not embedding quality: use `autoresearch.py --dense
cloudflare` for that.
"""

import argparse
import hashlib
import json
import math
import os
import sys
import time
import uuid

import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

HERE = os.path.dirname(os.path.abspath(__file__))
AI_ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path[:0] = [HERE, AI_ROOT]

from common import shops  # noqa: E402
from systems import Config, Lexical, metrics, rank  # noqa: E402
from tests.support import (  # noqa: E402
    REPO_ROOT,
    apply_ai_baseline,
    apply_core_migrations,
)

from src.agent.repository import AgentConversationRepository  # noqa: E402
from src.infra.postgre_db_client import PostgreDBClient  # noqa: E402
from src.memory.repository import AgentMemoryRepository  # noqa: E402

DIMS = 384
MIGRATIONS = [
    "20261014000000_agent_memories.sql",
    "20261015000000_agent_memory_visibility.sql",
]
HYBRID = Config(
    name="hybrid",
    channels="hybrid",
    fusion="mix",
    mix_alpha=0.1,
    weight="none",
    use_importance=False,
    freq="none",
)


def embed(text: str) -> list[float]:
    """Signed hashed character 3-grams, L2-normalised."""
    vector = [0.0] * DIMS
    padded = f"  {text.lower()}  "
    for i in range(len(padded) - 2):
        digest = hashlib.blake2b(padded[i : i + 3].encode(), digest_size=8).digest()
        h = int.from_bytes(digest, "big")
        vector[h % DIMS] += 1.0 if (h >> 32) & 1 else -1.0
    norm = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / norm for x in vector]


class HashDense:
    """The bench's dense channel over the same stand-in vectors."""

    def scores(self, query, memories, by_id):
        q = embed(query.text)
        return {m.id: sum(a * b for a, b in zip(q, embed(m.content))) for m in memories}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--hybrid", action="store_true")
    args = parser.parse_args()

    url = os.environ["POSTGRES_TEST_URL"]
    schema = f"e2e_{uuid.uuid4().hex[:8]}"
    admin = psycopg.connect(url, autocommit=True)
    admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    admin.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
    apply_core_migrations(admin)
    apply_ai_baseline(admin, f"{schema}_read")
    path = f"{schema},public"
    admin.execute(f"SET search_path TO {path}")
    for name in MIGRATIONS:
        migration = REPO_ROOT / "supabase/migrations" / name
        admin.execute(migration.read_text(), prepare=False)
    database = make_url(url).update_query_dict({"options": f"-c search_path={path}"})
    postgres = PostgreDBClient(database.render_as_string(hide_password=False))
    try:
        result = run(admin, postgres, args.hybrid)
    finally:
        postgres.close()
        for name in (schema, f"{schema}_read"):
            admin.execute(
                sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(name))
            )
    json.dump(result, open(args.out, "w"), indent=1)
    print(json.dumps({k: v for k, v in result.items() if k != "latency_ms"}, indent=1))


def run(admin, postgres, hybrid: bool) -> dict:
    """Replay each test shop's history, then score its queries."""
    repository = AgentMemoryRepository(postgres)
    conversations = AgentConversationRepository(postgres)
    dense = HashDense()
    records, parity, latencies = [], [], []
    for n, shop in enumerate(shops("test")):
        user, shop_id = owner(admin, n)
        conversation, _ = conversations.save_exchange(
            user_id=user,
            shop_id=shop_id,
            conversation_id=None,
            user_message="q",
            assistant_message="a",
        )
        bench_id = {}
        for m in shop.memories:
            row = admin.execute(
                "INSERT INTO agent_memories (shop_id, user_id, source_conversation_id,"
                " memory_type, content, embedding, importance, created_at)"
                " VALUES (%s, %s, %s, %s, %s, %s::vector, %s,"
                " NOW() - make_interval(secs => %s)) RETURNING id",
                (
                    shop_id,
                    user,
                    conversation,
                    m.memory_type,
                    m.content,
                    str(embed(m.content)),
                    m.importance,
                    -m.created_day * 86400,
                ),
            ).fetchone()
            bench_id[row[0]] = m.id

        def search(text: str) -> list[int]:
            extra = {"text": text} if hybrid else {}
            started = time.perf_counter()
            found = repository.search(shop_id, user, embed(text), 5, **extra)
            elapsed = (time.perf_counter() - started) * 1000
            latencies.append((len(shop.memories), elapsed))
            return [bench_id[memory.id] for memory in found]

        # Use counts come from the code under test, as in production.
        for query in shop.history:
            search(query.text)
        lexical = Lexical(shop.memories)
        by_id = {m.id: m for m in shop.memories}
        for query in shop.queries:
            found = search(query.text)
            records.append((query, found))
            if hybrid:
                expected = rank(HYBRID, query, shop.memories, by_id, dense, lexical, 0)
                parity.append(found == expected)

    result = metrics(records)
    # Rows that differ hold memories with equal scores in a different order.
    result["parity"] = sum(parity) / len(parity) if parity else None
    result["latency_ms"] = {}
    for size in sorted({size for size, _ in latencies}):
        ms = sorted(elapsed for s, elapsed in latencies if s == size)
        result["latency_ms"][size] = {
            "p50": ms[len(ms) // 2],
            "p95": ms[int(len(ms) * 0.95)],
            "n": len(ms),
        }
    return result


def owner(admin, n: int) -> tuple[int, int]:
    """A fresh user and shop, so each bench shop is its own owner."""
    user = admin.execute(
        "INSERT INTO users (display_name) VALUES (%s) RETURNING id", (f"u{n}",)
    ).fetchone()[0]
    shop = admin.execute(
        "INSERT INTO shops (owner_id, name, industry)"
        " VALUES (%s, %s, 'Retail') RETURNING id",
        (user, f"s{n}"),
    ).fetchone()[0]
    return user, shop


if __name__ == "__main__":
    main()
