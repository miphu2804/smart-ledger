-- Drop the rolling chat summary columns: the feature was removed because short
-- support messages never approach the chat model's context limit. On databases
-- that never applied 003 this is a no-op.
ALTER TABLE chat_conversations
    DROP COLUMN IF EXISTS summary,
    DROP COLUMN IF EXISTS summary_through_message_id;
