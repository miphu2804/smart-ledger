import json
from contextlib import suppress
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    Text,
    delete,
    func,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, Session, mapped_column

from src.agent.errors import ConversationNotFoundError
from src.agent.turn_context import TurnExecution
from src.infra.postgre_db_client import Base, PostgreDBClient
from src.infra.redis_client import RedisClient


class ChatConversation(Base):
    __tablename__ = "chat_conversations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger)
    shop_id: Mapped[int] = mapped_column(BigInteger)
    title: Mapped[str | None] = mapped_column(String(255))
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("chat_conversations.id")
    )
    # The AI baseline migration creates the "ChatRole" type.
    role: Mapped[str] = mapped_column(
        ENUM("USER", "ASSISTANT", name="ChatRole", create_type=False)
    )
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AgentConversationRepository:
    # Each turn reads the latest messages that the previous turn just saved, and the
    # database is a round trip to another region. Redis keeps them instead of the
    # process, so every AI process shares one cache and it survives a restart.
    HISTORY_CACHE_TTL_SECONDS = 24 * 3600

    def __init__(self, postgres: PostgreDBClient, cache: RedisClient) -> None:
        self.postgres = postgres
        self.cache = cache

    def list_conversations(self, user_id: int, shop_id: int) -> list[dict]:
        with self.postgres.session() as session:
            conversations = session.scalars(
                select(ChatConversation)
                .where(
                    ChatConversation.user_id == user_id,
                    ChatConversation.shop_id == shop_id,
                )
                .order_by(
                    ChatConversation.last_message_at.desc(),
                    ChatConversation.id.desc(),
                )
            ).all()
        return [self._summary(conversation) for conversation in conversations]

    def get_conversation(
        self, conversation_id: int, user_id: int, shop_id: int
    ) -> dict:
        with self.postgres.session() as session:
            conversation = self.owned_conversation(
                session, conversation_id, user_id, shop_id
            )
            messages = session.scalars(
                select(ChatMessage)
                .where(ChatMessage.conversation_id == conversation_id)
                .order_by(ChatMessage.created_at, ChatMessage.id)
            ).all()

        return {
            **self._summary(conversation),
            "messages": [
                {
                    "message_id": message.id,
                    "role": message.role,
                    "content": message.content,
                    "created_at": message.created_at,
                }
                for message in messages
            ],
        }

    def recent_messages(
        self, conversation_id: int, user_id: int, shop_id: int, limit: int
    ) -> list[dict]:
        """Return the conversation's latest `limit` messages, oldest first."""
        # The owner is in the key, so a hit means the database ownership check already
        # passed for this owner.
        key = self._history_key(conversation_id, user_id, shop_id)
        cached = self.cache.get(key)
        if cached is not None:
            entry = json.loads(cached)
            if entry["limit"] == limit:
                return entry["messages"]

        # Two autocommit statements: a delete between them only shortens the history.
        with self.postgres.read_session() as session:
            self.owned_conversation(session, conversation_id, user_id, shop_id)
            messages = session.scalars(
                select(ChatMessage)
                .where(ChatMessage.conversation_id == conversation_id)
                .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
                .limit(limit)
            ).all()

        history = [
            {"message_id": message.id, "role": message.role, "content": message.content}
            for message in reversed(messages)
        ]
        self._cache_history(key, limit, history)
        return history

    def save_exchange(
        self,
        user_id: int,
        shop_id: int,
        conversation_id: int | None,
        user_message: str,
        assistant_message: str,
    ) -> tuple[int, int]:
        with self.postgres.session() as session:
            saved_conversation_id, question_id, reply_id = self.write_exchange(
                session,
                user_id,
                shop_id,
                conversation_id,
                user_message,
                assistant_message,
            )

        # After the commit, so a failed save leaves the cache untouched.
        key = self._history_key(saved_conversation_id, user_id, shop_id)
        cached = self.cache.get(key)
        if cached is not None:
            entry = json.loads(cached)
            messages = entry["messages"] + [
                {"message_id": question_id, "role": "USER", "content": user_message},
                {
                    "message_id": reply_id,
                    "role": "ASSISTANT",
                    "content": assistant_message,
                },
            ]
            self._cache_history(key, entry["limit"], messages[-entry["limit"] :])
        return saved_conversation_id, reply_id

    def write_exchange(
        self,
        session: Session,
        user_id: int,
        shop_id: int,
        conversation_id: int | None,
        user_message: str,
        assistant_message: str,
    ) -> tuple[int, int, int]:
        """Write one question and reply inside the caller's transaction.

        Returns the conversation, question and reply ids. The caller owns `session`,
        so `AgentTurnRepository.complete` can commit the exchange together with its
        receipt; an existing conversation is locked here unless the caller already
        holds its lock.
        """
        if conversation_id is None:
            conversation = ChatConversation(
                user_id=user_id,
                shop_id=shop_id,
                title=" ".join(user_message.split())[:255],
            )
            session.add(conversation)
        else:
            conversation = self.owned_conversation(
                session, conversation_id, user_id, shop_id, lock=True
            )
        conversation.last_message_at = func.now()
        conversation.updated_at = func.now()
        # Flushed first, so a new conversation has its id for the messages.
        session.flush()

        question = ChatMessage(
            conversation_id=conversation.id,
            role="USER",
            content=user_message,
        )
        reply = ChatMessage(
            conversation_id=conversation.id,
            role="ASSISTANT",
            content=assistant_message,
        )
        session.add_all([question, reply])
        session.flush()
        saved_conversation_id, question_id, reply_id = (
            conversation.id,
            question.id,
            reply.id,
        )
        return saved_conversation_id, question_id, reply_id

    def save_receipted_exchange(
        self,
        execution: TurnExecution,
        conversation_id: int | None,
        user_message: str,
        assistant_message: str,
        model: str,
        model_version: str,
    ) -> tuple[int, int]:
        """Save a receipted turn's exchange atomically with its receipt.

        The receipt repository owns that transaction and its lock order (conversation
        row, then receipt row) and writes the messages through `write_exchange`; this
        method then drops the cached history.
        """
        cid, mid = execution.store.complete(
            execution,
            self,
            conversation_id,
            user_message,
            assistant_message,
            model,
            model_version,
        )
        # Do not cache replay answers; deletion must make the result unavailable.
        # Cache availability cannot undo committed receipt/answer evidence.
        with suppress(Exception):
            self.cache.delete(
                self._history_key(cid, execution.user_id, execution.shop_id)
            )
        return cid, mid

    def rename_conversation(
        self, conversation_id: int, user_id: int, shop_id: int, title: str
    ) -> dict:
        with self.postgres.session() as session:
            row = session.execute(
                update(ChatConversation)
                .where(
                    ChatConversation.id == conversation_id,
                    ChatConversation.user_id == user_id,
                    ChatConversation.shop_id == shop_id,
                )
                .values(title=title.strip(), updated_at=func.now())
                .returning(
                    ChatConversation.id,
                    ChatConversation.title,
                    ChatConversation.last_message_at,
                )
            ).one_or_none()
            if row is None:
                raise ConversationNotFoundError

        return {
            "conversation_id": row.id,
            "title": row.title,
            "last_message_at": row.last_message_at,
        }

    def delete_conversation(
        self, conversation_id: int, user_id: int, shop_id: int
    ) -> None:
        with self.postgres.session() as session:
            conversation = self.owned_conversation(
                session, conversation_id, user_id, shop_id, lock=True
            )
            session.execute(
                delete(ChatMessage).where(
                    ChatMessage.conversation_id == conversation_id
                )
            )
            session.delete(conversation)

        self.cache.delete(self._history_key(conversation_id, user_id, shop_id))

    @staticmethod
    def _history_key(conversation_id: int, user_id: int, shop_id: int) -> str:
        return f"chat-history:{conversation_id}:{user_id}:{shop_id}"

    def _cache_history(self, key: str, limit: int, messages: list[dict]) -> None:
        self.cache.set(
            key,
            json.dumps({"limit": limit, "messages": messages}),
            self.HISTORY_CACHE_TTL_SECONDS,
        )

    @staticmethod
    def owned_conversation(
        session: Session,
        conversation_id: int,
        user_id: int,
        shop_id: int,
        lock: bool = False,
    ) -> ChatConversation:
        """Return the owner's conversation, or raise.

        Every read and write of one conversation starts here, so another owner's or
        another shop's conversation is indistinguishable from a missing one. `lock`
        holds the row until the transaction ends, so a concurrent delete cannot drop
        the conversation between this check and the caller's write.
        """
        statement = select(ChatConversation).where(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == user_id,
            ChatConversation.shop_id == shop_id,
        )
        if lock:
            statement = statement.with_for_update()
        conversation = session.scalar(statement)
        if conversation is None:
            raise ConversationNotFoundError
        return conversation

    @staticmethod
    def _summary(conversation: ChatConversation) -> dict:
        return {
            "conversation_id": conversation.id,
            "title": conversation.title,
            "last_message_at": conversation.last_message_at,
        }
