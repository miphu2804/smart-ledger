# CORE-019: shared success quotas

The owner approved commit-based, cross-instance quotas and the two-table migration on 2026-10-31. This supersedes the in-memory/request-counting proposal in [issue #430](https://github.com/miphu2804/smart-ledger/issues/430). Enforcement defaults off; no shared-DB migration or activation is implied.

The [API contract](../../../docs/contracts/api-contracts.md#giới-hạn-thao-tác-core-019) owns limits, responses, retry and fixed-window semantics. Traceability is BR-024 → FR-037 → AC-104–108.

## Architecture

`RateLimitPolicy` defines two POST groups. `UserRateLimitFilter` runs inside Spring Security after Firebase verification, with servlet auto-registration disabled. It maps verified UID to an active Core profile and commits the window anchor before controller validation, without consuming quota or rejecting replay based on capacity. Unmatched methods/routes bypass it.

`UserRateLimitService` owns transaction boundaries and fail-closed storage errors; `UserRateLimitRepository` owns SQL. All admission/completion/release operations acquire the same transaction advisory lock for user/group before media/user/shop row locks. Hash collisions serialize operations but never share counters. PostgreSQL supplies timestamps across instances.

Media idempotency admission takes that lock first and reserves quota only for a new/reclaimed upload, in the same short REQUIRES_NEW transaction as its media lease. Full quota rolls back both admissions. Valid replay returns the stored result without reserving quota, even when full; it still validates user/body/key and expiry.

Cloudinary I/O remains outside DB transactions. Final media writes complete quota before business row locks, then update the media reference, idempotency result, cleanup outbox and audit in the same transaction. Later failure rolls everything back. Failure release changes only PENDING receipts using their opaque token; expired leases free capacity on admission. A request that lost its lease cannot commit. A still-valid late completion belongs to its admitted window.

Shop creation reserves/completes inside the existing shop/audit transaction. It does not gain idempotency: each new POST can create another shop. Success means DB commit, including when a client loses the response.

## V20 and retention

`user_rate_limit_windows` stores UUID, user FK with cascade, group, start/end and successful count; it has a unique user/group/start, expiry index and group/count/date checks. `user_rate_limit_reservations` stores UUID, window FK with cascade, unique opaque lease token, status and creation/lease/completion timestamps; its composite window/status/expiry index supports admission. No email, bearer token, raw idempotency key, IP or image bytes are stored.

Both tables use RLS and revoke PUBLIC/anon/authenticated access without client policies. Backend role access follows the existing Core privilege model. Migration collision fails and rolls back rather than adopting another table. The logical model is in [DBML](../../../docs/architecture/diagrams/src/erd.dbml).

Adding another quota group requires reviewing both the policy and the database group/count constraints in a new migration; adding another route to an existing group only changes its policy matcher.

Hourly cleanup deletes windows that ended more than one day ago and have no live PENDING lease; receipts cascade. It never deletes active quotas, business data or audit. Disabling enforcement skips quota SQL, including cleanup.

## Proxy trust

Native forwarded headers enable Tomcat RemoteIpValve before the unchanged Zalo filter. Defaults trust multiple private/loopback ranges, not a Docker network name. Core has no published host port in the VPS compose file, but this does not prove every internal peer is trusted.

Inspect the actual Caddy peer/network ranges before rollout and narrow Spring Boot's `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES` regex where required; never set it empty to trust all peers. Caddy's normal reverse_proxy behavior discards untrusted forwarded values. Review trusted_proxies separately if a CDN is placed ahead of Caddy. Do not parse X-Forwarded-For directly in application code. See [Tomcat](https://tomcat.apache.org/tomcat-10.1-doc/config/valve.html#Remote_IP_Valve) and [Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#defaults).

Forwarding also affects scheme/secure information; smoke-test HTTPS Zalo cookies and web/native redirects. Zalo's existing salted 4096-bucket guard remains per instance and permits conservative collisions; it does not become distributed.

## Activation and recovery

1. Merge reviewed code/migration after CI; follow the [shared migration workflow](../../../docs/development/local-development.md#database-migrations), never migrate shared DBs from a feature checkout.
2. Apply merged V20 to staging in its approved window; verify Flyway, constraints, RLS and privileges with backup/recovery controls.
3. Upgrade all Core writers with `USER_RATE_LIMIT_ENABLED=false`; drain pre-upgrade uploads and allow old pending leases to expire before enabling. Old writers do not enforce quota.
4. Set `USER_RATE_LIMIT_ENABLED=true` consistently on every writer through normal deployment. No Redis dependency is added. Existing `MEDIA_UPLOAD_LEASE_SECONDS` (default 300) controls the upload lease, not the 60-second quota window.
5. Smoke-test Caddy/Firebase/media with test owners: new upload 11 and shop 6 rejected, replay free, Retry-After visible through CORS, Core restart and replicas agree. Production is a separate release after staging acceptance.

Rollback by disabling the flag on every writer and retaining both tables; old code ignores the additive schema. Flag-off writes are unmetered and are not backfilled when re-enabled. Do not drop quota/business/audit tables, repair Flyway history or silently use RAM on storage errors. New writes fail closed as specified in the contract.

## Verification boundary

`UserRateLimitPostgresTest` covers V19 upgrade/rerun/collision rollback, constraints/RLS metadata, independent instances/restart simulation, concurrency, rollback, windows, expiry, cleanup and missing store. `MediaConcurrencyPostgresTest` runs enforcement on and tests actual media/lease/audit commits, replay at full quota and provider failure/retry. HTTP tests exercise real Tomcat trusted/untrusted peers; web tests cover identity, route scope and error envelopes. The PostgreSQL CI gate requires the new cases.

These checks do not establish deployed proxy trust, FE retry UX, real provider acceptance or staging/production rollout. No shared migration is performed by implementation tests.
