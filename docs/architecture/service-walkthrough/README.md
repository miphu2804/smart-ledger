# Service walkthrough

Core diagrams reviewed against `staging` commit [`b1de421c461d59473b3bb73aae103027afd67a89`](https://github.com/miphu2804/smart-ledger/tree/b1de421c461d59473b3bb73aae103027afd67a89) on 2026-10-06. AI diagrams are outside this review and remain unchanged.
These are reading notes, not a source of truth — scope and behavior stay in `docs/product/` and `docs/contracts/`.

| Folder | Diagrams |
|---|---|
| `01-overview/` | request resolution, core services |
| `02-access/` | shop access guard, auth session |
| `03-sales/` | draft/sale/debt states, draft validation, checkout confirm |
| `04-money/` | idempotency, debt repay, sale void |
| `05-report/` | report summary |
| `06-ai/` | AI components, chat turn |

Colors: blue = step, yellow = decision / open state, red = error / terminal failure, green = start, success or final state, purple = data store, orange = shared service. Each group box has its own tint.

Re-render after editing this file: `./export.sh` (SVG, lossless zoom).

## 1. Request Resolution Logic

Every business request follows one path: Firebase auth → controller → service → shop ownership check → repository.

```mermaid
flowchart LR
    subgraph Client["Client Space"]
        APP["Mobile app (Expo)<br/>Bearer Firebase ID token<br/>X-Shop-Id header"]
    end

    subgraph Core["Core Space (Spring Boot)"]
        FILTER["BearerTokenAuthenticationFilter"]
        CTRL["*Controller<br/>/api/v1/..."]
        SVC["*ServiceImpl"]
        GUARD["ShopService<br/>requireOwnedActiveShop()"]
        IDEM["IdempotencyService<br/>execute()"]
        AUDIT["AuditLogService<br/>recordOwner()"]
        AICLIENT["AgentServiceImpl<br/>RestClient"]
    end

    subgraph AI["AI Space (FastAPI)"]
        AIROUTER["/internal/v1/agent/*"]
    end

    subgraph Data["Data Space (PostgreSQL)"]
        PG[("core tables")]
        VIEWS[("ai_read views")]
        CHAT[("chat history")]
    end

    APP -->|"HTTPS"| FILTER -->|"VerifiedFirebaseToken"| CTRL --> SVC
    SVC -->|"ownership"| GUARD
    SVC -->|"money writes"| IDEM
    SVC -->|"audit trail"| AUDIT
    SVC -->|"JPA"| PG
    SVC -->|"agent calls"| AICLIENT -->|"X-Internal-Token<br/>verified user_id, shop_id"| AIROUTER
    AIROUTER -->|"history"| CHAT
    AIROUTER -->|"read-only SQL"| VIEWS
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class PG,VIEWS,CHAT store
    style Client fill:#f3f8ff,stroke:#9dbcf5
    style Core fill:#f4fbf2,stroke:#a8d5a2
    style AI fill:#fff9ee,stroke:#f0c987
    style Data fill:#faf3ff,stroke:#cfa8f0
```

## 2. Core Service Interfaces

Every public method takes `VerifiedFirebaseToken` + `shopId` (`X-Shop-Id`) and calls `requireOwnedActiveShop` first — except `AuthSessionService` and some `ShopService` methods.

```mermaid
flowchart TB
    subgraph Catalog["Catalog Space"]
        PROD["ProductService<br/>create / list / getById<br/>patch / archive"]
        CAT["CategoryService<br/>create / list / getById<br/>replace / archive"]
        CUST["CustomerService<br/>create / list / getById<br/>replace / archive"]
    end

    subgraph Sales["Sales Space"]
        DRAFT["SaleDraftService<br/>create / replace / cancel<br/>confirm → SaleResponse"]
        SALE["SaleService<br/>list / getById"]
        PAYS["PaymentService<br/>listForSale / getById"]
    end

    subgraph Money["Money Write Space"]
        VOID["SaleVoidService<br/>voidSale(key) / getRefund"]
        DEBT["DebtService<br/>list / getById / repay(key)"]
        EXP["ExpenseService<br/>create(key) / list(period)<br/>getById / patch / archive"]
    end

    subgraph Read["Read and Agent Space"]
        REP["ReportService<br/>summary(period)"]
        AQ["AuditLogQueryService<br/>list(filters, page)"]
        AG["AgentService<br/>chat / list / get<br/>rename / delete"]
    end

    subgraph Session["Session Space"]
        AUTH["AuthSessionService<br/>openSession<br/>getCurrentSession<br/>(no shop scope)"]
    end

    subgraph Shared["Shared Services"]
        SHOP{{"ShopService<br/>requireOwnedActiveShop()<br/>create / getById / updateById<br/>archiveById / updateStatus (ADMIN)"}}
        IDEM{{"IdempotencyService<br/>execute(op, key, request, action)"}}
        AUDIT{{"AuditLogService<br/>record() / recordOwner()"}}
    end


    Catalog -->|"ownership"| SHOP
    Sales -->|"ownership"| SHOP
    Money -->|"ownership"| SHOP
    Read -->|"ownership"| SHOP
    VOID -->|"SALE_VOID"| IDEM
    DEBT -->|"DEBT_REPAYMENT"| IDEM
    EXP -->|"EXPENSE_CREATE"| IDEM
    DRAFT -->|"SALE_CONFIRMED"| AUDIT
    Money -->|"audit events"| AUDIT
    SHOP -->|"SHOP_ARCHIVED"| AUDIT
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class SHOP,IDEM,AUDIT shared
    style Catalog fill:#f3f8ff,stroke:#9dbcf5
    style Sales fill:#f4fbf2,stroke:#a8d5a2
    style Money fill:#fff9ee,stroke:#f0c987
    style Read fill:#faf3ff,stroke:#cfa8f0
    style Session fill:#effafa,stroke:#8fd3d3
    style Shared fill:#fff4f4,stroke:#f0a8a8
```

## 3. Shop Access Guard — `requireOwnedActiveShop`

```mermaid
flowchart LR
    START(["requireOwnedActiveShop<br/>(token, X-Shop-Id)"])

    subgraph User["User Check"]
        U{"user exists<br/>and not DISABLED?"}
        O{"role == OWNER?"}
    end

    subgraph Shop["Shop Check"]
        P{"X-Shop-Id<br/>valid?"}
        F{"owned by user?"}
        A{"ARCHIVED?"}
        ACT{"INACTIVE?"}
    end

    START --> U -->|yes| O -->|yes| P -->|yes| F -->|yes| A -->|no| ACT -->|no| OK(["return Shop"])
    U -->|no| E1["AUTH_PROFILE_NOT_FOUND<br/>ACCOUNT_DISABLED"]
    O -->|no| E2["SHOP_ACCESS_DENIED"]
    P -->|no| E3["invalid shopId"]
    F -->|no| E2
    A -->|yes| E5["SHOP_NOT_FOUND"]
    ACT -->|yes| E6["SHOP_INACTIVE"]
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class U,O,P,F,A,ACT decision
    class E1,E2,E3,E5,E6 error
    class START,OK terminal
    style User fill:#f3f8ff,stroke:#9dbcf5
    style Shop fill:#f4fbf2,stroke:#a8d5a2
```

## 4. Auth Session — `openSession`

```mermaid
flowchart LR
    T["Verified<br/>Firebase token"] --> L{"AuthIdentity<br/>by uid?"}
    L -->|found| U["UserAccount"]
    L -->|missing| D{"displayName<br/>given?"}
    D -->|no| X["DISPLAY_NAME_REQUIRED"]
    D -->|yes| C["createOwner()<br/>+ AuthIdentity"] --> U
    U --> ACT{"DISABLED?"}
    ACT -->|yes| X2["ACCOUNT_DISABLED"]
    ACT -->|no| S["syncFirebaseProfile()"] --> R["AuthSessionResponse<br/>shops: not ARCHIVED<br/>needsOnboarding: OWNER, no shop"]
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class L,D,ACT decision
    class X,X2 error
    class R terminal
```

## 5. Sale lifecycle — draft → sale → payment / debt

### 5.1 State machines

```mermaid
stateDiagram-v2
    direction LR
    [*] --> DRAFT : create()
    DRAFT --> DRAFT : replace()
    DRAFT --> CANCELLED : cancel()
    DRAFT --> CONFIRMED : confirm() creates Sale
    DRAFT --> EXPIRED : past expiresAt (1 month)
    classDef open fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef done fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef dead fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    class DRAFT open
    class CONFIRMED done
    class CANCELLED,EXPIRED dead
```

```mermaid
stateDiagram-v2
    direction LR
    state "Sale.saleStatus" as S {
        direction LR
        [*] --> SALE_CONFIRMED : fromDraft()
        SALE_CONFIRMED --> SALE_VOIDED : voidSale()
    }
    state "Sale.paymentStatus" as P {
        direction LR
        [*] --> PAID : paid == total
        [*] --> PARTIAL : 0 < paid < total
        [*] --> DEBT : paid == 0
        DEBT --> PARTIAL : partial repayment
        DEBT --> PAID : fully repaid in one payment
        PARTIAL --> PAID : fully repaid
    }
    state "Debt.status" as D {
        direction LR
        [*] --> OPEN : open(outstanding > 0)
        OPEN --> OPEN : partial repay()
        OPEN --> SETTLED : repay() to 0
        OPEN --> DEBT_VOIDED : voidRemaining()
    }
    classDef open fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef done fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef dead fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    class DEBT,PARTIAL,OPEN open
    class SALE_CONFIRMED,PAID,SETTLED done
    class SALE_VOIDED,DEBT_VOIDED dead
```

### 5.2 `SaleDraftService.create / replace` — validation (`prepare`)

```mermaid
flowchart LR
    IN["SaleDraftWriteRequest"]

    subgraph Customer["Customer Check"]
        CUS{"customerId<br/>given?"}
        CF{"ACTIVE in shop?"}
    end

    subgraph Item["Per-item Check"]
        PID{"productId?"}
        CUSTOM{"name + unit<br/>given?"}
        TXT{"client sent<br/>name/unit too?"}
        DUP{"duplicate<br/>productId?"}
        PR{"product ACTIVE?"}
        LINE["lineTotal =<br/>round(price × qty)"]
    end

    subgraph Totals["Totals Check"]
        TOT{"total = Σ line − discount<br/>total > 0?"}
        PAY{"paid ≤ total and<br/>paid > 0 ⇔ method?"}
        SAVE["save SaleDraft<br/>+ item snapshots"]
    end

    IN --> CUS
    CUS -->|yes| CF -->|yes| PID
    CUS -->|no| PID
    PID -->|null| CUSTOM -->|yes| LINE
    PID -->|set| TXT -->|no| DUP -->|no| PR -->|yes| LINE
    LINE --> TOT -->|yes| PAY -->|yes| SAVE

    CF -->|no| EC["CUSTOMER_NOT_FOUND"]
    CUSTOM -->|no| EI["DRAFT_ITEM_INVALID"]
    TXT -->|yes| EI
    PR -->|no| EI
    DUP -->|yes| ED["DRAFT_ITEM_DUPLICATE"]
    TOT -->|no| ET["DRAFT_TOTAL_INVALID"]
    PAY -->|no| EP["DRAFT_PAYMENT_INVALID"]
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class CUS,CF,PID,CUSTOM,TXT,DUP,PR,TOT,PAY decision
    class EC,EI,ED,ET,EP error
    class SAVE terminal
    style Customer fill:#f3f8ff,stroke:#9dbcf5
    style Item fill:#f4fbf2,stroke:#a8d5a2
    style Totals fill:#fff9ee,stroke:#f0c987
```

### 5.3 `SaleDraftService.confirm` — checkout

```mermaid
flowchart LR
    S(["confirm(draftId)"]) --> LOCK["lock SaleDraft"]

    subgraph Guard["Draft Guard"]
        REP{"already<br/>CONFIRMED?"}
        ED{"DRAFT and<br/>not expired?"}
    end

    subgraph Cust["Customer for Debt"]
        CU{"paid < total?"}
        CN{"customer<br/>source?"}
        NEWC["Customer.create()"]
    end

    subgraph Stock["Totals and Stock"]
        CHK["re-check<br/>Σ line − discount == total"]
        STK["lock products by id asc<br/>deductStock() if tracked"]
    end

    subgraph Persist["Persist"]
        SALE["Sale.fromDraft()<br/>+ SaleItems"]
        P1{"initialPaid > 0?"}
        PAY["Payment.initial()"]
        D1{"initialPaid < total?"}
        DEBT["Debt.open()"]
        DONE["draft.confirm(saleId)<br/>audit SALE_CONFIRMED"]
    end

    LOCK --> REP
    REP -->|yes| RET(["return existing Sale"])
    REP -->|no| ED -->|yes| CU
    ED -->|no| X1["DRAFT_NOT_EDITABLE"]
    CU -->|yes| CN
    CU -->|no| CHK
    CN -->|active id| CHK
    CN -->|name only| NEWC --> CHK
    CN -->|none| X2["CUSTOMER_REQUIRED_FOR_DEBT<br/>CUSTOMER_NOT_FOUND"]
    CHK --> STK --> SALE --> P1
    STK -.->|"short stock"| X3["PRODUCT_STOCK_INSUFFICIENT"]
    P1 -->|yes| PAY --> D1
    P1 -->|no| D1
    D1 -->|yes| DEBT --> DONE
    D1 -->|no| DONE
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class REP,ED,CU,CN,P1,D1 decision
    class X1,X2,X3 error
    class S,RET,DONE terminal
    style Guard fill:#f3f8ff,stroke:#9dbcf5
    style Cust fill:#f4fbf2,stroke:#a8d5a2
    style Stock fill:#fff9ee,stroke:#f0c987
    style Persist fill:#faf3ff,stroke:#cfa8f0
```

## 6. Money writes with idempotency

### 6.1 `IdempotencyService.execute`

Runs inside the caller's transaction (`Propagation.MANDATORY`).

```mermaid
flowchart LR
    K{"key valid<br/>(≤ 255)?"} -->|yes| H["hash = sha256(request)"] --> R{"reserve(shop, user,<br/>op, key, hash, ttl 30d)"}
    K -->|no| X0["INVALID_IDEMPOTENCY_KEY"]

    subgraph First["First Request"]
        RUN["action.get()"] --> C["complete()<br/>store response JSON"] --> OUT(["response"])
    end

    subgraph Retry["Retry"]
        M{"same user<br/>and hash?"} -->|yes| EXP{"not expired?"} -->|yes| REPLAY(["stored response"])
    end

    R -->|new| RUN
    R -->|exists| M
    M -->|no| X1["IDEMPOTENCY_KEY_CONFLICT"]
    EXP -->|no| X2["IDEMPOTENCY_KEY_EXPIRED"]
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class K,R,M,EXP decision
    class X0,X1,X2 error
    class OUT,REPLAY terminal
    style First fill:#f3f8ff,stroke:#9dbcf5
    style Retry fill:#f4fbf2,stroke:#a8d5a2
```

### 6.2 `DebtService.repay`

```mermaid
sequenceDiagram
    box rgb(238,244,255) Core API
    participant C as DebtController
    end
    box rgb(255,233,214) Core services
    participant D as DebtServiceImpl
    participant I as IdempotencyService
    end
    box rgb(239,230,255) Data
    participant DB as Repositories
    end
    C->>D: repay(token, shopId, debtId, key, req)
    D->>D: requireOwnedActiveShop
    D->>I: execute("DEBT_REPAYMENT", key, [id, req])
    I->>D: repayOnce()
    D->>DB: findSaleIdByIdAndShopId (no lock)
    D->>DB: lock Sale before Debt (same order as void)
    Note over D: Sale must be CONFIRMED, else SALE_ALREADY_VOIDED
    D->>DB: lock Debt
    D->>D: debt.repay(amount): OPEN, 0 < amount ≤ outstanding
    D->>D: sale.recordRepayment(amount): PAID or PARTIAL
    D->>DB: save Payment.debtRepayment()
    D->>D: audit DEBT_REPAYMENT_RECORDED
    D-->>C: DebtRepaymentResponse(debt, payment)
```

### 6.3 `SaleVoidService.voidSale`

Shared lock order for every money flow: **Sale → Debt → Product (ascending id)**.

```mermaid
flowchart LR
    S(["voidSale(saleId, key, req)"]) --> IDEM["Idempotency<br/>SALE_VOID"] --> LS["lock Sale"]

    subgraph Check["Pre-checks"]
        ST{"CONFIRMED?"}
        SUM{"Σ payments<br/>== paidVnd?"}
        RM{"received > 0 ⇔<br/>refundMethod?"}
    end

    subgraph Reverse["Reverse Effects"]
        LD["lock Debt"]
        RS{"restockItems?"}
        RP["lock products asc<br/>restoreStock()"]
        DV["debt.voidRemaining()"]
    end

    subgraph Close["Close Sale"]
        RF{"received > 0?"}
        REF["SaleRefund.record()"]
        V["sale.voidSale(reason)<br/>audit SALE_VOIDED"]
    end

    LS --> ST -->|yes| SUM -->|yes| RM -->|yes| LD --> RS
    RS -->|yes| RP --> DV
    RS -->|no| DV
    DV --> RF
    RF -->|yes| REF --> V
    RF -->|no| V

    ST -->|no| X1["SALE_ALREADY_VOIDED"]
    SUM -->|no| X2["SALE_PAYMENT_MISMATCH"]
    RM -->|no| X3["SALE_REFUND_METHOD_<br/>REQUIRED / INVALID"]
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class ST,SUM,RM,RS,RF decision
    class X1,X2,X3 error
    class S,V terminal
    style Check fill:#f3f8ff,stroke:#9dbcf5
    style Reverse fill:#f4fbf2,stroke:#a8d5a2
    style Close fill:#fff9ee,stroke:#f0c987
```

## 7. Report — `ReportService.summary(period)`

```mermaid
flowchart LR
    W["ReportWindow.of(period)<br/>[from, to)"]

    subgraph InWindow["Filtered by Period"]
        Q1["sales by soldAt"]
        Q2["VOIDED sales by voidedAt"]
        Q3["payments by receivedAt"]
        Q4["refunds"]
        Q5["ACTIVE expenses"]
    end

    subgraph Metrics["Summary Metrics"]
        GR["grossRevenue"]
        VR["voidedRevenue"]
        NR["netRevenue =<br/>gross − voided"]
        COL["collected"]
        RFD["refunded"]
        EXP["expenseTotal"]
        OUT["outstanding"]
    end

    ALL["all shop debts<br/>(not period-filtered)"]

    W --> Q1 & Q2 & Q3 & Q4 & Q5
    Q1 -->|"Σ total"| GR --> NR
    Q2 -->|"Σ total"| VR --> NR
    Q3 -->|"Σ amount"| COL
    Q4 -->|"Σ amount"| RFD
    Q5 -->|"Σ amount"| EXP
    ALL -->|"Σ outstanding"| OUT
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class ALL store
    class NR terminal
    style InWindow fill:#f3f8ff,stroke:#9dbcf5
    style Metrics fill:#f4fbf2,stroke:#a8d5a2
```

## 8. AI service

### 8.1 Components (composition root: `main.lifespan`)

```mermaid
flowchart LR
    subgraph API["API Space"]
        ROUTER["agent router<br/>/internal/v1/agent"]
    end

    subgraph Agent["Agent Space"]
        SVC["AgentService.chat()"]
        GUARD["AgentGuardrails<br/>+ PII + call limits"]
        TOOLS["tools<br/>search_chat_history<br/>query_shop_data"]
        FOLD["ChatSummaryFolder.fold()"]
    end

    subgraph SQL["SQL Space"]
        EXEC["ReadOnlySqlExecutor.run()"]
        SG["SqlGuard<br/>validate_and_wrap()"]
    end

    subgraph Store["Storage"]
        REPO["AgentConversationRepository"]
        PG[("chat history")]
        VIEWS[("ai_read views")]
    end

    ROUTER -->|"chat"| SVC
    ROUTER -.->|"background task"| FOLD
    ROUTER -->|"list / get / rename / delete"| REPO
    SVC -->|"middleware"| GUARD
    SVC -->|"tool calls"| TOOLS
    SVC -->|"context_for / save_exchange"| REPO
    TOOLS -->|"folded_messages"| REPO
    TOOLS -->|"sql"| EXEC --> SG
    EXEC -->|"shop-scoped txn"| VIEWS
    FOLD -->|"save_summary (CAS)"| REPO
    REPO --> PG
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class PG,VIEWS store
    style API fill:#f3f8ff,stroke:#9dbcf5
    style Agent fill:#f4fbf2,stroke:#a8d5a2
    style SQL fill:#fff9ee,stroke:#f0c987
    style Store fill:#faf3ff,stroke:#cfa8f0
```

### 8.2 One chat turn end-to-end

```mermaid
sequenceDiagram
    box rgb(223,245,227) Client
    participant App as Mobile app
    end
    box rgb(238,244,255) Core
    participant Core as Core AgentServiceImpl
    end
    box rgb(255,249,238) AI service
    participant R as AI router
    participant A as AgentService
    participant G as Guardrails
    participant T as Tools
    participant F as ChatSummaryFolder
    end
    box rgb(239,230,255) Data
    participant DB as Postgres
    end

    App->>Core: POST /api/v1/agent/chat
    Core->>Core: requireOwnedActiveShop gives user_id, shop_id
    Core->>R: POST /internal/v1/agent/chat (timeout 40s)
    R->>A: chat(user_id, shop_id, message, conversation_id)
    A->>DB: context_for(): summary + messages after watermark
    A->>G: before_agent: input length, PII redaction
    loop up to model / tool call limits
        A->>T: query_shop_data(sql) or search_chat_history(q)
        T->>T: SqlGuard: one SELECT on ai_read views, LIMIT n+1
        T->>DB: read-only txn scoped by smartledger.shop_id
        T-->>A: JSON rows or Error[CODE] for the model to retry
    end
    A->>G: after_agent: replace empty or leaking answers
    A->>DB: save_exchange(redacted user message, answer)
    A-->>R: AgentChatResult
    R-->>Core: conversation_id, message_id, answer, model
    R-)F: background fold(): summarize older messages
    Core-->>App: AgentChatResponse
    Note over Core: AI error or timeout gives ai_unavailable, 404 gives CONVERSATION_NOT_FOUND
```
