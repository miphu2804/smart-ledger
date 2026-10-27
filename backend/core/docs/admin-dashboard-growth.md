# Admin dashboard: daily creation counts

Core handoff for `feat/admin-dashboard-growth`. The canonical API shape, date rules,
examples, errors, data boundaries and audit semantics now live in the
[API contract](../../../docs/contracts/api-contracts.md#chuỗi-tạo-mới-theo-ngày--admin-growth).
The approved behavior is [FR-024 / AC-097–AC-100](../../../docs/product/product-requirements.md#nghiệm-thu-tổng-quan-admin-theo-ngày).
Implementation status is in the
[technical design](../../../docs/architecture/technical-design.md#tổng-quan-admin-theo-ngày--admin-growth).
This handoff does not establish FE or staging acceptance.

The owner approved publication; [PR #368](https://github.com/miphu2804/smart-ledger/pull/368)
was merged into `staging` at `d4dc743` on 2026-10-26, carrying feature HEAD
`3e93dd1`. Deployment and FE acceptance have not been verified by this documentation
handoff. The first CI run
lost its self-hosted runners before build/test; its report upload also hit the
artifact-storage quota. Those operational failures do not replace CI verification.

## Integration and rollout

- New additive route: `GET /api/v1/admin/overview/growth`; the original overview
  remains unchanged and supplies the KPI cards and current shop-status counts.
- Supply `fromDate` and `toDate` for 7/30/90-day charts; see the canonical contract.
  No new environment variables, dependencies, tables, indexes or migrations.
- SQL aggregates each source independently, then joins a bounded daily series.
  It does not load entity lists into JVM memory. Realistic large-dataset query plans
  and latency remain unverified; obtain approval before any index migration.
- The read is audited as the existing `ADMIN_OVERVIEW_VIEWED` / `SYSTEM` action,
  not a new chart-specific action. History does not distinguish the two overview
  routes. Audit persistence must succeed before protected data can be returned.
- Rollback: revert the additive route and its callers; retain all audit history.
  Do not change or run shared-DB migrations for this feature.
- FE source is unchanged by this branch. Staging smoke/UAT must verify the public
  contract and real ADMIN authorization after deployment; local tests are not UAT.

## Automated checks

Controller tests cover auth, role/status guards, ranges, response shape, no-store,
audit failure and unsupported writes. PostgreSQL tests cover real existing Flyway
migrations in a UUID test schema, Vietnam midnight boundaries with a UTC DB session,
leap day, zero filling, maximum range, independent counts, agreement with overview,
and audit failure/retry.

Use only a disposable database with `CORE_TEST_POSTGRES_URL`,
`CORE_TEST_POSTGRES_USERNAME`, and `CORE_TEST_POSTGRES_PASSWORD`. The PostgreSQL
suite creates and drops its own test schema; never point it at business databases.

```powershell
.\mvnw.cmd '-Dtest=AdminDashboardControllerWebTest,AdminDashboardPostgresTest,AdminAccessAuditServiceTest' test
.\mvnw.cmd verify
```

## Verification history

- 2026-10-22: 47 targeted cases passed against a separate PostgreSQL 16.15 container,
  zero failures/errors/skips. The explicit UTC-session assertion was added later.
- A subsequent full PostgreSQL verify was interrupted; it is not claimed as a pass.
- 2026-10-23: verify without DB variables passed: 1,306 cases reported,
  1,050 executed, 256 skipped. This is not a full DB regression.
- The pre-push rerun and review are recorded in [PROGRESS.md](../../../PROGRESS.md).
- 2026-10-26: verify without DB variables passed again on staging base
  `0e2b1de`: 1,050 executed, 256 skipped, zero failures/errors. The explicit UTC
  DB-session assertion compiled but was skipped. At that checkpoint, full
  PostgreSQL verification was pending because the Docker Linux engine was unavailable.
- 2026-10-26, after Docker recovered: full `mvnw.cmd -B verify` passed on committed
  code `976be02` in a clean temporary checkout against separate PostgreSQL 16.15:
  1,422 testcases, zero failures/errors/skips, BUILD SUCCESS in 13:31. Maven totals
  agree with the XML testcase counts. The dashboard controller's 22 cases and
  PostgreSQL suite's 18 cases passed, including the explicit UTC-session assertion.
  Existing migrations ran only in disposable test schemas; no business database
  was used. Local log: `backend/core/target/admin-growth-full-verify-20261026.log`
  (ignored). The validation blocker was resolved; push was awaiting approval at that checkpoint.
- No new migration was authored. FE/Firebase end-to-end, deployment and load testing
  are outside this automated result.
