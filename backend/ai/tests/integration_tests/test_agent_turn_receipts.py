"""Real PostgreSQL receipts and fake models, on disposable schemas only."""

import asyncio
import json
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from pydantic_ai.models.function import FunctionModel
from tests.support import (
    AI_MIGRATIONS,
    TEST_GUARDRAIL_LIMITS,
    FakeRedis,
    ScriptedModel,
    apply_ai_baseline,
    apply_core_migrations,
    schema_url,
)

from src.agent.errors import TurnProtocolError
from src.agent.receipts import AgentTurnRepository
from src.agent.repository import AgentConversationRepository
from src.agent.schema import AgentChatRequest
from src.agent.service import AgentService, Done
from src.agent.turns import AgentTurnService
from src.infra.postgre_db_client import PostgreDBClient
from src.main import app


@pytest.fixture
def receipt_env(monkeypatch, internal_headers):
    database = os.getenv("POSTGRES_TEST_URL")
    if not database:
        pytest.skip("POSTGRES_TEST_URL required for durable receipt verification")
    name = f"agent_receipt_{uuid.uuid4().hex}"
    connection = psycopg.connect(database, autocommit=True)
    postgres = None
    try:
        connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))
        connection.execute(
            sql.SQL("SET search_path TO {}").format(sql.Identifier(name))
        )
        apply_core_migrations(connection)
        apply_ai_baseline(connection, name)
        for migration in (
            "20261107000000_agent_turn_receipts.sql",
            "20261108000000_agent_turn_result_metadata.sql",
        ):
            # SET LOCAL takes effect in a real migration transaction.
            with connection.transaction():
                connection.execute(
                    (AI_MIGRATIONS / migration).read_text(), prepare=False
                )
        user = connection.execute(
            "INSERT INTO users(display_name) VALUES ('Receipt test') RETURNING id"
        ).fetchone()[0]
        shop = connection.execute(
            "INSERT INTO shops(owner_id,name,industry) "
            "VALUES (%s,'Test','Retail') RETURNING id",
            (user,),
        ).fetchone()[0]
        postgres = PostgreDBClient(schema_url(database, name), pool_size=4)
        conversations = AgentConversationRepository(postgres, FakeRedis())
        store = AgentTurnRepository(postgres)
        model = ScriptedModel("Saved test answer")
        agent = AgentService(model, conversations, TEST_GUARDRAIL_LIMITS)
        turns = AgentTurnService(store, agent, True)
        monkeypatch.setattr(app.state, "agent", agent, raising=False)
        monkeypatch.setattr(app.state, "conversations", conversations, raising=False)
        monkeypatch.setattr(app.state, "turns", turns, raising=False)
        # Avoid lifespan: it intentionally builds real runtime clients/settings.
        client = TestClient(app, headers=internal_headers)
        env = SimpleNamespace(
            client=client,
            store=store,
            turns=turns,
            agent=agent,
            conversations=conversations,
            model=model,
            connection=connection,
            postgres=postgres,
            user=user,
            shop=shop,
            headers=internal_headers,
        )
        yield env
        client.close()
    finally:
        if postgres:
            postgres.close()
        connection.execute(
            sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(name))
        )
        connection.close()


def payload(env, **changes):
    return {
        "turn_id": str(uuid.uuid4()),
        "execution_fence": 1,
        "user_id": env.user,
        "shop_id": env.shop,
        "message": "Today's revenue?",
        **changes,
    }


def receipt(env, body):
    return env.client.get(
        f"/internal/v1/agent/turns/{body['turn_id']}",
        params={"user_id": env.user, "shop_id": env.shop},
    )


def cancel(env, body, fence=2):
    return env.client.post(
        f"/internal/v1/agent/turns/{body['turn_id']}/cancel",
        json={"user_id": env.user, "shop_id": env.shop, "execution_fence": fence},
    )


def rows(env, table):
    return env.connection.execute(
        sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))
    ).fetchone()[0]


