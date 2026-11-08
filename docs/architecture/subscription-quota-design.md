# Subscription and AI quota — phase-one design

This design records the owner's approved plan on 2026-11-07: Free with two AI chat turns per day; 99,000 VND for one calendar month and 297,000 VND for three calendar months, each paid tier with three hundred turns per week. All tiers retain the same existing application features; quotas differ. Phases three/four implement payments and durable entitlement fulfillment, independently default-off; phase five adds opt-in AI receipts. Phase six implements Core admission/debit/release and fenced recovery on V21, with both Core gates false by default. Shared enablement and integrated FE/provider acceptance are unverified. The [payment guide](../../backend/core/docs/sepay-payments.md) and [quota guide](../../backend/core/docs/ai-chat-quota.md) own setup/recovery.

[BR-028/BR-029](../product/business-requirements.md#subscription-và-quota-ai--quyết-định-lượt-1), [FR-042/FR-043 and AC-137–150](../product/product-requirements.md#subscription-và-quota-ai--thiết-kế-lượt-1) own the product rules. [API contract §10](../contracts/api-contracts.md#10-subscription-and-ai-quota) owns wire semantics; [SePay §9](../contracts/api-contracts.md#9-sepay-fee-payments--570) remains the money-receipt boundary.

## 1. Scope and approved decisions

Subscription belongs to the Core OWNER user, across all their shops. Switching or creating shops does not add allowances. A paid plan does not bypass active-account/shop ownership checks, grant ADMIN access or enable unconfigured providers/features. Free can still use the existing sales, catalogue, debts and reports; expiry never deletes or locks that data. Chat history and ordinary non-generation APIs consume no chat quota.

A turn is one logical user question which completes as a normal saved assistant answer. A completed answer asking for clarification or reporting insufficient data still counts. Model/tool calls inside that answer do not each consume another user turn. Technical failures before successful completion consume no turn. Server-side successful completion is not undone solely because the browser lost its response; retry retrieves that same answer without another charge. A partially streamed answer that never completes is not a successful turn.

The initial quota applies only to the assistant's POST chat and chat/stream routes. Existing on-device voice parsing, barcode, ordinary app requests and internal background memory/classification calls are not separate user-chat debits. Internal model costs still require token/tool/time/rate guards; no unlimited-use claim is introduced.

## 2. Entitlement lifecycle and calendar arithmetic

A request snapshots plan/version, price, durationMonths and quota-policy version before showing a QR. FREE has no payment request. A matched SePay transfer becomes a durable accepted payment first; request PAID and subscription ACTIVE are separate facts. An automatic grant worker must retry activation safely rather than depending on an in-memory callback or client redirect.

For a previously Free or expired account, the paid term and weekly anchor start when activation is durably applied, not at QR creation or bank transfer time. The user does not lose paid time while activation is pending. A duplicate accepted transaction never grants another term.

For continuous paid access, an early renewal adds one or three purchased calendar months and retains the original term and weekly anchors. It does not restart today's quota or immediately add three hundred turns. After a real gap in paid access, activation starts a new term/weekly epoch.

Use Asia/Ho_Chi_Minh calendar months, not fixed 30/90 days. Preserve the original day/time across a continuous term and clamp only each computed end date: a Jan 31 activation plus one month ends Feb 28 in 2027; two purchased months end Mar 31, not Mar 28; three end Apr 30. Store original anchor and total purchased months, with each paid grant as evidence. Access is valid in [activatedAt, expiresAt); no overlapping interval can be granted by two concurrent renewals.

At expiry the effective plan is FREE without waiting for a cron job. An already-admitted paid chat can complete against its reserved paid window; new questions use Free policy. A normal expiry does not prevent replay of an authorized completed question. Automatic recurring collection, refunds, prorated upgrades and cancellation of already-paid terms remain outside this design.

## 3. Allowance windows

| Effective tier | Allowance | Window |
|---|---|---|
| FREE | 2 successful logical turns | Local calendar day, 00:00 to next 00:00 Asia/Ho_Chi_Minh |
| FULL_MONTHLY | 300 successful logical turns | Consecutive seven-day windows anchored at paid activation |
| FULL_QUARTERLY | 300 successful logical turns | The same seven-day windows, across the three-month term |

Usage does not roll over and is never added on top of Free quota. A paid term's last window may be shorter than seven days; its allowance remains three hundred until access expires. A 300/week promise is not a fixed monthly total or a fixed quarterly lump sum. No new paid window begins after the paid term ends.

Compute window boundaries from authoritative server time and stored anchors; logging in, opening the app, changing a device or switching shops cannot reset counters. Early renewal preserves the current weekly counter. Existing reservations remain bound to the window/policy captured at admission if a day/week rolls over or a paid term starts/ends before they finish.

Remaining admission capacity is max(0, limit - committed - reserved). The GET shows both committed and reserved so two concurrent requests cannot each take the last turn. New questions are rejected before any AI/model work when capacity is exhausted.

## 4. Quota operation and a durable success receipt

Implemented default-off sequence: authenticate and validate shop/body → locate a replay by payer/key → reserve one slot atomically → dispatch a stable logical turn ID to trusted AI → observe/recover a durable terminal result → commit or release the slot → deliver/replay that result. Authorization still applies before replay, but an already-completed replay is not rejected just because a new question would exceed quota.

Uniqueness is by Core user + operation + Idempotency-Key, shared across JSON and SSE. Fingerprint the semantic body, shop and conversation, not transport mode or current plan. A key cannot be reused for a different question/shop/conversation or after a failed execution to run a new turn. A deliberate new attempt uses a new key; a transport retry first resolves the old attempt.

Phase five implements AI receipt identity, atomic answer persistence and authenticated receipt/cancellation in API contract §10. Phase six consumes that protocol through the Core quota facade for JSON/SSE, reads authoritative receipts before settlement/done, and never dispatches from recovery. An unknown receipt cannot release capacity until a durable cancellation tombstone prevents delayed execution. Both sides have local transaction/HTTP tests; coordinated rollout and integrated acceptance remain separate work.

A successful JSON HTTP code alone, an SSE 200 header, an initial delta or a browser disconnect cannot decide the debit. Persist a success receipt with the saved answer/reference; the stream's done event follows that save. Recovery uses that receipt if Core crashes after AI saves but before the debit/result reaches the client. Commit the quota result exactly once and replay the saved answer rather than generating a new answer.

Reserve/lease cleanup needs owner tokens/fencing and reconciliation. Do not release a reservation merely because its lease or HTTP connection expired while the worker could still save a successful answer; that would allow a later success plus an extra admission. An uncertain turn remains pending for durable recovery. Release only after a definitive terminal failure/cancellation fenced against a late success. Define and test bounded recovery operationally before enabling limits, with no manual counter edits in an HTTP handler.

Each terminal success increments its captured window once; definitive failure releases its reservation. The user-visible quota is per question, while rate/token/time guards continue independently to bound repeated failing or cancelled work.

## 5. Approved logical storage and gated runtime

The owner approved schema/migration creation; Core V21, the separate AI receipt migration and the approved metadata-only AI migration are present. Phases three through six add default-off payment, grant, receipt and quota writers. No new phase-six migration is required. The [schema proposal](billing-schema-proposal.md) owns columns, constraints, indexes and transaction boundaries. Quota GET remains read-only, projects recorded counters and reports enforcementEnabled from AI_QUOTA_ENABLED; this is configuration rather than acceptance or a health check.

| Record | Purpose and key rules |
|---|---|
| User subscription | One current continuous paid epoch per OWNER; activation anchor, calendar-month total, expiry and policy version; lock/CAS updates prevent lost concurrent renewals |
| Subscription grant | Append-only evidence of an applied accepted transaction and purchased plan snapshot; UNIQUE accepted bank transaction; identifies affected epoch and months added |
| AI quota window | User + policy epoch + exact window start is unique; stores limit, committed and reserved counts with nonnegative/capacity checks and atomic admission |
| AI turn usage | User + operation + idempotency key is unique; fingerprint, shop/conversation reference, stable logical turn ID, captured window, state, lease/fence and durable result reference; terminal transitions cannot charge twice |

The SePay request/transaction design also needs a durable fulfillment marker referencing its eventual grant. Writing the grant, extending the subscription and marking fulfillment APPLIED must be one Core DB transaction. Pending accepted payments are discoverable for worker retry, including after restart; payment remains PAID if activation has not yet succeeded. No broker or new service is required just to provide this durable handoff.

User deletion/retention, RLS/no client or AI billing-table grants, private operational access and data-minimization requirements must be reviewed with the concrete schema. Do not copy raw question text into a second Core ledger merely to implement quotas; use fingerprints and the restricted AI result reference.

## 6. Verified source boundary and next implementation gates

Baseline source review at staging 2821714 found no durable chat/quota protocol; that historical finding is superseded in this unmerged branch by phases five/six. Core now conditionally accepts stable keys on both public chat POSTs, uses trusted scope, reserves before dispatch, and settles from AI receipts. The disabled keyless path deliberately preserves legacy behavior; current keyless clients must be coordinated before enabling admission.

The [statechart guide](statecharts/README.md) includes the phase-five AgentTurn/durable-receipt models and the phase-six CoreQuota model/chart. CoreQuota abstracts atomic reservation/settlement, delayed dispatch, saved-result recovery, tombstones, stale handlers and captured windows. TLC checks and SVG rendering are reported separately from runtime tests; finite abstractions do not prove HTTP deadlines, SQL implementation or eventual recovery.

Coordinate Core, AI and FE before enforcing the new key requirement; never enable a counter that can call AI without a slot, release unknown outcomes blindly, or double-charge a retry. Quota policy/enforcement starts disabled until all writers support it and recovery tests pass. Runtime configuration/migration/provider changes still require their respective approval and rollout gates.

Tests must cover calendar/leap/month-end renewal, continuous and interrupted epochs, expiry without scheduler, multiple shops/devices, free/paid boundary transitions, weekly and final short windows, same-key replay across transports, last-slot concurrency, model/tool multiplicity, saved-result recovery, disconnect before/after save, stale lease fencing and error/quota UI. Phase-four local tests cover fulfillment concurrency, original-anchor/leap/calendar renewal, exact expiry, disabled users, rollback and read-only window projections. Phase-five local tests cover AI cross-transport/restart replay, cancellation/save races, deleted results and receipt failures. Phase-six local tests additionally cover Core last-slot races, retry across transports, lock-wait rollover, crash/cancel/fence recovery, unavailable batches and stream/save races. Phase seven adds actual loopback Core HTTP → Python AI HTTP with SQL persistence, fake model/cache and fixture Firebase/preliminary shop lookup. It verifies nine integration scenarios separately from unit models and supplies a [FE handoff](../contracts/billing-ai-client-handoff.md). Deployed Core–AI/FE/provider acceptance and performance remain pending.
