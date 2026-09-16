# So Nghe Loi AI — ERD Description

## 1. Overview

This ERD describes the PostgreSQL database of **So Nghe Loi AI**, an AI-assisted bookkeeping system for small businesses.

The database manages users, stores, products, sales, invoices, expenses, AI conversations, and system logs.

## 2. Main Tables

### Authentication
- **users**: Stores user accounts and system roles.
- **oauth_accounts**: Stores Google and Facebook login accounts.
- **refresh_tokens**: Stores refresh tokens and session information.

### Store and Products
- **stores**: Stores business information.
- **categories**: Stores product categories for each store.
- **system_products**: A shared product catalog with barcode and basic product information.
- **products**: Stores store-specific product information, including price, cost, stock, and custom image.

### Sales and Invoices
- **sales**: Stores sales transactions.
- **sale_items**: Stores products, quantities, and prices in each sale.
- **invoices**: Stores invoices generated from sales.

### Expenses and Documents
- **source_documents**: Stores uploaded menus, invoices, receipts, and other documents for OCR processing.
- **expenses**: Stores confirmed business expenses.

### AI and System
- **chat_history**: Stores text and voice conversations between users and the AI assistant.
- **audit_logs**: Records important system actions and data changes.

## 3. Main Relationships

- A **user** can own multiple **stores**.
- A **store** can have multiple **categories** and **products**.
- A **product** can optionally link to a **system product**.
- A **sale** contains multiple **sale items**.
- Each **sale item** belongs to one **product**.
- A **sale** can have one **invoice**.
- A **source document** can be linked to an **expense** after OCR processing and user confirmation.
- A **store** has its own sales, products, expenses, and chat history.

## 4. OCR Data Flow

Uploaded documents are processed before becoming official business data:

```text
Document Upload
      ↓
source_documents
      ↓
OCR / AI Processing
      ↓
User Confirmation
      ↓
Products / Expenses
```

This separation helps prevent incorrect OCR results from directly changing business data.

## 5. Design Principles

- PostgreSQL is the main database for persistent business data.
- Store-specific data is separated by `store_id`.
- Shared product information is stored in `system_products`.
- Sales and expenses are stored as official business records.
- OCR documents are kept separately as source data.
- The database is designed to support future features and system expansion.