def test_json_replay_restart_and_stream_keep_exact_answer_and_model_metadata(
    receipt_env, monkeypatch
):
    env = receipt_env
    body = payload(env)
    first = env.client.post("/internal/v1/agent/chat", json=body)
    assert first.status_code == 200, first.text
    second = env.client.post("/internal/v1/agent/chat", json=body)
    assert second.json() == first.json()
    assert first.json()["request_id"] == body["turn_id"]
    assert first.headers["cache-control"] == "no-store"
    unused = AgentService(
        ScriptedModel("Must never run"), env.conversations, TEST_GUARDRAIL_LIMITS
    )
    fresh = AgentTurnService(AgentTurnRepository(env.postgres), unused, True)
    monkeypatch.setattr(app.state, "turns", fresh)
    monkeypatch.setattr(app.state, "agent", unused)
    stream = env.client.post("/internal/v1/agent/chat/stream", json=body)
    done = [
        json.loads(line[6:])
        for line in stream.text.splitlines()
        if line.startswith("data: ")
    ][-1]
    assert done == first.json()
    stored = receipt(env, body)
    assert stored.json()["state"] == "SUCCEEDED"
    assert stored.json()["result"] == first.json()
    assert set(stored.json()) == {
        "turn_id",
        "execution_fence",
        "state",
        "resultAvailable",
        "result",
        "failure_code",
    }
    assert len(env.model.requests) == 1
    assert rows(env, "chat_messages") == 2


def test_stream_save_precedes_done_and_json_retry_does_not_run_again(receipt_env):
    env = receipt_env
    body = payload(env)

    async def exercise():
        request = AgentChatRequest(**body)
        created, _, execution = await env.turns.admit(request)
        assert created
        events = await env.turns.stream(request, execution)
        seen = []
        async for event in events:
            if isinstance(event, Done):
                state = env.store.get(request.turn_id, env.user, env.shop)
                assert state["state"] == "SUCCEEDED" and state["resultAvailable"]
                seen.append(event.result.answer)
        assert seen == ["Saved test answer"]

    asyncio.run(exercise())
    assert (
        env.client.post("/internal/v1/agent/chat", json=body).json()["answer"]
        == "Saved test answer"
    )
    assert len(env.model.requests) == 1


def test_scope_fingerprint_fence_and_paired_fields_fail_before_model(receipt_env):
    env = receipt_env
    body = payload(env)
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 200
    for changes, expected in [
        ({"message": "Changed question"}, 409),
        ({"execution_fence": 2}, 409),
        ({"shop_id": env.shop + 99}, 404),
        ({"user_id": env.user + 99}, 404),
    ]:
        assert (
            env.client.post(
                "/internal/v1/agent/chat", json={**body, **changes}
            ).status_code
            == expected
        )
    assert receipt(env, body).headers["cache-control"] == "no-store"
    for changes in (
        {"execution_fence": None},
        {"turn_id": None},
        {"execution_fence": True},
        {"execution_fence": 2**63},
    ):
        assert (
            env.client.post(
                "/internal/v1/agent/chat", json={**body, **changes}
            ).status_code
            == 422
        )
    missing = payload(env, conversation_id=99999)
    assert env.client.post("/internal/v1/agent/chat", json=missing).status_code == 404
    # The missing conversation leaves a committed FAILED receipt, not a rollback.
    assert rows(env, "agent_turn_receipts") == 2
    assert receipt(env, missing).json()["failure_code"] == "conversation_not_found"
    assert len(env.model.requests) == 1


