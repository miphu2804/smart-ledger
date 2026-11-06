---
type: Technical Design
title: "Technical design — SmartLedger"
description: "Implementation status (§1), components, data, main flows and verification."
owner: Technical owner
status: stable
author: miphu2804
stale_after: 2027-01-05T22:18:48+07:00
---
# Technical design — SmartLedger

| Metadata | Value |
|---|---|
| Status | SmartLedger runs in production; this document describes checked-in component responsibilities and separates source implementation from live enablement and acceptance |
| Reviewers | Core, AI and FE owners |

## Related documents

- [BRD](../product/business-requirements.md) and [PRD](../product/product-requirements.md): source of `BO/BR → FR/NFR → AC`.
- [Logical architecture](diagrams/README.md#logical-architecture): component and trust boundaries, not deployment topology.
- [Target architecture](diagrams/images/architecture.svg) and [CI/CD and runtime topology](diagrams/images/ci-cd.svg): target components and delivery flow; the [diagram guide](diagrams/README.md) lists every diagram and its boundary.
- [API contracts](../contracts/api-contracts.md): FE ↔ Core and Core ↔ AI.
- Current sources of evidence: [`frontend/mobile`](../../frontend/mobile/README.md), [`frontend/web`](../../frontend/web/README.md), [`backend/core`](../../backend/core/src/main/java/com/smartledger/core/controller/AuthController.java) and [`backend/ai`](../../backend/ai/src/agent/router.py). The EXE201 FE is the historical source used when the initial scope was drafted.

## 1. Scope

**Source review:** `staging` revision `a2766ee3a37e23c0f03fd43383b608c1b2fac898`. Implemented means present in this source, not enabled, deployed or accepted. This review did not inspect live configuration, shared-database migration history, provider/device behavior or integrated `AC-*` results.

| Component | Implemented boundary |
|---|---|
| Core | Firebase session/profile; shops/catalog/customers; drafts, confirmation, sales, payments, debt, void/refund and expenses; stock-in/decrease, barcode and list pagination; reports; media, audit, notifications; ADMIN support/growth; Zalo WEB/ANDROID and the Agent proxy |
| AI | Internal chat/stream, conversation management, deterministic guardrails, optional scoped shop-data tools, calculation/sandbox and default-off long-term memory |
| Mobile | Expo Router client with explicit mock flags; Core-backed Home/Analytics totals; Android on-device STT and a separate rule-based order parser |
| Web ADMIN | Firebase-to-Core ADMIN access and real support pages through `adminApi.ts`; legacy tasks/AI-support pages use a separate mock model |

Core's checked-in Flyway set is V1–V20, with 25 tables. AI migrations separately own chat, read views and optional memory. Historical V19/23-table counts describe earlier revisions, not the current schema.

### CORE-019 — successful operation quotas

The source includes transactional quota policies and two V20 tables. The code default is off. Migration state, writer compatibility, trusted-proxy configuration and integrated acceptance require the authorized [Core verification procedure](../../backend/core/docs/user-rate-limits.md); none is inferred from source.

### CORE-018 — daily user activity

V19 and the authenticated-request recorder exist; the code default is off. Telemetry is best-effort and does not replace mandatory ADMIN audit. The approved product trace and retention policy remain in the [Core guide](../../backend/core/docs/user-daily-activity.md) and [V19 description](erd-description.md#core-018-v19).

### Stock decrease adjustments — CORE-021

Core implements standalone stock decrease with scoped idempotency, product locking and audit in one transaction. It creates no money obligation or separate stock ledger. See the [contract](../contracts/api-contracts.md#core-021-stock-decrease-adjustment) and [verification guide](../../backend/core/docs/stock-adjustments.md).

### Daily ADMIN overview — admin-growth

PR #368's growth API is included in the audited source. Aggregation uses a writable REPEATABLE_READ transaction because access must be audited; audit failure exposes no protected data. Deployment, chart integration and acceptance were not verified. See the [contract](../contracts/api-contracts.md#daily-creation-series--admin-growth) and [Core guide](../../backend/core/docs/admin-dashboard-growth.md).

### Zalo CORE-015

WEB authorize/callback/exchange and recent-authentication LINK are implemented with V17. The code default is off; live deployment, provider behavior and enablement were not audited. Cookie, PKCE, identity mapping, transaction and recovery safeguards are owned by the [contract](../contracts/api-contracts.md#zalo-core-015), [V17 description](erd-description.md#zalo-core-015-v17) and [Core guide](../../backend/core/docs/zalo-auth-implementation-plan.md).

### Zalo Android CORE-016

ANDROID browser handoff and V18 are checked in, default-off. The service binds channel, client, request, purpose and verifier; it does not accept arbitrary return URLs. A checked-in sample does not prove shared-DB migration or native enablement. See the [contract](../contracts/api-contracts.md#zalo-android-core-016) and [Core verification guide](../../backend/core/docs/zalo-android-preparation.md).

### AI and client boundaries

- Core authorizes the user/shop pair. AI authenticates a shared service token but does not independently verify that ownership; the token and restricted network access are part of the trust boundary.
- AI has no HTTP draft parser and does not implement a text/voice/image-to-sale workflow. Its internal parser helper is not Mobile's rule-based parser.
- Conversation and memory repositories filter by user and shop. Default-off memory still has an in-flight usage-metadata write caveat after switch-off.
- Stream disconnect cancels production, but an already-running database write can commit. Missing completion is not proof that nothing was saved.
- Read views exclude customer contacts but expose shop phone/address. Enabled tracing can export personal data remaining after redaction.
- Mobile totals use Core report APIs; some Analytics charts/best-seller displays still aggregate loaded invoices. See [current report boundaries](../../frontend/mobile/docs/operations.md#homeanalytics-metrics).

The [AI architecture](../../backend/ai/docs/architecture.md) owns these boundaries, and the [runtime reference](../../backend/ai/docs/runtime-reference.md) owns defaults and implementation details. The [API contract](../contracts/api-contracts.md) owns consumer semantics; [service verification guides](../../backend/core/docs/index.md) retain feature-specific procedures and dated evidence. BRD/PRD/ADR history and approval status are unchanged.

## 2. Components and ownership

The CORE-012 barcode work does not change component boundaries or add Redis: Core normalizes and looks up, PostgreSQL enforces uniqueness, and FE integrates through its own contract. The branch state and how to verify it are in §4.3 below; AI/scanner are not changed in this round.

| Component | Responsibility |
|---|---|
| Mobile/FE | OWNER interface: collects input, shows the draft, requires the user to confirm, calls only Core |
| Web dashboard | ADMIN interface: looks up OWNERs and the customer base and views the support overview; does not edit the business ledger |
| Core | Currently has auth, shop/catalog/customer, draft/sale/payment/debt/refund, expense, summary, audit and the Agent proxy to AI; ADMIN reads overview/profile/support history and changes shop status, all audited. The audited source includes cumulative stock-in, cost snapshots, advanced reports and Product/Shop/User media; client acceptance and live provider configuration are separate checks |
| AI | Implemented: Agent chat (history, guardrails, data read tool and restock suggestions when a reader is configured; long-term memory behind a flag, off by default). No HTTP draft parsing or image-analysis route exists; returns answers/suggestions without writing the ledger |
| PostgreSQL | Core business data, idempotency and audit_logs; V15 stores Core inbox/read-state/threshold. AI: chat history, the `ai_read` views and memory tables in `supabase/migrations/` (migration list in [§1](#1-scope)); the `vector` extension is enabled per [ADR-0001](adr/0001-vector-store-pgvector.md), and the only table with embeddings is `agent_memories` (long-term memory, [ADR-0002](adr/0002-agent-long-term-memory.md)); no migration creates an `ai_requests` table; runtime traces live in HoneyHive, not PostgreSQL |
| Bifrost | Self-hosted model gateway on the VPS, replacing LiteLLM: holds the OpenAI and Inception keys, and AI calls `http://bifrost:8080` with a virtual key. Gateway definitions exist in source; actual routing and enablement were not verified |
| HoneyHive | Traces each Agent chat turn: duration, model, tokens, tool names, errors, `shop_id`, and content including the question after `InputRedaction`, SQL, tool results and the answer (`NFR-008`); raw media is not sent. Each turn is a session carrying `user_id`, model and `prompt_version`. Activation also depends on the source/sampling configuration; see [ADR-0009](adr/0009-end-to-end-tracing.md) and the [AI service architecture](../../backend/ai/docs/architecture.md#observability) |

Only Core has a public API. FE does not call AI, PostgreSQL, Bifrost or HoneyHive directly.

## 3. Main flows

1. FE gets a Firebase ID token; Core verifies the token and maps the UID to a user/identity. The session returns the role and the accessible shops; Core issues no token of its own.
2. Auth/me and Shop use path IDs and need no X-Shop-Id; business APIs need X-Shop-Id, an active OWNER, and a shop that belongs to the OWNER and is ACTIVE.
3. The current flow is pick/manual entry to create a draft; a catalog item needs an ACTIVE product in the same shop, and a custom item with a null productId needs name/unit/price/quantity. A draft does not affect money, debt, stock or reports and expires after one month.
4. Confirm locks the draft, then locks the group of ACTIVE products in the same shop with one `PESSIMISTIC_WRITE` query, `ORDER BY p.id ASC` in the DB; an empty group skips the query. It snapshots name/unit/price, stock_deducted and the known total cost (`costPriceVnd × quantity`, HALF_UP to VND), deducts actual stock, then reconciles stock alerts once for the locked group; it creates the sale/items/initial payment and a debt if anything is unpaid in the same transaction. Custom items and products without a cost price keep a NULL cost snapshot. Retrying an already confirmed draft returns the same sale without writing or deducting again.
5. Repay locks the sale before the debt, adds a payment and updates the balance atomically. Customers use stable IDs; duplicate names/phones are not merged automatically. Confirming a credit sale without a customer ID needs a name to create the customer; the phone is optional.
6. Void locks sale → debt; when restocking, it checks the snapshot first, then locks once the group of products with `stockDeducted=true` in the same shop with `ORDER BY p.id ASC`, without filtering ACTIVE (an archived product can still be restocked under the existing rules). It restocks, then reconciles alerts for the whole group; an empty group runs no Product/open-alert lock query. It checks the payment total, records a refund of all money collected if > 0, cancels only the OPEN balance, keeps SETTLED, stores the void reason/user/time and an explicit choice to restock or not. Payments are not edited or deleted, and no further debt repayment is accepted for a VOIDED sale.
7. Summary uses soldAt/voidedAt/receivedAt/refundedAt events per Vietnam period; money collected in an earlier period is not excluded because the sale was voided. The debt shown is the current balance of the whole shop. Field definitions are in the [API contract](../contracts/api-contracts.md).
8. Stock-in: verify OWNER/ACTIVE shop → reserve idempotency PRODUCT_STOCK_IN → lock the ACTIVE product in the same shop → check tracked/total stock → add the quantity → record STOCK_ADJUSTED/source STOCK_IN → flush the product so the updatedAt snapshot is correct → store the 200 response for replay → commit. A failure in any write step rolls back stock/audit/key. Only the product is locked; no sale/debt is locked and no money obligation is created.

A confirm/repay/void failure rolls back every money/debt/stock, notification and audit change, including the idempotency reservation if any. A confirmed sale has no PATCH/DELETE path; it can only be voided in full with a trail. restockItems is required; restocking relies on the snapshot, not on the current tracked flag. A historical NULL snapshot is not enough for automatic restocking; custom items create no stock.

Core calls AI for the assistant chat and conversation/memory proxy, not for ledger draft parsing. AI has no authority to create sales, payments, debts or expenses.

ADMIN flow: verify the token → ADMIN/ACTIVE profile in the DB → read the support projection → write the audit → commit → return the response. The seven base GETs `/api/v1/admin/*` cover the overview, OWNER list/detail, shop list/detail, shop status history and the ADMIN's own access history; the audited source includes an eighth GET for the creation series. These GETs use a writable transaction with REPEATABLE_READ isolation, not readOnly, because they must store the audit. Failing to store the audit returns 503 admin_audit_unavailable and no protected data. Query/DTO/scope details are in the [ADMIN contract](../contracts/api-contracts.md#7-admin-dashboard--implemented-in-core).

`PATCH /api/v1/shops/{shopId}/status` stays outside the admin prefix; suspending/reactivating takes a reason and records one SHOP_INACTIVATED/SHOP_REACTIVATED event shared by the OWNER history and the ADMIN projection. The status change and audit share a transaction, and an audit failure rolls back. ADMIN does not impersonate an OWNER or edit the ledger; the Core implementation alone does not prove that web/staging meets BR-014/NFR-009.

## 4. Data and constraints

The [ERD](diagrams/src/erd.dbml) documents the checked-in Core/AI schema rather than unimplemented tables. The [ERD description](erd-description.md) describes relations and the migration mapping. Core currently guarantees:

- The tenant is verified in the service by the owning shop; payment/debt/refund inherit scope through the sale. Not every table has its own shop_id column.
- users.system_role is OWNER|ADMIN; a shop has one owner, and an OWNER has many shops.
- Money is BIGINT VND, quantity numeric(15,3), IDs BIGINT; instants are TIMESTAMPTZ/UTC in Core. JSON timestamps show +07:00 and report periods use Asia/Ho_Chi_Minh.
- Product/category/customer/expense are archived, and history is not deleted. An INACTIVE shop still lets the OWNER see the reason but blocks business operations; ARCHIVED is not shown to the OWNER.
- Payments are append-only; paid_vnd reconciles with the payment total. Debt original_vnd = total debt repayments + outstanding_vnd + COALESCE(cancelled_vnd, 0). A refund is a separate outflow and does not subtract or delete payments.
- V8 makes sale_items.product_id nullable but keeps the FK when an ID exists; V9 adds sale_refunds (unique sale_id, sale/user FK, amount/method check, refunded_at index), nullable stock_deducted and the VOIDED debt audit/lifecycle. V12 adds nullable sale_items.estimated_cost_vnd with a non-negative check; history is not backfilled. V13 adds provider public IDs for Product/Shop/User, the `media_cleanup_jobs` table with status/retry and the avatar audit whitelist. V14 adds a separate `media_upload_keys` to reserve/replay by scope and fence with a UUID token. Released migrations are not edited, and old stock, cost price or audit snapshots are not guessed.
- A SETTLED debt stays unchanged after a sale void; only an OPEN debt with a balance moves to VOIDED with cancelled_vnd/voided_at. Nothing collected means no refund row.
- Idempotency covers POST expense, debt repayment, sale void and stock-in: reserve/action/replay result share a transaction; the key is per shop + operation, and the hash covers the body and path ID when present. Stock-in normalizes quantity/reason before hashing and stores a 200 snapshot; the older flows keep 201. The default TTL is 30 days and there is no cleanup job yet. POSTs that create categories/customers/drafts/shops are not protected by a key; confirm deduplicates by draft ID.
- Product PATCH/archive/stock-in lock the row the same way as checkout/void, so concurrent runs do not overwrite stock. PATCH only edits information/stock tracking; false→true initializes 0, true→true keeps the stock read under the lock. Repay/void share the lock order sale → debt → product to avoid lock inversion.
- Media upload checks JPEG/PNG bytes, size ≤5 MiB and dimensions ≤2048 px before calling the provider. `imagePublicId`/`logoPublicId`/`avatarPublicId` are not part of the client contract. V14 keeps reservation/replay for all three uploads, and the public ID is derived from the target/key/file hash; Cloudinary uses `overwrite=true` so a retry with the same bytes works. Avatar replay stores an internal snapshot and rebuilds the authenticated URL in the response; Firebase `avatar_url` still syncs as the fallback after DELETE avatar. `CLOUDINARY_ENABLED=false` returns 503 for writes that need to change a reference, a DELETE with no custom image is still a no-op 204; the session drops the Cloudinary avatar instead of failing, and the worker is not created. Enabled with missing credentials or an invalid prefix fails fast at startup.
- Vector tables (`pgvector`; currently only `agent_memories`) must have `shop_id`, and every similarity query filters by `shop_id` in the same SQL statement ([ADR-0001](adr/0001-vector-store-pgvector.md)); `agent_memories` filters both `shop_id` and `user_id` in every read and write.

V10 creates append-only `audit_logs` (a trigger blocks UPDATE/DELETE/TRUNCATE); Core writes an audit for successful OWNER/ADMIN writes in the same business transaction, and the OWNER reads it through `GET /api/v1/audit-logs` (see the [API contract](../contracts/api-contracts.md#shop-audit-history)). V11 extends the same table for 7 ADMIN read actions and allows a null shop_id/entity_id on exactly the system-wide/list/OWNER-profile events; business events still need a real shop and target. V11 replaces the ID/action-target check and keeps the FKs, the other checks and the V10 trigger; it creates no admin_access_logs and does not rewrite history (see [migration alignment](erd-description.md#7-migration-alignment)). AI tracing (HoneyHive) is in the code but was not accepted in this round; long-term memory (the only vector table) has integration tests that filter by shop and user, is off by default in code and is not accepted; media implementation and provider enablement are separate boundaries.

Audit is separated by projection and whitelist: an OWNER does not read ADMIN_*; ADMIN access logs read only the support actions of the current actor, with no raw money/debt/stock metadata. A shop's status history reads only ADMIN status-change events, which may include other ADMINs. Read audits store queryPresent/resultCount instead of the query/response or raw contacts; reading the ADMIN history also creates an event, reading the OWNER history does not.

The PostgreSQL schema is managed with versioned SQL migrations in Git. Do not edit the schema directly in the Supabase Dashboard. Dev and staging share a DB, so only run migrations from code merged into `staging`; Core uses Flyway, AI uses the Supabase CLI (`supabase db push`); dev machines run Core with `FLYWAY_ENABLED=false` (see [Database migrations](../development/local-development.md#database-migrations)). Migrations must run on standard PostgreSQL; Supabase-specific extensions, triggers or APIs are used only with a separate technical decision.

### 4.1. Batched queries

The #134–#137 optimizations keep the tenant guard, response order, error codes and transaction boundaries; they add no JPA relations, indexes, migrations or Redis cache. The query counts below cover only the data named in each row, **not authentication/shop access, customers, other queries or writes**.

| Flow | Query approach and test limits |
|---|---|
| Sale/draft list (#134, continued by #153) | Keeps batched items but reads only the parent IDs in the page + shop, orders parent/item IDs ascending, then groups into a map; no collection join-fetch while paginating. With data, at most 3 queries for content/count/items, and count can be skipped when the total can be inferred; an empty page reads no items. Sales are ordered by soldAt/id descending, drafts by id descending; a parent without items returns `items: []`. Detail/confirm/void keep the single-parent item query. |
| Create/edit draft — `prepare` (#135) | Checks the customer first; only collects catalog IDs without throwing duplicate errors yet; reads ACTIVE products in the same shop once, without locking, then looks them up in a map in request item order. With catalog items: 1 Product query; all custom: 0. Keeps the error order custom name/unit → catalog text → duplicate ID → invalid product → pricing/overflow. |
| Confirm (#136) | Collects distinct non-null catalog IDs; one query locks ACTIVE products in the same shop, `ORDER BY p.id ASC` in SQL. Missing results are still rejected; checking/deducting stock and snapshots work as before. Empty group: 0 Product lock queries. |
| Void with restock (#136) | After locking sale → debt and checking the snapshot, collects only IDs with `stockDeducted=true`; one lock query per shop, IDs ascending, no status filter. Empty group: 0 Product lock queries; custom items and items without stock deduction are not restocked. |
| Stock alert reconcile (#137) | Confirm groups after deducting stock; void groups after restocking. `reconcileStock(Shop, Collection<Product>)` reads all open LOW/OUT alerts of the group in one query, then groups by entity ID. Empty group: 0; the single-product call reuses the collection logic. Keeps resolve → flush → create event/recipient and the existing read state. |

Limits: when a new alert cycle opens, the history/dedup lookup and the event/recipient writes can still happen per product; confirm/void are not promised to run only two SQL statements. #153 pagination bounds the parents loaded but not the item count of a single parent. The lock order is checked on Hibernate SQL and the PostgreSQL plan, not only by sorting IDs in Java. The walkthrough [§5.3 confirm](service-walkthrough/README.md#53-saledraftserviceconfirm--checkout) and [§6.3 void](service-walkthrough/README.md#63-salevoidservicevoidsale) illustrate the flows; the regression guide is in the [Core README](../../backend/core/docs/verification.md#lists-pagination-and-filtered-sale-totals).

### 4.2. OWNER list pagination

`OwnerListQuery` holds the allowlist records/enums for the six lists; the controller binds and validates before querying. `PageResponse<T>` is a separate DTO and does not expose Spring Page or return the legacy array. Names/defaults/filters/sorts/errors are in the [pagination contract](../contracts/api-contracts.md#pagination-of-owner-lists); this contract does not apply to ADMIN/audit/notification/category/payment.

- The service checks the OWNER and ACTIVE shop before reading the ledger and runs `readOnly=true`, `REPEATABLE_READ`. The six repositories use `JpaSpecificationExecutor`; `OwnerListSpecifications` uses the same tenant/filter for content and count. PageRequest applies LIMIT/OFFSET in SQL and does not slice the whole list in Java. Spring Data can skip the count when the total can be inferred; the data budget is at most 2 queries for simple lists and 3 for sale/draft, excluding auth/shop.
- Sale/draft batch only the items of the IDs in the page with the tenant predicate; an empty page skips it. Sale item search uses EXISTS, so several matching items do not duplicate sales/count; q uses only historical snapshots or an exact ID. No JPA relations or item queries in a loop are added.
- Search uses built-in PostgreSQL `lower`/`translate`, normalizes Vietnamese terms and escapes literals; no unaccent extension, Redis or DB dependency is added. Product stock sort uses coalesce so nulls come last; there is always an ID tie-break. Search does not mean sorting by the unaccented name; name sort still follows the DB collation.
- Draft uses one `now` for the SQL status/count and the response mapping. A DRAFT past expiresAt is read as EXPIRED, the GET does not write the status, and expiry is not filtered after pagination.
- Sales/expenses compare `[from, to)` timestamps directly on soldAt/expenseAt; they do not turn a timestamp into a Vietnam date or add a day to `to`. Offsets are compared as instants; the expenses period keeps using ReportWindow and is not combined with a custom range.
- Schema and writes are unchanged; #153 adds no index/migration. Deep pages still pay the OFFSET and exact COUNT cost; measure the plan before proposing an index/cursor. REPEATABLE_READ keeps a snapshot only within **one request** and does not prevent page drift between two GETs. No fixed response time is promised.

The list rollout is a breaking change: FE must change its client/mock and list screens, move filters to the server, and not sum totals from a single page. The existing `/reports/summary` is unchanged and still aggregates entities in Java; the sale list aggregate is a separate endpoint in [§4.5](#45-sale-list-totals-core-014). DebtResponse has no name/phone yet; missing projections/aggregates must be settled separately instead of reloading the whole list. Do not merge/deploy for the old FE before coordinating #144 and accepting `AC-063`.

### 4.3. Barcode Core (CORE-012 #163/#164)

**Branch `feat/core-barcode`, 2026-10-12, following staging base `33d2da441e2eaf033a1af9663ddfbf99a6b53e3f`:** shared normalization for create/PATCH/lookup, an exact GET lookup, an ACTIVE-only precheck and a 409 with optional productId/status. V16 is prepared to change the unique constraint; it has not run on the business/shared DB and FE is not accepted. Traced `BR-021` → `FR-034` → `AC-064`–`AC-067`; the [API contract](../contracts/api-contracts.md#barcode-core-012) is the source for input/output, the [ERD](erd-description.md#7-migration-alignment) for schema/rollout/recovery.

- Lookup checks OWNER/account/shop first, then calls `findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc` with ACTIVE, the exact barcode and limit 1. No list loading, LIKE/lower/COUNT or cache. The V16 partial index on shop/barcode/ACTIVE supports this query. Not found or only ARCHIVED returns 404; the detail/list routes are unchanged.
- Create checks for an ACTIVE duplicate; PATCH keeps the current row lock and excludes its own ID from the competing-code query. The precheck returns the details settled in D4; the DB unique index is the last guard when two requests pass the precheck. The handler maps both the new index name and the old constraint to 409 and does not read the DB after the failed transaction to get details. Idempotency is not extended to Product CRUD.
- The V16 index build is transactional and creates the new guard before dropping the old one; lock/statement timeouts bound the wait and a catalog write freeze window is required. Data, historical snapshots and entity fields are unchanged. `ddl-auto=update` does not prove the partial uniqueness has been applied. Do not run migrations from a feature branch on the shared DB.
- `ProductBarcodeWebTest`/`ProductServiceTest`/`ApiDocumentationWebTest` check normalization, routing, permissions and 409/JSON. `ProductBarcodePostgresTest` checks the service on the Flyway schema, CREATE/PATCH reuse, tenant/status, a single Product query and EXPLAIN of the Hibernate SQL with 20,000 Products. `ProductBarcodeMigrationPostgresTest` checks V16 fresh/upgrade/history/failure and two JDBC writers passing the precheck together (create/patch), plus an HTTP 409 handler test; the JDBC test is not treated as a full end-to-end request. Local timing is only diagnostic evidence, not a production SLA.
- FE #162/#165 must handle 404/409 with or without details, keep the barcode characters and not create fake products; decisions D2/D3 and scanner/cart UAT still wait for the team. FE is not changed and real Firebase/staging is not proven in this round.

### 4.4. Concurrency and lifecycle (CORE-013)

The #181 fix on `fix/core-concurrency` adds no field/entity/migration and does not change tenant scope. A lock query does not refresh an entity already in the persistence context; the profile/catalog write paths take the lock, then `EntityManager.refresh(..., PESSIMISTIC_WRITE)` before checking/mutating. Void keeps the existing batch lock and adds a limit check in the entity:

| Write path | Lock and guarantee |
|---|---|
| Firebase session | Looks up the User ID from the identity, locks/refreshes the User before the ACTIVE check and sync. Role/status/Cloudinary avatar handle are not part of the Firebase sync. Writers that change the avatar/role/status of the same row are serialized; there is no ADMIN API to lock/demote a user yet. |
| OWNER edits/archives a Shop; ADMIN changes status | Reads the Shop under the lock and refreshes before checking; INACTIVE keeps the reason and the shop_inactive error, ARCHIVED keeps shop_not_found. Status/logo are not rewritten from an old snapshot; audit/notification share the transaction. |
| Customer/Category replace/archive | Locks by ID/shop, then refreshes/checks ACTIVE; GET stays read-only. If archive commits first, the edit request returns not_found and does not revive the record or erase archive metadata. |
| Product create/Category assignment | Create locks the target Category before insert; PATCH locks/refreshes the Product, then locks/refreshes the target Category in the same shop/ACTIVE and holds it until commit. A null category takes no lock; omitting the field keeps the fresh Product data read under the lock. Category archive locks only the Category, then reads whether an ACTIVE Product exists without write-locking Products, so Product → Category is never inverted. Assignment commits first: category_has_products; archive first: product_category_invalid. Categories are not detached and Products are not archived automatically. |
| Void with restock | Keeps Sale → Debt → Product IDs ascending through the batch query. A total of exactly MAX_STOCK is allowed; exceeding it returns product_stock_overflow before assignment. The whole void rolls back, including items that already wrote stock/audit; retrying the same key after a valid adjustment does not double the refund/stock/notification. |

No shop-wide lock is applied to every transaction. Refresh adds one read under the lock for the write paths that need fresh data; it does not lose the #133 batched items/Product lock/reconcile. Real PostgreSQL SQL uses `FOR NO KEY UPDATE` through Hibernate for these row locks; this is checked with SQL assertions and two transactions with coordination/timeouts, not only mocks. Running the Shop → Product, Product → Category and Category archive chains without deadlock in the test fixture does not mean every deployed schedule has been accepted.

Evidence: `AuthSessionConcurrencyPostgresTest`, `ShopConcurrencyPostgresTest`, `CatalogLifecycleConcurrencyPostgresTest` and `CategoryAssignmentConcurrencyPostgresTest` check both commit orders and preloaded entities; `NotificationPostgresTest` checks the rollback of a multi-item void, an archived Product, the overflow error and retry/replay with real idempotency. `ProductStockRestorationTest` checks the MAX_STOCK boundary and keeps the restock-unavailable error; a web test checks 409. The guide is in the [Core README](../../backend/core/docs/verification.md#transaction-lock-and-concurrency-regressions), void errors in the [contract](../contracts/api-contracts.md#3-draft--sale--payment--voidrefund). A temporary test DB does not replace FE/Firebase/staging UAT; BRD/PRD/ERD are unchanged because this restores settled constraints and does not extend business scope or schema.

### 4.5. Sale list totals (CORE-014)

`Sales` and `SalesSummary` both implement `OwnerListQuery.SaleFilter`; both normalize q and check the range with the same helper, but the summary has no pagination. `SaleController` declares the specific `/summary` route and `SaleService.summary` checks `requireOwnedActiveShop` before the repository in a read-only transaction. Controller/Swagger tests cover the route and the five-field schema; detail is not called with saleId="summary".

`SaleRepository` composes the `SaleSummaryRepository` fragment, implemented with a Criteria tuple of COUNT/conditional COUNT/SUM in PostgreSQL. `OwnerListSpecifications.sales` applies the same tenant/q/status/soldAt predicate as the list; the item q uses EXISTS so several matching items do not multiply sale rows. Sale/SaleItem are not hydrated, and items are not read one by one and summed in Java. The three counts are long; money totals keep a wide type until a checked conversion to signed 64-bit. An overflowing total returns 409 sale_summary_overflow; no DB constraint is changed and nothing is forced negative. The field/error contract and the difference from netRevenueVnd are in the [contract](../contracts/api-contracts.md#sales-list-totals-under-filters-core-014).

`SalesListQueryPostgresTest` runs the checked-in migration set (V1–V20 at the audited staging revision) on a temporary schema and keeps the real constraints. Direct summary tests: empty set, status filter, q combined with a half-open range/equivalent offset/one-sided range, discounted sales fully paid/partly paid/on credit, cross-period void, archived product snapshot, duplicate items and OWNER/ADMIN/shop permissions. The overflow fixture uses PAID with paidVnd=totalVnd and checks both statuses and the Long.MAX_VALUE boundary; the CI gate requires these methods. 10,000 sales/50,000 items run one data SELECT, excluding auth/shop; timing is only a local observation. Commands are in the [Core verification guide](../../backend/core/docs/verification.md#lists-pagination-and-filtered-sale-totals).

The additional API needs no field/entity/index/migration or Redis and does not change the existing list/detail/write/report. Core is deployed before FE calls the summary; the frontend sends the same filter and refreshes when the shop/filter changes, but the two HTTP requests do not share a snapshot. Do not replace the period report card with the list value card. There is no Firebase/FE/staging verification for this endpoint yet; tracked by `AC-069`–`AC-072`.

## 5. Auth and authorization

- Phone/Google providers are the sign-in target described in the PRD; Core accepts the Firebase ID token, and backend tests alone do not prove the UI/provider is integrated. Firebase Account Linking merges one user's sign-in methods into one Firebase UID; Core stores that UID in `auth_identities`.
- Core does not store passwords or raw tokens. There is no Core refresh token or separate business session; V17 only stores temporary OAuth sessions and external mappings to exchange a Zalo result through Firebase. Business APIs keep using the Firebase ID token verified by Core; pre-sign-in steps and LINK follow the [Zalo contract](../contracts/api-contracts.md#zalo-core-015).
- Core defaults self-registered accounts to OWNER; the ADMIN role is granted only through a controlled operational action, never from a request or a client-made claim.
- Auth/me and every Shop API use path IDs and need no X-Shop-Id; the remaining OWNER business endpoints need a token/X-Shop-Id of an ACTIVE shop owned by the OWNER. Shop status is ADMIN-only; this is the exception outside the admin prefix and grants no right to edit the ledger.
- /api/v1/admin/* checks ADMIN/ACTIVE before processing the query and again in the service; X-Shop-Id is not used to extend permissions. Successful responses set Cache-Control: no-store; lists mask contacts, and support details have full contacts but no Firebase identity or ledger data. ADMIN can read INACTIVE/ARCHIVED profiles and has no access to OWNER business APIs.
- Real data must not be used before 401/403 and cross-shop isolation are tested.

## 6. Environment configuration

The service guides and `.env.example` files own developer-facing settings and defaults. This architecture overview does not enumerate credentials or environment values.

Actual domains, network placement, provider-project mappings, access grants and rollout procedures belong to the [private operations knowledge base](https://app.notion.com/p/M-i-tr-ng-v-domain-407f1ce5c3ac80249cd0c2a28c259436). Local dependencies and disposable test databases are described in [local development](../development/local-development.md). Shared migrations still require the [authorized migration process](../development/local-development.md#database-migrations); no environment state is inferred here.

## 7. Pre-merge verification

Checking code/schema does not replace running the system again. The Core suite has controller, service, validation, timestamp, concurrency and migration tests (SaleRefundMigrationPostgresTest, DebtVoidPostgresTest, AdminDashboardControllerWebTest, AdminDashboardPostgresTest, ReportAggregationPostgresTest). PostgreSQL tests are opt-in: Maven skips them without `CORE_TEST_POSTGRES_URL` (the CI `core` job sets it); a disposable test DB must be enabled to verify the checked-in migration set, rollback and concurrent locks. Media tests check input, the public-ID prefix, idempotency replay, the adapter, the worker and the V13/V14 schema; a real upload with safe staging credentials is still needed. NotificationPostgresTest uses the real checked-in migrations to check stock episodes, same-key/different-key confirm/void, rollback when a notification fails, batch read/concurrency and tenant/status filtering; migration tests check fresh validation/upgrade/adoption/rollback. Commands are in the [Core README](../../backend/core/README.md); per-run results in PROGRESS.md do not replace UAT.

N+1 tests on real PostgreSQL (not only repository mocks):

- `OwnerPaginationWebTest`/`OwnerListQueryTest`: envelope/default/boundary/overflow, allowlist/filter binding, timestamps with offsets and errors. `OwnerListPaginationPostgresTest`: six tenants/filters/counts, expiry, two-sided range/equivalent offset, a 100,000 catalog, deep pages, plans and the snapshot when inserting between content and count. See [pagination tests](../../backend/core/docs/verification.md#lists-pagination-and-filtered-sale-totals).
- `SalesListQueryPostgresTest`: 1/20/100/1,337/10,000 sales or drafts, up to 50,000 items; a page of at most 100 parents reads only that page's items, at most 3 queries including count, items skipped when empty; checks order and tenant. A 100-parent control reproduces the old 101 queries against the new 3 including count. See [list regression](../../backend/core/docs/verification.md#lists-pagination-and-filtered-sale-totals).
- `ProductBatchLockPostgresTest`: checks one lock query for the confirm/void group, SQL with `ORDER BY`, and a PostgreSQL plan that locks by ID; a 100,000-product catalog, groups of 1/20/100. Checks contention with reversed item order, archive/missing/custom and rollback of money/debt/stock/notification/audit. See [batch locks](../../backend/core/docs/verification.md#transaction-lock-and-concurrency-regressions).
- `NotificationEventServiceTest`, `NotificationPostgresTest` and the reconciliation part of `ProductBatchLockPostgresTest`: one query reads open alerts for a group with no state change; fixtures of 100,000 resolved events and 10,000 open alerts; lifecycle LOW → OUT → no alert → LOW, retry/concurrency without duplicate events/recipients, a notification failure rolls back the business change. History/dedup lookups when creating are outside the one-query budget. See [stock alerts](../../backend/core/docs/verification.md#transaction-lock-and-concurrency-regressions).
- `SaleDraftServiceTest` and the prepare part of `ProductBatchLockPostgresTest`: create/replace with catalog items uses one Product query, all-custom reads no Product; multiple errors still follow request order, and snapshots/rounding/discount/payment and old data are kept when a replace fails. See [draft reads](../../backend/core/docs/verification.md#transaction-lock-and-concurrency-regressions).

Query count, SQL/plan and correctness are regression checks; local benchmark timing is only reference evidence, not an HTTP/staging SLA or a sustained load result. Run results are recorded by date in [PROGRESS.md](../../PROGRESS.md); editing docs does not mean the whole Maven suite was rerun or FE was accepted. CORE-015 adds V17 fresh/upgrade/failure/no-op/RLS checks and Zalo OpenAPI over HTTP, plus a mandatory gate for the migration suite and the two PostgreSQL auth suites; rollout/FE are checked separately.

| Group | Required evidence |
|---|---|
| Core | Current migrations through V20 on a separate test schema, including fresh/upgrade per suite; controller contracts for sections 1–4 and 7; N+1 checks for sale/draft lists, prepare, confirm/void locks and open-alert reads per §4.1; confirm/repay/void rollback, replay and lock contention; report aggregates/missing cost price/empty days; media validation/idempotency/cleanup worker; cross-shop tests, ADMIN projection/actor scope, growth by Vietnam date/UTC session and fail-closed audit/rollback; verification-run evidence in the [Core handoff](../../backend/core/docs/admin-dashboard-growth.md#verification-history). A local test DB does not replace Supabase staging or FE acceptance |
| AI | Core ↔ AI contract tests; timeout/fallback; output schema; retrieval correctly scoped by `shop_id` |
| FE | OWNER: login → pick shop → create/confirm → report; ADMIN: login → look up the customer base → view the overview; test the role guard and loading/error/empty states |
| Ops | CI checks migrations; staging uses its own Supabase project; production deploys need approval |

## 8. Risks

- CORE-011 changes the response of six lists and returns only 20 records by default; an old FE can break or show incomplete totals if it still maps/reduces as a full array. #144/AC-063 is not accepted; backend tests are not confirmation of rollout compatibility.
- History with a NULL stock_deducted is not restocked automatically, and VOIDED debt audit is not guessed. V9 stops when local data is invalid instead of silently fixing it. Backup/recovery is required before migrating a shared environment.
- Changing the API from hard delete to void, requiring Idempotency-Key/restockItems and splitting revenue fields require FE updates; backend tests do not prove FE compatibility.
- Firebase, Zalo and model-provider integrations depend on external services; adapters, timeouts and fallbacks must be tested before acceptance.
- The ADMIN dashboard widens the data that can be read; endpoints must be minimal and audited, and user impersonation is out of scope.
