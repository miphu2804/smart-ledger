-- Read-only activity numbers for sizing load tests (PEAK_USERS).
--
-- Core records no sign-in or last-seen time, so "active" here means the user wrote
-- something: a sale, a sale draft, an expense, or any audited action. Users who only
-- read reports are not counted, so DAU below is a lower bound. Accounts whose email
-- starts with `loadtest+` are the load-test accounts and are left out.
--
-- Run in the Supabase SQL editor, or as a Grafana Postgres datasource with a
-- read-only role (see docs/development/load-testing-and-monitoring.md). Days and
-- hours are in the shop's time zone, Asia/Ho_Chi_Minh.

-- 1. Daily active users over the last 30 days.
WITH activity AS (
    SELECT actor_user_id AS user_id, created_at FROM audit_logs
    UNION ALL
    SELECT created_by_user_id, created_at FROM sales
    UNION ALL
    SELECT created_by_user_id, created_at FROM sale_drafts
    UNION ALL
    SELECT created_by_user_id, created_at FROM expenses
)
SELECT
    (a.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
    count(DISTINCT a.user_id) AS dau
FROM activity a
JOIN users u ON u.id = a.user_id
WHERE a.created_at >= now() - interval '30 days'
  AND coalesce(u.email, '') NOT LIKE 'loadtest+%'
GROUP BY day
ORDER BY day;

-- 2. Share of active users per hour of day over the last 30 days. The busiest
-- hour's share is the "peak-hour share" in CCU = DAU x share x (session min / 60).
WITH activity AS (
    SELECT actor_user_id AS user_id, created_at FROM audit_logs
    UNION ALL
    SELECT created_by_user_id, created_at FROM sales
    UNION ALL
    SELECT created_by_user_id, created_at FROM sale_drafts
    UNION ALL
    SELECT created_by_user_id, created_at FROM expenses
),
user_hours AS (
    SELECT DISTINCT
        a.user_id,
        (a.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
        extract(hour FROM a.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hour
    FROM activity a
    JOIN users u ON u.id = a.user_id
    WHERE a.created_at >= now() - interval '30 days'
      AND coalesce(u.email, '') NOT LIKE 'loadtest+%'
),
user_days AS (
    SELECT count(*) AS total FROM (SELECT DISTINCT user_id, day FROM user_hours) d
)
SELECT
    hour,
    count(*) AS active_user_hours,
    round(count(*)::numeric / nullif((SELECT total FROM user_days), 0), 3) AS share_of_daily_users
FROM user_hours
GROUP BY hour
ORDER BY hour;
