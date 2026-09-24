import os
import uuid
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from psycopg import sql

from src.agent.repository import AgentConversationRepository
from src.agent.service import AgentService
from src.infra.postgre_db_client import PostgreDBClient
from src.main import app

BACKEND_ROOT = Path(__file__).resolve().parents[3]
CORE_MIGRATION = (
    BACKEND_ROOT / "core/src/main/resources/db/migration/V1__create_auth_and_shops.sql"
)
CHAT_MIGRATION = BACKEND_ROOT / "ai/migrations/001_create_chat_history.sql"


class ConversationEchoModel(FakeListChatModel):
    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        content = " | ".join(
            str(message.content) for message in messages if message.type == "human"
        )
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=content))]
        )


@pytest.fixture
def postgres_agent_client(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, int, int]]:
    database_url = os.getenv("POSTGRES_TEST_URL")
    if not database_url:
        pytest.skip("set POSTGRES_TEST_URL to run PostgreSQL endpoint tests")

    schema_name = f"agent_e2e_{uuid.uuid4().hex}"
    setup_connection = psycopg.connect(database_url, autocommit=True)
    postgres = None
    client = None
    try:
        setup_connection.execute(
            sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema_name))
        )
        setup_connection.execute(
            sql.SQL("SET search_path TO {}").format(sql.Identifier(schema_name))
        )
        setup_connection.execute(CORE_MIGRATION.read_text(), prepare=False)
        setup_connection.execute(CHAT_MIGRATION.read_text(), prepare=False)

        user_id = setup_connection.execute(
            "INSERT INTO users (display_name) VALUES (%s) RETURNING id",
            ("E2E owner",),
        ).fetchone()[0]
        shop_id = setup_connection.execute(
            """
            INSERT INTO shops (owner_id, name, industry)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (user_id, "E2E shop", "Retail"),
        ).fetchone()[0]

        postgres = PostgreDBClient()
        postgres.connection = psycopg.connect(
            database_url,
            options=f"-c search_path={schema_name}",
        )
        agent = AgentService(
            ConversationEchoModel(responses=[]), AgentConversationRepository(postgres)
        )
        monkeypatch.setattr(app.state, "agent", agent, raising=False)
        client = TestClient(app)
        yield client, user_id, shop_id
    finally:
        if client is not None:
            client.close()
        if postgres is not None and postgres.connection is not None:
            postgres.connection.close()
        try:
            setup_connection.execute(
                sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                    sql.Identifier(schema_name)
                )
            )
        finally:
            setup_connection.close()


def test_conversation_crud_uses_postgres(
    postgres_agent_client: tuple[TestClient, int, int],
) -> None:
    client, user_id, shop_id = postgres_agent_client
    scope = {"user_id": user_id, "shop_id": shop_id}

    created = client.post(
        "/internal/v1/agent/chat",
        json={**scope, "message": "doanh thu hôm nay?"},
    )

    assert created.status_code == 200
    conversation_id = created.json()["conversation_id"]
    assert created.json()["answer"] == "doanh thu hôm nay?"

    listed = client.get("/internal/v1/agent/conversations", params=scope)
    detail = client.get(
        f"/internal/v1/agent/conversations/{conversation_id}", params=scope
    )

    assert [conversation["conversation_id"] for conversation in listed.json()] == [
        conversation_id
    ]
    assert detail.json()["title"] == "doanh thu hôm nay?"
    assert [
        (message["role"], message["content"]) for message in detail.json()["messages"]
    ] == [
        ("USER", "doanh thu hôm nay?"),
        ("ASSISTANT", "doanh thu hôm nay?"),
    ]

    renamed = client.patch(
        f"/internal/v1/agent/conversations/{conversation_id}",
        json={**scope, "title": "  Ca sáng  "},
    )
    renamed_list = client.get("/internal/v1/agent/conversations", params=scope)
    renamed_detail = client.get(
        f"/internal/v1/agent/conversations/{conversation_id}", params=scope
    )

    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Ca sáng"
    assert renamed_list.json()[0]["title"] == "Ca sáng"
    assert renamed_detail.json()["title"] == "Ca sáng"

    continued = client.post(
        "/internal/v1/agent/chat",
        json={
            **scope,
            "conversation_id": conversation_id,
            "message": "còn hôm qua?",
        },
    )
    continued_detail = client.get(
        f"/internal/v1/agent/conversations/{conversation_id}", params=scope
    )

    assert continued.status_code == 200
    assert continued.json()["conversation_id"] == conversation_id
    assert continued.json()["answer"] == "doanh thu hôm nay? | còn hôm qua?"
    assert len(continued_detail.json()["messages"]) == 4

    deleted = client.delete(
        f"/internal/v1/agent/conversations/{conversation_id}", params=scope
    )
    after_delete_list = client.get("/internal/v1/agent/conversations", params=scope)
    after_delete_detail = client.get(
        f"/internal/v1/agent/conversations/{conversation_id}", params=scope
    )
    after_delete_chat = client.post(
        "/internal/v1/agent/chat",
        json={
            **scope,
            "conversation_id": conversation_id,
            "message": "tin nhắn sau khi xóa",
        },
    )

    assert deleted.status_code == 204
    assert after_delete_list.json() == []
    assert after_delete_detail.status_code == 404
    assert after_delete_chat.status_code == 404
