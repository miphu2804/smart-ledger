# SmartLedger — ERD Description

## 1. Overview

This ERD describes the target PostgreSQL database for **SmartLedger Phase 1**, an AI-assisted bookkeeping system for small businesses. It includes planned tables and relationships that are not yet in Core's Flyway migrations.

The logical ERD includes authentication, shops, products, customers, drafts, sales, payments, refunds, debts, expenses, Agent chat history, AI request traces, idempotency, and audit logs. Core migrations V1–V11 implement the business tables, idempotency and shared OWNER/ADMIN audit logs; AI migrations `001`–`004` in `backend/ai/migrations` create the chat tables, enable `pgvector` and add read-only views for the Agent; migration `005` on branch `feat/ai-restock-insight` adds the `v_sales` and `v_sale_items` views. `ai_requests` and the notification tables remain target design. This does not assert deployment.

Business decisions are owned by the [BRD](../product/business-requirements.md) and [PRD](../product/product-requirements.md); endpoint/JSON details are owned by the [API contract](../contracts/api-contracts.md). Core audit/schema alignment reviewed against `staging` commit `b1de421c461d59473b3bb73aae103027afd67a89` on 2026-10-06; AI sections retain their previous snapshot and are outside this review.

A sale record in this MVP is an internal business record. It is **not an electronic invoice**.

## 2. Main Tables

### Authentication

- **users**: Stores user profiles and system roles (`OWNER`, `ADMIN`).
- **auth_identities**: Stores one Firebase UID per application user. Phone and Google sign-in methods are linked to that Firebase account.

### Shops, Products, and Customers

- **shops**: Stores business information. One OWNER can own multiple shops. `ACTIVE` shops can operate; `INACTIVE` shops can carry an `inactive_reason` for the OWNER, while `ARCHIVED` shops record `archived_at` and may have an `archived_reason`.
- **categories**: Groups products within a shop, not shops by business industry. Cannot archive while active products remain.
- **products**: Stores shop-specific products, selling price, cost price, unit, and simple stock quantity.
- **customers**: Stores a minimal customer directory for debt tracking. Names and normalized phone numbers are not unique; customer ID identifies the shared history. Phone is optional; Core never automatically merges matching names/phones.

### Drafts

- **sale_drafts**: Stores temporary sales before user confirmation.
- **sale_draft_items**: Stores items inside a temporary sale draft. Core accepts a same-shop catalog `productId` or a custom item with a null `productId`, a name, and a unit.

Drafts do not affect revenue, stock, payments, or debts until confirmed.

### Sales, Payments, and Debts

- **sales**: Stores CONFIRMED/VOIDED sale history and void time, user, and reason. Voiding does not erase the collection history in paid_vnd/payment_status.
- **sale_items**: Stores product references when available, quantities, name/unit/price snapshots, and line totals. Custom sale items retain a null `product_id` and do not deduct catalog stock. Nullable `stock_deducted` snapshots whether confirmation actually deducted stock: true/false for new items, NULL for unknown historical movement.
- **payments**: Append-only history of initial collection and subsequent repayments; never delete or rewrite payments to represent refunds.
- **sale_refunds**: Zero or one full refund per sale, with positive amount, CASH/TRANSFER method, optional transfer reference, refunding user, and timestamp. Amount is the money actually collected, not the sale total or cancelled debt; zero-paid void has no refund row.
- **debts**: Stores original/outstanding debt and OPEN/SETTLED/VOIDED status. V9 adds nullable voided_at/cancelled_vnd to preserve the time and amount of unpaid debt cancelled by sale void. Already SETTLED debts retain settled_at/status and have no void audit.

### Expenses

- **expenses**: Stores confirmed operating expenses of a shop.

### AI and System Safety

- **chat_conversations**: Agent conversations per user and shop, created by the AI baseline in `supabase/migrations/`, with `summary` and `summary_through_message_id` for the rolling summary.
- **chat_messages**: USER/ASSISTANT messages of a conversation; folded messages stay for history search. `ai_request_id` has no foreign key until `ai_requests` exists.
- **ai_read views**: the AI baseline creates `ai_read.v_shop_profile`, `v_categories` and `v_products` for the Agent's read-only shop-data tool, and `v_sales` and `v_sale_items` for confirmed-sales questions and restock suggestions. They are views, not tables.
- **ai_requests**: Planned table for AI request status, model/version, result, errors, and media object references; not yet created by any migration.
- **api_idempotency_keys**: Protects exactly expense creation, debt repayment, and sale void. Confirmation replays by draft ID instead. Other create operations are not covered; default TTL is 30 days and no cleanup job exists.
- **audit_logs**: V10 creates append-only history of successful OWNER/ADMIN writes; V11 extends the same table for ADMIN support reads. Stores actor_user_id/actor_role, action/entity_type, optional entity_id/shop_id where the event permits, outcome SUCCESS, optional reason/idempotency_key, server request_id, safe metadata and created_at. UPDATE/DELETE/TRUNCATE are rejected by triggers. There is no admin_access_logs table; differing visibility is enforced by action/actor-scoped queries and explicit API projections, not by a second physical store.

