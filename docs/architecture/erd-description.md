# SmartLedger — ERD Description

## 1. Overview

This ERD describes the PostgreSQL database for **SmartLedger Phase 1**, an AI-assisted bookkeeping system for small businesses.

The database manages authentication, shops, products, customers, sale drafts, confirmed sales, payments, debts, expenses, AI request traces, idempotency, and audit logs.

A sale record in this MVP is an internal business record. It is **not an electronic invoice**.

## 2. Main Tables

### Authentication

- **users**: Stores user profiles and system roles (`OWNER`, `ADMIN`).
- **auth_identities**: Stores one Firebase UID per application user. Phone and Google sign-in methods are linked to that Firebase account.

### Shops, Products, and Customers

- **shops**: Stores business information. One OWNER can own multiple shops.
- **categories**: Stores product categories for each shop.
- **products**: Stores shop-specific products, selling price, cost price, unit, and simple stock quantity.
- **customers**: Stores a minimal customer directory for debt tracking.

### Drafts

- **sale_drafts**: Stores temporary sales before user confirmation.
- **sale_draft_items**: Stores items inside a temporary sale draft.

Drafts do not affect revenue, stock, payments, or debts until confirmed.

### Sales, Payments, and Debts

- **sales**: Stores confirmed sales transactions.
- **sale_items**: Stores products, quantities, price snapshots, and line totals for each sale.
- **payments**: Stores every amount collected from customers.
- **debts**: Stores the outstanding debt of a partially paid or unpaid sale.

### Expenses

- **expenses**: Stores confirmed operating expenses of a shop.

### AI and System Safety

- **ai_requests**: Stores AI request status, model/version, result, errors, and media object references.
- **api_idempotency_keys**: Prevents duplicate sale or payment creation caused by retry or double-click.
- **audit_logs**: Records important business actions and sensitive ADMIN access.

### Notifications

- **notification_events**: Stores notification events, optional shop link, entity reference, and payload.
- **notification_recipients**: Stores per-user recipient read status for each notification event.

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
- A **debt** can have multiple debt repayment **payments**.
- A **notification event** can have multiple **notification recipients**.
- An **AI request** can be linked to a sale draft created from AI voice input.

## 4. Main Data Flow

### Sale Draft Flow

```text
Manual Input / AI Voice
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
Debt becomes SETTLED when outstanding_vnd = 0
```

### AI Draft Flow
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
- Timestamps use TIMESTAMPTZ and are stored in UTC.
- Shop-specific data is separated by `shop_id`.
- Product, category, customer, and expense records use archive instead of physical deletion.
- Sale item snapshots preserve historical product names, prices, and units.
- payments is append-only payment history.
- paid_vnd and outstanding_vnd are cached balances that can be reconciled from payment records.
- Drafts do not affect reports, stock, revenue, or debt until confirmed.
- AI media is stored as an object key/reference, not as raw media in PostgreSQL.
- Idempotency keys prevent duplicate business records when mobile requests are retried.
- Electronic invoices, full inventory management, CRM, OCR documents, and store staff roles are deferred to later phases.

## 6. Core Business Validation Rules

To keep the ERD clean in Phase 1 without nested composite foreign keys, Core service is responsible for validating the following business constraints:

1. **Tenant Consistency (Shop Isolation)**:
   - Core must ensure all related entities in a transaction belong to the same `shop_id` (e.g., `products.shop_id == sales.shop_id`, `customers.shop_id == sales.shop_id`, `categories.shop_id == products.shop_id`, `sale_drafts.shop_id == products.shop_id`).
2. **Product Barcode Scope**:
   - `(shop_id, barcode)` is unique per shop; null barcodes are permitted for untracked/custom items.
3. **Draft Item Integrity**:
   - Before persisting a draft item, Core requires either a product belonging to the draft's shop or a non-blank custom-item name and unit. An unresolved item cannot be confirmed until the user reviews it.
4. **Payment & Debt Integrity**:
   - For `payments.type = 'INITIAL'`: `debt_id` must be `NULL`.
   - For `payments.type = 'DEBT_REPAYMENT'`: `debt_id` must be NOT NULL, and `debt.sale_id` must equal `payments.sale_id`.
5. **Debt & Customer Integrity**:
   - `sales.payment_status` in (`DEBT`, `PARTIAL`) requires a non-null `sales.customer_id` before confirmation.
   - `debts.customer_id` must match `sales.customer_id`.
   - `sales.payment_status` in (`DEBT`, `PARTIAL`) requires a corresponding `debts` record; `sales.payment_status = 'PAID'` must not create an open debt record.
