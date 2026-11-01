# SmartLedger — ERD Description

## 1. Overview

CORE-019 adds owner-approved V20 on 2026-10-31: private `user_rate_limit_windows` and `user_rate_limit_reservations`, bringing the checked-in Core schema to 25 tables. Quota is committed with business changes; the feature remains default-off and this document does not establish shared-DB rollout. [Policy and recovery](../../backend/core/docs/user-rate-limits.md) describe activation and retention. The two tables below are additive; the earlier V19 review remains a dated snapshot.

CORE-018 on `feat/core-daily-activity` adds V19 and `user_daily_activity` on 2026-10-29, bringing the checked-in Core schema to 23 tables. The previous full mapping review was V1–V18 (22 tables) against `feat/admin-dashboard-growth` at `3e93dd1` on 2026-10-26; this change does not re-audit every older mapping or establish shared-database migration.
The dated feature notes below preserve their original preparation boundaries.
The `.dbml` file owns the logical schema; `.dbdiagram` is only the editor's table
layout. AI tables and the planned `ai_requests` table retain their own status.

CORE-015 #238 on `feat/zalo-login`, prepared 2026-10-16 against staging `120779d`: additive V17 creates external Zalo identity mappings and short-lived OAuth sessions. Schema details and operational recovery are [below](#zalo-core-015-v17); preparation and disposable-PostgreSQL verification do not assert shared-DB rollout.

CORE-016 #276 on `feat/zalo-android`: approved V18 extends the session store for Android; [migration and recovery](#zalo-android-core-016-v18) and the reviewed staging configuration are checked in, not applied to a shared DB or Railway. Native remains off by runtime default; production activation and APK acceptance are separate.

CORE-012 #163/#164 on `feat/core-barcode`, reviewed 2026-10-12: V16 replaces archived-inclusive barcode uniqueness with an ACTIVE-only partial index. This branch addition does not assert shared-DB migration or mobile/staging acceptance; older schema/AI snapshots below remain dated as stated.

This ERD describes the target PostgreSQL database for **SmartLedger Phase 1**, an AI-assisted bookkeeping system for small businesses. It includes planned tables and relationships that are not yet in Core's Flyway migrations.

The logical ERD includes authentication, shops, products, customers, drafts, sales, payments, refunds, debts, expenses, media cleanup jobs, Agent chat history, Agent long-term memory, AI request traces, idempotency, and audit logs. Core migrations V1–V19 implement the business tables, idempotency, shared OWNER/ADMIN audit logs, nullable sale-item estimated-cost snapshot, Cloudinary media references/outbox, OWNER notifications, ACTIVE-only barcode uniqueness, external Zalo mappings and WEB/ANDROID OAuth sessions, plus V19 daily user activity; the AI baseline `supabase/migrations/20261005000000_ai_baseline.sql` creates the chat tables, enables the `vector` extension (pgvector), creates the read-only `ai_read` views (including `v_sales` and `v_sale_items`) and the `ai_sql_reader` role; later AI migrations in the same folder add `v_debts`, `v_payments` and `v_expenses` and the `agent_memories` and `agent_memory_settings` tables. V15 adds OWNER notification events/recipients and nullable product thresholds; `ai_requests` remains target design. This does not assert deployment.

Business decisions are owned by the [BRD](../product/business-requirements.md) and [PRD](../product/product-requirements.md); endpoint/JSON details are owned by the [API contract](../contracts/api-contracts.md). Core audit/schema alignment reviewed against `staging` commit `b1de421c461d59473b3bb73aae103027afd67a89` on 2026-10-06; AI sections were re-checked against `supabase/migrations/` and `backend/ai/src` at `staging` commit `f1a4818` on 2026-10-16.

A sale record in this MVP is an internal business record. It is **not an electronic invoice**.

## CORE-018 V19

Owner approval on 2026-10-29 covers an additive `user_daily_activity(user_id BIGINT NOT NULL, activity_date DATE NOT NULL)` table, composite PK `(user_id, activity_date)`, FK to `users.id` with `ON DELETE CASCADE` for this telemetry only, and `(activity_date, user_id)` index. There is no backfill or business-data mutation. V19 enables RLS and revokes PUBLIC/anon/authenticated access; Grafana needs a separately reviewed read-only policy/column grant. Core must use its trusted SQL role.

The date is initial successful-request admission in `Asia/Ho_Chi_Minh`, not UTC or a timestamp. The recorder resolves an ACTIVE Core user after controller completion and only counts authenticated handled business API 2xx/3xx responses. Public OAuth, health, OPTIONS and failed requests are excluded. Only user/day is persisted. The bounded cache is an optimization; PostgreSQL PK and `ON CONFLICT DO NOTHING` preserve uniqueness across instances and restarts.

