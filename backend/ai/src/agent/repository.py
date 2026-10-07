from src.infra.postgre_db_client import PostgreDBClient


class ConversationNotFoundError(Exception):
    pass


class AgentConversationRepository:
    def __init__(self, postgres: PostgreDBClient) -> None:
        self.postgres = postgres

    def list_conversations(self, user_id: int, shop_id: int) -> list[dict]:
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, title, last_message_at
                    FROM chat_conversations
                    WHERE user_id = %s AND shop_id = %s
                    ORDER BY last_message_at DESC, id DESC
                    """,
                    (user_id, shop_id),
                )
                rows = cursor.fetchall()
        return [
            {
                "conversation_id": row[0],
                "title": row[1],
                "last_message_at": row[2],
            }
            for row in rows
        ]

    def get_conversation(
        self, conversation_id: int, user_id: int, shop_id: int
    ) -> dict:
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, title, last_message_at
                    FROM chat_conversations
                    WHERE id = %s AND user_id = %s AND shop_id = %s
                    """,
                    (conversation_id, user_id, shop_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise ConversationNotFoundError

                cursor.execute(
                    """
                    SELECT id, role, content, created_at
                    FROM chat_messages
                    WHERE conversation_id = %s
                    ORDER BY created_at, id
                    """,
                    (conversation_id,),
                )
                message_rows = cursor.fetchall()

        return {
            "conversation_id": row[0],
            "title": row[1],
            "last_message_at": row[2],
            "messages": [
                {
                    "message_id": message[0],
                    "role": str(message[1]),
                    "content": message[2],
                    "created_at": message[3],
                }
                for message in message_rows
            ],
        }

    def context_for(
        self,
        conversation_id: int,
        user_id: int,
        shop_id: int,
    ) -> dict:
        """Return the stored summary plus every message not yet folded into it."""
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT summary, summary_through_message_id
                    FROM chat_conversations
                    WHERE id = %s AND user_id = %s AND shop_id = %s
                    """,
                    (conversation_id, user_id, shop_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise ConversationNotFoundError

                cursor.execute(
                    """
                    SELECT id, role, content
                    FROM chat_messages
                    WHERE conversation_id = %s
                      AND id > COALESCE(%s::bigint, 0)
                    ORDER BY created_at, id
                    """,
                    (conversation_id, row[1]),
                )
                message_rows = cursor.fetchall()

        return {
            "summary": row[0],
            "summary_through_message_id": row[1],
            "messages": [
                {
                    "message_id": message[0],
                    "role": str(message[1]),
                    "content": message[2],
                }
                for message in message_rows
            ],
        }

    def folded_messages(
        self, conversation_id: int, user_id: int, shop_id: int
    ) -> list[dict]:
        """Return the messages already folded into the summary, oldest first.

        Empty when the conversation has no summary yet or is not owned by this user
        and shop: the scope check and the watermark live in the same query.
        """
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT m.id, m.role, m.content, m.created_at
                    FROM chat_messages m
                    JOIN chat_conversations c ON c.id = m.conversation_id
                    WHERE c.id = %s AND c.user_id = %s AND c.shop_id = %s
                      AND m.id <= c.summary_through_message_id
                    ORDER BY m.created_at, m.id
                    """,
                    (conversation_id, user_id, shop_id),
                )
                rows = cursor.fetchall()
        return [
            {
                "message_id": row[0],
                "role": str(row[1]),
                "content": row[2],
                "created_at": row[3],
            }
            for row in rows
        ]

    def save_exchange(
        self,
        user_id: int,
        shop_id: int,
        conversation_id: int | None,
        user_message: str,
        assistant_message: str,
    ) -> tuple[int, int]:
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                if conversation_id is None:
                    title = " ".join(user_message.split())[:255]
                    cursor.execute(
                        """
                        INSERT INTO chat_conversations (user_id, shop_id, title)
                        VALUES (%s, %s, %s)
                        RETURNING id
                        """,
                        (user_id, shop_id, title),
                    )
                    conversation_id = cursor.fetchone()[0]
                else:
                    cursor.execute(
                        """
                        SELECT id
                        FROM chat_conversations
                        WHERE id = %s AND user_id = %s AND shop_id = %s
                        FOR UPDATE
                        """,
                        (conversation_id, user_id, shop_id),
                    )
                    if cursor.fetchone() is None:
                        raise ConversationNotFoundError

                cursor.execute(
                    """
                    INSERT INTO chat_messages (conversation_id, role, content)
                    VALUES (%s, %s::"ChatRole", %s)
                    """,
                    (conversation_id, "USER", user_message),
                )
                cursor.execute(
                    """
                    INSERT INTO chat_messages (conversation_id, role, content)
                    VALUES (%s, %s::"ChatRole", %s)
                    RETURNING id
                    """,
                    (conversation_id, "ASSISTANT", assistant_message),
                )
                message_id = cursor.fetchone()[0]
                cursor.execute(
                    """
                    UPDATE chat_conversations
                    SET last_message_at = now(), updated_at = now()
                    WHERE id = %s AND user_id = %s AND shop_id = %s
                    """,
                    (conversation_id, user_id, shop_id),
                )

        return conversation_id, message_id

    def save_summary(
        self,
        conversation_id: int,
        user_id: int,
        shop_id: int,
        summary: str,
        through_id: int,
        expected_through_id: int | None,
    ) -> bool:
        """Advance the summary watermark, but only from the value the caller read.

        A concurrent fold that already advanced the watermark makes this update match
        no row, so the later writer is dropped instead of overwriting newer messages.
        Returns whether the update was applied.
        """
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE chat_conversations
                    SET summary = %s,
                        summary_through_message_id = %s,
                        updated_at = now()
                    WHERE id = %s AND user_id = %s AND shop_id = %s
                      AND summary_through_message_id IS NOT DISTINCT FROM %s::bigint
                    """,
                    (
                        summary,
                        through_id,
                        conversation_id,
                        user_id,
                        shop_id,
                        expected_through_id,
                    ),
                )
                return cursor.rowcount == 1

    def rename_conversation(
        self, conversation_id: int, user_id: int, shop_id: int, title: str
    ) -> dict:
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE chat_conversations
                    SET title = %s, updated_at = now()
                    WHERE id = %s AND user_id = %s AND shop_id = %s
                    RETURNING id, title, last_message_at
                    """,
                    (title.strip(), conversation_id, user_id, shop_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise ConversationNotFoundError

        return {
            "conversation_id": row[0],
            "title": row[1],
            "last_message_at": row[2],
        }

    def delete_conversation(
        self, conversation_id: int, user_id: int, shop_id: int
    ) -> None:
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id
                    FROM chat_conversations
                    WHERE id = %s AND user_id = %s AND shop_id = %s
                    FOR UPDATE
                    """,
                    (conversation_id, user_id, shop_id),
                )
                if cursor.fetchone() is None:
                    raise ConversationNotFoundError

                cursor.execute(
                    "DELETE FROM chat_messages WHERE conversation_id = %s",
                    (conversation_id,),
                )
                cursor.execute(
                    "DELETE FROM chat_conversations WHERE id = %s",
                    (conversation_id,),
                )
