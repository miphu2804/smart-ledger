# SmartLedger Core — setup

Core is a Java 21 / Spring Boot backend. This README covers how to run it locally on Windows, macOS/Linux, in IntelliJ IDEA, or with Docker Compose. For product behavior and API details, see the [documentation index](../../docs/README.md) and [API contracts](../../docs/contracts/api-contracts.md).

## Prerequisites

- JDK 21 for a host/IntelliJ run. The included Maven wrapper downloads the required Maven version; a separate Maven installation is not needed.
- A PostgreSQL database: the shared staging Supabase database from the repo-root `.env.staging`, or your own local `smartledger` database.
- Firebase project ID and a Firebase service-account JSON file. Keep the JSON outside the repository and do not commit it.

Set these environment variables in the process that launches Core. [`.env.example`](.env.example) is a reference; Spring Boot does not load it automatically.

| Variable | Description |
|---|---|
| `DATABASE_URL` | JDBC URL, for example `jdbc:postgresql://localhost:5432/smartledger` |
| `DATABASE_USERNAME`, `DATABASE_PASSWORD` | PostgreSQL credentials |
| `FIREBASE_PROJECT_ID` | Firebase project used by this backend |
| `GOOGLE_APPLICATION_CREDENTIALS` | Absolute path to the service-account JSON **on the machine running Core** |
| `SERVER_PORT`, `PORT` | Optional; `SERVER_PORT` takes precedence, then the hosted runtime's `PORT`, then `8080` |
| `CORS_ALLOWED_ORIGINS` | Exact browser origins, comma-separated; empty by default (no cross-origin browser access) |
| `OPENAPI_ENABLED`, `SWAGGER_UI_ENABLED` | Both default to `true` for local/staging; set both to `false` on production |
| `FLYWAY_ENABLED` | `false` for the shared dev/staging database; `true` for a disposable database or an authorized migration run |
| `FIREBASE_AUTH_EMULATOR_HOST` | Optional for local Auth Emulator testing, e.g. `127.0.0.1:9099` without `http://` |
| `AI_BASE_URL` | Optional; AI service URL for the Agent proxy, defaults to `http://localhost:8001` |
| `INTERNAL_API_TOKEN` | Shared with AI and sent as `X-Internal-Token`; a missing or mismatched value makes AI return `401`, which Core reports as `503 ai_unavailable` |
| `IDEMPOTENCY_TTL_DAYS` | Optional; retention of `Idempotency-Key` results, defaults to `30` |
| `CLOUDINARY_ENABLED` | `false` by default; set `true` only when all Cloudinary variables below are present |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-only Cloudinary credential; never commit or put in mobile/web variables |
| `CLOUDINARY_PUBLIC_ID_PREFIX` | Required when media is enabled; relative namespace such as `smartledger/local`, `smartledger/staging`, or `smartledger/prod` |
| `MEDIA_UPLOAD_LEASE_SECONDS` | PENDING Product/logo/avatar upload lease, defaults to `300`; an expired lease can be safely claimed again with the same key/file |
| `CLOUDINARY_CLEANUP_FIXED_DELAY_MS` | Optional cleanup worker delay; defaults to `60000` ms and is useful as a short value only in local testing |

