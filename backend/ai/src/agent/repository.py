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

    def recent_messages(
        self,
        conversation_id: int,
        user_id: int,
        shop_id: int,
        limit: int,
    ) -> list[dict]:
        with self.postgres.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id
                    FROM chat_conversations
                    WHERE id = %s AND user_id = %s AND shop_id = %s
                    """,
                    (conversation_id, user_id, shop_id),
                )
                if cursor.fetchone() is None:
                    raise ConversationNotFoundError

                cursor.execute(
                    """
                    SELECT role, content
                    FROM chat_messages
                    WHERE conversation_id = %s
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (conversation_id, limit),
                )
                rows = cursor.fetchall()

        rows.reverse()
        return [{"role": str(row[0]), "content": row[1]} for row in rows]

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
