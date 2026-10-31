-- CORE-019: owner-approved additive quota state. Do not apply to shared DBs from a feature branch.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE user_rate_limit_windows (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_key VARCHAR(30) NOT NULL CHECK (group_key IN ('MEDIA_UPLOAD', 'SHOP_CREATE')),
    started_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    successful_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT ck_rate_window_dates CHECK (ends_at > started_at),
    CONSTRAINT ck_rate_window_count CHECK (successful_count >= 0 AND successful_count <=
        CASE group_key WHEN 'MEDIA_UPLOAD' THEN 10 ELSE 5 END),
    CONSTRAINT uq_rate_window_start UNIQUE (user_id, group_key, started_at)
);
CREATE INDEX idx_rate_windows_expiry ON user_rate_limit_windows(ends_at);

CREATE TABLE user_rate_limit_reservations (
    id UUID PRIMARY KEY,
    window_id UUID NOT NULL REFERENCES user_rate_limit_windows(id) ON DELETE CASCADE,
    lease_token UUID NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMMITTED', 'RELEASED')),
    lease_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT ck_rate_reservation_dates CHECK (lease_expires_at > created_at),
    CONSTRAINT ck_rate_reservation_status CHECK ((status = 'PENDING') = (completed_at IS NULL))
);
CREATE INDEX idx_rate_reservations_window ON user_rate_limit_reservations(window_id, status, lease_expires_at);

ALTER TABLE user_rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rate_limit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_rate_limit_windows, user_rate_limit_reservations FROM PUBLIC;
DO $$
DECLARE public_role TEXT;
BEGIN
    FOREACH public_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = public_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE %I.user_rate_limit_windows, %I.user_rate_limit_reservations FROM %I',
                current_schema(), current_schema(), public_role);
        END IF;
    END LOOP;
END $$;
