-- Owner-approved phase-five addition, 2026-11-08: exact model metadata for durable replay.
-- No copied question/answer, backfill, new grants or shared-environment execution implied.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE agent_turn_receipts
    ADD COLUMN result_model VARCHAR(512),
    ADD COLUMN result_model_version VARCHAR(512),
    ADD CONSTRAINT ck_agent_receipt_model CHECK (
        (result_model IS NULL AND result_model_version IS NULL)
        OR (state = 'SUCCEEDED' AND result_model IS NOT NULL AND result_model_version IS NOT NULL));
