ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS summary TEXT;

-- Watermark of the newest message already folded into `summary`. `summary_through_message_id`
-- deliberately has no foreign key: it marks a position in the message stream, and the messages
-- below it stay in `chat_messages` for `search_chat_history`-style lookups.
ALTER TABLE chat_conversations
    ADD COLUMN IF NOT EXISTS summary_through_message_id BIGINT;