With `FLYWAY_ENABLED=true` (the default in `application.yml`) Flyway runs committed migrations at startup; JPA then validates the schema. The shared dev/staging database is migrated only from merged code, so set `FLYWAY_ENABLED=false` when you point Core at it (see [Database migrations](../../README.md#database-migrations)). Use the same Firebase project ID for the backend and any locally generated test tokens.

## Cloudinary media

Core uploads one Product image and one Shop logo as public media, and one user avatar as authenticated media. The client calls Core multipart endpoints; it never receives `CLOUDINARY_API_SECRET` or a provider public ID. Core accepts JPEG/PNG only, validates bytes rather than the filename/MIME, limits files to 5 MiB and dimensions to 2048×2048.

Set `CLOUDINARY_ENABLED=true` only together with cloud name, API key, API secret and a prefix. Startup deliberately fails when one is missing or the prefix is unsafe. Use separate credentials or at least prefixes for local/staging/production; for example `smartledger/local`, `smartledger/staging`, `smartledger/prod`. When disabled, media writes return `503 media_unavailable`, the cleanup worker is absent, and session endpoints still work even for an account that has a stored avatar reference.

Replacing or deleting a Product image/logo/avatar commits a `media_cleanup_jobs` row alongside the database change. The worker locks PENDING jobs with `FOR UPDATE SKIP LOCKED`, checks current references and active uploads, then deletes the old asset. Its per-job transaction remains open during deletion; competing workers skip it. Retry updates only PENDING jobs. New assets uploaded before a database rollback may still require operational cleanup.

All three uploads require `Idempotency-Key`. V14 adds `media_upload_keys` with SHOP scope for Product/logo and USER scope for avatar. An active duplicate receives `409 media_upload_in_progress`; a completed request replays its snapshot. Avatar replay regenerates the delivery URL. Expired upload leases are reclaimed atomically with a new token; old uploaders cannot complete or release a newer reservation. Final writes lock/recheck the entity and lease before changing references/audit. Deterministic public IDs use `overwrite=true` to retry identical bytes. Monetary idempotency remains in `api_idempotency_keys`.

Firebase `avatar_url` remains a fallback and keeps syncing. DELETE removes only the custom Cloudinary avatar; later sessions return the fallback. When Cloudinary is disabled, DELETE with a reference returns `503`; an absent custom reference remains a `204` no-op. Apply V13/V14 using the reviewed migration workflow before deploying to a shared database. Apply V13 audit CHECK validation during reduced or stopped writes. See the [API contract](../../docs/contracts/api-contracts.md#1-auth-và-tiệm).

## Windows PowerShell

Open PowerShell in `backend/core`, configure the variables above in that terminal (or use an IntelliJ Run Configuration), then run:

```powershell
.\mvnw.cmd spring-boot:run
```

With the default port, open `http://localhost:8080/swagger-ui/index.html` to check that Core started. Press `Ctrl+C` to stop it.

## macOS / Linux

Open a terminal in `backend/core`, export the same variables, then run:

```bash
./mvnw spring-boot:run
```

If the wrapper is not executable, run `chmod +x mvnw` once. Swagger uses the same default URL and port as on Windows.

## IntelliJ IDEA

Open `backend/core` as a Maven project and use JDK 21. Run `com.smartledger.core.SmartLedgerCoreApplication`. In **Run → Edit Configurations**, add the variables from the table to **Environment variables**; setting them in a separate terminal does not automatically pass them to IntelliJ. Make sure the database in `DATABASE_URL` is reachable before running the application.

## Docker Compose

Run this from the **repository root** with Docker Desktop/Engine running. Compose has no PostgreSQL container: database credentials come from the root `.env.staging`, and `backend/core/.env` supplies `FIREBASE_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS` as an absolute path to the JSON file on the host. See the root [README](../../README.md#local-compose) for the env files.

```powershell
docker compose --env-file .env.staging --env-file backend/core/.env up --build core
```

Omit `core` to start AI as well. Compose mounts the service-account JSON read-only and sets its path inside the container. Core listens on container port `8080`; Compose exposes it on host port `8000` by default (`CORE_PORT` changes the host port). Open `http://localhost:8000/swagger-ui/index.html` to check startup. Stop with `Ctrl+C`, then run `docker compose down` from the repository root when finished.

If the Firebase Auth Emulator runs on the host, configure `FIREBASE_AUTH_EMULATOR_HOST` with an address reachable **from the container**; `127.0.0.1` inside Core means the container, not the host.

Compose forwards `CORS_ALLOWED_ORIGINS`, `OPENAPI_ENABLED`, `SWAGGER_UI_ENABLED` and the Cloudinary variables into Core. Set the FE origins and Cloudinary values in the selected environment and recreate the Core container after changing them. Host/IntelliJ and hosted runtimes use the same variables directly.

## Browser access and deployment checks

For a browser calling Core directly, set `CORS_ALLOWED_ORIGINS` in the process running Core. For example, with Expo web on port `8081`:

```powershell
$env:CORS_ALLOWED_ORIGINS = 'http://localhost:8081,http://127.0.0.1:8081'
```

For staging/production, use only the actual FE HTTPS origins, for example `https://your-staging-app.vercel.app`. An origin contains a scheme, hostname and optional port, **not** a path or trailing slash. Wildcards and wildcard preview domains are rejected. Add a preview origin explicitly only when needed. A local proxy is not a substitute for deployed CORS configuration.

CORS allows `Authorization`, `Content-Type`, `X-Shop-Id` and `Idempotency-Key` headers. Authentication still uses a bearer token, not cross-site cookies: allowing an origin does not grant a role or access to a shop. Native clients and tools such as PowerShell still require the normal authentication/authorization checks even though CORS is a browser restriction.

The following GET endpoints do not require a token and return a health status, without component details or credentials. The aggregate endpoint also lists the available probe group names:

| Endpoint | Purpose |
|---|---|
| `/actuator/health/liveness` | Process availability; does not check PostgreSQL or AI |
| `/actuator/health/readiness` | Readiness state plus PostgreSQL connectivity; returns `503` when not ready |
| `/actuator/health` | Aggregate health status |

Point a deployment health check at `/actuator/health/readiness`. Health is the only exposed Actuator endpoint; other management endpoints are not exposed. Health does **not** verify Firebase sign-in, schema completeness or the entire business flow. AI availability is not a Core readiness dependency.

Keep environment configuration separate: the existing Firebase project `smart-ledger-c2892` is for dev/staging; `smartledger-production` is for production; the Auth Emulator is local-only. Each hosted environment needs its own database credentials, matching Firebase project/service account, FE origin and (when using AI) internal token. Do not set `FIREBASE_AUTH_EMULATOR_HOST` on a real staging/production runtime. Keep service-account JSON and database passwords outside Git and out of FE configuration. Do not point local tests at the production database.

On production, explicitly set `OPENAPI_ENABLED=false` and `SWAGGER_UI_ENABLED=false`; this disables `/v3/api-docs`, its Swagger configuration endpoint and the Swagger UI. Keep both `true` on staging for API testing. These settings do not change business authentication or health checks. There is no automatic environment detection: loading a production database env file alone does not turn documentation off. With multiple Compose `--env-file` arguments, the later file and process environment can override earlier values; avoid loading local/staging Swagger settings over production settings.

After startup, test real Firebase tokens (valid, wrong project and expired), OWNER/ADMIN permissions and cross-shop denial, then run the FE business flow with mocks disabled. A passing health check or mocked web test alone does not complete CORE-004 acceptance.

## Read-only staging auth smoke check

Use [scripts/verify_staging_auth.ps1](scripts/verify_staging_auth.ps1) in Windows PowerShell 5.1 or PowerShell 7. It makes **GET requests only**, uses no production credentials and does not sign up users, create sessions or change business data. Choose the actual HTTPS **staging** origin explicitly; the script cannot determine whether a domain belongs to production. Never run it against production as a substitute for staging UAT.

Prepare two different existing OWNER profiles with their own ACTIVE shops and one existing ADMIN profile. Provision these fixtures through the team's approved process first; this script does not create them. Put the following variables in the process that runs the script:

| Variable | Value |
|---|---|
| `CORE_STAGING_URL` | Core HTTPS origin, without `/api/v1`, credentials or query parameters |
| `CORE_STAGING_FIREBASE_PROJECT_ID` | Expected staging project ID, normally `smart-ledger-c2892` |
| `CORE_STAGING_SHOP_A_ID`, `CORE_STAGING_SHOP_B_ID` | Different ACTIVE shop IDs belonging to OWNER A and OWNER B |
| `CORE_STAGING_OWNER_A_TOKEN`, `CORE_STAGING_OWNER_B_TOKEN`, `CORE_STAGING_ADMIN_TOKEN` | Fresh real Firebase **ID tokens** for those staging users |
| `CORE_STAGING_WRONG_PROJECT_TOKEN` | Fresh, genuinely issued Firebase ID token from another project (use a separate non-production test project) |
| `CORE_STAGING_EXPIRED_TOKEN` | Genuinely issued staging ID token expired for at least ten minutes; do not edit a JWT to manufacture this fixture |

Obtain tokens locally using the Firebase SDK. Do not paste tokens into chat, source code, committed env files or command-line arguments. The backend's service-account JSON is not an ID token. You may populate a token variable from your local SDK result, e.g. `$env:CORE_STAGING_OWNER_A_TOKEN = $login.idToken`; clear the five token variables when finished and close the test terminal. The script neither prints tokens nor dumps response bodies.

From `backend/core`, after setting all the variables:

```powershell
.\scripts\verify_staging_auth.ps1
```

Missing/invalid fixtures, unexpected status/error contracts, network failures or redirects fail the run instead of reporting success. JWT payload decoding checks fixture metadata only; the script does not verify signatures locally, so fake tokens are not evidence for the real Firebase matrix. There are 54 read-only checks: readiness, token rejection, roles, own-shop access and cross-shop/ADMIN denial across nine OWNER read APIs. Successful output does **not** prove FE integration, create/confirm/repay/void/expense writes, ADMIN status changes or provider UI behavior. Keep those as separate UAT checks. A private service-account file outside the repo is normal; do not commit it to make this script work.

The tool's offline guards can be checked with `.\scripts\test_verify_staging_auth.ps1`. This uses synthetic fixtures and an in-memory transport, makes no network calls and is **not** a real staging/Firebase acceptance run.

## Run tests

From `backend/core`:

```powershell
.\mvnw.cmd test
```

On macOS/Linux, use `./mvnw test`. If startup fails, check the PostgreSQL connection, Firebase credentials, and Flyway error in the Core logs.

For the real PostgreSQL repayment/void concurrency and rollback tests, point these **test-only** variables at a disposable PostgreSQL database:

```powershell
$env:CORE_TEST_POSTGRES_URL = 'jdbc:postgresql://localhost:55432/core_test'
$env:CORE_TEST_POSTGRES_USERNAME = 'test_user'
$env:CORE_TEST_POSTGRES_PASSWORD = 'test_password'
.\mvnw.cmd '-Dtest=DebtVoidPostgresTest' test
```

The test creates and removes only a randomly named `core_void_test_*` schema, requires permission to create schemas, and does not run Flyway. It uses real business services and transactions, with auth/idempotency stubbed. Without `CORE_TEST_POSTGRES_URL`, PostgreSQL suites are skipped; unit/web tests still run normally.

### Exact product barcode lookup and ACTIVE-only uniqueness (CORE-012 / #163–#164)

`GET /api/v1/products/lookup?barcode=ABC-123` returns one `ProductResponse`, not a page. It requires a valid bearer token and `X-Shop-Id`, an active OWNER, and an ACTIVE shop belonging to that OWNER. The repository performs one exact, case-sensitive shop/barcode/ACTIVE lookup with a one-row limit; it does not load the product list. V16's partial unique index supports this lookup.

Create, PATCH and lookup share normalization: trim leading/trailing whitespace (including Unicode spaces and scanner CR/LF/TAB suffixes); preserve case, letters, digits, leading zeros and punctuation; reject internal whitespace, non-whitespace control characters and more than 100 Unicode code points **after trim** with `400 validation_failed` and `details[].field = barcode`. The limit counts code points, not UTF-16 code units, bytes or grapheme clusters; supplementary characters count as one each, matching PostgreSQL `varchar(100)`. Lookup requires a nonblank code; create accepts null/blank as no barcode. PATCH omission preserves the stored value, including legacy values; explicit null/blank clears it. Legacy values are not bulk-normalized.

Missing, foreign-shop or ARCHIVED products return `404 product_not_found`. Account/role/shop access is checked before querying Products. With V16, archive releases a code for another ACTIVE Product in the same shop; the old Product ID/barcode and sale/draft references remain intact. PATCH keeping its own code succeeds. Duplicate ACTIVE codes return `409 product_barcode_conflict`: the service precheck supplies `details: [{field: "barcode", issue: "already_in_use", productId: 123, status: "ACTIVE"}]`; races rejected by the DB may omit details. Ordinary errors retain only field/issue. The handler recognizes both the old constraint and V16 index during rollout.

See the canonical [barcode contract](../../docs/contracts/api-contracts.md#barcode-core-012), `FR-034`/`AC-064`–`AC-067`, and [V16 schema/recovery notes](../../docs/architecture/erd-description.md#7-migration-alignment). No entity field, barcode table, restore API, Redis cache or mobile code is added. FE #162/#165 and integrated staging acceptance remain separate.

To run focused tests, set the three `CORE_TEST_POSTGRES_*` variables above to a **disposable** database, then run:

```powershell
.\mvnw.cmd '-Dtest=ProductServiceTest,CatalogControllerWebTest,ProductBarcodeWebTest,ProductBarcodePostgresTest,ProductBarcodeMigrationPostgresTest,SaleRefundMigrationPostgresTest,ApiErrorDetailTest,ApiExceptionHandlerTest,ApiDocumentationWebTest' test
```

`ProductBarcodePostgresTest` applies the current migrations in a generated `core_barcode_test_*` schema. It verifies persisted normalization, reuse after archive, CREATE/PATCH conflict details, tenant/status permissions and one Product query with 20,000 synthetic products; EXPLAIN uses Hibernate's actual SQL/bindings. Local timing is diagnostic, not a production SLA. `ProductBarcodeMigrationPostgresTest` uses generated `core_barcode_migration_test_*` schemas for fresh V1–V16, V15 upgrade with historical references/snapshots, null/exact/shop uniqueness, migration atomic failure and concurrent CREATE/PATCH writers that both pass precheck. These JDBC races verify the DB guard; HTTP tests verify 409 mapping separately. Tests remove only their own schemas. Without the test URL, PostgreSQL suites are skipped, not passed. Run `clean verify` with all three variables for full regression.

#### V16 rollout and recovery

- Do not run feature-branch migrations against the business local DB, staging or production. Shared rollout follows the [migration workflow](../../README.md#database-migrations): reviewed code merged into staging, backup, migration owner, staging verification, then controlled production release.
- V16 changes an **index/constraint**, not a column. `ddl-auto=update` cannot safely replace the old `UNIQUE(shop_id, barcode)`; reuse remains blocked until V16 runs.
- Review the actual current schema first, including unexpected dependent FKs and any locally added indexes. Check for duplicate ACTIVE non-null codes before migration:

```sql
SELECT shop_id, barcode, COUNT(*)
FROM products
WHERE status = 'ACTIVE' AND barcode IS NOT NULL
GROUP BY shop_id, barcode
HAVING COUNT(*) > 1;
```

- Pause catalog writes and schedule a maintenance window. V16 creates the partial unique index **before** dropping the old constraint in one transaction; lock timeout is 5 seconds and statement timeout is 60 seconds. It is not a concurrent/zero-downtime index build. Test duration on a disposable copy representative of your catalog first; the 20,000-product lookup benchmark does not predict production DDL locking.
- A timeout, duplicate ACTIVE row or unexpected dependency stops/rolls back V16; inspect the cause and retry under the approved process. Never delete/recode history, rewrite V4, baseline a shared DB or use Flyway repair to bypass failure. Confirm a valid unique `uq_products_shop_barcode_active`, the exact ACTIVE/non-null predicate and absence of the old constraint.
- Recovery retains the partial index and uses an ACTIVE-only-compatible application. Old code's precheck can still block archived-code reuse, so rolling back binaries is a degraded mode. Reintroducing the old uniqueness requires a reviewed forward migration and a check for duplicates across ACTIVE **and ARCHIVED**; obtain a resolution decision first. Do not drop the new guard or silently rewrite historical products.

### OWNER list pagination (CORE-011)

[CORE-011 #153](https://github.com/miphu2804/smart-ledger/issues/153) changes the existing six OWNER GET lists (`products`, `sales`, `sale-drafts`, `customers`, `debts`, `expenses`) from arrays to `PageResponse<T>`, even without query parameters. There is no `/page` route or full-array fallback. See the canonical [pagination contract](../../docs/contracts/api-contracts.md#phân-trang-danh-sách-owner) for the exact filters, sorting and errors. Detail/write/report contracts are unchanged; no schema/index migration or Redis cache is added.

All lists default to `page=0&size=20`; size is 1–100 and the offset must fit Integer.MAX_VALUE. Filtering precedes SQL pagination. Sale/draft item queries are bounded by the parent IDs in the page and the selected shop. Simple lists use at most two data queries; sale/draft lists use at most three including count and item batch, excluding auth/shop checks. Spring Data may skip count when the correct total can be inferred. Empty parent pages never load items. Content/count share one REPEATABLE_READ snapshot per request, not across requests; deep OFFSET/count can still be expensive and concurrent changes can shift pages.

With all three `CORE_TEST_POSTGRES_*` variables above pointing to a **disposable** database, run:

```powershell
.\mvnw.cmd '-Dtest=OwnerListQueryTest,OwnerPaginationWebTest,OwnerListPaginationPostgresTest,SalesListQueryPostgresTest,ApiDocumentationWebTest' test
```

`OwnerListPaginationPostgresTest` applies V1–V16 in a generated `core_owner_page_test_*` schema, validates mappings and removes that schema afterward. It checks tenant/filter/count consistency, effective draft expiry without GET writes, literal/accent-insensitive search, stock thresholds and sorting, timestamp boundaries/equivalent offsets, a 100,000-product catalog, deep pages, query counts, response bytes and EXPLAIN ANALYZE. A concurrent insert between content/count verifies per-request snapshot consistency. Timing is logged, not asserted as a latency SLA. Without the test URL PostgreSQL suites are skipped; that is not full verification. Run `.\mvnw.cmd verify` with all three variables for the entire Core regression suite.

For a manual **read-only local** check, first run Core with a local test OWNER token and an ACTIVE shop it owns. Supply `CORE_LOCAL_OWNER_TOKEN` in your terminal without committing or printing it; select your test shop ID below. This does not create fixtures or prove staging UAT:

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

The same `from/to` applies to expenses; it requires offset timestamps and selects `[from, to)`, not inclusive calendar dates. Either bound may be omitted; if both exist, from must precede to by instant. Date-only/no-offset values return 400 validation_failed; reversed/equal bounds return the resource's invalid query code. Do not combine an expense period with either bound. In Swagger enter the raw offset value; URL construction must encode `+` as `%2B`, as above. Neither `fromDate` nor `toDate` is the filter name.

Check no-result and beyond-last pages, page -1, size 0/101, offset overflow, a record exactly at each time bound, and equivalent Z/+07:00 timestamps. With no match expect items empty and totals zero; beyond the last page expect items empty but the actual filtered totals. For protected routes also check missing token, ADMIN, another OWNER's shop and INACTIVE/ARCHIVED shops under the existing auth contract.

**FE rollout remains pending in #144 / PRD AC-063.** Clients/mocks must consume items/metadata, load/reset pages and use server-side filters. Do not reduce a page into shop-wide revenue/profit/debt/expense/stock totals or group incomplete debt pages by customer. Reuse suitable reports; missing aggregate/contact projections require separate approval. FE old arrays are incompatible with this branch; passing Core tests is not authorization to deploy over an unadapted FE or evidence of integrated acceptance.

### Sale and draft list query regression tests

Issue [#134](https://github.com/miphu2804/smart-ledger/issues/134) removed per-parent item reads. CORE-011 retains batching but limits it to page parent IDs plus shop; nonempty pages use up to three data queries including count, and empty pages skip items. These counts exclude auth/shop checks. Sales now sort by soldAt/id descending, drafts by id descending, and items by id ascending within each parent. Detail, confirm and void retain single-parent item reads. The pagination response is a breaking API change, with no schema change.

With the disposable `CORE_TEST_POSTGRES_*` variables above, run:

```powershell
.\mvnw.cmd '-Dtest=SalePaymentServiceTest,SaleDraftServiceTest,SalesListQueryPostgresTest' test
```

`SalesListQueryPostgresTest` applies V1–V16 and validates mappings in a generated `core_list_query_test_*` schema. Synthetic fixtures roll back after each test, and the suite removes only its generated schema. Hibernate SQL counting exercises real list services and ownership checks with 1, 20, 100, 1,337 and 10,000 parents, each with five items, but reads at most 100 parents/500 items per tested page. It verifies filtered totals, item ordering, empty/missing items, cross-shop denial, inactive shops, archived-product snapshots and computed expiry. A control reproduces the old loop with 100 parents (101 data queries) versus three optimized queries including count.

Use only a disposable database with schema-creation permission, never a business, shared staging or production database. Without the test URL, the PostgreSQL suite is skipped. This is a SQL-count regression test, not an HTTP/Firebase/FE load benchmark or staging UAT. SQL pagination bounds parent rows, not the number of items inside any individual order/draft.

### CORE-014 filtered sale totals

On `feat/sales-filter-summary`, `GET /api/v1/sales/summary` accepts the same `q`, `saleStatus`, `from` and `to` filters as the sale list, plus the required OWNER bearer token and `X-Shop-Id`. It aggregates all matching sales without pagination. Time bounds apply to `soldAt`, with `from` inclusive and `to` exclusive; timestamps require an offset. Either bound can be omitted; omitting both includes all history. The existing list and `/reports/summary` retain their behavior.

The response has five non-null integer fields: `matchedOrderCount`, `confirmedOrderCount`, `voidedOrderCount`, `confirmedSalesVnd` and `voidedSalesVnd`. Empty sets return five zeros. Counts and values use the current sale status, and values sum `totalVnd` after discount. Confirmed value includes unpaid and partly paid orders; it is not cash collected. Voided value is the whole sale value, not the refund amount. A prior-period sale voided later stays in its original `soldAt` filter window here; report `netRevenueVnd` instead subtracts void adjustments by `voidedAt`. Separate list and summary requests do not share a database snapshot. A per-status monetary sum exceeding signed 64-bit VND returns HTTP 409 `sale_summary_overflow`; narrow the filters.

With `CORE_TEST_POSTGRES_*` pointing at the disposable database described above, run:

```powershell
.\mvnw.cmd '-Dtest=SalesListQueryPostgresTest,OwnerListQueryTest,SalePaymentServiceTest,OwnerPaginationWebTest,ApiDocumentationWebTest' test
```

The real PostgreSQL summary cases cover zero results/draft exclusion, status and combined search/time filters, equivalent offsets, half-open boundaries, one-sided ranges, discounted paid/partial/debt sales, cross-period voids, literal wildcard and archived-product snapshot search, OWNER/ADMIN/account/shop guards, exact `Long.MAX_VALUE` and overflow for both statuses. Overflow fixtures use valid PAID sales and keep the real business constraints enabled. The 10,000-sale/50,000-item fixture checks one aggregate data SELECT with no item hydration; auth/shop checks are excluded. Logged local timings are observations, not staging latency guarantees. CI requires these summary methods through `scripts/verify_postgres_tests.py`. See the [API contract](../../docs/contracts/api-contracts.md#tổng-danh-sách-sale-theo-bộ-lọc-core-014) and PRD `AC-069`–`AC-072`; FE/staging UAT remains pending.

### Checkout and void batch product-lock tests

Issue [#136](https://github.com/miphu2804/smart-ledger/issues/136) replaces per-product lock queries during confirm and restocking void with one shop-scoped `PESSIMISTIC_WRITE` query ordered by product ID. Confirm requires ACTIVE products; void may restore archived products using the historical `stockDeducted` snapshot. Empty product groups skip the query. Void retains sale → debt → ascending product locks. API, schema, money/debt, cost snapshots and audit contracts are unchanged.

With the disposable `CORE_TEST_POSTGRES_*` variables above, run:

```powershell
.\mvnw.cmd '-Dtest=SaleDraftServiceTest,SaleVoidServiceTest,ProductBatchLockPostgresTest,DebtVoidPostgresTest' test
```

`ProductBatchLockPostgresTest` applies V1–V16 and validates mappings in a generated `core_batch_lock_test_*` schema. It checks the Hibernate SQL and PostgreSQL EXPLAIN ordering, one product-lock query for 1/20/100 products, missing/foreign/archived products, custom and non-deducted items, unknown deduction snapshots, concurrent reverse-order confirmations/voids, and rollback of stock, money/debt, audit, notifications and void idempotency reservations. Fixtures commit to permit real concurrent transactions; the suite removes its generated schema after the class. Use only a disposable database with schema-creation permission, never a business/shared staging/production DB. Without the test URL, PostgreSQL suites are skipped.

The same suite compares legacy single-product locks with batch confirm locks for 1/20/100 selected products sampled across a 100,000-product catalog. It logs median elapsed time from three measured samples after one warmup, including connection/transaction overhead; query counts are asserted but latency is not, to avoid flaky CI thresholds. These local measurements are not HTTP/Firebase/FE benchmarks, sustained-load tests or staging UAT. For the full Core check with PostgreSQL suites enabled, use `mvnw.cmd clean verify` with all three test variables set.

### Batch stock-alert reconciliation tests

Issue [#137](https://github.com/miphu2804/smart-ledger/issues/137) reads open stock alerts once for a nonempty collection of locked products, groups them by product ID, then preserves the existing resolve/flush/new-event/recipient lifecycle. The single-product method delegates to the collection method. Confirm reconciles once after all stock deductions; void reconciles the restored group once. Empty groups skip the alert query.

With the disposable `CORE_TEST_POSTGRES_*` variables above, run:

```powershell
.\mvnw.cmd '-Dtest=NotificationEventServiceTest,NotificationPostgresTest,ProductBatchLockPostgresTest,SaleDraftServiceTest,SaleVoidServiceTest' test
```

Unit tests count open-alert reads with up to 10,000 products. PostgreSQL tests cover LOW → OUT → resolved → LOW cycles, unchanged alerts/readAt, threshold/tracking/archive behavior, replay, reverse-order concurrent confirm/void, recipient uniqueness and notification-write rollback of stock, money/debt, audit and idempotency. The shared batch-lock suite compares 100 single-product reconciliations with one collection reconciliation against 100,000 resolved events plus 10,000 open alerts: open-alert reads drop from 100 to one without notification writes when state is unchanged. New alert cycles still perform per-product history/dedup queries and event/recipient writes; this is not a promise of two SQL statements for an entire confirm or void.

### Draft batch product-read tests

Issue [#135](https://github.com/miphu2804/smart-ledger/issues/135) loads distinct catalog product IDs once, filtered by shop and ACTIVE status, for draft creation/replacement. All-custom requests skip Product reads. Customer validation remains first; collection only gathers IDs, then the original request-order loop checks custom fields, catalog text, duplicates, missing products and monetary overflow. Missing/foreign/archived products retain `DRAFT_ITEM_INVALID`, duplicates retain `DRAFT_ITEM_DUPLICATE`; snapshots, HALF_UP rounding, discount and initial-payment rules are unchanged. These are non-locking reads; confirm retains its separate product locks.

With the same disposable PostgreSQL variables, run:

```powershell
.\mvnw.cmd '-Dtest=SaleDraftServiceTest,ProductBatchLockPostgresTest' test
```

Tests exercise actual create/replace services and Hibernate SQL with 1/20/100 selected products across a 100,000-product catalog: one Product read per write, excluding authentication/shop/customer queries and draft/item writes. All-custom requests use zero Product reads. Multi-error unit cases preserve error precedence; PostgreSQL cases reject missing/foreign/archived products without creating a partial draft or changing the existing draft/items. The suite compares legacy per-product reads with batch reads using three measured samples after one warmup, including connection/transaction overhead. Latency is logged, not asserted; measurements are not HTTP/FE load tests or staging guarantees. The disposable-schema setup/cleanup is described in the batch product-lock section above. No API, schema or migration change is required for either optimization.

### Admin dashboard development tests

With the same disposable PostgreSQL variables, run:

```powershell
.\mvnw.cmd '-Dtest=AdminDashboardControllerWebTest,AdminAccessAuditServiceTest,AdminDashboardPostgresTest' test
```

`AdminDashboardPostgresTest` applies the actual Flyway migrations (currently V1–V18) inside a generated `core_admin_test_*` schema, then removes that schema. It exercises the migrated schema without manual constraint fixtures. No additional audit table is created. Do not point test variables at staging or production.

ADMIN and OWNER events share the existing `audit_logs`; ADMIN reads are separated by their `ADMIN_*` actions and API whitelists. Shop status changes reuse the existing `SHOP_INACTIVATED`/`SHOP_REACTIVATED` event once. V11 extends action/target constraints and allows missing shop/target IDs only for the corresponding ADMIN reads; business events still require both IDs. Existing history, V10 foreign keys and append-only triggers are preserved. Failed audit persistence returns `503 admin_audit_unavailable` and rolls back the operation.

For a fresh disposable local database, use `FLYWAY_ENABLED=true` and `SPRING_JPA_HIBERNATE_DDL_AUTO=validate` to apply V1–V18 and validate the entity mappings. A Flyway-managed database already at V10 applies subsequent versions in order; review the V17 Zalo rollout below and [V18 Android rollout](docs/zalo-android-preparation.md#staging-activation-after-merge) before a shared-environment deployment. Follow the repository's merged-code migration policy for shared environments. Do not enable Flyway blindly on a Hibernate-created database without migration history: V10 rejects pre-existing ADMIN read events. Use a fresh local database or a separately reviewed adoption plan, preserving the original database. The migrations do not baseline or repair migration history.

If V11 validation fails, PostgreSQL rolls back its schema changes; review the offending records before retrying. Recovery uses a forward fix retaining audit history. Restoring V10 constraints or older readers that cannot handle `ADMIN_*` events is unsafe after these records exist. Integrated Firebase/FE UAT and document alignment remain pending.

To run **all** Core tests, including migration, audit/checkout rollback and real PostgreSQL readiness coverage, keep the three test-only variables above and run `.\mvnw.cmd verify` (or `./mvnw verify`). The migration/audit suites manage their own randomly named schemas; use a disposable database with schema-creation permission. The readiness test checks connectivity with valid and deliberately invalid test credentials, so an expected database-health warning can appear in the logs.

### Stock-in development tests

Product stock-in adds a positive quantity under the same row lock used by checkout, void and catalog edits. PATCH no longer accepts `stockQuantity`, including null; enabling tracking starts at zero. Create and ProductResponse keep initial/current stock. See the [Product contract](../../docs/contracts/api-contracts.md#22-product) for the request, retry rules and required mobile coordination. No migration is added; V7/V10/V11 storage is reused.

With the disposable `CORE_TEST_POSTGRES_*` variables above, run:

```powershell
.\mvnw.cmd '-Dtest=ProductStockInServiceTest,ProductServiceTest,CoreBusinessContractWebTest,ApiDocumentationWebTest,IdempotencyServiceTest,AuditLogPostgresTest' test
```

`AuditLogPostgresTest` applies V1–V16 in a generated `core_audit_test_*` schema and removes only that schema. It checks concurrent receipts/retries and contention with checkout/void/PATCH/archive, audit/idempotency-write rollback, authorization and numeric overflow. Do not use shared/staging/production databases. Manual Swagger checks and mobile UAT remain separate.

### Advanced report development tests

`GET /api/v1/reports/top-products`, `/sales-series` and `/profit-estimate` reuse the summary periods and do not change `/reports/summary`. V12 adds nullable `sale_items.estimated_cost_vnd`; historical/custom/unknown-cost rows remain null. Confirm snapshots known line cost once, while PostgreSQL aggregate queries allocate sale discount, apply soldAt/voidedAt event timing and report incomplete cost coverage explicitly.

With the disposable `CORE_TEST_POSTGRES_*` variables above, run:

```powershell
.\mvnw.cmd '-Dtest=AdvancedReportServiceTest,ExpenseReportControllerWebTest,ReportAggregationPostgresTest,SaleDraftServiceTest' test
```

`ReportAggregationPostgresTest` applies V1–V16 in a generated `core_report_test_*` schema and removes only that schema. It verifies the nullable/nonnegative snapshot constraint, discounted item revenue, catalog/custom grouping, a prior-period void, daily event buckets and incomplete profit estimates. Mobile still computes its existing local analytics until FE integrates these endpoints; Core tests are not FE/staging UAT.

### Cloudinary media development tests

Run the unit/web contract tests without any Cloudinary network credential:

```powershell
.\mvnw.cmd '-Dtest=CloudinaryMediaConfigurationTest,MediaControllerWebTest,MediaServiceTest,MediaWriteTransactionServiceTest,MediaCleanupWorkerTest,MediaCleanupWorkerConfigurationTest,ImageUploadValidatorTest,MediaPublicIdFactoryTest,MediaIdempotencyReplayTest,MediaPersistenceModelTest,SaleRefundMigrationPostgresTest' test
```

Set `CORE_TEST_POSTGRES_*` only to a disposable PostgreSQL database to run the V13/V14 migration assertions and media concurrency tests. To smoke-test a real provider locally, set `CLOUDINARY_ENABLED=true`, all four Cloudinary values, `FLYWAY_ENABLED=false` and use a schema already created by local `ddl-auto=update`; do **not** point a feature branch at shared staging with `update`. Upload a small JPEG/PNG through Swagger, verify only the returned URL, replace it, then verify a `media_cleanup_jobs` row becomes COMPLETED. Local `CLOUDINARY_CLEANUP_FIXED_DELAY_MS=5000` can shorten the test wait. Do not paste Cloudinary API secrets or delivery URLs with authenticated signatures into source, tickets, or chat.

## CORE-013 concurrency and stock-restoration regression tests

Point `CORE_TEST_POSTGRES_URL`, `CORE_TEST_POSTGRES_USERNAME` and `CORE_TEST_POSTGRES_PASSWORD` only at a disposable PostgreSQL database, then run from `backend/core`:

```powershell
.\mvnw.cmd '-Dtest=AuthSessionConcurrencyPostgresTest,ShopConcurrencyPostgresTest,CatalogLifecycleConcurrencyPostgresTest,CategoryAssignmentConcurrencyPostgresTest,MediaConcurrencyPostgresTest,ProductStockRestorationTest,CheckoutControllerWebTest,NotificationPostgresTest' test
.\mvnw.cmd clean verify
```

The PostgreSQL suites create/drop UUID-named schemas, use real row locks and bounded transaction coordination, and must not be skipped for acceptance. Session sync preserves current role/status/Cloudinary avatar state; OWNER/ADMIN Shop writes and Customer/Category update/archive use locked refresh. Product create/PATCH assignment holds the target Category lock until commit: assignment first blocks archive with `category_has_products`; archive first rejects assignment with `product_category_invalid`. PATCH locks Product before Category; archive checks Product existence without taking Product write locks. Null/omitted category semantics remain unchanged. No new field or migration is required.

Media upload/delete writers refresh User, Shop and Product under their row locks before status checks and mutations. `MediaConcurrencyPostgresTest` binds one request-style EntityManager across pre-upload reads, independent commits and the final writer transaction, covering managed (not just detached) entities as with OSIV. It checks both session/avatar and profile/logo orders, disabled/inactive/archived rejection, preservation of Product fields/stock and cleanup of the latest asset reference. Provider access is mocked; the database and transactions are real. There is no transaction spanning the provider upload. Preserving role/status/public IDs means preserving their latest business values, not forbidding unchanged columns in Hibernate UPDATE SQL.

CI runs `python3 scripts/test_verify_postgres_tests.py` and `python3 scripts/verify_postgres_tests.py target/surefire-reports` after Maven. The gate requires all four new profile/catalog concurrency suites, the media suite and critical overflow/rollback methods; missing, empty, skipped or failing suites fail verification. Surefire parameter signatures/invocation indexes are normalized when checking required method names. Run the gate against a full `clean verify`, not a focused test run or stale reports.

`ProductStockRestorationTest` and `NotificationPostgresTest` verify MAX_STOCK equality and overflow by 0.001, including archived Products. A later overflowing item rolls back earlier stock/audit plus refund/debt/notifications/idempotency; correcting the test fixture's stock allows the same key to retry once and replay safely. `restockItems=false` remains explicit, and custom/non-deducted items retain their behavior. `CheckoutControllerWebTest` verifies HTTP 409 `product_stock_overflow`. The ADMIN read-projection test checks event/field exclusion, not raw money digits that can coincidentally appear in timestamps or IDs. Full Core verification is not Firebase/FE/staging/production UAT.

## Time display

No extra IntelliJ, JVM or Docker timezone setting is required. Core uses UTC internally; API timestamps include Vietnam's `+07:00` offset, and report periods follow the Vietnam calendar. Clients should parse the offset, not add seven hours. Date/time inputs must include an offset (`Z` or `+07:00`).

Optionally display PostgreSQL `TIMESTAMPTZ` values in Vietnam time in your SQL client's connection:

```sql
SET TIME ZONE 'Asia/Ho_Chi_Minh';
```

This affects only that connection's display, not stored data or teammates' connections. Reapply after reconnecting, or use the SQL client's session initialization setting.

## Zalo authentication (CORE-015, local backend implementation)

Zalo is **disabled by default**. CORE-015 adds Core login/link and additive V17; it does not enable the live frontend button. Apply V17 to a shared database only from reviewed, merged staging code under the repo migration procedure. `ddl-auto=validate` remains unchanged; normal Core never creates these tables at runtime. Missing tables fail closed with `503 zalo_unavailable`. With Zalo disabled, existing Firebase login works without the new tables or Zalo credentials. The user confirmed LOGIN on the isolated real-provider local helper; this is not FE/LINK/native/staging acceptance.

Configuration placeholders are in [`.env.example`](.env.example):

| Variable | Meaning |
| --- | --- |
| `ZALO_ENABLED` | Default `false`; keep off until V17 and runtime/FE/operational acceptance are complete. |
| `ZALO_APP_ID`, `ZALO_APP_SECRET` | App identifier and server-only secret from Zalo Developers. Never put the secret in FE, git, logs or chat. |
| `ZALO_CALLBACK_URL` | Exact public HTTPS Core URL ending in `/api/v1/auth/zalo/callback`; register this in Zalo Developers. The static domain-verification HTML is not the application callback. |
| `ZALO_CLIENT_ORIGINS` | Comma-separated exact HTTPS FE origins, without trailing slash/path/wildcard. Also configure the existing `CORS_ALLOWED_ORIGINS` for POST completion. |
| `ZALO_SESSION_ENCRYPTION_KEY` | Standard Base64 of a separate, cryptographically random 32-byte AES key. Not the app secret or Firebase credential. Rotation invalidates in-flight flows. |
| `ZALO_SESSION_TTL_SECONDS` | Default 300, allowed 60–600. |
| `ZALO_PROOF_TTL_SECONDS` | Default 90, allowed 15–90, not greater than the session TTL. |
| `ZALO_HTTP_TIMEOUT_SECONDS` | Default 10, allowed 1–30 per provider request. |

The authoritative consumer boundary is the [Zalo API contract](../../docs/contracts/api-contracts.md#zalo-core-015), with generated OpenAPI checked over HTTP. [The implementation plan](docs/zalo-auth-implementation-plan.md) links to it; schema rollout/recovery is in [the ERD description](../../docs/architecture/erd-description.md#zalo-core-015-v17).

For an opt-in real-provider test without deploying, use [the isolated manual login guide](docs/zalo-manual-login.md). It uses a test-only Core entry point, disposable loopback PostgreSQL and a restricted HTTPS gateway; it never points to a business database. Firebase calls are real dev/staging calls and may create a test Firebase user. The helper is not enabled in the packaged application and does not implement a LINK UI.

1. FE generates a 32-byte random base64url `clientVerifier` (43 characters), its SHA-256 base64url `clientChallenge`, and a random `requestId` (16–100 URL-safe characters). Keep the verifier only in the initiating browser flow.
2. Open `GET /api/v1/auth/zalo/authorize?purpose=LOGIN|LINK&clientOrigin=...&requestId=...&clientChallenge=...` in a popup. Core creates a browser-bound Secure/HttpOnly/SameSite=Lax host cookie and redirects to Zalo. No target UID, ID token or secret goes in this URL.
3. Callback HTML posts `{type: "smartledger:zalo", requestId, purpose, proof, error}` only to that exact client origin. FE must validate `event.origin` equals the configured Core origin, `event.source` equals the popup it opened, and the expected requestId/purpose. Keep a compatible opener relationship: `noopener` or an incompatible COOP policy breaks this handoff. No opener means restart, not a token-in-URL fallback.
4. For LOGIN, POST `{proof, clientVerifier}` to `/api/v1/auth/zalo/exchange` with the initiating Origin. The response is `{firebaseCustomToken, displayName}`. Use Firebase `signInWithCustomToken`; only the resulting Firebase **ID token** is a Core Bearer token. Open the existing `/api/v1/auth/session` to create/load the Core OWNER. `displayName` is an optional initial hint (up to 255 characters), not an instruction to overwrite an existing profile. The session request still allows at most 150 characters; validate the hint and let the user edit it before submitting a new profile.
5. For LINK, prove ownership of the existing Firebase account through recent reauthentication, then POST the same proof body to `/api/v1/auth/zalo/link` with its Bearer ID token and Origin. Firebase revocation is checked; `auth_time` must be within five minutes. Link returns 204 without minting a token. A Zalo identity already bound to another UID returns `409 zalo_identity_conflict`; do not merge/move existing accounts or shops automatically. Link before a separate first Zalo login if the user wants to keep the original account.

Proofs are one-use and purpose/origin/challenge-bound. Replay, browser mismatch or an expired flow requires a fresh authorization attempt. Mapping is committed before Firebase I/O so a failed mint/new OAuth flow reuses the canonical UID. Local/Firebase disabled accounts and ADMIN linking/login are rejected; linking preserves role/status/profile/media/shop data.

Zalo routes hash the path and socket `remoteAddr` with a private per-instance salt into 4096 fixed buckets, each allowing at most 30 requests per 60-second window; completion bodies are limited to 8 KiB. Colliding clients conservatively share a bucket and can receive 429 earlier. New keys are not rejected just because a key map is full, and key churn cannot evict/reset counters. This bounded guard is neither distributed protection nor a DDoS guarantee. Before deployment, verify trusted-proxy handling so the address is meaningful; do not trust arbitrary `X-Forwarded-For`. Configure edge throttling and redact callback query strings, proof bodies, Authorization, cookies and custom tokens from proxy/APM/access logs. Core does not log provider bodies or credentials. A scheduled worker removes expired OAuth sessions; identity mappings remain.

Point `CORE_TEST_POSTGRES_*` only at a disposable DB. Web/native tests apply actual Flyway migrations in UUID-named schemas and remove only those schemas. Historical V17 migration tests pin that version; Android migration/flow tests use V18, with a separate V17 compatibility schema. The web compatibility flow starts Hibernate on V16 before applying the exact V17 SQL; it proves feature-off behavior with the old schema as well. No duplicate prospective native schema fixture remains:

```powershell
.\mvnw.cmd '-Dtest=*Zalo*' test
.\mvnw.cmd clean verify
python scripts/test_verify_postgres_tests.py
python scripts/verify_postgres_tests.py target/surefire-reports
node --test scripts/test_zalo_popup.mjs
```

The optional browser regression needs Node 22+ and Chrome (`CHROME_PATH` may override the executable), and consumes synthetic HTML emitted by `ZaloCallbackPageTest`. Provider/Firebase APIs are mocked; PostgreSQL, transaction/unique-key concurrency and popup HTML/CSP are real. These checks do not replace FE integration, real Firebase signing/revocation, real Zalo callback/cookie behavior on HTTPS, external-user UAT or deployment verification. See [local verification evidence](docs/zalo-auth.tdd.md).

Staging preparation (do not copy `ZALO_MANUAL_*` variables into Railway):

1. Before merging, confirm `FLYWAY_ENABLED`: turning Zalo off does not stop automatic startup migrations. Review the intended DB, backup/recovery owner and migration window first. Merge/deploy with `ZALO_ENABLED=false`; apply V17 only from merged code under that procedure. V17 enables RLS with no public policies and removes public/anon/authenticated grants on its two stores; verify Core's trusted SQL role has the intended owner/reviewed access before enabling, never add public allow-all policies.
2. Set `ZALO_APP_ID`, server-only `ZALO_APP_SECRET`, `ZALO_CALLBACK_URL=https://core-staging-01d2.up.railway.app/api/v1/auth/zalo/callback`, `ZALO_CLIENT_ORIGINS=https://smart-ledger-staging.vercel.app`, a persistent 32-byte Base64 `ZALO_SESSION_ENCRYPTION_KEY`, and matching existing `CORS_ALLOWED_ORIGINS`. Preserve any other approved existing origins. No temporary tunnel origins.
3. Reuse the existing staging Firebase project/credential configuration; a local `ZALO_MANUAL_FIREBASE_CREDENTIALS` filesystem path is not a Railway credential. Verify actual custom-token signing and ID-token verification in that runtime.
4. Verify callback registration, HTTPS cookie/popup opener, log redaction (callback query/body/Authorization/cookies), trusted proxy behavior and edge/shared throttling. FE must validate origin/source/requestId/purpose and reauthenticate before LINK. Keep the feature off until owners approve integration testing; enabling does not deploy FE.
5. Recovery: turn Zalo off/roll back application code but retain V17 tables and identity mappings. Do not drop mappings or delete Firebase accounts as rollback; key rotation invalidates active OAuth sessions. Any destructive removal needs a separately reviewed forward migration.


## Zalo Android Core preparation — CORE-016

Android LOGIN/LINK on `feat/zalo-android` (#276) adds separate `/api/v1/auth/zalo/native/authorize`, `/api/v1/auth/zalo/native/exchange`, `/api/v1/auth/zalo/native/link` endpoints, shared provider callback dispatch, exact HTTPS App Link fallback and environment-specific `/.well-known/assetlinks.json`. The approved migration `V18__add_zalo_android_handoff.sql` is now included; native remains **OFF by runtime default**. [The reviewed staging example](config/zalo-native-staging.env.example) sets `ZALO_NATIVE_ENABLED=true` only when explicitly copied to Railway staging **after merge/migration**; it does not auto-enable a deployment. V17 WEB stays supported, missing V18 fails closed, and production is not activated. See [the integration/rollout guide](docs/zalo-android-preparation.md) and [canonical contract](../../docs/contracts/api-contracts.md#zalo-android-core-016). FE/APK and real-provider/device acceptance remain separate work.

## OWNER in-app notifications

V15 adds nullable `products.low_stock_threshold` and the existing ERD's `notification_events` / `notification_recipients`. Apply it through the reviewed migration workflow before using `ddl-auto=validate` with this code. No historical alerts or default thresholds are backfilled. A valid Hibernate-created local schema may be adopted, but first test a disposable copy with migration history; invalid rows stop migration. Do not baseline/repair a shared database or run feature-branch migrations there. Recovery retains these additive structures and read history; corrections use forward migrations. Stop writes during local-table adoption/index/CHECK validation; production-sized migration locking has not been benchmarked.

Set `lowStockThreshold` via Product create/PATCH (nullable, nonnegative, max 12 integer/3 fractional digits). Omitted PATCH keeps it; explicit null clears it. Tracked stock zero always raises OUT_OF_STOCK; positive stock at/below a configured threshold raises LOW_STOCK. Same-level changes do not repeat an open alert. Level changes, restocking above threshold, tracking disable and archive resolve old alerts; subsequent episodes are new events. A resolved alert remains unread until marked read. Old products are reconciled on the next business write, not by migration or an automatic startup scan.

Bearer OWNER token is required, but no `X-Shop-Id` or idempotency header for:

- `GET /api/v1/me/notifications?shopId=4&page=0&size=20` (optional shop/type/unreadOnly filters).
- `GET /api/v1/me/notifications/unread-count?shopId=4`.
- `PATCH /api/v1/me/notifications/{eventId}/read` → 204.
- `PATCH /api/v1/me/notifications/read` with `{ "ids": [1, 2] }` → atomic 204.

Pages start at 0; size 1–100 and offset <=2147483647. OWNER must be ACTIVE, have a recipient and still own the shop. INACTIVE shops expose only status notifications; ARCHIVED shops are excluded. Retry/parallel reads preserve the first readAt. Any inaccessible ID rejects the whole batch with 404. See [notification contract](../../docs/contracts/api-contracts.md#8-notification-owner--đã-có-trên-featapp-notifications) and PRD AC-055–058.

`NotificationPostgresTest` runs in a generated `core_notification_test_*` schema with actual V1–V16 and Hibernate validation, without a supplemental schema fixture. It covers event lifecycle, notification-write rollback, replay/concurrent checkout/void, read concurrency and cross-shop/status isolation. `SaleRefundMigrationPostgresTest` additionally tests V15 upgrade, local-table adoption and atomic migration failure/retry. Supply all `CORE_TEST_POSTGRES_*` variables pointing only to a disposable PostgreSQL DB. No push delivery/device registration/FCM/email/SMS/debt reminders or notification FE integration is implemented by this change.
