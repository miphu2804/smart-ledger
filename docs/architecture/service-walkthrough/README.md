---
type: Walkthrough
title: "Service walkthrough"
description: "Reading notes with diagrams of Core and AI service flows; explains code, does not decide behavior."
owner: Technical owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-06T22:18:48+07:00 }
stale_after: 2027-01-05T22:18:48+07:00
---
# Service walkthrough

Current source reconciliation: `staging` revision `a2766ee3a37e23c0f03fd43383b608c1b2fac898` for the request/service maps, idempotency coverage and AI provider wiring. No live environment or integrated acceptance was verified.

Historical Core documentation audit, 2026-10-26, against `feat/admin-dashboard-growth` at
`3e93dd1`: the request/service overview below now includes the implemented
ADMIN, Zalo, media and notification boundaries. The detailed sale/money/report
diagrams retain their dated review history. This is source-code alignment;
runtime enablement, deployment and integrated acceptance remain separate.

Core diagrams reviewed against `staging` commit [`b1de421c461d59473b3bb73aae103027afd67a89`](https://github.com/miphu2804/smart-ledger/tree/b1de421c461d59473b3bb73aae103027afd67a89) on 2026-10-06. AI diagrams (§8) were reviewed separately against `staging` commit [`f1a4818800446e82b0b3cb9eec24d2fa809f9436`](https://github.com/miphu2804/smart-ledger/tree/f1a4818800446e82b0b3cb9eec24d2fa809f9436) on 2026-10-16.

Query-optimization update (#138), reviewed on 2026-10-10 against `perf/query-optimization` commit [`b6e4169dcfb9ffb2534b20baa9aa5e368b86d9b3`](https://github.com/miphu2804/smart-ledger/tree/b6e4169dcfb9ffb2534b20baa9aa5e368b86d9b3): the preparation note in §5.2 and confirm/void diagrams in §5.3/§6.3 reflect #134–#137. This is a branch-code review, not confirmation of staging deployment or FE acceptance; other diagrams retain the baseline above. Query budgets and regression evidence are described in [technical design §4.1](../technical-design.md#41-batched-queries) and [§7](../technical-design.md#7-pre-merge-verification).

These are reading notes, not a source of truth — scope and behavior stay in `docs/product/` and `docs/contracts/`.

CORE-013 (#181), reviewed on 2026-10-13 against `fix/core-concurrency` commit [`089611b`](https://github.com/miphu2804/smart-ledger/commit/089611b): session sync, profile/catalog writes and Category assignment use fresh rows under locks; void validates the restored total before assignment. The affected auth/void SVGs are re-rendered. This describes branch code and disposable PostgreSQL tests, not staging deployment or FE acceptance; see [technical design §4.4](../technical-design.md#44-concurrency-and-lifecycle-core-013).

| Folder | Diagrams |
|---|---|
| `01-overview/` | request resolution, core services |
| `02-access/` | shop access guard, auth session |
| `03-sales/` | draft/sale/debt states, draft validation, checkout confirm |
| `04-money/` | idempotency, debt repay, sale void |
| `05-report/` | report summary |
| `06-ai/` | AI components, chat turn (JSON and stream) |

Colors: blue = step, yellow = decision / open state, red = error / terminal failure, green = start, success or final state, purple = data store, orange = shared service. Each group box has its own tint.

Each diagram's Mermaid source is the `.mmd` file next to its SVG. Edit the source, then re-render every SVG on a white background with `./export.sh`.

## 1. Request Resolution Logic

Protected OWNER ledger requests follow Firebase auth → controller → service →
active-shop ownership guard → repository. Auth/session, avatar, OWNER inbox,
ADMIN support and public Zalo bootstrap use different guards. Avatar writes
resolve the current UID to an ACTIVE user (OWNER or ADMIN); they use no shop or
notification-recipient scope. Inbox requires an ACTIVE OWNER and checks recipient,
shop ownership and visibility: ACTIVE shops expose eligible events; INACTIVE
shops expose only shop-status events, and ARCHIVED shops expose none. The diagram
keeps those paths separate. Public OAuth callbacks do not authenticate ledger requests.

![Request resolution](01-overview/request-resolution.svg)

Source: [`01-overview/request-resolution.mmd`](01-overview/request-resolution.mmd)

## 2. Core Service Interfaces

OWNER ledger services take `VerifiedFirebaseToken` and `X-Shop-Id`. Session,
avatar, inbox, ADMIN and Zalo methods have their own scopes, so a shop header
does not replace those checks. The map lists interfaces, not an API contract;
request/response and error rules remain in the canonical contract.

![Core service interfaces](01-overview/core-services.svg)

Source: [`01-overview/core-services.mmd`](01-overview/core-services.mmd)

## 3. Shop Access Guard — `requireOwnedActiveShop`

![Shop access guard](02-access/shop-access-guard.svg)

Source: [`02-access/shop-access-guard.mmd`](02-access/shop-access-guard.mmd)

## 4. Auth Session — `openSession`

Existing identities are first resolved to a User ID without fetching a stale User. Lock and refresh User before checking DISABLED and synchronizing Firebase fields. Role/status and Cloudinary avatar handle remain DB-owned; concurrent avatar/status/role writers serialize on the User row. New-owner creation and Firebase fallback avatar retain their behavior. This does not introduce an ADMIN user-disable/demote API; those races are exercised by DB test fixtures.

![Auth session](02-access/auth-open-session.svg)

Source: [`02-access/auth-open-session.mmd`](02-access/auth-open-session.mmd)

## 5. Sale lifecycle — draft → sale → payment / debt

### 5.1 State machines

![Sale draft states](03-sales/state-sale-draft.svg)

Source: [`03-sales/state-sale-draft.mmd`](03-sales/state-sale-draft.mmd)

![Sale and debt states](03-sales/state-sale-debt.svg)

Source: [`03-sales/state-sale-debt.mmd`](03-sales/state-sale-debt.mmd)

### 5.2 `SaleDraftService.create / replace` — validation (`prepare`)

After customer validation, `prepare` collects distinct catalog IDs without raising duplicate-item errors, then reads ACTIVE products in the shop once into a map. All-custom requests skip this Product query. The diagram below shows validation order, not one SQL query per item: `product ACTIVE?` is a map lookup. Items are still validated in request order (custom fields → catalog text → duplicate ID → product lookup → money calculation), preserving error precedence, snapshots, rounding, discount and initial-payment checks.

![Sale draft validation](03-sales/sale-draft-validate.svg)

Source: [`03-sales/sale-draft-validate.mmd`](03-sales/sale-draft-validate.mmd)

### 5.3 `SaleDraftService.confirm` — checkout

When a selected Customer is needed for a new debt, the write lock order is **SaleDraft → Customer → Product ID ascending**. Refresh Customer under its lock before checking ACTIVE and taking its current profile snapshot; hold the lock through commit so archive cannot race debt creation. If confirm commits first, a later archive may retain that historical debt. Fully paid sales retain their existing snapshot behavior without taking this Customer lock. Confirmation replay returns before this check.

The draft lock still protects confirmation/replay. Nonempty catalog groups use one `PESSIMISTIC_WRITE` Product query filtered by shop and ACTIVE status, with `ORDER BY p.id ASC` in SQL; no catalog IDs means no Product-lock query. Missing/inactive/foreign products remain invalid. After all deductions, one grouped stock reconciliation runs on the already-locked products before persisting the sale. Custom items do not deduct stock; response item order and cost snapshots are unchanged.

![Sale draft confirm](03-sales/sale-draft-confirm.svg)

Source: [`03-sales/sale-draft-confirm.mmd`](03-sales/sale-draft-confirm.mmd)

## 6. Money writes with idempotency

### 6.1 `IdempotencyService.execute`

Runs inside the caller's transaction (`Propagation.MANDATORY`).

![Idempotent execution](04-money/idempotency-execute.svg)

Source: [`04-money/idempotency-execute.mmd`](04-money/idempotency-execute.mmd)

### 6.2 `DebtService.repay`

![Debt repayment](04-money/debt-repay.svg)

Source: [`04-money/debt-repay.mmd`](04-money/debt-repay.mmd)

### 6.3 `SaleVoidService.voidSale`

Repayment and void share the lock order **Sale → Debt**. A restocking void then locks Products in ascending ID order; confirm instead starts with its draft lock (§5.3).

With `restockItems=true`, validate deduction snapshots before locking products. Only `stockDeducted=true` items contribute IDs; custom/non-deducted items do not restore stock, and unknown snapshots fail rather than guessing. One nonempty Product-lock query is scoped to the shop, ordered by ID and has no ACTIVE filter, so archived products remain eligible for restoration under the existing stock rules. Reconcile the restored product group once; an empty group skips both Product locking and open-alert reads. Restock audit, debt cancellation, full refund and idempotent replay keep their existing behavior.

The stock-restoration limit, error response and retry rules are defined in the [sale void API contract](../../contracts/api-contracts.md#full-void-and-refund). `restoreStock()` validates before mutating that Product; a failure on a later item rolls back earlier stock/audit writes and the entire void transaction, including refund, debt, notification and idempotency reservation.

![Sale void](04-money/sale-void.svg)

Source: [`04-money/sale-void.mmd`](04-money/sale-void.mmd)

For both confirm and void, stock-alert reconciliation shares the business transaction: failures roll back stock, money/debt, notifications, audit and the idempotency reservation where applicable (confirm uses draft replay). Only the open-alert lookup is batched; creating new alert cycles can still require per-product history/dedup reads and writes. The diagrams do not promise a fixed total SQL count for the complete transaction.

## 7. Report — `ReportService.summary(period)`

![Report summary](05-report/report-summary.svg)

Source: [`05-report/report-summary.mmd`](05-report/report-summary.mmd)

## 8. AI service

### 8.1 Components (composition root: `main.lifespan`)

`main.py` builds one `APIRouter` with prefix `/internal/v1` and the `X-Internal-Token` dependency, includes the agent router under it, and mounts it on the app, so every route under that prefix requires the token. `GET /health` and the Prometheus `GET /metrics` sit outside the prefix and need no token. The agent router exposes `POST /agent/chat`, `POST /agent/chat/stream`, the conversation list, get, rename and delete routes, `GET`/`PUT /agent/memory/settings`, and `GET /agent/memory/items` with `DELETE /agent/memory/items/{memory_id}`; the endpoint contract is in [API contracts](../../contracts/api-contracts.md).

`lifespan` opens two `PostgreDBClient` pools: one for chat history (`POSTGRES_URL`, `POSTGRES_POOL_MAX_SIZE`) and one for the read-only SQL reader (`AI_SQL_READER_URL`, `SQL_POOL_MAX_SIZE`, used by `ShopDataRepository`). Both default to 2 connections. It builds the chat model with `LLMFactory.create_model("chat")`: the alias in `MODEL_ALIASES` picks the API and the model, and a `FallbackModel` wraps the primary model when at least one `MODEL_FALLBACKS` entry builds (an invalid entry is logged and dropped). Without `OPENAI_API_KEY`, or when the alias cannot be built, the model is `None` and every chat turn answers `503 ai_unavailable`. `AgentService` then receives `shop_data` and `restock`; both are `None` when `AI_SQL_READER_URL` is unset, so chat still runs without data tools; `suggest_screen` is always there. `calculation` is built while `CALC_ENABLED` is on (default), and `calculate` stays callable past the tool-call limit because it does no I/O. `sandbox` is built while `SANDBOX_ENABLED` is on (default) and gives the model `run_code`, which runs model-written Python in Monty and calls no tool ([ADR-0007](../adr/0007-sandbox-without-data-tools.md)). It also receives `memory`, which `build_memory_service` builds only when `AGENT_MEMORY_ENABLED` is on (off in code by default and on in production after the PO approved it on 2026-11-07; once on, each owner's switch is on until they turn it off), a chat model and the chat-history pool exist, and an embedder can be built (local ONNX by default; the providers are in the [runtime reference](../../../backend/ai/docs/runtime-reference.md#long-term-memory-and-onnx-embeddings)); otherwise memory is `None` and the memory settings report `available: false`. `Observability.start` runs in `lifespan`, before any agent runs, and sends Pydantic AI spans to HoneyHive only when `HH_API_KEY` is set, for the share of turns `HH_SAMPLE_RATE` picks. Each chat turn is one HoneyHive session that opens with the question `InputRedaction` already cleaned and closes with the answer and token use, or with `metadata.error` when the turn fails, times out or is cancelled; spans carry the run's `shop_id` and the content (`NFR-008`). `lifespan` flushes queued spans and stops the tracer on shutdown.

![AI service components](06-ai/ai-components.svg)

Source: [`06-ai/ai-components.mmd`](06-ai/ai-components.mmd)

### 8.2 One chat turn end-to-end

The [AI statecharts](../statecharts/README.md) draw the same turn, and the memory task after it, as states with the trace span or log line each state leaves.

`POST /chat` returns one JSON reply after the turn is saved. `POST /chat/stream` answers with server-sent events while the model runs: `memory` lists the recalled memories once, before the first `delta`, when memory is on and some were used; `delta` carries new text, `reset` discards text already sent (a preamble before a data tool call, or an answer the screen rejected; text written before a call to `suggest_screen` alone is part of the answer and stays), and `done` carries the saved ids and answer. `done` is sent only after `save_exchange`. A refusal before the stream opens, such as `input_too_long` or a missing conversation, is an HTTP error; a later failure, such as `answer_timeout`, arrives as an `error` event. If the app disconnects, Core closes the stream and the turn is cancelled; nothing is saved unless the disconnect lands while the exchange is already being written.

Core checks the owner's shop, sends the owner's `user_id` with `shop_id`, and copies the stream line by line, narrowing `done` to `conversation_id`, `message_id` and `answer`; the JSON route returns the same three fields. An AI `404` becomes `conversation_not_found`, an AI `422` with a guardrail code (`input_too_long`, `answer_unavailable` or `answer_timeout`) keeps that code, and any other failure, including any other `422`, becomes `503 ai_unavailable`. The codes are listed in [API contracts](../../contracts/api-contracts.md).

![One chat turn](06-ai/ai-chat-sequence.svg)

Source: [`06-ai/ai-chat-sequence.mmd`](06-ai/ai-chat-sequence.mmd)
