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
from tests.support import TEST_GUARDRAIL_LIMITS

from src.agent.repository import (
    AgentConversationRepository,
    ConversationNotFoundError,
)
from src.agent.service import AgentService
from src.infra.postgre_db_client import PostgreDBClient
from src.main import app

BACKEND_ROOT = Path(__file__).resolve().parents[3]
CORE_MIGRATION = (
    BACKEND_ROOT / "core/src/main/resources/db/migration/V1__create_auth_and_shops.sql"
)
CHAT_MIGRATION = BACKEND_ROOT / "ai/migrations/001_create_chat_history.sql"
FACT_IN_FIRST_MESSAGE = "Lan owes 200000 VND"


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


class RecordingEchoModel(ConversationEchoModel):
    seen_messages: list = []

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen_messages = list(messages)
        return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)


def seed_conversation(
    conversations: AgentConversationRepository,
    user_id: int,
    shop_id: int,
    exchanges: int,
) -> int:
    """Persist `exchanges` question/answer pairs; the first one carries the fact."""
    conversation_id = None
    for index in range(exchanges):
        conversation_id, _ = conversations.save_exchange(
            user_id=user_id,
            shop_id=shop_id,
            conversation_id=conversation_id,
            user_message=FACT_IN_FIRST_MESSAGE if index == 0 else f"question {index}",
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


def test_context_for_scope_is_enforced(
    postgres_agent_client: tuple[TestClient, int, int, AgentConversationRepository],
) -> None:
    _, user_id, shop_id, conversations = postgres_agent_client
    conversation_id = seed_conversation(conversations, user_id, shop_id, 1)

    with pytest.raises(ConversationNotFoundError):
        conversations.context_for(conversation_id, user_id + 1, shop_id)
    with pytest.raises(ConversationNotFoundError):
        conversations.context_for(conversation_id, user_id, shop_id + 1)


def test_context_for_returns_every_message_in_order(
    postgres_agent_client: tuple[TestClient, int, int, AgentConversationRepository],
) -> None:
    _, user_id, shop_id, conversations = postgres_agent_client
    conversation_id = seed_conversation(conversations, user_id, shop_id, 3)

    context = conversations.context_for(conversation_id, user_id, shop_id)

    assert len(context["messages"]) == 6
    ids = [message["message_id"] for message in context["messages"]]
    assert ids == sorted(ids)
    assert len(set(ids)) == 6
    assert [message["role"] for message in context["messages"]] == [
        "USER",
        "ASSISTANT",
    ] * 3
    assert [message["content"] for message in context["messages"][:2]] == [
        FACT_IN_FIRST_MESSAGE,
        "answer 0",
    ]