def test_parallel_posts_and_existing_in_progress_receipt_start_only_one_model(
    receipt_env, monkeypatch
):
    env = receipt_env
    entered, release = threading.Event(), threading.Event()
    calls = []

    async def blocked(messages, info):
        calls.append(1)
        entered.set()
        assert await asyncio.to_thread(release.wait, 10)
        from pydantic_ai.messages import ModelResponse, TextPart

        return ModelResponse(parts=[TextPart("One answer")])

    monkeypatch.setattr(
        env.turns,
        "agent",
        AgentService(FunctionModel(blocked), env.conversations, TEST_GUARDRAIL_LIMITS),
    )
    body = payload(env)
    try:
        with ThreadPoolExecutor(2) as workers:
            first = workers.submit(
                env.client.post, "/internal/v1/agent/chat", json=body
            )
            assert entered.wait(5)
            second = workers.submit(
                env.client.post, "/internal/v1/agent/chat/stream", json=body
            ).result(5)
            assert second.status_code == 202 and second.headers["retry-after"] == "2"
            assert second.json()["state"] == "IN_PROGRESS"
            release.set()
            assert first.result(10).status_code == 200
    finally:
        release.set()
    assert len(calls) == 1 and rows(env, "chat_messages") == 2


def test_cancel_before_post_tombstone_and_foreign_scope_never_run_model(receipt_env):
    env = receipt_env
    body = payload(env)
    assert receipt(env, body).status_code == 404
    tombstone = cancel(env, body)
    assert tombstone.status_code == 200 and tombstone.json()["state"] == "CANCELLED"
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 409
    assert (
        env.client.post(
            "/internal/v1/agent/chat/stream", json={**body, "execution_fence": 3}
        ).status_code
        == 409
    )
    assert (
        env.client.post(
            f"/internal/v1/agent/turns/{body['turn_id']}/cancel",
            json={"user_id": env.user + 99, "shop_id": env.shop, "execution_fence": 3},
        ).status_code
        == 404
    )
    assert len(env.model.requests) == 0 and rows(env, "chat_messages") == 0


def test_cancel_fences_stale_save_and_success_wins_a_late_cancel(receipt_env):
    env = receipt_env
    body = payload(env)
    _, _, execution = asyncio.run(env.turns.admit(AgentChatRequest(**body)))
    assert cancel(env, body, fence=0).status_code == 422
    assert cancel(env, body, fence=2).json()["execution_fence"] == 2
    with pytest.raises(TurnProtocolError, match="ai_turn_cancelled"):
        env.store.complete(
            execution, env.conversations, None, "question", "answer", "model", "version"
        )
    assert rows(env, "chat_messages") == 0
    success = payload(env)
    answer = env.client.post("/internal/v1/agent/chat", json=success).json()
    ended = cancel(env, success, fence=99).json()
    assert ended["state"] == "SUCCEEDED" and ended["result"] == answer
    assert ended["execution_fence"] == 1


def test_cancel_save_race_commits_only_one_terminal_outcome(receipt_env):
    env = receipt_env
    body = payload(env)
    _, _, execution = asyncio.run(env.turns.admit(AgentChatRequest(**body)))
    barrier = threading.Barrier(2)

    def save():
        barrier.wait()
        try:
            return env.store.complete(
                execution, env.conversations, None, "q", "a", "m", "v"
            )
        except TurnProtocolError as error:
            assert error.code == "ai_turn_cancelled"
            return None

    def stop():
        barrier.wait()
        return env.store.cancel(execution.turn_id, env.user, env.shop, 2)

    with ThreadPoolExecutor(2) as workers:
        a, b = workers.submit(save), workers.submit(stop)
        saved, stopped = a.result(10), b.result(10)
    row = receipt(env, body).json()
    assert row["state"] in {"SUCCEEDED", "CANCELLED"}
    assert rows(env, "chat_messages") == (2 if saved else 0)
    assert stopped["state"] == row["state"]


def test_deleted_conversation_keeps_success_but_replay_is_gone_without_generation(
    receipt_env,
):
    env = receipt_env
    conversation, _ = env.conversations.save_exchange(
        env.user, env.shop, None, "initial", "initial answer"
    )
    body = payload(env, conversation_id=conversation)
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 200
    env.conversations.delete_conversation(conversation, env.user, env.shop)
    row = receipt(env, body).json()
    assert (
        row["state"] == "SUCCEEDED"
        and not row["resultAvailable"]
        and row["result"] is None
    )
    replay = env.client.post("/internal/v1/agent/chat", json=body)
    assert (
        replay.status_code == 410
        and replay.json()["detail"] == "ai_turn_result_removed"
    )
    assert len(env.model.requests) == 1 and rows(env, "chat_messages") == 0