### Notifications

- **notification_events**: Planned table for notification events, optional shop link, entity reference, and payload.
- **notification_recipients**: Planned table for per-user recipient read status for each notification event.

## 3. Main Relationships

- A **user** has one **auth identity** in Phase 1.
- A **user** can own multiple **shops**.
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
- A planned **AI request** can be linked to a sale draft created from AI voice input once that flow is implemented.
- Every **audit log** references an actor **user** with an actor-role snapshot. A shop FK is optional only for scoped ADMIN read events that do not target a shop; business audit always requires a shop and entity target. The polymorphic entity_id has no generic entity FK; entity_type/action/target checks constrain its meaning.

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
- Idempotency reservation, business mutations, and saved replay result commit/rollback together for expense creation, debt repayment, and sale void. Sale draft confirmation returns the existing sale on retry without using this table.
- Audit is evidence, not a replacement for money/debt/inventory source tables. Administrative GET retries are new audited accesses, not idempotent money-operation replays. old_data/new_data/ip_address are retained nullable legacy schema columns; Core does not populate full snapshots or IP headers in them.
- Electronic invoices, full inventory management, CRM, OCR documents, and store staff roles are deferred to later phases.

## 6. Core Business Validation Rules

To keep the ERD clean in Phase 1 without nested composite foreign keys, Core service is responsible for validating the following business constraints:

1. **Tenant Consistency (Shop Isolation)**:
   - Core must ensure all related entities in a transaction belong to the same `shop_id` (e.g., `products.shop_id == sales.shop_id`, `customers.shop_id == sales.shop_id`, `categories.shop_id == products.shop_id`, `sale_drafts.shop_id == products.shop_id`).
2. **Product Barcode Scope**:
   - `(shop_id, barcode)` is unique per shop including archived products; nullable barcode is permitted regardless of stock tracking. Custom sale items are not product rows.
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

## 7. Migration Alignment

- V8 only permits NULL sale_items.product_id for custom items while keeping the FK for non-null values; it does not create catalog products.
- V9 adds sale_refunds (sale/user FKs, unique sale_id, positive amount/method checks, refund-time index), nullable sale_items.stock_deducted, and nullable debts.voided_at/cancelled_vnd with lifecycle checks. Existing sales void fields are reused, not recreated.
- Existing historical stock snapshots remain NULL; do not invent stock deductions. Existing OPEN/SETTLED data remains intact. V9 can adopt valid Hibernate-created local columns/refund tables, but orphan/invalid refund or unaudited legacy VOIDED rows stop the migration rather than being silently repaired.
- V1–V8 are not rewritten. Use forward migrations for later changes; shared databases require backup/recovery planning. Local Hibernate development schema is not proof that Flyway constraints or shared deployments have passed.
- V10 creates audit_logs with actor-role/outcome/request-ID/JSON-object/action-target checks, actor/shop FKs (ON DELETE RESTRICT), indexes on (shop_id, created_at, id), (entity_type, entity_id), actor_user_id, and statement-level triggers rejecting UPDATE/DELETE/TRUNCATE, including bulk/zero-row attempts. Metadata key/type allowlisting belongs to Core on write; the DB check requires a JSON object, not every application key rule. Schema owners/superusers can disable triggers, so production application-role isolation remains necessary.
- V11 changes shop_id/entity_id nullability and replaces ID/action-target checks without rewriting V10 or historical rows. Existing business actions still require non-null shop/target. Only ADMIN read actions permit global/list null targets; ADMIN_OWNER_VIEWED requires a positive owner target and null shop; ADMIN_SHOP_VIEWED/ADMIN_SHOP_STATUS_HISTORY_VIEWED require entity_id = shop_id. Read events require actor_role ADMIN and null reason/idempotency_key. Global/list actions and entity types are defined in the API contract.
- V11 retains V10 FKs, role/outcome/request/metadata checks, indexes and append-only triggers; it does not add a second audit table. Invalid existing rows stop validation/roll back migration. Recovery preserves audit data and uses a reviewed forward fix; do not restore V10 NOT NULL/action checks after ADMIN read rows exist, drop history, or use Flyway repair to bypass invalid data. Apply shared-DB migrations only through the approved [migration workflow](../../README.md#database-migrations).
