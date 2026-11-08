# AI chat quota — admission and recovery

Phase six implements Core admission, debit, release and receipt recovery for JSON/SSE chat using the approved V21 tables. No new migration is added. Source implementation and local tests do not mean the capability is enabled or accepted on a shared environment. [Contract §10](../../../docs/contracts/api-contracts.md#10-subscription-and-ai-quota) owns wire semantics, [subscription design](../../../docs/architecture/subscription-quota-design.md) owns policy and [AI runtime](../../ai/docs/runtime-reference.md#durable-turn-protocol--phase-five) owns receipt/save/cancel behavior. Payment setup remains in the [SePay guide](sepay-payments.md).

## Gates and client handoff

| Variable | Default | Effect |
|---|---|---|
| AI_QUOTA_ENABLED | false | Require a stable Idempotency-Key and route both public chat POSTs through quota admission; quota GET reports this gate as enforcementEnabled |
| AI_QUOTA_RECOVERY_ENABLED | false | Allow the receipt recovery scan; new durable admission requires both Core gates |
| AGENT_TURN_RECEIPTS_ENABLED (AI) | false | Enable authenticated durable turn/receipt/cancel; required for compatible Core operation |

With admission off and no key, the existing legacy path is unchanged. A supplied key explicitly selects durable handling even while admission is off: existing keys can settle/replay, but a new key returns 503 instead of generating through legacy chat. Missing/blank/overlength keys on the enabled path return 400 ai_turn_key_invalid. A false recovery gate blocks new durable admissions with 503; it does not revoke a previously completed result. enforcementEnabled reflects configuration, not a health or acceptance check.

FE must preserve one key plus input/shop/conversation across network retries, JSON/SSE fallback, 202 pending and page/session retry. A different question requires a different key; a terminal failed key cannot start again. Both routes must accept JSON errors/202 before SSE starts. A new key is not a way to retry an uncertain outcome. Review the FE error/quota display before enabling; current source compatibility with keyless clients is only the disabled legacy path.

## Transaction and receipt boundaries

Admission rechecks active OWNER and owned active shop, serializes on the OWNER, checks an existing key before current allowance, then locks or creates the exact current window. The semantic SHA256 includes hash version, trusted user/shop, input conversation and trimmed message; transport and current plan are excluded. Core stores no duplicate question/answer text. After lock waits, time/policy is recalculated so waiting across Vietnam midnight or paid expiry cannot reserve the old current window. Window policy/version/limit mismatches fail closed.

Reserve increments reserved_count and creates a stable UUID usage with lease owner, execution fence 1 and a 90-second lease in one transaction. Network dispatch happens after commit. Completion locks captured window → usage; only the current fence/lease owner can transition pending work. SUCCEEDED moves one reservation to committed, FAILED/CANCELLED releases one reservation, and a repeated terminal settlement does not update counters. All database writes require exactly one affected row. A day/week or subscription change never moves an already-admitted usage to another bucket.

An HTTP success, SSE header/delta or incoming done is not a success proof. Core reads the authenticated scoped AI receipt and commits the usage before emitting its narrowed three-field public result/done. A deleted successful answer returns 410 ai_turn_result_removed while keeping its debit. Progress can be streamed earlier; unknown/malformed receipts never become a public done. EOF, technical error or disconnect closes upstream and attempts receipt/cancel settlement; a successful save winning that race stays charged. Failure to obtain a definitive result retains pending capacity rather than refunding it.

## Restart and recovery

The worker waits ten seconds initially, then ten seconds after each completed poll. It scans up to twenty pending usages ordered by expired lease deadline and ID. Each claim locks window → usage, rechecks expiry, advances the fence and changes the lease owner/deadline by another 90 seconds. A claimed unavailable row moves behind still-expired rows instead of starving the next batch. There is no generation retry in the worker.

Receipt SUCCEEDED settles once even after a Core crash, payer disablement or admission pause. FAILED/CANCELLED settles a release. MISSING/IN_PROGRESS or a failed receipt read can release only after an authenticated cancellation commits a durable tombstone or reports an existing terminal result. A GET 404, lease age, browser close or timeout alone never releases. A stale handler cannot settle a slot claimed by a later recovery owner. If receipt and cancellation remain unavailable, keep the reservation and retry after the lease; do not edit counters or synthesize failures.

The SQL transaction timeout is five seconds, with lock_timeout two seconds and statement_timeout three seconds. Pool connection acquisition is governed separately by the deployed datasource; these settings do not establish a five-second HTTP deadline. Receipt HTTP has connect/read limits of three/five seconds; generation retains the existing chat client timeout. Poll size/timing and leases are bounded implementation settings, not proven throughput or eventual-recovery guarantees. Profile pool waits, pending counts and receipt/provider latency before shared activation.

## Rollout and rollback

1. Review/merge compatible Core/AI code, existing V21 and both AI receipt migrations; verify backup/restore and the intended private service roles. This guide does not authorize shared migration execution.
2. Coordinate FE stable keys and JSON/SSE error handling. Keep all gates false while those clients or durable stores are missing.
3. With separately approved rollout, enable the AI receipt protocol and Core recovery, inspect their health, then enable Core admission. Keep the internal service token/network private and test both transports, last-slot races, disconnect/save, restart, unavailable receipt and deleted results on the integrated system.
4. To pause new durable admission, set only AI_QUOTA_ENABLED=false and keep recovery/AI receipts compatible until pending work is settled. Compatible FE must preserve old keys; omitting them would select legacy generation. To stop generation entirely, use the authorized route/maintenance control as well. Do not advertise enforced quota while the admission gate is off.
5. Do not disable/drop receipt storage or remove V21 to roll back. Preserve terminal usage, idempotency evidence and cancellation tombstones; do not reset counters or reopen a terminal key. Admission, recovery, collection and subscription fulfillment are independent gates.

## Local verification

Follow [Core verification](verification.md) with a disposable PostgreSQL only. ChatQuotaPostgresTest runs real V21 transactions with two independent facades, restart recovery and a fake durable AI transport; it asserts that transport calls occur outside Core transactions. Cases cover last Free/paid slot across shops, lock-wait midnight rollover, paid expiry/renewal, cross-transport replay, disabled gates, rollback after saved AI success, cancel-before-dispatch, stale finalizers, unavailable batches, deleted results and stream disconnect races. ChatQuotaAiClientTest verifies the internal HTTP contract and malformed/private replies; controller tests verify Firebase, no legacy fallback, 202/429 JSON and Retry-After. These tests complement phase-five real-PostgreSQL AI receipt/save tests. Phase seven adds an explicit CoreAiQuotaIT process suite with actual Core HTTP → Python AI HTTP and shared disposable SQL storage; see the [FE handoff and rerun](../../../docs/contracts/billing-ai-client-handoff.md). Its model/cache/Firebase fixtures and omitted infrastructure remain separate from deployed Core–AI/FE/provider acceptance. [Core quota model](../../../docs/architecture/statecharts/README.md#core-quota-admission-and-recovery) is checked separately from runtime.