def test_technical_failure_is_terminal_and_never_reveals_diagnostics(
    receipt_env, monkeypatch
):
    env = receipt_env

    async def fail(*args, **kwargs):
        raise RuntimeError("private provider payload")

    monkeypatch.setattr(env.agent, "_answer", fail)
    body = payload(env)
    first = env.client.post("/internal/v1/agent/chat", json=body)
    assert first.status_code == 503 and "private" not in first.text
    assert receipt(env, body).json()["state"] == "FAILED"
    monkeypatch.setattr(
        app.state,
        "agent",
        AgentService(
            ScriptedModel("must not run"), env.conversations, TEST_GUARDRAIL_LIMITS
        ),
    )
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 503
    assert rows(env, "chat_messages") == 0


@pytest.mark.anyio
@pytest.mark.parametrize("commit_first", [False, True])
async def test_disconnect_during_threaded_save_is_fenced_or_recovers_committed_answer(
    receipt_env, monkeypatch, commit_first
):
    env = receipt_env
    entered, release, finished = threading.Event(), threading.Event(), threading.Event()
    original = env.store.complete

    def delayed(*args):
        try:
            result = original(*args) if commit_first else None
            entered.set()
            assert release.wait(10)
            return result if commit_first else original(*args)
        finally:
            finished.set()

    monkeypatch.setattr(env.store, "complete", delayed)
    request = AgentChatRequest(**payload(env))
    _, _, execution = await env.turns.admit(request)
    task = asyncio.create_task(env.turns.chat(request, execution))
    try:
        assert await asyncio.to_thread(entered.wait, 5)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    finally:
        release.set()
    assert await asyncio.to_thread(finished.wait, 5)
    result = env.store.get(request.turn_id, env.user, env.shop)
    assert result["state"] == ("SUCCEEDED" if commit_first else "CANCELLED")
    assert rows(env, "chat_messages") == (2 if commit_first else 0)


def test_failed_atomic_save_rolls_back_messages_and_never_sends_done(receipt_env):
    env = receipt_env
    env.connection.execute(
        "CREATE FUNCTION skip_success() RETURNS trigger LANGUAGE plpgsql "
        "AS $$ BEGIN RETURN NULL; END $$"
    )
    env.connection.execute(
        "CREATE TRIGGER skip_success BEFORE UPDATE ON agent_turn_receipts "
        "FOR EACH ROW EXECUTE FUNCTION skip_success()"
    )
    body = payload(env)
    response = env.client.post("/internal/v1/agent/chat/stream", json=body)
    assert response.status_code == 200
    assert "event: done" not in response.text and "event: error" in response.text
    assert rows(env, "chat_messages") == 0
    assert receipt(env, body).json()["state"] == "IN_PROGRESS"
    env.connection.execute("DROP TRIGGER skip_success ON agent_turn_receipts")
    assert cancel(env, body).json()["state"] == "CANCELLED"
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 409
    assert len(env.model.requests) == 1


def test_disabled_gate_and_missing_store_never_fall_back_to_legacy_chat(
    receipt_env, monkeypatch
):
    env = receipt_env
    body = payload(env)
    monkeypatch.setattr(
        app.state, "turns", AgentTurnService(env.store, env.agent, False)
    )
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 503
    assert cancel(env, body).status_code == 503
    assert rows(env, "agent_turn_receipts") == 0 and not env.model.requests
    monkeypatch.setattr(app.state, "turns", env.turns)
    env.connection.execute(
        "ALTER TABLE agent_turn_receipts RENAME TO unavailable_receipts"
    )
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 503
    assert not env.model.requests