The 90-day window includes today and 89 previous Vietnam dates. Hourly cleanup deletes older rows; SQL always bounds its window even if cleanup is unavailable. Recovery disables `USER_ACTIVITY_ENABLED` and retains V19; the flag defaults false and must only be enabled after the merged migration succeeds. See [Core rollout/retention/Grafana handoff](../../backend/core/docs/user-daily-activity.md) for limits, read-only role and operator acceptance; this is not shared-DB rollout evidence.

## 2. Main Tables

### Authentication

- **users**: Stores user profiles and system roles (`OWNER`, `ADMIN`), Firebase/avatar URL fallback, and nullable internal `avatar_public_id` for an authenticated Cloudinary avatar.
- **auth_identities**: Stores one Firebase UID per application user. Firebase sign-in providers remain under that account; Zalo uses the external mapping below, not another row/provider in this table.
- **external_auth_identities**: V17 primary key `(provider, provider_app_id, provider_subject)` maps an app-scoped Zalo subject to a canonical `firebase_uid` string. No user FK: the UID mapping is committed before Firebase provisioning and before `/auth/session` creates a Core profile. Several explicitly linked subjects may share a UID; one external identity may not be reassigned to another UID. It is not tenant business data and is never exposed to AI read views or FE DTOs.
- **oauth_login_sessions**: V17 UUID session with unique state hash, browser-binding hash, purpose, exact client origin/request ID/challenge, encrypted provider verifier, provider app/subject/name, unique nullable proof hash, lifecycle and TTL timestamps. V18 defaults existing sessions to WEB and adds ANDROID client/return-target/reference hash/expiry; channel constraints require WEB origin/proof versus ANDROID NULL origin/no WEB proof and the proper VERIFIED handoff. Expiry index supports cleanup. No provider access/refresh token or Firebase custom token is stored; raw state/proof/reference/browser binding are hashed and verifier ciphertext uses authenticated encryption. V18 being checked in does not assert shared deployment.

### Shops, Products, and Customers

- **shops**: Stores business information and nullable `logo_url`/internal `logo_public_id`. One OWNER can own multiple shops. `ACTIVE` shops can operate; `INACTIVE` shops can carry an `inactive_reason` for the OWNER, while `ARCHIVED` shops record `archived_at` and may have an `archived_reason`.
- **categories**: Groups products within a shop, not shops by business industry. Cannot archive while active products remain.
- **products**: Stores shop-specific products, selling price, cost price, unit, simple stock quantity, a delivery `image_url`, and internal nullable `image_public_id`. On `feat/core-stock-in`, stock-in adds a positive quantity to the locked current balance; PATCH no longer accepts an absolute stock_quantity. Enabling tracking initializes zero, keeping tracking preserves the balance, and disabling tracking clears it. Initial stock on creation is unchanged.
- **customers**: Stores a minimal customer directory for debt tracking. Names and normalized phone numbers are not unique; customer ID identifies the shared history. Phone is optional; Core never automatically merges matching names/phones.

### Drafts

- **sale_drafts**: Stores temporary sales before user confirmation.
- **sale_draft_items**: Stores items inside a temporary sale draft. Core accepts a same-shop catalog `productId` or a custom item with a null `productId`, a name, and a unit.

Drafts do not affect revenue, stock, payments, or debts until confirmed.

### Sales, Payments, and Debts

- **sales**: Stores CONFIRMED/VOIDED sale history and void time, user, and reason. Voiding does not erase the collection history in paid_vnd/payment_status.
- **sale_items**: Stores product references when available, quantities, name/unit/price snapshots, line totals and nullable `estimated_cost_vnd`. Confirmed catalog items snapshot `costPriceVnd × quantity`, rounded HALF_UP to VND; custom items, products without cost and history before V12 remain NULL and are never backfilled from today's product. Nullable `stock_deducted` snapshots whether confirmation actually deducted stock: true/false for new items, NULL for unknown historical movement.
- **payments**: Append-only history of initial collection and subsequent repayments; never delete or rewrite payments to represent refunds.
- **sale_refunds**: Zero or one full refund per sale, with positive amount, CASH/TRANSFER method, optional transfer reference, refunding user, and timestamp. Amount is the money actually collected, not the sale total or cancelled debt; zero-paid void has no refund row.
- **debts**: Stores original/outstanding debt and OPEN/SETTLED/VOIDED status. V9 adds nullable voided_at/cancelled_vnd to preserve the time and amount of unpaid debt cancelled by sale void. Already SETTLED debts retain settled_at/status and have no void audit.

### Expenses

- **expenses**: Stores confirmed operating expenses of a shop.

### AI and System Safety

