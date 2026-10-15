import os
import uuid
from collections.abc import Iterator

import psycopg
import pytest
from psycopg import sql
from sqlalchemy.engine import make_url
from tests.support import REPO_ROOT, apply_ai_baseline, apply_core_migrations

from src.agent.repository import AgentConversationRepository
from src.infra.postgre_db_client import PostgreDBClient
from src.memory.repository import AgentMemoryRepository, NewMemory

MEMORY_MIGRATION = REPO_ROOT / "supabase/migrations/20261014000000_agent_memories.sql"


def vector(*head: float) -> list[float]:
    """A 384-dimension vector, the migration's size, led by `head`."""
    return [*head, *([0.0] * (384 - len(head)))]


def memory(content: str, *head: float) -> NewMemory:
    return NewMemory("semantic", content, 0.5, vector(*head))


@pytest.fixture
def memory_db() -> Iterator[tuple[psycopg.Connection, PostgreDBClient, dict]]:
    database_url = os.getenv("POSTGRES_TEST_URL")
    if not database_url:
        pytest.skip("set POSTGRES_TEST_URL to run PostgreSQL memory tests")

    schema = f"agent_memory_{uuid.uuid4().hex}"
    admin = psycopg.connect(database_url, autocommit=True)
    postgres = None
    try:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        admin.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
        apply_core_migrations(admin)
        apply_ai_baseline(admin, f"{schema}_read")
        # The vector type lives wherever the extension was first created.
        vector_schema = admin.execute(
            "SELECT extnamespace::regnamespace::text FROM pg_extension"
            " WHERE extname = 'vector'"
        ).fetchone()[0]
        search_path = f"{schema},{vector_schema}"
        admin.execute(f"SET search_path TO {search_path}")
        admin.execute(MEMORY_MIGRATION.read_text(), prepare=False)

        ids = {}
        for name in ("a", "b"):
            ids[f"user_{name}"] = admin.execute(
                "INSERT INTO users (display_name) VALUES (%s) RETURNING id", (name,)
            ).fetchone()[0]
            ids[f"shop_{name}"] = admin.execute(
                "INSERT INTO shops (owner_id, name, industry)"
                " VALUES (%s, %s, 'Retail') RETURNING id",
                (ids[f"user_{name}"], name),
            ).fetchone()[0]

        url = make_url(database_url).update_query_dict(
            {"options": f"-c search_path={search_path}"}
        )
        postgres = PostgreDBClient(url.render_as_string(hide_password=False))
        yield admin, postgres, ids
    finally:
        if postgres is not None:
            postgres.close()
        try:
            for name in (schema, f"{schema}_read"):
                admin.execute(
                    sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                        sql.Identifier(name)
                    )
                )
        finally:
            admin.close()


def new_conversation(postgres: PostgreDBClient, user_id: int, shop_id: int) -> int:
    conversation_id, _ = AgentConversationRepository(postgres).save_exchange(
        user_id=user_id,
        shop_id=shop_id,
        conversation_id=None,
        user_message="q",
        assistant_message="a",
    )
    return conversation_id


def test_search_ranks_by_cosine_and_stays_in_the_owner_scope(memory_db) -> None:
    admin, postgres, ids = memory_db
    memories = AgentMemoryRepository(postgres)
    conversation_a = new_conversation(postgres, ids["user_a"], ids["shop_a"])
    conversation_b = new_conversation(postgres, ids["user_b"], ids["shop_b"])
    memories.add(
        ids["shop_a"],
        ids["user_a"],
        conversation_a,
        [memory("gạo chú Tư", 1, 0), memory("đóng cửa 22h", 0, 1)],
    )
    memories.add(
        ids["shop_b"], ids["user_b"], conversation_b, [memory("gạo shop B", 1, 0)]
    )
    admin.execute(
        "INSERT INTO agent_memories (shop_id, user_id, source_conversation_id,"
        " memory_type, content, embedding, expires_at)"
        " VALUES (%s, %s, %s, 'semantic', 'gạo cũ', %s::vector,"
        " NOW() - INTERVAL '1 day')",
        (ids["shop_a"], ids["user_a"], conversation_a, str(vector(1, 0))),
    )

    found = memories.search(ids["shop_a"], ids["user_a"], vector(1, 0.1), 5)

    # Shop B's identical fact and the expired one never come back.
    assert [item.content for item in found] == ["gạo chú Tư", "đóng cửa 22h"]
    assert found[0].relevance > found[1].relevance
    assert memories.search(ids["shop_a"], ids["user_b"], vector(1, 0), 5) == []


