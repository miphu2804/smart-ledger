-- Additive CORE-015 schema. No existing users, Firebase identities, shops or ledger rows are rewritten.
-- Logical external identity key intentionally has no users FK: mapping precedes first /auth/session.
-- Recovery: disable Zalo and retain these durable mappings; never drop them to roll back application code.
CREATE TABLE external_auth_identities (
    provider VARCHAR(30) NOT NULL,
    provider_app_id VARCHAR(100) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    firebase_uid VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_external_auth_identities PRIMARY KEY (provider, provider_app_id, provider_subject),
    CONSTRAINT ck_external_auth_identities_provider CHECK (provider = 'ZALO')
);

CREATE TABLE oauth_login_sessions (
    id UUID PRIMARY KEY,
    state_hash VARCHAR(64) NOT NULL UNIQUE,
    browser_binding_hash VARCHAR(64) NOT NULL,
    purpose VARCHAR(10) NOT NULL,
    client_origin VARCHAR(2048) NOT NULL,
    client_request_id VARCHAR(128) NOT NULL,
    client_challenge VARCHAR(64) NOT NULL,
    verifier_ciphertext VARCHAR(2048),
    status VARCHAR(20) NOT NULL,
    provider_subject VARCHAR(255),
    display_name VARCHAR(255),
    proof_hash VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    proof_expires_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    provider_app_id VARCHAR(100) NOT NULL,
    CONSTRAINT ck_oauth_login_sessions_purpose CHECK (purpose IN ('LOGIN', 'LINK')),
    CONSTRAINT ck_oauth_login_sessions_status CHECK (status IN ('PENDING', 'EXCHANGING', 'VERIFIED', 'CONSUMED', 'FAILED')),
    CONSTRAINT ck_oauth_login_sessions_expiry CHECK (expires_at > created_at),
    CONSTRAINT ck_oauth_login_sessions_proof_expiry CHECK (proof_expires_at IS NULL OR proof_expires_at <= expires_at),
    CONSTRAINT ck_oauth_login_sessions_pending_verifier CHECK (status NOT IN ('PENDING', 'EXCHANGING') OR verifier_ciphertext IS NOT NULL),
    CONSTRAINT ck_oauth_login_sessions_verified_proof CHECK (status <> 'VERIFIED' OR (proof_hash IS NOT NULL AND provider_subject IS NOT NULL AND proof_expires_at IS NOT NULL))
);

-- New, initially empty table: a transactional index is appropriate; no existing ledger table is locked/rebuilt.
CREATE INDEX ix_oauth_login_sessions_expires_at ON oauth_login_sessions(expires_at);

-- Auth stores are server-only even if an exposed Supabase schema has legacy default table grants.
ALTER TABLE external_auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_login_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE external_auth_identities, oauth_login_sessions FROM PUBLIC;
DO $$
DECLARE
    public_role TEXT;
BEGIN
    FOREACH public_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = public_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE %I.external_auth_identities, %I.oauth_login_sessions FROM %I',
                current_schema(), current_schema(), public_role);
        END IF;
    END LOOP;
END $$;
-- No public policies. Core's trusted SQL role must be the owner or have separately reviewed access.
