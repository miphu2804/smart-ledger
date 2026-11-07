---
type: Verification Guide
title: "SmartLedger Core — verification and regression guide"
description: "Disposable-database checks, feature regression commands and migration evidence boundaries for Core."
owner: Core owner
status: stable
author: miphu2804
---
# SmartLedger Core — verification and regression guide

Source review: `staging` commit `a2766ee3a37e23c0f03fd43383b608c1b2fac898`. This Core-owned guide preserves detailed regression commands, provider setup and smoke procedures moved out of the service landing page. Commands and `scripts/` paths are relative to `backend/core` unless stated otherwise. It is an engineering verification guide, not a product contract or deployment approval. The [API contracts](../../../docs/contracts/api-contracts.md), feature handoffs and [technical design](../../../docs/architecture/technical-design.md) own behavior; local tests prove implementation against their checked-in revision only.

## Verification map

| Area | Canonical detail | Focused checks |
|---|---|---|
| API and common service behavior | [API contracts](../../../docs/contracts/api-contracts.md) | `ApiDocumentationWebTest`, `CoreBusinessContractWebTest`, controller/service suites |
| Barcode and catalog | [barcode contract](../../../docs/contracts/api-contracts.md#barcode-core-012) and [V16 ERD notes](../../../docs/architecture/erd-description.md#7-migration-alignment) | `ProductBarcode*`, `CatalogControllerWebTest` |
| OWNER pagination and filtered totals | [pagination contract](../../../docs/contracts/api-contracts.md#pagination-of-owner-lists) and [sale summary](../../../docs/contracts/api-contracts.md#sales-list-totals-under-filters-core-014) | `Owner*`, `SalesListQueryPostgresTest`, `SalePaymentServiceTest` |
| Transactions, locks and alerts | [batched queries](../../../docs/architecture/technical-design.md#41-batched-queries) and [concurrency](../../../docs/architecture/technical-design.md#44-concurrency-and-lifecycle-core-013) | `ProductBatchLockPostgresTest`, `NotificationPostgresTest`, concurrency suites |
| Admin growth | [admin handoff](admin-dashboard-growth.md) | `AdminDashboardControllerWebTest,AdminAccessAuditServiceTest,AdminDashboardPostgresTest` |
| Daily activity and quotas | [CORE-018](user-daily-activity.md), [CORE-019](user-rate-limits.md) | `UserDailyActivity*`, `UserRateLimit*` |
| Stock adjustment | [CORE-021 handoff](stock-adjustments.md) | `ProductStockAdjustmentTest`, contract and product tests |
| Media | [Media setup](#cloudinary-media) and [media contract](../../../docs/contracts/api-contracts.md#1-auth-and-shop) | `Cloudinary*`, `Media*`, `ImageUploadValidatorTest` |
| Zalo | [web plan/evidence](zalo-auth-implementation-plan.md), [Android runbook](zalo-android-preparation.md) | `*Zalo*`, Node popup/landing helpers |

## Migration evidence and safety

The checked-in Core tree at this revision contains Flyway `V1__...` through `V20__...`, including V19 daily activity and V20 rate-limit tables. This is the **checked-in schema**, not evidence that any shared database has reached V20 or that a feature is enabled/accepted. Apply shared migrations only from reviewed, merged code through the repository migration workflow; never run a feature checkout against a business, staging or production database.

Most current PostgreSQL regression suites apply the checked-in migration set in a generated schema. Historical migration tests intentionally pin an earlier version or test an upgrade path, for example V15/V16/V17/V18/V19 compatibility. Those historical fixtures preserve rollout/recovery evidence and must not be read as the deployed schema. A test result is local implementation evidence, not staging/production acceptance.

Set all three variables only to a disposable PostgreSQL database with permission to create schemas:

```powershell
$env:CORE_TEST_POSTGRES_URL = 'jdbc:postgresql://localhost:55432/core_test'
$env:CORE_TEST_POSTGRES_USERNAME = 'test_user'
$env:CORE_TEST_POSTGRES_PASSWORD = 'test_password'
```

The suites create/drop randomly named schemas and do not run Flyway against the database itself. Without `CORE_TEST_POSTGRES_URL`, PostgreSQL suites are skipped; skipped is not a pass. Never use `.env.staging`, Supabase, production credentials or a business database for these tests. Credentials, Firebase tokens, Cloudinary secrets, Zalo secrets and signed URLs must stay out of source, logs, command arguments, tickets and chat.

## Baseline and full verification

Run from `backend/core`:

```powershell
.\mvnw.cmd test
.\mvnw.cmd verify
python scripts/verify_postgres_tests.py target/surefire-reports
```

The report gate requires the configured PostgreSQL suites to have executed and passed. Run `clean verify` for a fresh report set when checking the complete suite; do not use stale Surefire output. The Core tests are not Firebase, FE, real-provider, load, staging or production UAT.

For the real repayment/void concurrency and rollback path:

```powershell
.\mvnw.cmd '-Dtest=DebtVoidPostgresTest' test
```

It uses only a random `core_void_test_*` schema, requires schema creation, and stubs authentication/idempotency. A missing test URL skips it.

## Catalog and barcode verification

`GET /api/v1/products/lookup?barcode=ABC-123` is an exact, case-sensitive, ACTIVE product lookup for an authenticated OWNER and owned ACTIVE shop; it returns one `ProductResponse`, not a page, and the repository performs one bounded Product query rather than loading the catalog. CREATE, PATCH and lookup trim Unicode whitespace and scanner CR/LF/TAB suffixes, preserve case/leading zeros/punctuation, reject internal whitespace/control characters and enforce 100 Unicode code points after trim. PATCH omission preserves the stored value, including legacy values; explicit null/blank clears it, and legacy values are not bulk-normalized. Missing, foreign-shop and archived products return `404 product_not_found`; duplicate ACTIVE codes return `409 product_barcode_conflict` with `details: [{field: "barcode", issue: "already_in_use", productId: 123, status: "ACTIVE"}]` when the application precheck can provide it, while a database race may omit details.

V16 is an index/constraint change, not a column. Before a reviewed rollout, pause catalog writes and check duplicates; the transactional index build is not zero-downtime:

```sql
SELECT shop_id, barcode, COUNT(*)
FROM products
WHERE status = 'ACTIVE' AND barcode IS NOT NULL
GROUP BY shop_id, barcode
HAVING COUNT(*) > 1;
```

A timeout, duplicate or dependency rolls back V16. Do not delete/recode history, rewrite V4, baseline a shared database, use Flyway repair to bypass failure, or drop the new guard. Recovery uses a reviewed forward migration; old binaries may block archived-code reuse until compatible application code is restored.

Focused checks use the disposable variables above:

```powershell
.\mvnw.cmd '-Dtest=ProductServiceTest,CatalogControllerWebTest,ProductBarcodeWebTest,ProductBarcodePostgresTest,ProductBarcodeMigrationPostgresTest,SaleRefundMigrationPostgresTest,ApiErrorDetailTest,ApiExceptionHandlerTest,ApiDocumentationWebTest' test
```

`ProductBarcodePostgresTest` checks normalization, archive reuse, conflict details, tenant/status permissions and one Product query over 20,000 synthetic products. `ProductBarcodeMigrationPostgresTest` checks fresh V1–V16, V15 upgrade/history, uniqueness, atomic failure and concurrent writers in generated schemas. These are implementation checks; FE and staging acceptance remain separate.

## Lists, pagination and filtered sale totals

The six OWNER list GETs return `PageResponse<T>` with default `page=0&size=20`; there is no `/page` route or full-array fallback, size is 1–100 and offset must fit `Integer.MAX_VALUE`. Filtering precedes pagination. Simple lists use at most two data queries; sale/draft item queries are bounded by page parent IDs and shop and use at most three including count (Spring Data may infer a total without count). Content/count share one `REPEATABLE_READ` snapshot per request, not across requests. Date bounds use offset timestamps and `[from,to)`; URL `+` must be encoded as `%2B`. Do not compute shop-wide totals or group incomplete debt pages from one page. FE must consume `items` and metadata, reset/load pages on shop/filter changes, and not replace this contract with local aggregation.

```powershell
$baseUrl = 'http://localhost:8080'
$headers = @{ Authorization = "Bearer $env:CORE_LOCAL_OWNER_TOKEN"; 'X-Shop-Id' = '4' }
$from = [uri]::EscapeDataString('2026-10-09T00:00:00+07:00')
$to = [uri]::EscapeDataString('2026-10-10T00:00:00+07:00')
$page = Invoke-RestMethod -Method Get -Headers $headers `
    -Uri "$baseUrl/api/v1/sales?page=0&size=2&from=$from&to=$to"
$page | Select-Object page,size,totalElements,totalPages
$page.items
```

Check no-result and beyond-last pages, negative/overflow page values, size 0/101, exact time boundaries, equivalent `Z`/`+07:00` timestamps, missing/foreign/inactive/archived shops and ADMIN denial. Keep `CORE_LOCAL_OWNER_TOKEN` local and never print or commit it.

Focused list and summary checks:

```powershell
.\mvnw.cmd '-Dtest=OwnerListQueryTest,OwnerPaginationWebTest,OwnerListPaginationPostgresTest,SalesListQueryPostgresTest,ApiDocumentationWebTest' test
.\mvnw.cmd '-Dtest=SalePaymentServiceTest,SaleDraftServiceTest,SalesListQueryPostgresTest' test
.\mvnw.cmd '-Dtest=SalesListQueryPostgresTest,OwnerListQueryTest,SalePaymentServiceTest,OwnerPaginationWebTest,ApiDocumentationWebTest' test
```

`OwnerListPaginationPostgresTest` covers tenant/filter/count consistency, effective draft expiry without GET writes, literal/accent-insensitive search, stock thresholds, sorting, timestamp boundaries, a 100,000-product catalog, deep pages, query counts, response bytes, plans and per-request snapshot consistency. `SalesListQueryPostgresTest` covers 1/20/100/1,337/10,000 parents, bounded item reads, empty pages, ordering, tenant guards and the old 101-query versus new three-query control. The filtered sale summary returns `matchedOrderCount`, `confirmedOrderCount`, `voidedOrderCount`, `confirmedSalesVnd` and `voidedSalesVnd`; confirmed value is sale value after discount, not cash collected, voided value is whole sale value, and filtering uses `soldAt` while report net revenue uses void timing. Summary tests cover zero results, status/search/time filters, discounts, payment states, cross-period voids, archived snapshots, permissions and signed-64-bit overflow. Timings are diagnostic, not production SLAs.

## Transaction, lock and concurrency regressions

Confirm and void lock selected products once in ascending ID order; void can restore archived products from historical `stockDeducted` snapshots. Stock alerts reconcile once for a nonempty group, while history/dedup writes can still occur per product when a new cycle opens. Draft creation/replacement reads distinct catalog IDs once and all-custom requests read no Product rows; request-order validation, snapshots, rounding and rollback remain unchanged.

```powershell
.\mvnw.cmd '-Dtest=SaleDraftServiceTest,SaleVoidServiceTest,ProductBatchLockPostgresTest,DebtVoidPostgresTest' test
.\mvnw.cmd '-Dtest=NotificationEventServiceTest,NotificationPostgresTest,ProductBatchLockPostgresTest,SaleDraftServiceTest,SaleVoidServiceTest' test
.\mvnw.cmd '-Dtest=SaleDraftServiceTest,ProductBatchLockPostgresTest' test
```

`ProductBatchLockPostgresTest` checks SQL ordering/plans, 1/20/100 products, a 100,000-product catalog, missing/foreign/archived/custom items, unknown deduction snapshots, reverse-order concurrency and rollback of stock, money/debt, audit, notifications and idempotency. It logs median local timings after warmup but asserts query counts, not latency; those measurements are not HTTP/Firebase/FE benchmarks or staging guarantees. `NotificationPostgresTest` checks LOW → OUT → resolved → LOW, replay, recipient uniqueness and failure rollback. These are SQL/transaction regressions, not HTTP/Firebase/FE load tests or UAT.

The broader CORE-013 suites cover auth/session, shop, catalog/category, media and stock-restoration commit orders. Run them only with the disposable variables:

```powershell
.\mvnw.cmd '-Dtest=AuthSessionConcurrencyPostgresTest,ShopConcurrencyPostgresTest,CatalogLifecycleConcurrencyPostgresTest,CategoryAssignmentConcurrencyPostgresTest,MediaConcurrencyPostgresTest,ProductStockRestorationTest,CheckoutControllerWebTest,NotificationPostgresTest' test
.\mvnw.cmd clean verify
```

CI's `scripts/test_verify_postgres_tests.py` and `scripts/verify_postgres_tests.py target/surefire-reports` require critical suites to execute; a focused run is not a full-gate result.

## Admin, stock, reports and media

For the additive ADMIN growth API, no migration or new environment variable exists. The existing `audit_logs` model and ADMIN read actions are reused; failed audit persistence rolls back the operation. See the [admin handoff](admin-dashboard-growth.md) for rollout boundaries and dated evidence.

```powershell
.\mvnw.cmd '-Dtest=AdminDashboardControllerWebTest,AdminAccessAuditServiceTest,AdminDashboardPostgresTest' test
```

For CORE-021, the adjustment is a positive quantity decrease with a mandatory reason, OWNER/shop/product guards, shared Product lock, idempotent replay and atomic stock/audit/notification commit. No migration is added; never send an absolute stock count through PATCH. See [stock-adjustments.md](stock-adjustments.md) for the FE and staging handoff.

```powershell
.\mvnw.cmd '-Dtest=ProductStockAdjustmentTest,ProductServiceTest,CoreBusinessContractWebTest,ApiDocumentationWebTest' test
```

Stock-in adds positive quantity under the same Product lock as checkout, void and catalog edits; PATCH no longer accepts `stockQuantity`, including null, and enabling tracking starts at zero. Create/ProductResponse retain initial/current stock. Advanced reports reuse summary periods; V12 snapshots nullable `sale_items.estimated_cost_vnd`, preserves null historical/custom/unknown-cost rows, allocates discount and event timing, and reports incomplete cost coverage. Stock-in, advanced reports and media focused checks are:

```powershell
.\mvnw.cmd '-Dtest=ProductStockInServiceTest,ProductServiceTest,CoreBusinessContractWebTest,ApiDocumentationWebTest,IdempotencyServiceTest,AuditLogPostgresTest' test
.\mvnw.cmd '-Dtest=AdvancedReportServiceTest,ExpenseReportControllerWebTest,ReportAggregationPostgresTest,SaleDraftServiceTest' test
.\mvnw.cmd '-Dtest=CloudinaryMediaConfigurationTest,MediaControllerWebTest,MediaServiceTest,MediaWriteTransactionServiceTest,MediaCleanupWorkerTest,MediaCleanupWorkerConfigurationTest,ImageUploadValidatorTest,MediaPublicIdFactoryTest,MediaIdempotencyReplayTest,MediaPersistenceModelTest,SaleRefundMigrationPostgresTest' test
```

For a real local Cloudinary smoke test only, use a disposable/local schema with `FLYWAY_ENABLED=false`, all four Cloudinary values and a small JPEG/PNG; verify only returned URLs and cleanup completion. Never use shared staging with `ddl-auto=update`, paste secrets or signed URLs into logs/chat, or infer provider/deployment acceptance from these tests.

## Daily activity, quotas and notifications

[CORE-018](user-daily-activity.md) owns V19 retention, RLS, the read-only Grafana SQL and staging evidence. It counts successful authenticated API use, not billing/audit events; defaults off and does not replace business audit. Its checked-in SQL and dedicated reader privilege checks must be used for Grafana, not an owner/superuser session.

[CORE-019](user-rate-limits.md) owns V20 commit-based cross-instance quotas. Enforcement defaults off; all writers must be upgraded before activation. Do not trust unreviewed forwarded headers, use RAM on storage errors, repair Flyway history or drop quota/business/audit tables during rollback. Replay remains free at full quota; provider I/O stays outside database transactions.

V15 OWNER notifications use existing `notification_events` and `notification_recipients`, with nullable `products.low_stock_threshold`; no historical alerts or thresholds are backfilled. Tracked stock zero is OUT_OF_STOCK; positive stock at/below threshold is LOW_STOCK. Level changes, restocking above threshold, disabling tracking and archive resolve old alerts; a resolved alert remains unread until marked read. The read APIs use an OWNER bearer token and `shopId`, page 0 with size 1–100, and reject any inaccessible batch ID atomically; INACTIVE shops expose only status notifications and ARCHIVED shops are excluded. V15 adoption/migration failures roll back and require forward correction, never baseline/repair. `NotificationPostgresTest` and `SaleRefundMigrationPostgresTest` cover lifecycle, rollback, read concurrency and migration retry. No push delivery, device registration, email/SMS or FE acceptance is implied.

## Cloudinary media

Core accepts JPEG/PNG by validated bytes rather than filename/MIME, limits uploads to 5 MiB and 2048×2048, and never sends `CLOUDINARY_API_SECRET` or provider public IDs to clients. Startup fails if a media credential or unsafe prefix is missing. Use separate credentials or at least prefixes such as `smartledger/local`, `smartledger/staging` and `smartledger/prod`. Product image/logo uploads are public media; user avatars are authenticated media. When disabled, media writes return `503 media_unavailable`, cleanup is absent, and session endpoints still work with a stored avatar reference.

Replacement/deletion writes a `media_cleanup_jobs` row with the database change. The worker claims PENDING jobs using `FOR UPDATE SKIP LOCKED`, checks current references and active uploads, and retries only PENDING jobs. Provider deletion occurs while the per-job transaction is open; an asset uploaded before a database rollback may still need operational cleanup. All uploads require `Idempotency-Key`; an active duplicate returns `409 media_upload_in_progress`, a completed request replays its snapshot, and expired leases are reclaimed atomically so stale uploaders cannot complete a newer lease. Firebase `avatar_url` remains the fallback; DELETE removes only a custom Cloudinary avatar, while disabled media returns `503` when a custom reference exists and returns `204` for an absent reference. Apply V13/V14 only through the reviewed migration workflow; see the [API contract](../../../docs/contracts/api-contracts.md#1-auth-and-shop) and [verification guide](#cloudinary-media).


| Variable | Meaning |
|---|---|
| `CLOUDINARY_ENABLED` | `false` by default; enable only with all Cloudinary values below |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-only media credentials; never put them in mobile/web variables |
| `CLOUDINARY_PUBLIC_ID_PREFIX` | Required when media is enabled; use a separate safe namespace such as `smartledger/local` |
| `MEDIA_UPLOAD_LEASE_SECONDS` | PENDING upload lease, default `300`; expired leases can be reclaimed safely |
| `CLOUDINARY_CLEANUP_FIXED_DELAY_MS` | Optional cleanup-worker delay, default `60000`; shorten only for local testing |

## Browser, deployment and health checks

For a browser calling Core directly, configure exact origins in the process running Core, for example:

```powershell
$env:CORS_ALLOWED_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'
```

Use actual HTTPS FE origins in hosted environments, with no path or trailing slash. Wildcards and wildcard preview domains are rejected. CORS allows `Authorization`, `Content-Type`, `X-Shop-Id` and `Idempotency-Key`; it does not grant authentication or shop access. Native clients and PowerShell still use normal bearer and authorization checks.

Unauthenticated health endpoints expose status without component details or credentials:

| Endpoint | Purpose |
|---|---|
| `/actuator/health/liveness` | Process availability; no PostgreSQL/AI check |
| `/actuator/health/readiness` | PostgreSQL readiness; `503` when not ready |
| `/actuator/health` | Aggregate status and probe names |

Point deployment checks at readiness. Health does not verify Firebase, schema completeness, AI availability or the whole business flow; health is the only exposed Actuator surface.

Keep Firebase projects, database credentials, FE origins and internal tokens separate per environment. Do not set the Auth Emulator on staging/production, put service-account JSON or database passwords in Git/FE configuration, or use a production database for local tests. On production explicitly set `OPENAPI_ENABLED=false` and `SWAGGER_UI_ENABLED=false`; there is no automatic environment detection and later `--env-file`/process values can override earlier ones.

After startup, test real Firebase tokens (valid, wrong project and expired), OWNER/ADMIN permissions and cross-shop denial, then the FE business flow with mocks disabled. Health or a mocked web test alone is not CORE-004 acceptance.

### Read-only staging auth smoke check

Use [scripts/verify_staging_auth.ps1](../scripts/verify_staging_auth.ps1) only against the actual HTTPS staging origin. It performs GET requests, creates no users/sessions/data, and is not production UAT. Prepare two existing OWNER profiles with different ACTIVE shops and one existing ADMIN through the approved fixture process; the script does not create them.

Set `CORE_STAGING_URL`, `CORE_STAGING_FIREBASE_PROJECT_ID`, `CORE_STAGING_SHOP_A_ID`, `CORE_STAGING_SHOP_B_ID`, `CORE_STAGING_OWNER_A_TOKEN`, `CORE_STAGING_OWNER_B_TOKEN`, `CORE_STAGING_ADMIN_TOKEN`, `CORE_STAGING_WRONG_PROJECT_TOKEN` and `CORE_STAGING_EXPIRED_TOKEN` in the script process. Use genuinely issued Firebase ID tokens; do not edit JWTs, paste tokens into chat/source/command arguments, or use service-account JSON as an ID token. Clear token variables and close the terminal afterward.

```powershell
.\scripts\verify_staging_auth.ps1
```

The 54 checks cover readiness, rejection, roles, own-shop access and cross-shop/ADMIN denial across nine OWNER read APIs. JWT decoding checks fixture metadata only; signatures are verified by Core. Missing fixtures, redirects, network failures or unexpected contracts fail the run. The offline guard test uses synthetic fixtures and no network; neither it nor this smoke check proves FE integration, writes, provider UI or production state.


## Time display

Core stores UTC internally, API timestamps carry Vietnam's `+07:00` offset, and report periods use the Vietnam calendar. Clients must parse the offset, not add seven hours. Date/time inputs require `Z` or `+07:00`. To display PostgreSQL `TIMESTAMPTZ` in Vietnam time for one SQL connection:

```sql
SET TIME ZONE 'Asia/Ho_Chi_Minh';
```

This changes display only and must be reapplied after reconnecting.


## Zalo verification boundary

The [web plan](zalo-auth-implementation-plan.md) owns V17 contract, account safeguards and error matrix; [zalo-auth.tdd.md](zalo-auth.tdd.md) owns dated local evidence; [Android preparation](zalo-android-preparation.md) owns V18 activation and physical APK boundaries; [manual-zalo-login](zalo-manual-login.md) owns the opt-in real-provider local helper. Do not duplicate or promote their historical local results to deployment acceptance.

Use only a disposable PostgreSQL database:

```powershell
.\mvnw.cmd '-Dtest=*Zalo*' test
.\mvnw.cmd clean verify
python scripts/test_verify_postgres_tests.py
python scripts/verify_postgres_tests.py target/surefire-reports
node --test scripts/test_zalo_popup.mjs
```

Provider/Firebase calls are mocked in automated tests. The Node popup check uses synthetic HTML and needs Node 22+ and Chrome (`CHROME_PATH` may override it). Verify callback query/body/Authorization/cookie redaction, trusted proxy behavior and edge/shared throttling separately. Never share callback URLs, proofs, verifiers, custom tokens, cookies, HAR files or raw provider logs. Local tests do not establish FE integration, real Firebase signing/revocation, HTTPS cookie behavior, external-user UAT, APK acceptance or staging/production rollout.
