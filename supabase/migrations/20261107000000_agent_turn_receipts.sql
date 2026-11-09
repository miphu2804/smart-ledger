-- Owner-approved phase-two storage only. Apply after the AI chat baseline.
-- No Core FK points here and no existing chat writer uses this receipt yet.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE agent_turn_receipts (
    turn_id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    request_hash VARCHAR(64) CHECK (request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$'),
    hash_version INTEGER CHECK (hash_version IS NULL OR hash_version > 0),
    input_conversation_id BIGINT CHECK (input_conversation_id IS NULL OR input_conversation_id > 0),
    state VARCHAR(16) NOT NULL CHECK (state IN ('IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    execution_fence BIGINT NOT NULL CHECK (execution_fence > 0),
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    result_conversation_id BIGINT REFERENCES chat_conversations(id) ON DELETE SET NULL,
    result_message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
    failure_code VARCHAR(64),
    CONSTRAINT ck_agent_receipt_fingerprint CHECK (
        (request_hash IS NOT NULL AND hash_version IS NOT NULL)
        OR (state = 'CANCELLED' AND request_hash IS NULL AND hash_version IS NULL AND input_conversation_id IS NULL)),
    CONSTRAINT ck_agent_receipt_completion CHECK ((state = 'IN_PROGRESS') = (completed_at IS NULL)),
    CONSTRAINT ck_agent_receipt_dates CHECK (completed_at IS NULL OR completed_at >= created_at),
    CONSTRAINT ck_agent_receipt_failure CHECK (
        (state IN ('FAILED', 'CANCELLED') AND failure_code IS NOT NULL AND btrim(failure_code) <> '')
        OR (state NOT IN ('FAILED', 'CANCELLED') AND failure_code IS NULL)),
    -- Successful references can become NULL after owner chat deletion; the success still counts once.
    CONSTRAINT ck_agent_receipt_result CHECK (state = 'SUCCEEDED'
        OR (result_conversation_id IS NULL AND result_message_id IS NULL))
);
CREATE INDEX idx_agent_receipt_conversation ON agent_turn_receipts(result_conversation_id);
CREATE INDEX idx_agent_receipt_message ON agent_turn_receipts(result_message_id);
CREATE INDEX idx_agent_receipt_recovery ON agent_turn_receipts(state, created_at);
CREATE INDEX idx_agent_receipt_user ON agent_turn_receipts(user_id);
CREATE INDEX idx_agent_receipt_shop ON agent_turn_receipts(shop_id);
ALTER TABLE agent_turn_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON agent_turn_receipts FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'ai_sql_reader'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON TABLE %I.agent_turn_receipts FROM %I', current_schema(), role_name);
        END IF;
    END LOOP;
END $$;
