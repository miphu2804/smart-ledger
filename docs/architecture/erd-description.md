# SmartLedger — ERD Description

## 1. Overview

This ERD describes the PostgreSQL database for **SmartLedger Phase 1**, an AI-assisted bookkeeping system for small businesses.

The database manages authentication, stores, products, customers, sale drafts, confirmed sales, payments, debts, expenses, AI request traces, idempotency, and audit logs.

A sale record in this MVP is an internal business record. It is **not an electronic invoice**.

## 2. Main Tables

### Authentication

- **users**: Stores user profiles and system roles (`OWNER`, `ADMIN`).
- **auth_identities**: Links a user to one Firebase UID. Firebase manages Phone and Google authentication.

### Stores, Products, and Customers

- **stores**: Stores business information. One OWNER can own multiple stores.
- **categories**: Stores product categories for each store.
- **products**: Stores store-specific products, selling price, cost price, unit, and simple stock quantity.
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

- **expenses**: Stores confirmed operating expenses of a store.

### AI and System Safety

- **ai_requests**: Stores AI request status, model/version, result, errors, and media object references.
- **api_idempotency_keys**: Prevents duplicate sale or payment creation caused by retry or double-click.
- **audit_logs**: Records important business actions and sensitive ADMIN access.

## 3. Main Relationships

- A **user** has one **auth identity**.
- A **user** can own multiple **stores**.
- A **store** can have multiple **categories**, **products**, **customers**, **sales**, **drafts**, and **expenses**.
- A **category** can contain multiple **products**.
- A **customer** can have multiple **sales** and **debts**.
- A **sale draft** contains multiple **sale draft items**.
- A confirmed **sale draft** can create one **sale**.
- A **sale** contains multiple **sale items**.
- A **sale** can have multiple **payments**.
- A **sale** can have zero or one **debt**.
- A **debt** can have multiple debt repayment **payments**.
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
- Store-specific data is separated by store_id.
- Product, category, customer, and expense records use archive instead of physical deletion.
- Sale item snapshots preserve historical product names, prices, and units.
- payments is append-only payment history.
- paid_vnd and outstanding_vnd are cached balances that can be reconciled from payment records.
- Drafts do not affect reports, stock, revenue, or debt until confirmed.
- AI media is stored as an object key/reference, not as raw media in PostgreSQL.
- Idempotency keys prevent duplicate business records when mobile requests are retried.
- Electronic invoices, full inventory management, CRM, OCR documents, and store staff roles are deferred to later phases.
