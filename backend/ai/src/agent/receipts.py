"""Durable at-most-once execution identities; no model/network calls in transactions."""

import hashlib
import json
from contextlib import contextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from src.agent.errors import TurnProtocolError
from src.agent.repository import AgentConversationRepository
from src.agent.turn_context import TurnExecution
from src.infra.postgre_db_client import PostgreDBClient


class AgentTurnRepository:
    def __init__(self, postgres: PostgreDBClient):
        self.postgres = postgres

    @contextmanager
    def transaction(self):
        try:
            with self.postgres.session() as session:
                session.execute(text("SET LOCAL lock_timeout = '2s'"))
                session.execute(text("SET LOCAL statement_timeout = '3s'"))
                yield session
        except (SQLAlchemyError, RuntimeError):
            # Never let SQL parameter dumps (fingerprints/answers) reach generic logs.
            raise TurnProtocolError("ai_turn_unavailable", 503) from None

    @staticmethod
    def fingerprint(user: int, shop: int, conversation: int | None, message: str):
        body = json.dumps(
            [1, user, shop, conversation, message.strip()],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return hashlib.sha256(body.encode()).hexdigest()

    @staticmethod
    def _row(session, turn: UUID, user: int, shop: int, *, lock=False, required=False):
        row = (
            session.execute(
                text(
                    "SELECT * FROM agent_turn_receipts WHERE turn_id=:id"
                    + (" FOR UPDATE" if lock else "")
                ),
                {"id": turn},
            )
            .mappings()
            .one_or_none()
        )
        if row is None and required:
            raise TurnProtocolError("ai_turn_unavailable", 503)
        if row is None or row["user_id"] != user or row["shop_id"] != shop:
            raise TurnProtocolError("ai_turn_not_found", 404)
        return dict(row)

    def admit(
        self,
        turn: UUID,
        user: int,
        shop: int,
        conversation: int | None,
        message: str,
        fence: int,
    ):
        fingerprint = self.fingerprint(user, shop, conversation, message)
        with self.transaction() as session:
            # A concurrent cancel may insert the tombstone first; never replace it.
            inserted = session.execute(
                text("""
                INSERT INTO agent_turn_receipts(turn_id, user_id, shop_id, request_hash,
                hash_version,
                    input_conversation_id,state,execution_fence,created_at)
                VALUES (:id, :user, :shop, :hash, 1, :conversation, 'IN_PROGRESS',
                :fence, clock_timestamp())
                ON CONFLICT (turn_id) DO NOTHING RETURNING turn_id
                """),
                {
                    "id": turn,
                    "user": user,
                    "shop": shop,
                    "hash": fingerprint,
                    "conversation": conversation,
                    "fence": fence,
                },
            ).scalar_one_or_none()
            row = self._row(session, turn, user, shop, lock=True, required=True)
            if row["request_hash"] is not None and row["request_hash"] != fingerprint:
                raise TurnProtocolError("ai_turn_conflict", 409)
            if row["state"] != "CANCELLED" and row["execution_fence"] != fence:
                raise TurnProtocolError("ai_turn_conflict", 409)
            if inserted is not None and conversation is not None:
                AgentConversationRepository._owned_conversation(
                    session, conversation, user, shop
                )
            # A silently skipped INSERT must not become admission.
        return inserted is not None, row, fingerprint

    def get(self, turn: UUID, user: int, shop: int):
        with self.transaction() as session:
            row = self._row(session, turn, user, shop)
            return self._result(session, row)

    @staticmethod
    def _result(session, row):
        row["result"] = None
        row["resultAvailable"] = False
        if (
            row["state"] == "SUCCEEDED"
            and row["result_conversation_id"] is not None
            and row["result_message_id"] is not None
        ):
            result = session.execute(
                text("""
                SELECT m.content FROM chat_messages m JOIN chat_conversations c ON
                c.id=m.conversation_id
                WHERE m.id=:message AND c.id=:conversation AND c.user_id=:user AND
                c.shop_id=:shop
                    AND m.role='ASSISTANT'
                """),
                {
                    "message": row["result_message_id"],
                    "conversation": row["result_conversation_id"],
                    "user": row["user_id"],
                    "shop": row["shop_id"],
                },
            ).scalar_one_or_none()
            if result is not None:
                if row["result_model"] is None or row["result_model_version"] is None:
                    raise TurnProtocolError("ai_turn_unavailable", 503)
                row["resultAvailable"] = True
                row["result"] = {
                    "conversation_id": row["result_conversation_id"],
                    "message_id": row["result_message_id"],
                    "request_id": str(row["turn_id"]),
                    "answer": result,
                    "model": row["result_model"],
                    "model_version": row["result_model_version"],
                }
        return row

    def cancel(self, turn: UUID, user: int, shop: int, fence: int):
        with self.transaction() as session:
            session.execute(
                text("""
                INSERT INTO agent_turn_receipts(turn_id, user_id, shop_id, state,
                execution_fence, created_at, completed_at, failure_code)
                VALUES (:id, :user, :shop, 'CANCELLED', :fence, statement_timestamp(),
                statement_timestamp(), 'ai_turn_cancelled')
                ON CONFLICT (turn_id) DO NOTHING
                """),
                {"id": turn, "user": user, "shop": shop, "fence": fence},
            )
            row = self._row(session, turn, user, shop, lock=True, required=True)
            if row["state"] == "IN_PROGRESS":
                if fence < row["execution_fence"]:
                    raise TurnProtocolError("ai_turn_conflict", 409)
                changed = session.execute(
                    text("""
                    UPDATE agent_turn_receipts SET state='CANCELLED',
                    execution_fence=:fence,
                        completed_at=GREATEST(clock_timestamp(), created_at),
                        failure_code='ai_turn_cancelled'
                    WHERE turn_id=:id AND state='IN_PROGRESS'
                    """),
                    {"id": turn, "fence": fence},
                )
                self._one(changed.rowcount)
                row = self._row(session, turn, user, shop)
            return self._result(session, row)

    def fail(self, execution: TurnExecution, code: str):
        with self.transaction() as session:
            # A committed success/cancellation wins even when its response was lost.
            row = self._row(
                session,
                execution.turn_id,
                execution.user_id,
                execution.shop_id,
                lock=True,
            )
            if (
                row["state"] == "IN_PROGRESS"
                and row["execution_fence"] == execution.fence
            ):
                changed = session.execute(
                    text("""
                    UPDATE agent_turn_receipts SET state='FAILED',
                    completed_at=GREATEST(clock_timestamp(), created_at),
                    failure_code=:code
                    WHERE turn_id=:id AND state='IN_PROGRESS' AND execution_fence=:fence
                    """),
                    {"id": execution.turn_id, "fence": execution.fence, "code": code},
                )
                self._one(changed.rowcount)

    def complete(
        self, execution, conversations, conversation, question, answer, model, version
    ):
        with self.transaction() as session:
            # Lock existing conversation before receipt, as deletion/FK nulling does.
            if conversation is not None:
                conversations._owned_conversation(
                    session,
                    conversation,
                    execution.user_id,
                    execution.shop_id,
                    lock=True,
                )
            row = self._row(
                session,
                execution.turn_id,
                execution.user_id,
                execution.shop_id,
                lock=True,
            )
            if (
                row["state"] != "IN_PROGRESS"
                or row["execution_fence"] != execution.fence
                or row["request_hash"] != execution.fingerprint
                or row["input_conversation_id"] != conversation
            ):
                raise TurnProtocolError("ai_turn_cancelled", 409)
            cid, _, mid = conversations._write_exchange(
                session,
                execution.user_id,
                execution.shop_id,
                conversation,
                question,
                answer,
            )
            changed = session.execute(
                text("""
                UPDATE agent_turn_receipts SET state='SUCCEEDED',
                completed_at=GREATEST(clock_timestamp(), created_at),
                    result_conversation_id=:cid, result_message_id=:mid,
                    result_model=:model, result_model_version=:version
                WHERE turn_id=:id AND state='IN_PROGRESS' AND execution_fence=:fence
                """),
                {
                    "id": execution.turn_id,
                    "cid": cid,
                    "mid": mid,
                    "model": model,
                    "version": version,
                    "fence": execution.fence,
                },
            )
            self._one(changed.rowcount)
        return cid, mid

    @staticmethod
    def _one(count):
        if count != 1:
            raise TurnProtocolError("ai_turn_unavailable", 503)
