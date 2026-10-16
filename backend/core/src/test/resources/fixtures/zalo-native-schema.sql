-- TEST FIXTURE ONLY. Prospective approved CORE-016 schema in an isolated UUID test schema.
-- NOT a Flyway migration, NOT a deployment/upgrade script. Runtime must never execute this file.
ALTER TABLE oauth_login_sessions
    ADD COLUMN client_type VARCHAR(10) NOT NULL DEFAULT 'WEB',
    ADD COLUMN native_client_id VARCHAR(100),
    ADD COLUMN return_target_id VARCHAR(100),
    ADD COLUMN handoff_reference_hash VARCHAR(64) UNIQUE,
    ADD COLUMN handoff_expires_at TIMESTAMPTZ,
    ALTER COLUMN client_origin DROP NOT NULL,
    DROP CONSTRAINT ck_oauth_login_sessions_verified_proof;

ALTER TABLE oauth_login_sessions
    ADD CONSTRAINT ck_test_oauth_channel CHECK (
        (client_type='WEB' AND client_origin IS NOT NULL AND native_client_id IS NULL AND return_target_id IS NULL
            AND handoff_reference_hash IS NULL AND handoff_expires_at IS NULL)
        OR (client_type='ANDROID' AND client_origin IS NULL AND native_client_id IS NOT NULL AND return_target_id IS NOT NULL
            AND proof_hash IS NULL AND proof_expires_at IS NULL)),
    ADD CONSTRAINT ck_test_oauth_handoff_expiry CHECK (handoff_expires_at IS NULL OR handoff_expires_at <= expires_at),
    ADD CONSTRAINT ck_test_oauth_verified CHECK (status <> 'VERIFIED' OR (provider_subject IS NOT NULL AND (
        (client_type='WEB' AND proof_hash IS NOT NULL AND proof_expires_at IS NOT NULL)
        OR (client_type='ANDROID' AND handoff_reference_hash IS NOT NULL AND handoff_expires_at IS NOT NULL))));
