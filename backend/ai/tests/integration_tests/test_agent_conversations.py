import os
import uuid
from collections.abc import Iterator

import psycopg
import pytest
from fastapi.testclient import TestClient
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from psycopg import sql
from tests.support import (
    TEST_GUARDRAIL_LIMITS,
    apply_ai_baseline,
    apply_core_migrations,
    schema_url,
)

from src.agent.repository import AgentConversationRepository, ConversationNotFoundError
from src.agent.service import AgentService
from src.infra.postgre_db_client import PostgreDBClient
from src.main import app


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


def seed_conversation(
    conversations: AgentConversationRepository,
    user_id: int,
    shop_id: int,
    exchanges: int,
) -> int:
    """Persist `exchanges` question/answer pairs numbered from 0."""
    conversation_id = None
    for index in range(exchanges):
        conversation_id, _ = conversations.save_exchange(
            user_id=user_id,
            shop_id=shop_id,
            conversation_id=conversation_id,
            user_message=f"question {index}",
            assistant_message=f"answer {index}",
        )
    return conversation_id


@pytest.fixture
def postgres_agent_client(
    monkeypatch: pytest.MonkeyPatch,
    internal_headers: dict[str, str],
) -> Iterator[tuple[TestClient, int, int, AgentConversationRepository]]:
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
        apply_core_migrations(setup_connection)
        apply_ai_baseline(setup_connection, schema_name)

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

        postgres = PostgreDBClient(schema_url(database_url, schema_name))
        agent = AgentService(
            ConversationEchoModel(responses=[]),
            AgentConversationRepository(postgres),
            guardrail_limits=TEST_GUARDRAIL_LIMITS,
        )
        monkeypatch.setattr(app.state, "agent", agent, raising=False)
        monkeypatch.setattr(
            app.state, "conversations", agent.conversations, raising=False
        )
        client = TestClient(app, headers=internal_headers)
        yield client, user_id, shop_id, agent.conversations
    finally:
        if client is not None:
            client.close()
        if postgres is not None:
            postgres.close()
        try:
            setup_connection.execute(
                sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                    sql.Identifier(schema_name)
                )
            )
        finally:
            setup_connection.close()


def test_conversation_crud_uses_postgres(
    postgres_agent_client: tuple[TestClient, int, int, AgentConversationRepository],
) -> None:
    client, user_id, shop_id, _ = postgres_agent_client
    scope = {"user_id": user_id, "shop_id": shop_id}

    created = client.post(
        "/internal/v1/agent/chat",
        json={**scope, "message": "today's revenue?"},
    )

    assert created.status_code == 200
    conversation_id = created.json()["conversation_id"]
    assert created.json()["answer"] == "today's revenue?"

    listed = client.get("/internal/v1/agent/conversations", params=scope)
    detail = client.get(
        f"/internal/v1/agent/conversations/{conversation_id}", params=scope
    )

    assert [conversation["conversation_id"] for conversation in listed.json()] == [
        conversation_id
    ]
    assert detail.json()["title"] == "today's revenue?"
    assert [
        (message["role"], message["content"]) for message in detail.json()["messages"]
    ] == [
        ("USER", "today's revenue?"),
        ("ASSISTANT", "today's revenue?"),
    ]

    renamed = client.patch(
        f"/internal/v1/agent/conversations/{conversation_id}",
        json={**scope, "title": "  Morning shift  "},
    )
    renamed_list = client.get("/internal/v1/agent/conversations", params=scope)
    renamed_detail = client.get(
        f"/internal/v1/agent/conversations/{conversation_id}", params=scope
    )

    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Morning shift"
    assert renamed_list.json()[0]["title"] == "Morning shift"
    assert renamed_detail.json()["title"] == "Morning shift"

    continued = client.post(
        "/internal/v1/agent/chat",
        json={
            **scope,
            "conversation_id": conversation_id,
            "message": "and yesterday?",
        },
    )
    continued_detail = client.get(
        f"/internal/v1/agent/conversations/{conversation_id}", params=scope
    )

    assert continued.status_code == 200
    assert continued.json()["conversation_id"] == conversation_id
    assert continued.json()["answer"] == "today's revenue? | and yesterday?"
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
            "message": "message after delete",
        },
    )

    assert deleted.status_code == 204
    assert after_delete_list.json() == []
    assert after_delete_detail.status_code == 404
    assert after_delete_chat.status_code == 404


def test_recent_messages_returns_the_latest_window_oldest_first(
    postgres_agent_client: tuple[TestClient, int, int, AgentConversationRepository],
) -> None:
    _, user_id, shop_id, conversations = postgres_agent_client
    conversation_id = seed_conversation(conversations, user_id, shop_id, 3)

    window = conversations.recent_messages(conversation_id, user_id, shop_id, 4)

    assert [(message["role"], message["content"]) for message in window] == [
        ("USER", "question 1"),
        ("ASSISTANT", "answer 1"),
        ("USER", "question 2"),
        ("ASSISTANT", "answer 2"),
    ]


def test_recent_messages_enforces_the_owner_scope(
    postgres_agent_client: tuple[TestClient, int, int, AgentConversationRepository],
) -> None:
    _, user_id, shop_id, conversations = postgres_agent_client
    conversation_id = seed_conversation(conversations, user_id, shop_id, 1)

    with pytest.raises(ConversationNotFoundError):
        conversations.recent_messages(conversation_id, user_id + 1, shop_id, 4)
    with pytest.raises(ConversationNotFoundError):
        conversations.recent_messages(conversation_id, user_id, shop_id + 1, 4)


def test_chat_sends_only_the_configured_window(
    monkeypatch: pytest.MonkeyPatch,
    postgres_agent_client: tuple[TestClient, int, int, AgentConversationRepository],
) -> None:
    client, user_id, shop_id, conversations = postgres_agent_client
    conversation_id = seed_conversation(conversations, user_id, shop_id, 3)
    agent = AgentService(
        ConversationEchoModel(responses=[]),
        conversations,
        guardrail_limits=TEST_GUARDRAIL_LIMITS,
        history_turns=1,
    )
    monkeypatch.setattr(app.state, "agent", agent)

    response = client.post(
        "/internal/v1/agent/chat",
        json={
            "user_id": user_id,
            "shop_id": shop_id,
            "conversation_id": conversation_id,
            "message": "next",
        },
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "question 2 | next"
