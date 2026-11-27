# Billing and AI quota — phase-two schema

Status: owner approved this schema in chat on 2026-11-07; phase two now adds Core V21 and the AI-owned receipt migration in this branch. Phase three now implements payment request/receipt writers with gates off. Phase four implements subscription/grant writers with an independent default-off gate; phase five adds default-off AI receipt/cancel/replay plus the separately approved two-column metadata migration; phase six implements default-off Core quota writers/recovery on V21, and no shared migration has been run. This document expands the [payment design](sepay-payment-design.md) and [subscription/quota design](subscription-quota-design.md); their [API contracts](../contracts/api-contracts.md#9-sepay-fee-payments--570) and [product acceptance criteria](../product/product-requirements.md#subscription-và-quota-ai--thiết-kế-lượt-1) remain canonical for behavior. The owner separately authorized migration creation after reviewing the schema and its diagram. That approval does not authorize shared-database execution, provider configuration or real collections.

Phase-two implementation: [Core V21](../../backend/core/src/main/resources/db/migration/V21__create_billing_and_ai_quota.sql) creates six empty tables; [AI receipt migration](../../supabase/migrations/20261107000000_agent_turn_receipts.sql) creates its own seventh table after the chat baseline. [BillingSchemaPostgresTest](../../backend/core/src/test/java/com/smartledger/core/config/BillingSchemaPostgresTest.java) checks migration safety and data invariants in disposable schemas. The [ERD description](erd-description.md#billing-and-ai-quota-v21) and DBML now include these checked-in tables. Payment creation/acceptance flows are now implemented; phase-four grant/calendar flows are implemented; AI receipt flows are implemented opt-in in phase five, and Core quota flows are implemented default-off in phase six; runtime/local evidence and integrated acceptance remain distinct.

## 1. Source boundary and conventions

Historical initial review against staging `2821714`, whose Core/AI/schema match `875fea9`: Core used Flyway through V20; shop-scoped idempotency could not represent a shopless OWNER purchase. AI owned conversations/messages but had no durable turn receipt. Implementation rebased onto staging 0cc94ec before writing V21; no intervening Core migration existed. The tables below are now migration-backed additions, with separately default-off writers implemented in phases three through six. Local tests cover their implemented transaction boundaries; shared enablement and integrated acceptance are not inferred.

All timestamps are `TIMESTAMPTZ`; calendar calculations use `Asia/Ho_Chi_Minh`. Money is positive whole VND in `BIGINT`, never floating point. Bank/account identifiers are strings preserving leading zeros. IDs described as `BIGINT` use generated identity; UUIDs are server generated. Required columns are NOT NULL unless marked nullable. State strings use explicit CHECK allowlists; identifiers and keys have length/nonblank checks.

`integration_key` is a stable, nonsecret namespace for a SePay company plus Test/Live boundary, resolved by trusted deployment configuration. It is not a webhook ID, secret, client input or freely changing label. The adapter must route two webhooks for the same provider/company/mode into the same namespace. Account/domain/credential mappings and the named reconciliation operator belong in the private operations knowledge base, not this public schema.

Existing `users`, `shops`, shop financial tables and AI chat tables retain their schema. New Core rows reference `users.id` with ON DELETE RESTRICT; referenced shops also use RESTRICT, consistent with preserving usage evidence. No fake shop, backfilled payment, new billing action in existing `audit_logs`, or write to `sales/payments/debts/expenses/stock` is introduced. Free is implicit and needs no subscription row or payment.

## 2. Core-owned tables

### 2.1 billing_payment_requests

| Columns | Type | Purpose/check |
|---|---|---|
| `id`, `payer_user_id` | BIGINT | PK; FK to existing user; authenticated active OWNER at creation |
| `integration_key` | VARCHAR(64) | Immutable company/mode scope |
| `plan_code`, `plan_version`, `duration_months`, `quota_policy_version` | VARCHAR(32), INTEGER, INTEGER, INTEGER | Only FULL_MONTHLY/1 month or FULL_QUARTERLY/3 months; positive versions; immutable offer snapshot |
| `amount_vnd`, `currency` | BIGINT, VARCHAR(3) | Positive; VND only; approved server catalog supplies 99,000 or 297,000 for initial version, never client price |
| `recipient_bank_code`, `recipient_account_number`, `recipient_account_name` | VARCHAR(32), VARCHAR(64), VARCHAR(255) | Immutable recipient snapshot; no credentials |
| `payment_code` | VARCHAR(15) | Exactly SLP plus twelve uppercase alphanumeric characters; generated with collision retry |
| `idempotency_key`, `request_hash`, `hash_version` | VARCHAR(255), VARCHAR(64), INTEGER | Nonblank key; SHA-256 semantic input hash with explicit canonicalization version |
| `original_response` | JSONB | Complete original public creation response; object only; no token, raw webhook or signature |
| `status`, `fulfillment_status` | VARCHAR(16), VARCHAR(16) | PENDING/EXPIRED/PAID; NOT_STARTED/PENDING/APPLIED |
| `created_at`, `expires_at`, `paid_at` | TIMESTAMPTZ; last nullable | Deadline exactly 30 minutes after creation; PAID iff paid_at present |
| `fulfilled_grant_id` | BIGINT nullable | Same request/payer's applied grant; present iff fulfillment is APPLIED |

Unique keys: `(integration_key, payment_code)` and `(payer_user_id, idempotency_key)`. The idempotency key scope is the authenticated OWNER and this creation operation, independent of recipient/integration rotation; a request retry returns its original snapshot before consulting today's catalog/configuration. A changed semantic body gives conflict. A 30-minute deadline does not delete the key. Composite UNIQUE `(id, payer_user_id, integration_key)` supports scoped financial FKs. The grant back-reference targets its own scoped unique key; no redundant `(id, payer_user_id)` request index is needed.

CHECK: a non-PAID request has NOT_STARTED fulfillment; PAID has PENDING or APPLIED fulfillment. Define the FK `(fulfilled_grant_id, id, payer_user_id)` to the grant's `(id, payment_request_id, user_id)` after both new tables exist. This optional back-reference allows initial request insertion and closes the reference only when fulfillment is applied. The transaction flow, not a CHECK alone, guarantees every PAID request has an accepted bank transaction.

Indexes beyond unique keys: `(payer_user_id, created_at DESC, id DESC)` for owned status/history; partial `(paid_at, id)` where PAID and fulfillment PENDING for recovery. Persist EXPIRED only as a status projection: it cannot reject an otherwise valid pre-deadline received webhook; never change a PAID request back to EXPIRED.

### 2.2 billing_bank_transactions

| Columns | Type | Purpose/check |
|---|---|---|
| `id`, `integration_key` | BIGINT, VARCHAR(64) | PK and immutable trusted scope |
| `provider_transaction_id` | VARCHAR(64) | Canonical positive decimal provider ID; parse losslessly, not as a floating-point JSON number; not referenceCode |
| `first_received_at`, `bank_occurred_at` | TIMESTAMPTZ; second nullable | Trusted authenticated Core receive instant; provider time retained only for reconciliation |
| `direction`, `amount_vnd` | VARCHAR(3), BIGINT | IN/OUT; positive whole VND |
| `bank_code`, `account_number`, `sub_account`, `payment_code` | VARCHAR(32), VARCHAR(64), VARCHAR(64) nullable, VARCHAR(15) nullable | Minimal normalized recipient and recognized code; an ambiguous/missing code is not invented |
| `matched_request_id`, `payer_user_id` | BIGINT nullable | Both absent or both present; only a uniquely identified request can be linked |
| `disposition`, `reason` | VARCHAR(32), VARCHAR(40) | ACCEPTED/REVIEW_REQUIRED/IGNORED_OUTGOING and contract-defined matching reason; accepted reason MATCHED |
| `financial_hash`, `hash_version` | VARCHAR(64), INTEGER | Fingerprint of canonical financial facts; excludes delivery/signature timestamps |

UNIQUE `(integration_key, provider_transaction_id)` deduplicates deliveries across webhook configurations. A changed hash for that identity conflicts without overwriting the first record. Partial UNIQUE `(matched_request_id)` where ACCEPTED prevents two distinct transfers paying one request. ACCEPTED requires IN and a linked request. Composite FK `(matched_request_id, payer_user_id, integration_key)` references the request's matching unique key, with RESTRICT; nullable-pair CHECK prevents a partial scope. Composite UNIQUE `(id, matched_request_id, payer_user_id, integration_key, disposition)` supports the accepted-only grant FK.

Indexes: `(matched_request_id, first_received_at, id)` for associated review/receipt lookup, and partial `(first_received_at, id)` where REVIEW_REQUIRED for restricted reconciliation. `reviewRequired` on the request is derived from linked review rows. An unknown/ambiguous code remains unlinked for the operator; it must not reveal another payer's transaction to an OWNER.

Store no free-form transaction description, sender profile, balance, raw body, HMAC or authentication header. Unmatched funds are durable evidence, not an automatic manual-confirmation feature. A late delivery goes to review even when its bank timestamp was before expiry. Recording authentic money must not fail merely because the payer was disabled after request creation; fulfillment can remain PENDING under account policy rather than discarding the receipt.

### 2.3 billing_subscription_periods

| Columns | Type | Purpose/check |
|---|---|---|
| `id`, `user_id` | BIGINT | PK and user FK |
| `activated_at` | TIMESTAMPTZ | Immutable calendar and weekly anchor of one continuous paid epoch |
| `purchased_months`, `quota_policy_version` | INTEGER, INTEGER | Positive total months from all grants; immutable policy version within this initial epoch |
| `expires_at` | TIMESTAMPTZ | Greater than activation; computed from original local anchor plus total calendar months |
| `is_current`, `version` | BOOLEAN, BIGINT | Latest epoch pointer and positive update version; is_current does not mean unexpired |

Partial UNIQUE `(user_id)` where `is_current` allows one current pointer while retaining historical epochs for quota/grant FKs. UNIQUE `(id, user_id)` scopes those FKs. Index `(user_id, activated_at DESC, id DESC)` supports historical lookup. Do not use a time-dependent partial index such as expiry greater than now.

The grant worker serializes on the existing user row before selecting/creating a current period. If still unexpired at activation application, extend `purchased_months` and recompute expiry from the original anchor; do not reset weekly windows. Otherwise close the old pointer and create a new epoch with a new application instant. Effective access is FULL exactly while the current epoch is unexpired; expiry needs no scheduler mutation. At exact expiry a new purchase starts a new epoch. Calendar arithmetic and absence of overlapping epochs are transaction invariants with tests, not falsely claimed cross-row CHECK constraints.

### 2.4 billing_subscription_grants

| Columns | Type | Purpose/check |
|---|---|---|
| `id`, `payment_request_id`, `accepted_transaction_id` | BIGINT | PK; one grant per request and one per accepted transaction |
| `user_id`, `integration_key`, `accepted_disposition` | BIGINT, VARCHAR(64), VARCHAR(32) | Same beneficiary/integration as request/transaction; disposition fixed to ACCEPTED |
| `period_id`, `period_version` | BIGINT, BIGINT | Scoped paid epoch and resulting update version |
| `duration_months` | INTEGER | 1 or 3; copied from the immutable request snapshot |
| `previous_expires_at`, `resulting_expires_at`, `applied_at` | TIMESTAMPTZ; first nullable | Before/after evidence; first grant has no previous expiry; resulting expiry exceeds application instant |

UNIQUE on each of `payment_request_id` and `accepted_transaction_id`; UNIQUE `(id, payment_request_id, user_id)` for the request back-reference; UNIQUE `(period_id, period_version)` for deterministic renewal order. Composite FKs reference request `(id, payer_user_id, integration_key)`, period `(id, user_id)`, and transaction `(id, matched_request_id, payer_user_id, integration_key, disposition)`. Include the grant's fixed accepted disposition in the last FK, so a review transaction cannot be used as an accepted payment. Index `(user_id, applied_at DESC, id DESC)` supports status evidence. Grants are append-only through the application role.

Plan/version/price/policy remain on the immutable request instead of a second mutable copy; the grant records the applied term change. Insert grant, extend/create epoch and set request fulfillment APPLIED plus fulfilled_grant_id in one Core transaction. A rollback leaves the PAID/PENDING receipt available to retry. The first grant's request ID and transaction ID cannot later be reused to extend another epoch.

### 2.5 ai_quota_windows

| Columns | Type | Purpose/check |
|---|---|---|
| `id`, `user_id` | UUID, BIGINT | PK and user FK |
| `kind`, `period_id`, `policy_version` | VARCHAR(16), BIGINT nullable, INTEGER | FREE_DAILY requires no period; PAID_WEEKLY requires a scoped period; positive policy version snapshot |
| `window_start`, `nominal_end` | TIMESTAMPTZ | Exact daily/weekly boundaries; end greater than start |
| `limit_count`, `committed_count`, `reserved_count` | INTEGER | Positive snapshot limit; nonnegative counters; committed + reserved <= limit |

Partial UNIQUE `(user_id, window_start)` for FREE_DAILY; partial UNIQUE `(user_id, period_id, window_start)` for PAID_WEEKLY. Do not add policy_version to these keys: changing configuration must not mint a second bucket for the same period. Composite FK `(period_id, user_id)` references the paid epoch; UNIQUE `(id, user_id)` scopes usage. Initial limits are 2 and 300; approved policy supplies limits rather than a client counter. Use a scoped index on period/user if not covered by the paid unique key for FK maintenance.

Free boundaries are Vietnam midnight to next midnight. Paid nominal boundaries are seven days from activation plus integer multiples of seven days. Store the nominal seven-day end, then derive effective display/admission end as the lesser of nominal_end and current epoch expiry. Do not permanently store a clipped final end: an early renewal may legitimately extend that same final partial week without replenishing its 300 slots. A captured turn always finalizes against its original window ID after rollover/expiry. Free usage earlier in a day remains when returning to Free that same day; activating a paid plan never clears it.

### 2.6 ai_turn_usages

| Columns | Type | Purpose/check |
|---|---|---|
| `id`, `user_id`, `shop_id` | UUID, BIGINT, BIGINT | Stable logical turn UUID, user FK and existing shop FK |
| `operation`, `idempotency_key` | VARCHAR(16), VARCHAR(255) | Operation CHAT shared by JSON and SSE; nonblank key |
| `request_hash`, `hash_version`, `input_conversation_id` | VARCHAR(64), INTEGER, BIGINT nullable | Semantic hash includes message/shop/conversation; conversation ID is a reference value, not a Core FK to an AI-owned table |
| `window_id` | UUID | Composite FK `(window_id, user_id)` to captured quota window |
| `state` | VARCHAR(16) | RESERVED/RECONCILING/SUCCEEDED/FAILED/CANCELLED |
| `execution_fence`, `lease_owner`, `lease_expires_at` | BIGINT, UUID, TIMESTAMPTZ | Positive monotonic recovery fence, worker ownership and lease; timeout alone never releases a slot |
| `admitted_at`, `completed_at` | TIMESTAMPTZ; second nullable | Completion present iff terminal state |
| `failure_code` | VARCHAR(64) nullable | Safe stable failure code on FAILED/CANCELLED; no stack, raw question or response |

UNIQUE `(user_id, operation, idempotency_key)` prevents a second logical turn across transports. The AI receipt uses this same UUID; there is deliberately no Core FK to an AI-owned receipt/message. Check current account/shop ownership on every request and replay, using existing guards; the existing shop table has no `(id, owner_id)` unique key to assume for a composite FK. Index `(user_id, admitted_at DESC, id)` for scoped investigation and partial `(lease_expires_at, id)` for RESERVED/RECONCILING recovery; index window_id for accounting/reconciliation. No automatic deletion of idempotency evidence is introduced.

Window row locking/CAS plus usage transitions are one local transaction: admission increments reserved; success decrements reserved and increments committed; definite failure/cancel decrements reserved. Each terminal transition is conditional on a still-held state/fence, so retries cannot decrement or charge twice. RESERVED/RECONCILING usages account for reserved_count, SUCCEEDED for committed_count. A reconciliation query must detect drift; it is not permission for an HTTP handler to reset counters manually.

## 3. AI-owned agent_turn_receipts

This table has a separate AI-owned migration and a phase-five default-off runtime writer. The owner approved a separate additive result_model/result_model_version metadata migration on 2026-11-08, without rewriting the original receipt migration. It is not created by Core Flyway. Existing AI conversation/message storage remains the answer source.

| Columns | Type | Purpose/check |
|---|---|---|
| `turn_id`, `user_id`, `shop_id` | UUID, BIGINT, BIGINT | PK; trusted Core scope; existing user/shop FKs with RESTRICT |
| `request_hash`, `hash_version`, `input_conversation_id` | VARCHAR(64) nullable, INTEGER nullable, BIGINT nullable | Canonical semantic fingerprint for a received generation; hash/version may both be absent only for cancellation before POST arrival |
| `state`, `execution_fence` | VARCHAR(16), BIGINT | IN_PROGRESS/SUCCEEDED/FAILED/CANCELLED; positive fence |
| `created_at`, `completed_at` | TIMESTAMPTZ; second nullable | Terminal completion timestamp consistency |
| `result_conversation_id`, `result_message_id` | BIGINT nullable | Existing conversation/message FKs with ON DELETE SET NULL, preserving current chat deletion |
| `failure_code` | VARCHAR(64) nullable | Safe terminal failure/cancellation code; no model trace |
| `result_model`, `result_model_version` | VARCHAR(512) nullable | Phase-five addition: exact model metadata on success, nullable together for pre-existing receipts; no copied answer/backfill |

PK turn_id guarantees one execution identity. All service operations recheck trusted user/shop scope and compare semantic hash on an existing execution; no FE access. Index both result FKs for deletion and `(state, created_at)` for recovery. Fingerprints/identity/terminal receipts are not overwritten by a new question. Result references are populated atomically with the saved assistant answer and SUCCEEDED receipt, and later become unavailable if the owner deletes that chat; do not copy content into a replay cache that defeats deletion. Validate referenced answer's conversation/ownership inside the save transaction, as existing chat IDs do not provide assumed composite unique keys.

Cancellation locks/creates the turn receipt, persists a terminal tombstone and fences any running/delayed save. A cancellation arriving before the original POST may have no fingerprint yet; immutable user/shop plus turn ID and CANCELLED state still reject delayed execution. Saving into an existing conversation first locks that conversation (matching owner deletion/FK nulling), then locks/verifies the receipt's IN_PROGRESS state/scope/hash/input-conversation/fence inside the same transaction as writing messages, metadata and SUCCEEDED; a stale worker cannot commit after cancellation. The AI must not automatically start a replacement model run for an unresolved existing turn. Core may advance a recovery fence only through the authenticated receipt/cancellation protocol, never solely because a lease expired.

A SUCCEEDED receipt remains successful if its chat is later deleted. Core still accounts for the completed turn once, but replay returns `410 ai_turn_result_removed` on the durable path without regeneration or another debit. Receipt reads report result availability separately from execution state; they must not misclassify deletion as a technical failure eligible for a quota refund. This compatibility detail supplements the proposed internal contract and preserves existing owner chat deletion.

## 4. Transactions, locks and invariants

| Operation | Proposed atomic work and lock order | Network boundary |
|---|---|---|
| Create request | Active OWNER guard; reserve unique owner/key; validate server offer; write request and original response; commit | No provider call under locks |
| Receive webhook | Authenticate raw bytes; capture receive instant; reserve provider unique identity → lock request; insert normalized financial outcome, PAID and fulfillment PENDING together if eligible | Authentication before transaction; ACK only after commit |
| Apply grant | Lock request → existing user → current epoch; insert unique grant, change epoch and fulfillment APPLIED together | No provider/AI call |
| Admit turn | Lock existing user → resolve epoch → window → usage; resolve same-key replay before capacity; reserve once | Commit reservation before calling AI |
| Finalize/recover turn | Read immutable window reference, then lock window → usage; apply conditional state/fence/counters | Fetch/settle AI receipt outside Core DB locks; recheck state/fence inside transaction |
| Save/cancel AI turn | Existing conversation lock, when needed → receipt → scoped exchange persistence; cancel locks/creates receipt; success or cancellation commits atomically | No Core DB transaction held across internal HTTP |

All paths touching multiple quota objects use window before usage; do not invert this order in a recovery job. A same-key admission serialized by the user lock still races a finalizer, so recheck the locked usage before deciding replay/admission. The request lock prevents a second acceptance; the user lock prevents concurrent grants losing purchased months or admission seeing half an activation. Incoming accepted financial facts do not acquire a user lock or depend on AI availability.

Checks/unique/FKs enforce row-local shape, identity, scope and at-most-one acceptance/grant; application transactions enforce cross-row correspondence and calendar arithmetic. Snapshot writes use an explicit update allowlist; bank transactions and grants have no generic update/delete API. V21 adds statement-level guards rejecting UPDATE/DELETE/TRUNCATE of bank transactions and grants. Schema owners can bypass those guards; private role separation is still required. The phase-three/six writers enforce request snapshot immutability, terminal fencing and cross-row transitions; a CHECK does not compare historical values. No scheduled cleanup may erase pending money, receipts or quota keys during the pilot.

## 5. Access, migration and recovery review

Enable RLS and revoke client access from PUBLIC/anon/authenticated on every new table. Explicitly review the actual service roles: Core needs its six tables, AI its receipt/chat storage; do not grant AI access to bank/subscription tables or automatically expose them through the Data API. These are database/application boundaries, not proof of a configured production role. Operator reconciliation initially uses separately authorized restricted read-only access; there is no manual grant/refund endpoint in this proposal.

The approved migrations create additive empty tables/FKs/indexes in dependency order: request without optional grant FK, bank transactions, periods, grants, optional request-to-grant FK, quota windows/usages; AI receipt is migrated by its owning service. Do not alter deployed V1–V20. New-table indexes do not need a concurrent build, but references to existing user/shop/chat tables still need lock-timeout/rehearsal review. Do not assume a transactional Core migration can create the AI-owned objects or that either service may write while the other's protocol is absent.

No historical purchases or quota are inferred/backfilled. Deploy compatible writers/readers before enforcement; keep request creation and quota admission disabled until coordinated Core/AI/FE tests pass. Stopping new collections must preserve processing/reconciliation for already-issued requests. Reverting an application build retains all committed financial and turn evidence; destructive down-migrations are not a rollback plan. Shared rollout requires merged migrations, verified backup/restore, explicit approval and private configuration review separately from this document.

Before Live, verify the chosen bank/account type is supported by the provider, name the private operational owner and settle retention/deletion/access procedures. No legal retention period is inferred. The [official bank capability list](https://developer.sepay.vn/vi/sepay-webhooks/tai-khoan-ngan-hang) and authenticated Dashboard determine actual availability; a simulated account does not prove Live support.

## 6. Required implementation evidence after approval

| Area | Required evidence; only the DDL/storage checks in BillingSchemaPostgresTest are implemented in phase two |
|---|---|
| Schema | Fresh Core migration plus upgrade from V20; separate AI migration; negative constraint/scope cases; role/RLS tests; no new client grants or existing business schema changes |
| Money | Concurrent duplicate provider IDs; changed facts conflict; two transfers/one request; wrong account/code/amount; late receipt including early bank timestamp; expiry/read race; rollback before ACK; integration rotation with old request replay |
| Fulfillment | Crash before/after PAID and before/after grant; two workers and two renewals; same accepted transaction cannot grant twice or to another user; disabled payer still has durable money evidence |
| Calendar/quota | Month-end/leap/year arithmetic; continuous/gapped terms; exact expiry; all shops/devices share quota; last-slot race; rollover during work; final partial week extended without another bucket; policy version cannot mint quota |
| AI recovery | Success saved before Core crash; cancellation before delayed POST; cancel/save race; stale worker; lease expiry with unknown outcome; no repeat model run for pending key; JSON/SSE replay; deleted-chat result stays charged and cannot regenerate |
| Operational | Independent backup restore, bounded connection/statement waits, recovery scan/metrics, drift alerts, redacted logs, disabled gates and bank Test mode; update/check affected AI statechart before runtime changes |

Owner schema/migration-creation approval is recorded in chat after review of the diagram. Phase two implements storage and its constraints; phase three adds payment request/receipt writers and their HTTP/HMAC/transaction tests. Phase four implements grant/calendar workers and subscription/quota reads. Phase five implements opt-in AI receipt/cancel and internal deleted-result HTTP replay. Phase six implements default-off Core admission/debit/release/recovery using V21 with real PostgreSQL transaction and scoped HTTP tests; shared Core–AI/FE acceptance remains pending. Bank enrollment, credentials, execution on staging/production and real-money tests remain separate actions.