def test_internal_auth_protects_receipt_get_cancel_and_execution(receipt_env):
    env = receipt_env
    body = payload(env)
    client = TestClient(app)
    try:
        assert (
            client.get(
                f"/internal/v1/agent/turns/{body['turn_id']}",
                params={"user_id": env.user, "shop_id": env.shop},
            ).status_code
            == 401
        )
        assert (
            client.post(
                f"/internal/v1/agent/turns/{body['turn_id']}/cancel",
                json={"user_id": env.user, "shop_id": env.shop, "execution_fence": 1},
            ).status_code
            == 401
        )
        assert client.post("/internal/v1/agent/chat", json=body).status_code == 401
    finally:
        client.close()
    assert not env.model.requests


def test_stale_cancel_cannot_revoke_a_newer_execution_and_skipped_insert_fails_closed(
    receipt_env,
):
    env = receipt_env
    body = payload(env, execution_fence=2)
    asyncio.run(env.turns.admit(AgentChatRequest(**body)))
    assert cancel(env, body, fence=1).status_code == 409
    assert receipt(env, body).json()["state"] == "IN_PROGRESS"
    env.connection.execute(
        "CREATE FUNCTION skip_insert() RETURNS trigger LANGUAGE plpgsql "
        "AS $$ BEGIN RETURN NULL; END $$"
    )
    env.connection.execute(
        "CREATE TRIGGER skip_insert BEFORE INSERT ON agent_turn_receipts "
        "FOR EACH ROW EXECUTE FUNCTION skip_insert()"
    )
    fresh = payload(env)
    assert env.client.post("/internal/v1/agent/chat", json=fresh).status_code == 503
    assert cancel(env, fresh).status_code == 503
    assert not env.model.requests


def test_metadata_migration_preserves_old_success_and_rolls_back_column_collision(
    receipt_env,
):
    env = receipt_env
    body = payload(env)
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 200
    env.connection.execute(
        "ALTER TABLE agent_turn_receipts DROP COLUMN result_model, "
        "DROP COLUMN result_model_version"
    )
    env.connection.execute(
        "ALTER TABLE agent_turn_receipts ADD COLUMN result_model_version VARCHAR(512)"
    )
    migration = (
        AI_MIGRATIONS / "20261108000000_agent_turn_result_metadata.sql"
    ).read_text()
    with pytest.raises(psycopg.errors.DuplicateColumn), env.connection.transaction():
        env.connection.execute(migration, prepare=False)
    assert (
        env.connection.execute(
            "SELECT count(*) FROM information_schema.columns "
            "WHERE table_schema=current_schema() "
            "AND table_name='agent_turn_receipts' AND column_name='result_model'"
        ).fetchone()[0]
        == 0
    )
    assert rows(env, "chat_messages") == 2
    env.connection.execute(
        "ALTER TABLE agent_turn_receipts DROP COLUMN result_model_version"
    )
    with env.connection.transaction():
        env.connection.execute(migration, prepare=False)
    assert rows(env, "agent_turn_receipts") == 1
    # Historical metadata is unknown, not invented from the current model.
    assert receipt(env, body).status_code == 503
    assert env.client.post("/internal/v1/agent/chat", json=body).status_code == 503
    assert len(env.model.requests) == 1


@pytest.mark.parametrize(
    "path", ["/internal/v1/agent/chat", "/internal/v1/agent/chat/stream"]
)
def test_missing_conversation_commits_a_failed_receipt_that_retries_replay(
    receipt_env, path
):
    env = receipt_env
    body = payload(env, conversation_id=999_999)
    first = env.client.post(path, json=body)
    assert first.status_code == 404
    assert first.json() == {"detail": "conversation_not_found"}
    stored = receipt(env, body).json()
    assert stored["state"] == "FAILED"
    assert stored["failure_code"] == "conversation_not_found"
    for retry_path in ("/internal/v1/agent/chat", "/internal/v1/agent/chat/stream"):
        retry = env.client.post(retry_path, json=body)
        assert retry.status_code == 404
        assert retry.json() == {"detail": "conversation_not_found"}
    # A late cancel keeps the committed failure instead of rewriting it.
    assert cancel(env, body).json()["failure_code"] == "conversation_not_found"
    assert env.model.requests == []
    assert rows(env, "chat_messages") == 0