def test_deleting_a_conversation_forgets_its_memories(memory_db) -> None:
    _, postgres, ids = memory_db
    memories = AgentMemoryRepository(postgres)
    conversation_id = new_conversation(postgres, ids["user_a"], ids["shop_a"])
    memories.add(
        ids["shop_a"], ids["user_a"], conversation_id, [memory("gạo chú Tư", 1, 0)]
    )

    AgentConversationRepository(postgres).delete_conversation(
        conversation_id, ids["user_a"], ids["shop_a"]
    )

    assert memories.search(ids["shop_a"], ids["user_a"], vector(1, 0), 5) == []


def age(admin: psycopg.Connection, content: str, days: int) -> None:
    admin.execute(
        "UPDATE agent_memories SET created_at = NOW() - make_interval(days => %s)"
        " WHERE content = %s",
        (days, content),
    )


def test_decay_lets_a_fresh_memory_beat_an_old_one_on_the_same_topic(
    memory_db,
) -> None:
    admin, postgres, ids = memory_db
    memories = AgentMemoryRepository(postgres)
    conversation_id = new_conversation(postgres, ids["user_a"], ids["shop_a"])
    memories.add(
        ids["shop_a"],
        ids["user_a"],
        conversation_id,
        [memory("gạo chú Tư", 1, 0), memory("gạo cô Ba", 1, 0.2)],
    )
    # exp(-0.01 * 200) leaves the older, closer fact about 14% of its weight.
    age(admin, "gạo chú Tư", 200)

    found = memories.search(ids["shop_a"], ids["user_a"], vector(1, 0), 5)

    assert [item.content for item in found] == ["gạo cô Ba", "gạo chú Tư"]
    assert found[0].relevance < found[1].relevance


def test_old_memories_of_a_chat_day_are_swapped_for_their_summary(memory_db) -> None:
    admin, postgres, ids = memory_db
    memories = AgentMemoryRepository(postgres)
    conversation_id = new_conversation(postgres, ids["user_a"], ids["shop_a"])
    memories.add(
        ids["shop_a"],
        ids["user_a"],
        conversation_id,
        [memory("gạo chú Tư", 1, 0), memory("chợ Bà Chiểu", 1, 0.1)],
    )
    memories.add(
        ids["shop_a"], ids["user_a"], conversation_id, [memory("mới nói", 0, 1)]
    )
    age(admin, "gạo chú Tư", 10)
    age(admin, "chợ Bà Chiểu", 10)

    (group,) = memories.due_for_summary(ids["shop_a"], ids["user_a"], 7)
    assert [item.content for item in group.memories] == ["gạo chú Tư", "chợ Bà Chiểu"]
    assert memories.due_for_summary(ids["shop_a"], ids["user_b"], 7) == []

    summary = [memory("gạo chú Tư chợ Bà Chiểu", 1, 0)]
    assert memories.replace(ids["shop_a"], ids["user_a"], group, summary)
    # A second run holding the same group changes nothing.
    assert not memories.replace(ids["shop_a"], ids["user_a"], group, summary)

    found = memories.search(ids["shop_a"], ids["user_a"], vector(1, 0), 5)
    assert sorted(item.content for item in found) == [
        "gạo chú Tư chợ Bà Chiểu",
        "mới nói",
    ]
    assert found[0].created_at == max(item.created_at for item in group.memories)
    assert memories.due_for_summary(ids["shop_a"], ids["user_a"], 7) == []

    AgentConversationRepository(postgres).delete_conversation(
        conversation_id, ids["user_a"], ids["shop_a"]
    )
    assert memories.search(ids["shop_a"], ids["user_a"], vector(1, 0), 5) == []
