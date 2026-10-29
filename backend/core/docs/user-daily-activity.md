# Daily user activity — CORE-018

Owner-approved implementation for [#409](https://github.com/miphu2804/smart-ledger/issues/409), prepared on `feat/core-daily-activity`. This records successful authenticated API use, including read-only report visits. It adds no FE endpoint and is separate from creation counts, business audit, realtime CCU and Core/JVM metrics. Local verification does not establish staging acceptance or production activation.

## What counts

- A mapped, currently ACTIVE Core OWNER or ADMIN calls a handled `/api/v1/**` controller with a verified Firebase Bearer token, and the final HTTP response is 2xx or 3xx without an unhandled exception. OPTIONS, public Zalo authorize/callback/exchange, health/static resources and 4xx/5xx do not count.
- `user_id` comes from the server-side `auth_identities` mapping, never email, query parameters or `X-User-Id`. UID resolution happens after the controller transaction, so a first successful `POST /auth/session` can record the newly committed profile. Status is read from the DB even on a cache hit.
- `activity_date` is the Vietnam date at initial authenticated MVC admission. Async/SSE waits for final MVC completion and retains that date across midnight. Failed/disconnected async requests without a final successful dispatch are not counted. An SSE HTTP 200 counts API use even when an application-level error event is sent inside the stream; this is not a model-success metric.
- The table holds only `(user_id, activity_date)`. It stores no IP, user agent, path, body or credential. All login providers use the same canonical Firebase UID/Core account mapping. This does not merge identities.

## Persistence and memory

V19 creates `user_daily_activity` with composite PK, user FK (`ON DELETE CASCADE` only for this telemetry), and `(activity_date, user_id)` index. It does not backfill earlier days or touch business rows. RLS is enabled and PUBLIC/Supabase client-role grants are revoked. Core uses its trusted owner role, or separately reviewed privileges/policies.

Each cache miss inserts with `ON CONFLICT DO NOTHING` in a short separate transaction. Only a committed successful attempt enters the cache. Per-user lock stripes prevent concurrent same-instance writes; the PK also handles other instances, process restarts and cache eviction. The default cache is bounded to 10,000 user/date entries per instance and clears when the Vietnam day changes. It stores no status decision. Eviction can cause an extra harmless INSERT attempt, so the cache is an optimization rather than the uniqueness guarantee. There is still one indexed identity/status SELECT per eligible request.

Database/transaction failures produce a fixed warning at most once a minute and leave the business response unchanged. The next eligible request retries. JDBC statements and the write transaction have a two-second timeout; acquiring a pooled connection still follows the existing datasource pool timeout. Recording is synchronous after controller completion and is not guaranteed during a database outage or process crash. Do not treat these counts as billing or an audit ledger.

Retention includes today and the preceding 89 Vietnam dates. An hourly worker, first run after one minute, deletes older rows; failures retry on the next run. A cleanup outage can temporarily retain older rows, but the published DAU/MAU queries always bound their windows. Turning the feature off also stops cleanup; the operator must arrange retention cleanup during a prolonged disablement. This 90-day product decision is not a legal retention claim.

## Configuration and rollout

| Variable | Default | Meaning |
|---|---|---|
| `USER_ACTIVITY_ENABLED` | `false` | Enables the recorder and retention worker only after V19 succeeds |
| `USER_ACTIVITY_CACHE_MAXIMUM_SIZE` | `10000` | Maximum entries per instance, accepted range 1–100000 |

1. Review the V19 migration from a branch merged into `staging`, backup/recovery access and a migration window according to [the repository migration rules](../../../docs/development/local-development.md#database-migrations). Never run this feature branch against shared databases.
2. Apply the merged V19 through the migration owner's normal process. Keep runtime Flyway configuration unchanged. Verify the new table, index and RLS while preserving existing user/identity/business data.
3. Before enabling, agree a bounded staging test window and latency/pool acceptance budget with the Core/monitoring owner, and capture a flag-off baseline on the same migrated build using the measurement plan below. Then set `USER_ACTIVITY_ENABLED=true` in the maintained Core staging config, sync it to the runtime env, and recreate Core through the normal deployment process. No change to Firebase or FE flags is needed.
4. With a staging test account, call a read-only API twice and confirm a single row. Verify absent/invalid tokens and downstream 401/403 do not add a row, then verify a newly created Core account and a later Vietnam date.
5. The monitoring owner for [#269](https://github.com/miphu2804/smart-ledger/issues/269) reviews the dedicated read-only Grafana role, installs the SQL panels below and verifies staging results. Production requires its own migration/release decision.

Recovery: turn `USER_ACTIVITY_ENABLED=false` and recreate Core. Keep V19 and existing rows so an application rollback does not remove data or change old migration checksums. Removing the schema requires a separately reviewed forward migration. A failed migration must be corrected/retried normally, never silently adopted with baseline/repair.

## Staging evidence required before closing #409

The issue remains open until staging evidence is recorded. The local 1449-test result and disposable-DB reader-role test below establish implementation behavior, not this rollout acceptance.

| Gate | Evidence to record | Current status |
|---|---|---|
| Merged schema and runtime | Tested commit/image, V19 migration success, staging host and flag-on time | Not verified on staging |
| Eligible activity | Read-only app request records one user/day, a repeated request adds none, and unauthenticated/401 requests add no activity | Not verified on staging |
| Actual Grafana datasource role | Connect directly with the staging datasource's dedicated read-only login; record the effective role and privilege checks below, without credentials | Not verified on staging |
| DAU and MAU panels | Run both checked-in SQL statements through that role on staging; record execution time, expected vs actual aggregate counts, timezone and exclusion of load-test accounts | Not verified on staging |
| Operational latency and pool impact | Flag-off vs flag-on measurements below, approved budget and Core/monitoring owner decision | Not measured on staging |

Record sanitized evidence in the PR/issue or an approved team report: environment, commit, test window, role, aggregate results and timings. Do not attach raw users/emails, passwords, connection strings or Bearer tokens. Publishing a report/comment remains a separate explicitly authorized action.

When connected as the actual datasource login, these checks are read-only:

```sql
SELECT current_user, session_user, current_database(), current_setting('TimeZone');
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
SELECT has_table_privilege(current_user, 'public.user_daily_activity', 'INSERT') AS can_insert,
       has_table_privilege(current_user, 'public.user_daily_activity', 'UPDATE') AS can_update,
       has_table_privilege(current_user, 'public.user_daily_activity', 'DELETE') AS can_delete,
       has_column_privilege(current_user, 'public.users', 'phone', 'SELECT') AS can_read_phone;
```

The effective role must be the dedicated reader, without superuser/BYPASSRLS or the write/phone privileges above. Also review inherited roles and table ownership; a successful owner/superuser query or owner session using `SET ROLE` is not proof that Grafana's real login has the right access. Run the [actual panel SQL](sql/user-daily-activity.sql), not only these privilege checks.

### Staging latency measurement

Use the same migrated commit, container resources, datasource settings, read-only endpoint mix, test accounts, concurrency and request rate in each phase. Keep writes/chat and production out of this measurement. Use only the approved bounded staging window; do not intentionally exhaust the shared DB pool to demonstrate failure.

1. Measure the recorder disabled after application warmup. Record sample count, request rate, concurrency, p50/p95/p99 client latency, throughput, HTTP errors/timeouts, request/executor occupancy, and available Hikari active/idle/pending/connection-acquisition timing.
2. Enable and recreate Core, allow equivalent application warmup, then measure a fresh test-account cohort's first eligible requests of the day (activity cache misses). Keep warmup traffic separate from that cohort. Record the same signals and activity-row results.
3. Repeat the cohort on the same day (warm activity cache). The per-request identity/status SELECT still runs, even when no INSERT is needed. Record the same signals and confirm row counts stay constant.
4. Record the actual pool connection timeout and statement/transaction timeout configuration. Compare deltas against the budget agreed before the run, and have the Core/monitoring owner decide acceptance. Existing monitoring or an approved profiler must supply server/pool signals; missing instrumentation is an unmeasured item, not a zero-cost result. Do not expose a public metrics endpoint or log credentials to collect it.

The two-second JDBC query/write-transaction timeouts do not cap connection acquisition, lock-stripe waiting or total recording time. Because recording runs synchronously in `afterCompletion`, some response bytes may already have reached the client before recording finishes. Client latency alone can therefore hide added servlet-thread occupancy and pool contention. Do not claim negligible overhead from warm-cache INSERT counts or client timing alone.

If enabling introduces errors, connection-acquisition timeouts, sustained pool queuing or exceeds the agreed performance budget, disable the feature, recreate Core and retain V19/data while investigating. A separate bounded telemetry datasource or an asynchronous recorder requires a reviewed design/change; neither is part of this implementation.

## Grafana handoff

Use [the read-only DAU/MAU queries](sql/user-daily-activity.sql) with a dedicated PostgreSQL datasource. DAU returns 90 zero-filled dates for each role. MAU means 30 calendar dates including today, not a calendar month or the sum of DAUs. Both explicitly use `Asia/Ho_Chi_Minh` regardless of DB/session timezone and exclude emails beginning `loadtest+` case-insensitively. Classification/exclusion use the current role/email, not historical snapshots. Users subsequently disabled remain in their historical counts.

The reviewed datasource role needs schema USAGE, column SELECT on `user_daily_activity(user_id, activity_date)` and `users(id, system_role, email)`, plus a SELECT RLS policy on the activity table. For an existing role `grafana_reader` in the `public` schema, the DB owner can review the following one-time setup; it is not run by V19 or Core:

```sql
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT (user_id, activity_date) ON public.user_daily_activity TO grafana_reader;
GRANT SELECT (id, system_role, email) ON public.users TO grafana_reader;
CREATE POLICY grafana_daily_activity_read ON public.user_daily_activity
    FOR SELECT TO grafana_reader USING (true);
```

Do not grant INSERT/UPDATE/DELETE, ownership, BYPASSRLS, service-role credentials or public/client access. Review existing inherited privileges and any RLS on users separately. This branch hands off SQL and the required privileges; it does not modify Grafana or shared-environment roles.

## Verification

Run from `backend/core` with `CORE_TEST_POSTGRES_URL`, `CORE_TEST_POSTGRES_USERNAME` and `CORE_TEST_POSTGRES_PASSWORD` pointing exclusively at disposable PostgreSQL:

```bash
mvn -B -Dtest=UserDailyActivityServiceTest,UserDailyActivityWebTest,UserDailyActivityPostgresTest test
mvn -B verify
```

The tests cover security/MVC registration, read-only and rejected requests, async completion, UID mapping after profile creation, Vietnam midnight, cache bounds/retry/concurrency, actual V18→V19 migration, PK/FK/index, cross-instance deduplication, retention and the Grafana windows. A skipped PostgreSQL suite is not database validation. Shared-DB migration, Grafana datasource provisioning and staging/production acceptance remain operator checks.

Verified locally on 2026-10-29 using disposable PostgreSQL 16.15:

| Check | Result |
|---|---|
| CORE-018 focused suite | 27 tests passed, zero skipped |
| Full `mvn -B verify` with PostgreSQL enabled | 1449 tests passed, zero failures/errors/skips |
| Final PostgreSQL assertions, including values under Honolulu DB timezone | 6 tests passed, zero skipped |
| Required PostgreSQL report gate | Passed, including the new CORE-018 suite |
| Gate self-tests | 13 passed |
| Modified Markdown links/anchors and ERD layout coverage | No missing targets or tables |

Logs and the link-check result are local ignored artifacts under `backend/core/target/core-018-*`. No shared database, Grafana, Firebase, FE or VPS configuration was changed by these checks.
