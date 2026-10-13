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

from src.infra.postgre_db_client import Base, PostgreDBClient


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


class ConversationNotFoundError(Exception):
    pass


class AgentConversationRepository:
    def __init__(self, postgres: PostgreDBClient) -> None:
        self.postgres = postgres

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
            conversation = self._owned_conversation(
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
        with self.postgres.session() as session:
            self._owned_conversation(session, conversation_id, user_id, shop_id)
            messages = session.scalars(
                select(ChatMessage)
                .where(ChatMessage.conversation_id == conversation_id)
                .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
                .limit(limit)
            ).all()

        return [
            {"message_id": message.id, "role": message.role, "content": message.content}
            for message in reversed(messages)
        ]

    def save_exchange(
        self,
        user_id: int,
        shop_id: int,
        conversation_id: int | None,
        user_message: str,
        assistant_message: str,
    ) -> tuple[int, int]:
        with self.postgres.session() as session:
            if conversation_id is None:
                conversation = ChatConversation(
                    user_id=user_id,
                    shop_id=shop_id,
                    title=" ".join(user_message.split())[:255],
                )
                session.add(conversation)
            else:
                conversation = self._owned_conversation(
                    session, conversation_id, user_id, shop_id, lock=True
                )
            conversation.last_message_at = func.now()
            conversation.updated_at = func.now()
            # Flushed first, so a new conversation has its id for the messages.
            session.flush()

            reply = ChatMessage(
                conversation_id=conversation.id,
                role="ASSISTANT",
                content=assistant_message,
            )
            session.add_all(
                [
                    ChatMessage(
                        conversation_id=conversation.id,
                        role="USER",
                        content=user_message,
                    ),
                    reply,
                ]
            )
            session.flush()
            return conversation.id, reply.id

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
            conversation = self._owned_conversation(
                session, conversation_id, user_id, shop_id, lock=True
            )
            session.execute(
                delete(ChatMessage).where(
                    ChatMessage.conversation_id == conversation_id
                )
            )
            session.delete(conversation)

    @staticmethod
    def _owned_conversation(
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