- **chat_conversations**: Agent conversations per user and shop, created by the AI baseline in `supabase/migrations/`. `user_id` and `shop_id` reference `users` and `shops` (ON DELETE RESTRICT). The columns `summary` and `summary_through_message_id` are unused by the code: it neither reads nor writes them. They are kept so the previous release can roll back, and a later migration drops them after this deploy.
- **chat_messages**: USER/ASSISTANT messages of a conversation; `conversation_id` references `chat_conversations`. Each chat turn reads the latest `AGENT_HISTORY_TURNS` exchanges; no message is folded or searched. `ai_request_id` is a plain indexed column with no foreign key until `ai_requests` exists.
- **ai_read views**: the AI baseline creates the `ai_read` schema with `v_shop_profile`, `v_categories`, `v_products`, `v_sales` and `v_sale_items`, used by the Agent's read-only shop-data tool and the restock suggestion. Migration `20261016000000_ai_read_ledger_views.sql` adds `v_debts` and `v_payments` (scoped to the shop through their sale) and `v_expenses` (ACTIVE only), without customer names, phone numbers, transfer references or expense descriptions. They are views, not tables. Each filters on the transaction setting `smartledger.shop_id` (unset means no rows) and exposes no `shop_id` column.
- **ai_sql_reader**: a NOLOGIN group role created by the AI baseline. It has SELECT on the eight `ai_read` views and no grant on base tables. The login role behind `AI_SQL_READER_URL` is created outside the migration as a member of this role.
- **agent_memories**: the Agent's long-term memory ([ADR-0002](adr/0002-agent-long-term-memory.md)), created by `20261014000000_agent_memories.sql` and extended by `20261015000000_agent_memory_visibility.sql`. Each row is one fact for a `shop_id` and `user_id` (both ON DELETE RESTRICT), with `memory_type` (`preference`, `semantic`, `procedural`, `episodic`), `content`, a `vector(384)` `embedding` under a cosine HNSW index, `importance` (0–1), `metadata`, optional `expires_at`, the recall fields `last_used_at` and `use_count`, and `superseded_by`, the correction link: when a fact is corrected, the older row stores the newer row's id there and search skips the older row (self-reference, ON DELETE SET NULL). `source_conversation_id` cascades, so deleting a conversation deletes the memories it produced. After a turn, at most three groups of live, not yet summarized memories (no `metadata.summarized_from`) of one conversation and one shop day whose `created_at` is older than 7 days (groups of two or more) are each replaced, one transaction per group, by one to five summary rows that keep the group's latest `created_at`, its `source_conversation_id`, last use and summed `use_count`, and carry `metadata.summarized_from` (the replaced ids); memories the group had superseded now point at the first summary row, and the replaced rows are deleted. Row-level security is on with no policy. The service writes it only when `AGENT_MEMORY_ENABLED` is on, which awaits PO approval.
- **agent_memory_settings**: the owner's memory switch per `(shop_id, user_id)` primary key, `memory_enabled` default true; no row means on. Created by `20261015000000_agent_memory_visibility.sql`, with row-level security and no policy.
- **vector extension**: the AI baseline runs `CREATE EXTENSION IF NOT EXISTS vector` ([ADR-0001](adr/0001-vector-store-pgvector.md)); `agent_memories.embedding` is the only column that uses it.
- **ai_requests**: Planned table for AI request status, model/version, result, errors, and media object references; not yet created by any migration. Runtime traces go to Logfire, not to this table ([technical design §2](technical-design.md#2-thành-phần-và-quyền-sở-hữu)).
- **api_idempotency_keys**: Protects expense creation, debt repayment, sale void and product stock-in. Stock-in uses operation PRODUCT_STOCK_IN, resource PRODUCT and response_status 200; its hash includes product ID, canonical quantity and normalized reason. Confirmation replays by draft ID instead. Media uploads use the separate V14 table below; monetary idempotency retains its shop-scoped V7 schema. Default completed-key TTL is 30 days and no key cleanup job exists.
- **media_upload_keys**: V14 durable upload reservations with unique `(scope_key, operation, idempotency_key)`, user FK, request hash, internal public ID, UUID lease token, expiry and nullable JSONB replay snapshot. Product/logo use SHOP scope; avatar uses USER scope. Null response is PENDING; expired matching requests atomically acquire a new token. Final writes lock/recheck the token and lease; stale requests cannot complete or release another attempt. Avatar replay snapshots contain internal public ID, not signed URLs. There is no scheduled retention cleanup.
- **media_cleanup_jobs**: V13 persistent outbox for deleting a replaced/deleted Cloudinary asset only after the Product/Shop/User database transaction commits. Stores internal provider public ID, asset type, PENDING/COMPLETED state, retry count/schedule/error, and completion time. No business FK is required after the owner reference is cleared. Workers use per-job SKIP LOCKED and per-asset advisory locks shared with media writers, check current entity references and active upload leases, and update retries only while PENDING. The cleanup transaction stays open during remote deletion; a COMPLETED job cannot be resurrected by a late retry.
- **audit_logs**: V10 creates append-only history of successful OWNER/ADMIN writes; V11 extends the same table for ADMIN support reads; V13 permits the actor-scoped, shop-null `USER_AVATAR_UPDATED` event. Stores actor_user_id/actor_role, action/entity_type, optional entity_id/shop_id where the event permits, outcome SUCCESS, optional reason/idempotency_key, server request_id, safe metadata and created_at. UPDATE/DELETE/TRUNCATE are rejected by triggers. There is no admin_access_logs table; differing visibility is enforced by action/actor-scoped queries and explicit API projections, not by a second physical store.

### Notifications

- **notification_events**: V15 shop-scoped OWNER events with one of five supported types, title/body, polymorphic PRODUCT/SALE/SHOP target, internal JSON-object payload, required dedup_key, optional resolved_at and created_at. Unique (shop_id, dedup_key) identifies a source episode; a partial unique index permits at most one unresolved LOW_STOCK/OUT_OF_STOCK per product. Only stock alerts may resolve; resolution cannot precede creation. A shop-status target must equal shop_id. Content is a historical snapshot, not current stock or an audit record.
- **notification_recipients**: V15 per-user read state with event/user FKs, unique (notification_event_id, user_id), created_at and nullable read_at. Read time cannot precede creation. Core preserves the first read time under locks and checks both recipient identity and current shop ownership/status on every API. Resolved stock alerts remain history and may still be unread. All current events are addressed to the shop's OWNER; ADMIN has no inbox access.

## 3. Main Relationships

- A **user** has one **auth identity** in Phase 1.
- A **user** can own multiple **shops**.
- A **media_cleanup_job** is intentionally independent from a current Product/Shop/User row: it refers to an old provider asset after its durable owner reference has been replaced or cleared.
- A **media_upload_key** belongs to a user; its SHOP/USER scope and operation identify a durable media request independently from monetary idempotency.
- A **shop** can have multiple **categories**, **products**, **customers**, **sales**, **drafts**, **expenses**, and **notification events**.
- A **category** can contain multiple **products**.
- A **customer** can have multiple **sales** and **debts**.
- A **sale draft** contains multiple **sale draft items**.
- A confirmed **sale draft** can create one **sale**.
- A **sale** contains multiple **sale items**.
- A **sale** can have multiple **payments**.
- A **sale** can have zero or one **debt**.
- A **sale** can have zero or one **sale refund**, linked to its refunding **user**. Refund tenancy is resolved through the sale's shop, not a separate refund shop_id.
- A **debt** can have multiple debt repayment **payments**.
- A **notification event** can have multiple **notification recipients**.
- A **chat conversation** belongs to one user and one shop and contains multiple **chat messages**; it can be the source of multiple **agent memories**, which are deleted with it.
- An **agent memory** belongs to one user and one shop and can point to the newer memory that superseded it; a user has at most one **agent memory settings** row per shop.
- A planned **AI request** can be linked to a sale draft created from AI voice input once that flow is implemented.
- Every **audit log** references an actor **user** with an actor-role snapshot. A shop FK may be null for supported ADMIN read events that do not target a shop, and for the actor-scoped `USER_AVATAR_UPDATED` event added in V13. The avatar event requires `entity_type = USER`, `shop_id = null`, `entity_id = actor_user_id`, and null reason/idempotency_key; it can record either an OWNER or ADMIN updating their own avatar. Ledger business audit requires a shop and entity target. The polymorphic entity_id has no generic entity FK; entity_type/action/target checks constrain its meaning.

## 4. Main Data Flow

### Sale Draft Flow

```text
Manual Input (implemented) / AI Voice (planned integration)
        ↓
sale_drafts
        ↓
sale_draft_items
        ↓
User Review and Confirmation
        ↓
sales + sale_items
```

### Payment and Debt Flow
```text
Confirmed Sale
      ↓
Customer pays enough
      ↓
payments (INITIAL)
      ↓
payment_status = PAID
```

### Debt Repayment Flow
```text
Confirmed Sale
      ↓
Customer does not pay enough
      ↓
payments (INITIAL, optional)
      ↓
debts
      ↓
Later repayment
      ↓
payments (DEBT_REPAYMENT)
      ↓
Debt becomes SETTLED when fully repaid (not when cancelled)
```

### Sale Void and Full Refund Flow

An OWNER explicitly chooses whether returned goods go back into stock. One transaction locks sale → debt → products (ascending ID when needed), validates payment reconciliation, records a full refund if any money was collected, cancels only remaining OPEN debt, optionally restores deducted stock, and marks the sale VOIDED with its reason/user/time.

Example: sale 100,000 VND, collected 40,000 VND → refund 40,000 VND, cancelled debt 60,000 VND. The cancelled amount is not included in sale_refunds. A SETTLED debt remains SETTLED even if the sale is subsequently voided. New repayments after void are rejected.

Restock uses the historical stock_deducted snapshot, not today's tracked flag alone. False snapshots/custom items never restore stock; unknown NULL snapshots or products no longer tracking stock reject requested restock and roll back the whole void. Archived products can still receive restored stock if their current stock tracking remains valid. restockItems=false changes no inventory. Partial returns/refunds and a separate stock-adjustment ledger are deferred.

Reports retain collection at payment.received_at, refunds at sale_refunds.refunded_at, and cancelled revenue at sales.voided_at. Voiding a previous-period sale may make current net revenue negative; see the API contract for the metric/window definitions.

### ADMIN Support Read and Audit Flow

Firebase token verification → active DB ADMIN profile → support projection query → audit insert → transaction commit → response. Each successful dashboard GET is audited, including empty searches; these transactions cannot be read-only. Audit persistence failure refuses protected output with 503 admin_audit_unavailable. Validation/permission/not-found failures do not create SUCCESS events; failure/security audit is a separate scope.

OWNER audit queries exclude all ADMIN_* read actions. ADMIN access history selects only the authenticated actor and administrative action/target whitelist, with no raw business metadata. Shop status history selects only ADMIN SHOP_INACTIVATED/SHOP_REACTIVATED events; the existing status event serves both authorized views without duplication. Access-history reads select their page before recording the read itself. Query strings and contact data are not captured in read audit: metadata contains only queryPresent/resultCount. API details are in the [ADMIN contract](../contracts/api-contracts.md#7-dashboard-quản-trị--đã-có-trong-core).

### Planned AI Draft Flow (not yet implemented in Core)
```text
Text / Audio / Image Input
        ↓
ai_requests
        ↓
AI Processing
        ↓
sale_drafts + sale_draft_items
        ↓
User Review
        ↓
Confirmed Sale or Cancelled Draft
```

## 5. Design Principles
- PostgreSQL is the main database for persistent business data.
- IDs use BIGINT and map to Java Long
- Monetary values use BIGINT VND.
- Quantity uses NUMERIC(15,3) to support items, kilograms, and liters.
- Timestamps use TIMESTAMPTZ for instants; Core creates/normalizes them in UTC, serializes API timestamps at +07:00, and calculates report boundaries in Asia/Ho_Chi_Minh. A DB client's display timezone does not change the instant.
- Shop-specific data is separated by `shop_id`.
- Product, category, customer, and expense records use archive instead of physical deletion.
- Sale item snapshots preserve historical product names, prices, and units.
- payments is append-only payment history.
- paid_vnd equals the sum of all sale payments and remains collection history after void. For debt, original_vnd = debt-repayment payments + outstanding_vnd + COALESCE(cancelled_vnd, 0); initial payments are not part of the debt's original balance. Refunds are a separate outgoing-money history, not negative payments.
- Drafts do not affect reports, stock, revenue, or debt until confirmed.
- AI media is stored as an object key/reference, not as raw media in PostgreSQL.
- Idempotency reservation, business mutations, and saved replay result commit/rollback together for expense creation, debt repayment, sale void, and stock-in. Product/logo media is intentionally different: it commits a PENDING reservation before the external provider call, then commits the matching reference/audit/result together after the call; a failed final write releases the PENDING row for a safe retry. Sale draft confirmation returns the existing sale on retry without using this table.
- Audit is evidence, not a replacement for money/debt/inventory source tables. Administrative GET retries are new audited accesses, not idempotent money-operation replays. old_data/new_data/ip_address are retained nullable legacy schema columns; Core does not populate full snapshots or IP headers in them.
- Electronic invoices, full inventory management, CRM, OCR documents, and store staff roles are deferred to later phases.

## 6. Core Business Validation Rules

To keep the ERD clean in Phase 1 without nested composite foreign keys, Core service is responsible for validating the following business constraints:

1. **Tenant Consistency (Shop Isolation)**:
   - Core must ensure all related entities in a transaction belong to the same `shop_id` (e.g., `products.shop_id == sales.shop_id`, `customers.shop_id == sales.shop_id`, `categories.shop_id == products.shop_id`, `sale_drafts.shop_id == products.shop_id`).
2. **Product Barcode Scope**:
   - With V16, `(shop_id, barcode)` is unique only where `status = 'ACTIVE' AND barcode IS NOT NULL`; codes are exact/case-sensitive. Archived rows retain their codes and product IDs, but release the code for a new ACTIVE row. Nullable barcode is permitted regardless of stock tracking. Sale/draft history still refers to the original product ID, not the reused code. Custom sale items are not product rows.
   - Create/PATCH/lookup share input normalization in Core; V16 does not rewrite legacy strings. `erd.dbml` describes the partial index in a note, not an unconditional `[unique]` declaration: DBML cannot express the predicate faithfully. SQL V16 is the physical source for this guard; no barcode field/table or restore API is added.
3. **Draft Item Integrity**:
   - Core requires either an active product belonging to the selected shop or, when `product_id` is null, a non-blank custom-item name and unit. Confirmation snapshots custom items into `sale_items` with a null `product_id`; only catalog products can deduct stock. The nullability change for `sale_items.product_id` is in Core migration V8.
4. **Payment & Debt Integrity**:
   - For `payments.type = 'INITIAL'`: `debt_id` must be `NULL`.
   - For `payments.type = 'DEBT_REPAYMENT'`: `debt_id` must be NOT NULL, and `debt.sale_id` must equal `payments.sale_id`.
5. **Debt & Customer Integrity**:
   - Confirming a sale with payment_status DEBT/PARTIAL requires an active same-shop customer ID or a non-blank name to create a new customer; phone is optional. Drafts may omit customer details, and fully paid sales may have no customer.
   - `debts.customer_id` must match `sales.customer_id`.
   - A new CONFIRMED DEBT/PARTIAL sale creates a matching debt atomically. An initially PAID sale creates no debt; an existing debt fully repaid later remains SETTLED. VOIDED sales preserve historical payment_status but have no outstanding obligation.
6. **Void and Debt Lifecycle**:
   - OPEN: outstanding > 0, settled_at/voided_at/cancelled_vnd NULL.
   - SETTLED: outstanding = 0, settled_at present, void audit NULL.
   - VOIDED: outstanding = 0, settled_at NULL, voided_at present, 0 < cancelled_vnd <= original_vnd.
   - One positive full refund at most per sale; zero collected means no refund row. FK/unique/check constraints supplement service-level same-shop and monetary validation.

### OWNER Notification Flow

A business transaction holds the source product/sale/shop lock → reconcile/open/resolve the stock episode or append void/status event → insert its OWNER recipient → commit together with business data and audit. Failed transactions and idempotent replays create no new events. Per-product low_stock_threshold is nullable NUMERIC(15,3), nonnegative; null disables low-stock alerts but tracked stock=0 still creates OUT_OF_STOCK. Threshold changes, checkout, stock-in, restock on void, tracking changes and product archive reconcile the lifecycle. Reading/marking the inbox does not mutate the business source or audit; status/ownership filters apply equally to pages, counts and read updates. Contract and AC are linked from the product documents.

## 7. Migration Alignment

### Zalo CORE-015 V17

`V17__create_zalo_auth_stores.sql` creates only the two new auth stores and their
indexes/constraints in one PostgreSQL transaction. Existing tables, Firebase
identities, roles, profiles, shops and ledger rows are not rewritten or
backfilled. Index creation is transactional on a new empty table, not a
concurrent build on a populated ledger. Existing relations with these names
cause failure, not silent adoption; the entire V17 and its history entry roll
back. Correct the cause under an approved procedure before retrying; do not use
Flyway baseline/repair to disguise a schema mismatch.

Both stores enable RLS without public policies and revoke PUBLIC privileges,
plus direct `anon`/`authenticated` grants when those Supabase roles exist.
Core's trusted SQL role must own the tables or have separately reviewed access;
do not add public allow-all policies or grant broad BYPASSRLS to make the feature
work. The migration changes no RLS/grants on existing business tables. This
follows [Supabase's grants/RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [PostgreSQL owner/default-deny semantics](https://www.postgresql.org/docs/16/ddl-rowsecurity.html).

The old `auth_identities.user_id` OneToOne is unchanged. A Zalo mapping may exist
without a Firebase user or Core profile yet. That absence is intentional, not
permission to create a new mapping/UID on every retry. Session cleanup clears
expired transient profile metadata, not durable identities or user accounts.

Deployment owner: the person operating Core/Railway and the shared DB; product
owner approves enabling Zalo. Sequence:

1. Before merge, confirm Railway's `FLYWAY_ENABLED` and the migration owner:
   `ZALO_ENABLED=false` does **not** disable Flyway. If startup migration is on,
   deploy may apply V17 automatically; arrange backup/review/window before merge
   or use the approved controlled migration procedure. Deploy Zalo off.
2. Back up/check the intended staging DB and existing migration history; run
   V17 only from merged staging code under the repo migration procedure. No
   feature-branch migration is run on shared DB in this preparation.
3. Configure the real Core HTTPS callback, exact client origins/CORS, Zalo
   app credentials, a separate persistent 32-byte encryption key and the existing
   staging Firebase credentials. Keep production projects/keys separate.
4. Check Firebase signing, proxy/edge throttling and access-log redaction. Do
   not log callback query, Authorization/cookies, proof body, tokens or secrets.
   Complete FE popup/LINK acceptance and then enable for the agreed pilot.

Recovery is **application rollback/feature-off with schema retained**, not an
automatic DOWN script. Dropping identity mappings would lose login/account
continuity, so it is not a safe rollback. Disable Zalo to stop new operations;
existing Firebase login remains supported. Preserve both stores and Firebase
users. Any later removal/data correction needs a separately reviewed forward
migration, explicit retention/recovery decision and owner approval. Rotating the
session encryption key invalidates in-flight sessions, not durable mappings.

`ZaloMigrationPostgresTest` verifies fresh V17, upgrade from V16 without user/shop
changes or backfill, unique identity scope, lifecycle/proof constraints, no-op
rerun and transactional rollback/retry after an intentional relation collision.
Repository/concurrency tests use actual V17. A compatibility flow test starts
Hibernate on V16 before applying the exact V17 SQL; it also proves feature-off
and missing-schema fail-closed behavior. These are generated disposable schemas,
not a staging migration or a performance/lock SLA for a production-sized DB.

<a id="zalo-android-core-016-pending-schema"></a>

### Zalo Android CORE-016 V18

`V18__add_zalo_android_handoff.sql` is approved and checked in for #276 on `feat/zalo-android`, **not yet an applied shared-DB schema**. V1–V17 remain unchanged. Native defaults OFF; explicit staging enablement is prepared for after merge/migration, production is not enabled. The entity description and DBML include V18; the old pending-schema anchor above is retained for existing links.

| V18 `oauth_login_sessions` change | Purpose / constraint |
|---|---|
| `client_type VARCHAR(10) NOT NULL DEFAULT 'WEB'` | WEB or ANDROID; existing web rows retain their channel without user/account backfill |
| `native_client_id VARCHAR(100)`, `return_target_id VARCHAR(100)` | Non-null only for ANDROID; fixed deployment configuration, never arbitrary callback URL |
| `handoff_reference_hash VARCHAR(64) UNIQUE` | Hash of random native reference, distinct from WEB proof; cleared on consume |
| `handoff_expires_at TIMESTAMPTZ` | No later than session expiry; both expiry checks are mandatory at consume |
| Make `client_origin` conditionally nullable | WEB requires origin and no native fields; ANDROID requires NULL origin and NULL WEB proof/expiry |
| Replace WEB-only VERIFIED constraint with channel-aware checks | VERIFIED requires subject plus the correct channel's hash/expiry; reject mixed channel state |

No new durable mapping/account/shop table or change to `auth_identities` is needed. Both channels reuse `(provider, provider_app_id, provider_subject) → canonical firebase_uid`; no identity reassignment, profile merge or business backfill occurs. Existing RLS/private-store grants/policies, WEB proof uniqueness/expiry and other lifecycle constraints remain. The VERIFIED constraint is replaced atomically with a channel-aware equivalent, and handoff reference uniqueness has a named constraint/index.

V18 is transactional DDL with `lock_timeout=5s` and `statement_timeout=60s`. Its ordinary unique-index/constraint build locks the existing transient session table; this is not zero-downtime or a production-sized performance guarantee. Review a short window/stop new OAuth starts and check backups, SQL-role ownership and `FLYWAY_ENABLED` before merge/deploy. Feature-off does not stop startup Flyway. Only run on shared DB from merged staging code under the [repository migration workflow](../development/local-development.md#database-migrations), never from this feature branch. No `IF NOT EXISTS`/baseline/repair silently adopts unexpected columns; early/late failures roll back all V18 DDL/history and retain V17 state. Resolve the cause before normal retry.

The former native SQL fixture is removed. `ZaloNativeMigrationPostgresTest` uses real Flyway V18 for fresh/upgrade/no-op, WEB/account/mapping preservation, mixed-channel/reference/expiry rejection, early/late rollback, lock contention/retry and RLS. `ZaloNativeFlowPostgresTest` uses actual V18 for channel/concurrency/expiry/UID/LINK safeguards and a separate actual V17 schema for compatibility/missing-V18 fail-closed checks; no ad-hoc column downgrade or migration-history edit is used. Runtime repository never executes DDL or adopts/repairs schema.

After merged V18 succeeds, the operator may review/copy [staging variables](../../backend/core/config/zalo-native-staging.env.example) to Railway staging to enable testing; Spring/Railway does not auto-load the file and it contains no secret/DB/migration switch. APK/provider acceptance remains pending and production needs separate release approval. See [implementation status](technical-design.md#zalo-android-core-016), [contract](../contracts/api-contracts.md#zalo-android-core-016) and [activation runbook](../../backend/core/docs/zalo-android-preparation.md#staging-activation-after-merge). Recovery disables native and retains V18/mappings/Firebase users/business data. There is no automatic destructive DOWN; any schema removal needs a separately approved forward migration, not column drops to roll back the app.

### Earlier migrations and business schema

- V16 `V16__product_barcode_unique_active.sql` creates `uq_products_shop_barcode_active` **before** dropping `uq_products_shop_barcode`, in one Flyway transaction with lock timeout 5 seconds and statement timeout 60 seconds. Pause catalog writes and use a controlled maintenance window; this ordinary index build is not zero-downtime. Failure creating the index or dropping the constraint rolls back V16. Unexpected ACTIVE duplicates/schema dependencies stop the migration; never silently delete/recode product/history rows. No new column/table or historical backfill is involved.
- V16 tests cover fresh V1–V16, upgrade from V15 with sale/draft snapshots intact, archive/reuse, exact/shop/null uniqueness, concurrent CREATE/PATCH writers and atomic failure. Run only against a disposable test DB; the approved [migration workflow](../development/local-development.md#database-migrations) still requires merged staging code and a migration owner for shared environments. `ddl-auto=update` cannot safely replace this constraint change.
- V16 recovery: retain the partial index and deploy an application compatible with ACTIVE-only uniqueness. Old application prechecks may still reject reused archived codes, so rollback is a degraded mode, not equivalent behavior. Restoring the old constraint requires a reviewed forward migration, a check for duplicate codes across ACTIVE/ARCHIVED, and an explicit resolution plan; do not remove the ACTIVE guard or rewrite history to force a rollback.

- Stock-in on `feat/core-stock-in` reuses products, api_idempotency_keys (V7) and STOCK_ADJUSTED in audit_logs (V10/V11). No new column/table/migration or DBML structure change: STOCK_IN is an application metadata source, not a new DB enum. This branch does not assert staging/mobile deployment.
- V8 only permits NULL sale_items.product_id for custom items while keeping the FK for non-null values; it does not create catalog products.
- V9 adds sale_refunds (sale/user FKs, unique sale_id, positive amount/method checks, refund-time index), nullable sale_items.stock_deducted, and nullable debts.voided_at/cancelled_vnd with lifecycle checks. Existing sales void fields are reused, not recreated.
- Existing historical stock snapshots remain NULL; do not invent stock deductions. Existing OPEN/SETTLED data remains intact. V9 can adopt valid Hibernate-created local columns/refund tables, but orphan/invalid refund or unaudited legacy VOIDED rows stop the migration rather than being silently repaired.
- V1–V8 are not rewritten. Use forward migrations for later changes; shared databases require backup/recovery planning. Local Hibernate development schema is not proof that Flyway constraints or shared deployments have passed.
- V10 creates audit_logs with actor-role/outcome/request-ID/JSON-object/action-target checks, actor/shop FKs (ON DELETE RESTRICT), indexes on (shop_id, created_at, id), (entity_type, entity_id), actor_user_id, and statement-level triggers rejecting UPDATE/DELETE/TRUNCATE, including bulk/zero-row attempts. Metadata key/type allowlisting belongs to Core on write; the DB check requires a JSON object, not every application key rule. Schema owners/superusers can disable triggers, so production application-role isolation remains necessary.
- V11 changes shop_id/entity_id nullability and replaces ID/action-target checks without rewriting V10 or historical rows. Existing business actions still require non-null shop/target. Only ADMIN read actions permit global/list null targets; ADMIN_OWNER_VIEWED requires a positive owner target and null shop; ADMIN_SHOP_VIEWED/ADMIN_SHOP_STATUS_HISTORY_VIEWED require entity_id = shop_id. Read events require actor_role ADMIN and null reason/idempotency_key. Global/list actions and entity types are defined in the API contract.
- V11 retains V10 FKs, role/outcome/request/metadata checks, indexes and append-only triggers; it does not add a second audit table. Invalid existing rows stop validation/roll back migration. Recovery preserves audit data and uses a reviewed forward fix; do not restore V10 NOT NULL/action checks after ADMIN read rows exist, drop history, or use Flyway repair to bypass invalid data. Apply shared-DB migrations only through the approved [migration workflow](../development/local-development.md#database-migrations).
- V13 adds nullable `products.image_public_id`, `shops.logo_url/logo_public_id`, `users.avatar_public_id` and `media_cleanup_jobs`. It validates fixed asset/status values, nonnegative retry count, status/completion consistency and indexes due jobs by `(status, next_attempt_at, id)`. Existing URL-only rows stay intact; no provider ID or media is invented. V13 replaces only the V11 action-target check to allow `USER_AVATAR_UPDATED` when `entity_id = actor_user_id`, shop/reason/key are null; existing V10 append-only guards and all other V11 rules remain. Invalid pre-existing local rows stop the migration/roll back; do not repair history or baseline a shared database from a feature branch.
- V14 adds `media_upload_keys` for scoped reservations and UUID lease fencing without modifying V13 or V7. Fresh and upgrade migration checks run only on disposable PostgreSQL. V13 audit CHECK validation must be planned during reduced/stopped writes; no shared migration is run from this feature branch.


- V15 is additive and forward-only: products.low_stock_threshold plus notification_events/notification_recipients, FKs, source/recipient uniqueness, one-open-stock partial uniqueness, lifecycle/type/target/JSON/read-time checks and inbox indexes. Existing products keep NULL; no notification/history backfill occurs. Valid Hibernate-created local notification tables/thresholds may be adopted without deleting rows; incompatible schema/data fails rather than being repaired silently. Test adoption only on a disposable copy first. New/small-table indexes are transactional; stop writes during adoption and schedule CHECK validation. No production-sized locking benchmark has been performed.
- V15 recovery retains additive columns/tables when rolling back the application; preserve notification/read history and correct shared schema/data with a reviewed forward migration. Do not rewrite V1–V14, drop history, baseline a shared database or use Flyway repair to bypass invalid rows. Apply only from merged code under the existing migration workflow; feature tests do not run shared migrations.
