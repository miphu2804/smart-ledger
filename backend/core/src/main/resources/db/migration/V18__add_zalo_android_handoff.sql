-- CORE-016: channel-bound Android handoff. Existing sessions default to WEB; no account/profile backfill.
-- Transactional migration on the transient OAuth store, not a zero-downtime/concurrent index build.
-- Stop new OAuth starts for the reviewed window. Contention or unexpected schema aborts the whole V18.
-- Recovery: disable native and retain schema/mappings. No automatic destructive DOWN migration.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE oauth_login_sessions
    ADD COLUMN client_type VARCHAR(10) NOT NULL DEFAULT 'WEB',
    ADD COLUMN native_client_id VARCHAR(100),
    ADD COLUMN return_target_id VARCHAR(100),
    ADD COLUMN handoff_reference_hash VARCHAR(64),
    ADD COLUMN handoff_expires_at TIMESTAMPTZ,
    ALTER COLUMN client_origin DROP NOT NULL,
    DROP CONSTRAINT ck_oauth_login_sessions_verified_proof;

ALTER TABLE oauth_login_sessions
    ADD CONSTRAINT uq_oauth_login_sessions_handoff_reference UNIQUE (handoff_reference_hash),
    ADD CONSTRAINT ck_oauth_login_sessions_channel CHECK (
        (client_type = 'WEB' AND client_origin IS NOT NULL
            AND native_client_id IS NULL AND return_target_id IS NULL
            AND handoff_reference_hash IS NULL AND handoff_expires_at IS NULL)
        OR
        (client_type = 'ANDROID' AND client_origin IS NULL
            AND native_client_id IS NOT NULL AND return_target_id IS NOT NULL
            AND proof_hash IS NULL AND proof_expires_at IS NULL)
    ),
    ADD CONSTRAINT ck_oauth_login_sessions_handoff_expiry CHECK (
        handoff_expires_at IS NULL OR handoff_expires_at <= expires_at
    ),
    ADD CONSTRAINT ck_oauth_login_sessions_verified_handoff CHECK (
        status <> 'VERIFIED' OR (provider_subject IS NOT NULL AND (
            (client_type = 'WEB' AND proof_hash IS NOT NULL AND proof_expires_at IS NOT NULL)
            OR
            (client_type = 'ANDROID' AND handoff_reference_hash IS NOT NULL AND handoff_expires_at IS NOT NULL)
        ))
    );

-- Retain V17 RLS, grants, policies, WEB proof uniqueness/expiry and all other lifecycle constraints.
-- No baseline, IF NOT EXISTS, public policies/grants, durable identity rewrite or runtime auto-DDL.
