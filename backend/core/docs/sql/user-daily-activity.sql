-- CORE-018: read-only Grafana panels. Roles are current users.system_role, not a historical role snapshot.
-- No status filter: later suspension must not erase an earlier eligible day.
-- DAU: 90 Vietnam dates including today, zero-filled separately for OWNER and ADMIN.
WITH dates AS (
    SELECT generate_series(
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 89,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        interval '1 day')::date AS activity_date
), eligible AS (
    SELECT a.user_id, a.activity_date, u.system_role
    FROM user_daily_activity a JOIN users u ON u.id=a.user_id
    WHERE a.activity_date BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 89
        AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND coalesce(u.email, '') NOT ILIKE 'loadtest+%'
)
SELECT d.activity_date, r.system_role, count(e.user_id) AS active_users
FROM dates d CROSS JOIN (VALUES ('OWNER'), ('ADMIN')) r(system_role)
LEFT JOIN eligible e ON e.activity_date=d.activity_date AND e.system_role=r.system_role
GROUP BY d.activity_date, r.system_role
ORDER BY d.activity_date, r.system_role;

-- MAU: distinct users in today + previous 29 Vietnam dates, including empty role groups.
SELECT r.system_role, count(DISTINCT a.user_id) AS active_users
FROM (VALUES ('OWNER'), ('ADMIN')) r(system_role)
LEFT JOIN users u ON u.system_role=r.system_role AND coalesce(u.email, '') NOT ILIKE 'loadtest+%'
LEFT JOIN user_daily_activity a ON a.user_id=u.id
    AND a.activity_date BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 29
        AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
GROUP BY r.system_role ORDER BY r.system_role;
