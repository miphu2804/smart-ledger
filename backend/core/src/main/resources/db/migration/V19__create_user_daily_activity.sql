-- CORE-018: additive daily activity only; no historical backfill or business-data changes.
-- Apply after merge, before enabling USER_ACTIVITY_ENABLED. Recovery: disable the flag and retain this table.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE user_daily_activity (
    user_id BIGINT NOT NULL,
    activity_date DATE NOT NULL,
    CONSTRAINT pk_user_daily_activity PRIMARY KEY (user_id, activity_date),
    CONSTRAINT fk_user_daily_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- The user-first PK deduplicates requests; this index serves day ranges and retention cleanup.
CREATE INDEX idx_user_daily_activity_date ON user_daily_activity(activity_date, user_id);

-- Daily user identifiers are server-only, including projects with legacy Supabase default grants.
ALTER TABLE user_daily_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE user_daily_activity FROM PUBLIC;
DO $$
DECLARE
    public_role TEXT;
BEGIN
    FOREACH public_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = public_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE %I.user_daily_activity FROM %I', current_schema(), public_role);
        END IF;
    END LOOP;
END $$;
-- No public policy. A separately reviewed read-only Grafana role needs an explicit SELECT policy.
