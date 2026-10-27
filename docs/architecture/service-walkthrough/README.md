# Service walkthrough

Core documentation audit, 2026-10-26, against `feat/admin-dashboard-growth` at
`3e93dd1`: the request/service overview below now includes the implemented
ADMIN, Zalo, media and notification boundaries. The detailed sale/money/report
diagrams retain their dated review history. This is source-code alignment;
runtime enablement, deployment and integrated acceptance remain separate.

Core diagrams reviewed against `staging` commit [`b1de421c461d59473b3bb73aae103027afd67a89`](https://github.com/miphu2804/smart-ledger/tree/b1de421c461d59473b3bb73aae103027afd67a89) on 2026-10-06. AI diagrams (§8) were reviewed separately against `staging` commit [`f1a4818800446e82b0b3cb9eec24d2fa809f9436`](https://github.com/miphu2804/smart-ledger/tree/f1a4818800446e82b0b3cb9eec24d2fa809f9436) on 2026-10-16.

Query-optimization update (#138), reviewed on 2026-10-10 against `perf/query-optimization` commit [`b6e4169dcfb9ffb2534b20baa9aa5e368b86d9b3`](https://github.com/miphu2804/smart-ledger/tree/b6e4169dcfb9ffb2534b20baa9aa5e368b86d9b3): the preparation note in §5.2 and confirm/void diagrams in §5.3/§6.3 reflect #134–#137. This is a branch-code review, not confirmation of staging deployment or FE acceptance; other diagrams retain the baseline above. Query budgets and regression evidence are described in [technical design §4.1](../technical-design.md#41-truy-vấn-theo-lô) and [§7](../technical-design.md#7-kiểm-chứng-trước-merge).

These are reading notes, not a source of truth — scope and behavior stay in `docs/product/` and `docs/contracts/`.

CORE-013 (#181), reviewed on 2026-10-13 against `fix/core-concurrency` commit [`089611b`](https://github.com/miphu2804/smart-ledger/commit/089611b): session sync, profile/catalog writes and Category assignment use fresh rows under locks; void validates the restored total before assignment. The affected auth/void SVGs are re-rendered. This describes branch code and disposable PostgreSQL tests, not staging deployment or FE acceptance; see [technical design §4.4](../technical-design.md#44-concurrency-và-vòng-đời-core-013).

| Folder | Diagrams |
|---|---|
| `01-overview/` | request resolution, core services |
| `02-access/` | shop access guard, auth session |
| `03-sales/` | draft/sale/debt states, draft validation, checkout confirm |
| `04-money/` | idempotency, debt repay, sale void |
| `05-report/` | report summary |
| `06-ai/` | AI components, chat turn (JSON and stream) |

Colors: blue = step, yellow = decision / open state, red = error / terminal failure, green = start, success or final state, purple = data store, orange = shared service. Each group box has its own tint.

Re-render after editing this file: `./export.sh` (SVG, lossless zoom).

## 1. Request Resolution Logic

Protected OWNER ledger requests follow Firebase auth → controller → service →
active-shop ownership guard → repository. Auth/session, avatar, OWNER inbox,
ADMIN support and public Zalo bootstrap use different guards. Avatar writes
resolve the current UID to an ACTIVE user (OWNER or ADMIN); they use no shop or
notification-recipient scope. Inbox requires an ACTIVE OWNER and checks recipient,
shop ownership and visibility: ACTIVE shops expose eligible events; INACTIVE
shops expose only shop-status events, and ARCHIVED shops expose none. The diagram
keeps those paths separate. Public OAuth callbacks do not authenticate ledger requests.

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        OWNER["OWNER app / web<br/>Firebase ID token; shop header when required"]
        ADMIN["ADMIN web<br/>Firebase ID token; DB role check"]
        PUBLIC["Zalo LOGIN bootstrap<br/>public, feature-gated"]
    end
    subgraph Core["Core · Spring Boot"]
        FILTER["BearerTokenAuthenticationFilter"]
        CTRL["Controllers"]
        AUTH["AuthSessionService<br/>session / me; no shop header"]
        AVATAR["Current user's avatar<br/>own UID + ACTIVE user<br/>OWNER or ADMIN"]
        INBOX["NotificationService · OWNER inbox<br/>ACTIVE OWNER + recipient<br/>shop ownership / event visibility"]
        PROFILE["ShopService<br/>owned profile; INACTIVE remains readable"]
        SHOP["ShopService<br/>active owned shop guard"]
        SUPPORT["AdminAccessGuard<br/>dashboard support reads"]
        STATUS["ShopService.updateStatus<br/>DB ADMIN / ACTIVE"]
        SVC["Ledger / catalog / report services"]
        ADM["AdminDashboardService<br/>read + mandatory audit transaction"]
        MEDIA["MediaService<br/>resource scope, lease, outbox"]
        OAUTH["ZaloAuthService / ZaloNativeAuthService<br/>browser binding, one-use proof/handoff<br/>LINK also requires verified recent OWNER"]
        IDEM["IdempotencyService<br/>supported expense / repay / void / stock-in"]
        AUDIT["Audit writers<br/>profile / ledger writes and ADMIN reads"]
        AGENT["AgentServiceImpl<br/>verified OWNER + shop scope"]
    end
    subgraph External["Provider boundaries"]
        ZALO["Zalo OAuth / profile"]
        FIREBASE["Firebase Admin<br/>verification / custom token"]
        CLOUD["Cloudinary"]
        AI["AI /internal/v1/agent/*<br/>X-Internal-Token"]
    end
    PG[("Core PostgreSQL tables")]
    CHAT[("AI chat / memory / read-only views")]
    OWNER --> FILTER
    ADMIN --> FILTER
    FILTER --> FIREBASE
    FILTER --> CTRL
    PUBLIC --> OAUTH
    CTRL --> AUTH
    CTRL --> AVATAR
    CTRL --> INBOX
    CTRL --> PROFILE
    CTRL --> SHOP
    CTRL --> SUPPORT --> ADM
    CTRL --> STATUS
    CTRL -->|"authenticated LINK"| OAUTH
    SHOP --> SVC
    AVATAR --> MEDIA
    SHOP --> MEDIA
    SHOP --> AGENT --> AI --> CHAT
    SVC --> IDEM
    SVC -->|"audited writes"| AUDIT
    ADM --> AUDIT
    STATUS --> AUDIT
    STATUS --> PG
    AUTH --> PG
    INBOX --> PG
    PROFILE --> PG
    SVC --> PG
    IDEM --> PG
    AUDIT --> PG
    MEDIA --> PG
    MEDIA --> AUDIT
    MEDIA --> CLOUD
    OAUTH --> ZALO
    OAUTH --> FIREBASE
    OAUTH --> PG
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class PG,CHAT store
    class FILTER,SHOP,SUPPORT,IDEM,AUDIT shared
```

## 2. Core Service Interfaces

OWNER ledger services take `VerifiedFirebaseToken` and `X-Shop-Id`. Session,
avatar, inbox, ADMIN and Zalo methods have their own scopes, so a shop header
does not replace those checks. The map lists interfaces, not an API contract;
request/response and error rules remain in the canonical contract.

```mermaid
flowchart TB
    subgraph Catalog["OWNER catalog"]
        PROD["ProductService<br/>CRUD / lookup / stockIn"]
        CAT["CategoryService<br/>CRUD"]
        CUST["CustomerService<br/>CRUD; no automatic merging"]
    end
    subgraph Sales["OWNER sales and money"]
        DRAFT["SaleDraftService<br/>prepare / confirm / draft replay"]
        SALE["SaleService<br/>paged list / detail / filtered summary"]
        PAY["PaymentService / DebtService<br/>history / repayment"]
        VOID["SaleVoidService<br/>void / full refund"]
        EXP["ExpenseService<br/>CRUD / period or range"]
    end
    subgraph Reads["OWNER reads and Agent"]
        REP["ReportService<br/>summary / topProducts<br/>salesSeries / profitEstimate"]
        AQ["AuditLogQueryService<br/>OWNER projection"]
        AG["AgentService<br/>chat / stream / conversations<br/>memory settings / items"]
    end
    subgraph UserScope["Session, media, OWNER inbox and Zalo"]
        AUTH["AuthSessionService<br/>session / me"]
        MEDIA["MediaService<br/>product / logo: OWNER + ACTIVE shop<br/>avatar: own ACTIVE user, OWNER or ADMIN"]
        INBOX["NotificationService<br/>ACTIVE OWNER; list / count / mark read<br/>recipient + shop ownership / visibility"]
        ZAUTH["ZaloAuthService<br/>ZaloNativeAuthService<br/>LOGIN / recent-auth LINK"]
    end
    subgraph Admin["ADMIN support"]
        ADM["AdminDashboardService<br/>overview / growth / users / shops<br/>status history / own access logs"]
        AAD["AdminAccessGuard + AdminAccessAuditService"]
    end
    subgraph Shared["Shared transaction helpers"]
        SHOP["ShopService<br/>owned-shop access / profile / status"]
        IDEM["IdempotencyService<br/>money and stock-in keys"]
        AUDIT["AuditLogService<br/>append-only event writes"]
        NOTIFY["NotificationEventService<br/>transactional events / stock episodes"]
        OUTBOX["Media cleanup worker<br/>durable upload leases / cleanup jobs"]
    end
    Catalog --> SHOP
    Sales --> SHOP
    Reads --> SHOP
    PROD --> IDEM
    PAY --> IDEM
    VOID --> IDEM
    EXP --> IDEM
    PROD --> AUDIT
    CAT --> AUDIT
    Sales --> AUDIT
    DRAFT -->|"confirm stock changes"| NOTIFY
    PROD --> NOTIFY
    VOID --> NOTIFY
    SHOP --> NOTIFY
    MEDIA --> OUTBOX
    ADM --> AAD --> AUDIT
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class SHOP,IDEM,AUDIT,NOTIFY,OUTBOX,AAD shared
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

Existing identities are first resolved to a User ID without fetching a stale User. Lock and refresh User before checking DISABLED and synchronizing Firebase fields. Role/status and Cloudinary avatar handle remain DB-owned; concurrent avatar/status/role writers serialize on the User row. New-owner creation and Firebase fallback avatar retain their behavior. This does not introduce an ADMIN user-disable/demote API; those races are exercised by DB test fixtures.

```mermaid
flowchart LR
    T["Verified<br/>Firebase token"] --> L{"AuthIdentity<br/>by uid?"}
    L -->|found| LK["lock + refresh UserAccount<br/>latest role / status / avatar handle"] --> U["UserAccount"]
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

After customer validation, `prepare` collects distinct catalog IDs without raising duplicate-item errors, then reads ACTIVE products in the shop once into a map. All-custom requests skip this Product query. The diagram below shows validation order, not one SQL query per item: `product ACTIVE?` is a map lookup. Items are still validated in request order (custom fields → catalog text → duplicate ID → product lookup → money calculation), preserving error precedence, snapshots, rounding, discount and initial-payment checks.

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

When a selected Customer is needed for a new debt, the write lock order is **SaleDraft → Customer → Product ID ascending**. Refresh Customer under its lock before checking ACTIVE and taking its current profile snapshot; hold the lock through commit so archive cannot race debt creation. If confirm commits first, a later archive may retain that historical debt. Fully paid sales retain their existing snapshot behavior without taking this Customer lock. Confirmation replay returns before this check.

The draft lock still protects confirmation/replay. Nonempty catalog groups use one `PESSIMISTIC_WRITE` Product query filtered by shop and ACTIVE status, with `ORDER BY p.id ASC` in SQL; no catalog IDs means no Product-lock query. Missing/inactive/foreign products remain invalid. After all deductions, one grouped stock reconciliation runs on the already-locked products before persisting the sale. Custom items do not deduct stock; response item order and cost snapshots are unchanged.

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
        STK["lock products by id asc (1 query)<br/>ACTIVE in shop; skip if empty<br/>deductStock() if tracked"]
        ALERT["reconcile stock alerts (batch)<br/>1 open-alert read if nonempty"]
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
    CHK --> STK --> ALERT --> SALE --> P1
    STK -.->|"short stock"| X3["PRODUCT_STOCK_INSUFFICIENT"]
    STK -.->|"missing / inactive / foreign"| X4["DRAFT_ITEM_INVALID"]
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
    class X1,X2,X3,X4 error
    class ALERT shared
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

Repayment and void share the lock order **Sale → Debt**. A restocking void then locks Products in ascending ID order; confirm instead starts with its draft lock (§5.3).

With `restockItems=true`, validate deduction snapshots before locking products. Only `stockDeducted=true` items contribute IDs; custom/non-deducted items do not restore stock, and unknown snapshots fail rather than guessing. One nonempty Product-lock query is scoped to the shop, ordered by ID and has no ACTIVE filter, so archived products remain eligible for restoration under the existing stock rules. Reconcile the restored product group once; an empty group skips both Product locking and open-alert reads. Restock audit, debt cancellation, full refund and idempotent replay keep their existing behavior.

The stock-restoration limit, error response and retry rules are defined in the [sale void API contract](../../contracts/api-contracts.md#hủy-toàn-bộ-và-hoàn-tiền). `restoreStock()` validates before mutating that Product; a failure on a later item rolls back earlier stock/audit writes and the entire void transaction, including refund, debt, notification and idempotency reservation.

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
        SNAP["validate stockDeducted snapshots<br/>collect deducted product IDs"]
        RP["lock products by id asc (1 query)<br/>same shop, including ARCHIVED<br/>skip if empty; restoreStock checks MAX_STOCK"]
        ALERT["reconcile restored stock alerts (batch)<br/>1 open-alert read if nonempty"]
        DV["debt.voidRemaining()"]
    end

    subgraph Close["Close Sale"]
        RF{"received > 0?"}
        REF["SaleRefund.record()"]
        V["sale.voidSale(reason)<br/>audit SALE_VOIDED"]
    end

    LS --> ST -->|yes| SUM -->|yes| RM -->|yes| LD --> RS
    RS -->|yes| SNAP --> RP --> ALERT --> DV
    RS -->|no; empty group| ALERT
    DV --> RF
    RF -->|yes| REF --> V
    RF -->|no| V

    ST -->|no| X1["SALE_ALREADY_VOIDED"]
    SUM -->|no| X2["SALE_PAYMENT_MISMATCH"]
    RM -->|no| X3["SALE_REFUND_METHOD_<br/>REQUIRED / INVALID"]
    SNAP -.->|"unknown / invalid snapshot"| X4["SALE_RESTOCK_UNAVAILABLE"]
    RP -.->|"missing / unrestorable"| X4
    RP -.->|"total exceeds MAX_STOCK"| X5["409 PRODUCT_STOCK_OVERFLOW<br/>rollback whole void + key"]
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class ST,SUM,RM,RS,RF decision
    class X1,X2,X3,X4,X5 error
    class ALERT shared
    class S,V terminal
    style Check fill:#f3f8ff,stroke:#9dbcf5
    style Reverse fill:#f4fbf2,stroke:#a8d5a2
    style Close fill:#fff9ee,stroke:#f0c987
```

For both confirm and void, stock-alert reconciliation shares the business transaction: failures roll back stock, money/debt, notifications, audit and the idempotency reservation where applicable (confirm uses draft replay). Only the open-alert lookup is batched; creating new alert cycles can still require per-product history/dedup reads and writes. The diagrams do not promise a fixed total SQL count for the complete transaction.

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

`main.py` builds one `APIRouter` with prefix `/internal/v1` and the `X-Internal-Token` dependency, includes the agent router under it, and mounts it on the app, so every route under that prefix requires the token. `GET /health` sits outside the prefix and needs no token. The agent router exposes `POST /agent/chat`, `POST /agent/chat/stream`, the conversation list, get, rename and delete routes, and `GET`/`PUT /agent/memory/settings`; the endpoint contract is in [API contracts](../../contracts/api-contracts.md).

`lifespan` opens two `PostgreDBClient` pools: one for chat history (`POSTGRES_URL`, `POSTGRES_POOL_MAX_SIZE`) and one for the read-only SQL reader (`AI_SQL_READER_URL`, `SQL_POOL_MAX_SIZE`, used by `ShopDataRepository`). Both default to 2 connections. It connects Redis at startup, but no feature reads it yet. It builds the chat model with `build_chat_model`: `MODEL_PROVIDER` picks the API, and a `FallbackModel` wraps the primary model when at least one `MODEL_FALLBACKS` entry builds (an invalid entry is logged and dropped). Without `OPENAI_API_KEY`, or when the primary model cannot be built, the model is `None` and every chat turn answers `503 ai_unavailable`. `AgentService` then receives `shop_data` and `restock`; both are `None` when `AI_SQL_READER_URL` is unset, so chat still runs with only the `suggest_screen` tool, which the agent always has. It also receives `memory`, which `build_memory_service` builds only when `AGENT_MEMORY_ENABLED` is on (default off, awaiting PO approval), a chat model and the chat-history pool exist, and an embedder can be built (sentence-transformers in the process, or Cloudflare Workers AI); otherwise memory is `None` and the memory settings report `available: false`. `configure_tracing` runs at module import, before any agent runs, and sends Pydantic AI spans to Logfire only when `LOGFIRE_TOKEN` is set. Spans carry the run's `shop_id`, never message content.

```mermaid
flowchart LR
    subgraph API["API Space"]
        MAIN["main.py lifespan<br/>pools, model, AgentService<br/>APIRouter /internal/v1 + X-Internal-Token"]
        ROUTER["agent router<br/>/internal/v1/agent<br/>chat, chat/stream, conversations, memory/settings"]
    end

    subgraph Agent["Agent Space"]
        SVC["AgentService<br/>chat() / stream_chat()"]
        GUARD["GuardrailService<br/>input check + redaction<br/>call, token, time limits<br/>answer screen"]
        MODEL["model gateway<br/>build_chat_model()<br/>FallbackModel when a MODEL_FALLBACKS entry builds"]
        TOOLS["tools<br/>query_shop_data, suggest_restock<br/>suggest_screen (always)"]
        RESTOCK["RestockService<br/>suggest(shop_id, period)"]
        MEM["AgentMemoryService<br/>with_memories() / remember()<br/>only when AGENT_MEMORY_ENABLED"]
        EMB["Embedder<br/>sentence-transformers or Workers AI"]
    end

    subgraph SQL["SQL Space"]
        EXEC["ShopDataRepository.run()<br/>pooled reader"]
        SG["SqlGuard<br/>validate_and_wrap()"]
    end

    subgraph Store["Storage"]
        REPO["AgentConversationRepository<br/>pooled chat-history client"]
        PG[("chat history")]
        VIEWS[("ai_read views")]
        MREPO["AgentMemoryRepository<br/>pooled chat-history client"]
        MEMDB[("agent_memories<br/>agent_memory_settings")]
        REDIS[("Redis<br/>connected at startup<br/>no feature reads it")]
    end

    subgraph Obs["Observability"]
        LF["Logfire<br/>only when LOGFIRE_TOKEN is set"]
    end

    MAIN -->|"include_router"| ROUTER
    MAIN -.->|"connect at startup"| REDIS
    ROUTER -->|"chat, chat/stream"| SVC
    ROUTER -->|"list / get / rename / delete"| REPO
    SVC -->|"before / during / after run"| GUARD
    SVC -->|"model calls"| MODEL
    SVC -->|"tool calls"| TOOLS
    SVC -->|"recent_messages / save_exchange"| REPO
    SVC -.->|"run spans, no content"| LF
    TOOLS -->|"query_shop_data(sql)"| EXEC
    TOOLS -->|"suggest_restock(period)"| RESTOCK -->|"fixed query"| EXEC
    EXEC --> SG
    EXEC -->|"shop-scoped read-only txn"| VIEWS
    REPO -->|"postgres pool"| PG
    ROUTER -->|"memory/settings"| MEM
    SVC -.->|"recall before run, remember after save"| MEM
    MEM -->|"embed question and facts"| EMB
    MEM -->|"extract and merge facts"| MODEL
    MEM --> MREPO -->|"postgres pool, shop and user scoped"| MEMDB
    classDef default fill:#eef4ff,stroke:#5b8def,color:#1f2d3d
    classDef decision fill:#fff4cc,stroke:#d4a017,color:#5c4400
    classDef error fill:#fde2e1,stroke:#d9534f,color:#8a1f1b
    classDef terminal fill:#dff5e3,stroke:#3c9d5d,color:#1e5631
    classDef store fill:#efe6ff,stroke:#8a63d2,color:#3d2a6b
    classDef shared fill:#ffe9d6,stroke:#e07b24,color:#6b3500
    class PG,VIEWS,REDIS,MEMDB store
    class MODEL,LF,EMB shared
    style API fill:#f3f8ff,stroke:#9dbcf5
    style Agent fill:#f4fbf2,stroke:#a8d5a2
    style SQL fill:#fff9ee,stroke:#f0c987
    style Store fill:#faf3ff,stroke:#cfa8f0
    style Obs fill:#fdf3f8,stroke:#e0a3c4
```

### 8.2 One chat turn end-to-end

`POST /chat` returns one JSON reply after the turn is saved. `POST /chat/stream` answers with server-sent events while the model runs: `memory` lists the recalled memories once, before the first `delta`, when memory is on and some were used; `delta` carries new text, `reset` discards text already sent (a preamble before a data tool call, or an answer the screen rejected; text written before a call to `suggest_screen` alone is part of the answer and stays), and `done` carries the saved ids and answer. `done` is sent only after `save_exchange`. A refusal before the stream opens, such as `input_too_long` or a missing conversation, is an HTTP error; a later failure, such as `answer_timeout`, arrives as an `error` event. If the app disconnects, Core closes the stream and the turn is cancelled; nothing is saved unless the disconnect lands while the exchange is already being written.

Core checks the owner's shop, sends the owner's `user_id` with `shop_id`, and copies the stream line by line, narrowing `done` to `conversation_id`, `message_id` and `answer`; the JSON route returns the same three fields. An AI `404` becomes `conversation_not_found`, an AI `422` with a guardrail code (`input_too_long`, `answer_unavailable` or `answer_timeout`) keeps that code, and any other failure, including any other `422`, becomes `503 ai_unavailable`. The codes are listed in [API contracts](../../contracts/api-contracts.md).

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
    participant Mem as Memory
    end
    box rgb(240,240,240) Model gateway
    participant M as Model
    end
    box rgb(239,230,255) Data
    participant DB as Postgres
    end

    App->>Core: POST /api/v1/agent/chat or /chat/stream
    Core->>Core: requireOwnedActiveShop gives owner user_id, shop_id
    Core->>R: POST /internal/v1/agent/chat or /chat/stream (40s read timeout, X-Internal-Token)
    R->>A: chat() or stream_chat(user_id, shop_id, message, conversation_id)
    opt conversation_id given
        A->>DB: recent_messages(): owner-scoped, latest AGENT_HISTORY_TURNS exchanges
    end
    A->>G: input length check (input_too_long), then redaction
    opt AGENT_MEMORY_ENABLED and the owner's switch is on
        A->>Mem: with_memories(): embed the question
        Mem->>DB: up to 10 preference memories, then cosine search, 5 best re-ranked
        Mem-->>A: question led by "Earlier facts from this owner"
        opt POST /chat/stream and memories were used
            A-->>R: memory event, before the first delta
            R-->>Core: SSE memory
            Core-->>App: relayed memory
        end
    end
    Note over A,M: turn limits (config defaults): 4 model requests, 200000 tokens, 3 tool calls, 35 s
    loop model requests and tool calls
        A->>M: instructions, history, redacted message, then the current time
        M-->>A: text or tool call
        opt POST /chat/stream
            A-->>R: delta or reset
            R-->>Core: SSE delta or reset
            Core-->>App: relayed delta or reset
        end
        A->>T: query_shop_data(sql), suggest_restock(period) or suggest_screen(screen)
        T->>T: SqlGuard: one SELECT on ai_read views, LIMIT n+1
        T->>DB: read-only txn scoped by smartledger.shop_id
        T-->>A: JSON rows or Error[CODE] for the model to retry
    end
    A->>G: OutputGuardrail: retry empty or leaking answers
    A->>A: append an actions block for up to 2 suggest_screen calls
    alt POST /chat
        A->>DB: save_exchange(redacted user message, answer)
        opt memory on
            A-)Mem: remember() in the background: extract up to 5 facts, merge memories older than 7 days
        end
        A-->>R: AgentChatResult
        R-->>Core: conversation_id, message_id, request_id, answer, model, model_version
        Core-->>App: AgentChatResponse (conversation_id, message_id, answer)
    else POST /chat/stream
        A-->>R: held-back tail as delta (reset first if the text shown is not a prefix of the answer)
        A->>DB: save_exchange(redacted user message, answer)
        opt memory on
            A-)Mem: remember() in the background
        end
        A-->>R: Done with saved ids and answer
        R-->>Core: SSE done
        Core-->>App: done (conversation_id, message_id, answer)
    end
    Note over A,App: a guardrail stop or other failure after the stream opens is an error event
```
