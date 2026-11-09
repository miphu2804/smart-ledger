# Billing and AI quota — frontend handoff

Phase seven provides a consumer handoff and local Core–AI integration tests for the default-off phase-three through six implementation. It does not implement FE screens, enable staging, verify SePay delivery or authorize real transfers. [API contract §9](api-contracts.md#9-sepay-fee-payments--570) and [§10](api-contracts.md#10-subscription-and-ai-quota) own exact wire fields/status codes; [FR-041–043 / AC-128–150](../product/product-requirements.md#sepay-570--yêu-cầu-và-trạng-thái-triển-khai) own behavior. This guide translates them into client integration steps without changing those requirements.

## Authentication and route map

Call Core only, using the existing Firebase ID token/session client. Do not send a user ID, tier, price, quota counters, execution fence or internal token. User status, role, ownership and entitlement remain backend decisions.

| Route | Shop header | Client responsibility |
|---|---|---|
| GET /api/v1/billing/plans | No | Render the returned offer version, price, calendar duration and allowance; Free has no purchase action |
| POST /api/v1/billing/payment-requests | No | Send only planCode/planVersion and a stable Idempotency-Key; retain the owned returned ID |
| GET /api/v1/billing/payment-requests/{id} | No | Read current payment/fulfillment state; creation replay is the original snapshot |
| GET /api/v1/billing/subscription | No | Read effective access, actual expiry and manual-renewal state |
| GET /api/v1/agent/quota | No | Read committed/reserved/remaining, window dates and enforcementEnabled |
| POST /api/v1/agent/chat and /chat/stream | Required | Retain a key per logical question and original message/conversation/shop; both transports share it |

An OWNER without a shop can read or purchase a plan; asking the assistant still requires an owned ACTIVE shop. Switching shops does not create another allowance. All tiers retain existing features; Free is 2 successful turns per Vietnam day, paid plans share 300 per activation-anchored seven days. Never advertise unlimited AI or imply that a three-month purchase provides a separate larger weekly quota.

## Payment flow

1. Load the catalog and effective subscription. Use the returned version and price, not hardcoded prices or a client-calculated offer. Free needs no payment request.
2. On an intentional paid purchase, create and retain one random key scoped to the signed-in OWNER and normalized purchase body. Send `{ "planCode": "FULL_MONTHLY", "planVersion": 1 }` or the selected catalog offer. Disable duplicate taps, but keep the same key for uncertain network/5xx retries; do not substitute a different offer under that key.
3. Read current state with GET after creation/replay. A POST replay always returns the original 201 snapshot, even after payment or expiry; it is not a live polling response. Display QR/recipient/amount/paymentCode from the stored server snapshot. Hide expired or null QR and use Core expiresAt as the countdown authority. Do not rebuild a QR with a different amount or code.
4. Poll the owned status while the payment view is active, with bounded retries/backoff and a stop when the view closes or the status becomes terminal. A countdown, redirect, screenshot or “I have transferred” click is never evidence of payment. Closing the view does not cancel money already in flight; do not automatically mint a second purchase request when reopening.
5. Once fulfillment is APPLIED, refresh subscription and quota. Render dates returned by Core; renewal adds calendar months and does not reset the current weekly allowance. Do not activate locally merely because status is PAID or a QR disappeared.

| Status / fulfillment | Suggested Vietnamese copy | Behavior |
|---|---|---|
| PENDING / NOT_STARTED, not expired | Chờ thanh toán | Show current QR and server deadline |
| EXPIRED | Yêu cầu thanh toán đã hết hạn | Hide QR; explain that already-sent money can need reconciliation; a new purchase is an explicit action |
| PAID / PENDING | Đã nhận thanh toán — đang kích hoạt gói | Retain request ID and show recoverable activation state; do not ask the user to pay again |
| PAID / APPLIED | Gói đã được kích hoạt | Refresh the effective term and quota; the last purchased plan is not the length of the whole continuous term |
| reviewRequired=true | Có khoản chuyển cần đối soát | Preserve the underlying payment/fulfillment state; this flag can coexist with a valid applied purchase after an extra transfer |

Review is not an automatic refund or an automatic entitlement decision. Missing/extra/wrong/late transfers need the authorized operator; FE has no manual confirmation, refund, bank-detail editing or grant endpoint. All terms are manual renewals; do not label a purchase as automatic recurring debit.

## Logical chat key and request lifecycle

When admission is enabled, both chat POSTs require Idempotency-Key (trimmed, nonblank, at most 255 characters). Capture the authenticated OWNER, selected shop, input conversation_id (including its original null/absence), trimmed message and key before the first send. Keep this snapshot for JSON/SSE retries, pending recovery and a page/session retry; a newly created output conversation ID must not replace the original input conversation ID on that retry. Retain pending metadata in the intended private account-scoped client store; never put tokens, complete questions or internal receipt data into diagnostics/analytics.

Do not create a fresh key just because a response was lost, a stream ended or the user changed a device. A different message/shop/conversation is a different operation and needs an explicit new key. If the outcome is uncertain, resolve the existing operation first. Do not move a pending operation to a newly selected shop/account. A known terminal failed/cancelled operation can be deliberately retried as a new question with a new key; sending the old key returns its recorded outcome.

| Client state | Event | Next step |
|---|---|---|
| Sending | 200 JSON with conversation_id/message_id/answer | Save/display the final answer once and refresh quota |
| Sending/streaming | 202 application/json, `{turnId,status:"PENDING"}` | Keep the original key/snapshot, honor Retry-After (currently 2), and retry the same public POST with bounded polling/backoff |
| Streaming | delta/reset/memory/tool_start/tool_end | Render progress only; neither a delta nor SSE HTTP 200 completes the question |
| Streaming | done | Replace partial text with its final three-field result, deduplicate the message and refresh quota |
| Streaming | error, EOF without done, network failure or timeout | Preserve the question and uncertain key; discard incomplete answer as success evidence; retry/reconcile the same operation |
| Sending | 429 ai_quota_exhausted | Keep the draft, show details entry with field nextAvailableAt and honor Retry-After; allow history and all ordinary features |
| Sending | 409 ai_turn_conflict | Restore the original snapshot/key or start an explicitly different question; do not mutate and loop the same key |
| Sending | 409 ai_turn_cancelled | Recorded terminal cancellation; an intentional new attempt needs a new key |
| Sending | 410 ai_turn_result_removed | Completed answer was deleted; do not regenerate under that key or refund locally |
| Sending | 503 ai_quota_unavailable | Do not fall back to a new legacy/keyless generation; retain uncertain state and offer retry |

Check 202 and Content-Type before opening the SSE reader: 202 is a successful HTTP status but is not an answer or an event stream. Send `Accept: text/event-stream, application/json`; errors/pending before stream headers remain JSON. JSON chat also returns 202, so a generic typed `response.json()` cannot be assumed to be an AgentChatMessageView. Core exposes Retry-After through its existing CORS configuration. Use server codes/details for decisions, not translated message text or traceId.

Normal completed clarification/insufficient-data answers count once; tools/models inside the answer do not add turns. A transport failure after a saved success can still count once. Only a definitive fenced failure/cancellation releases a slot. FE must not implement a local refund rule or automatically remove reserved capacity on timeout.

Other existing auth/shop/body/guardrail errors keep their contract behavior. Account/shop authorization applies on replay. Retain draft input, but do not bypass a disabled user, inactive/foreign shop or deleted conversation. Preserve existing 401 session handling. Input errors can be corrected for a deliberate new attempt; an uncertain previous attempt must not be silently treated as a definitive failure.

## Quota display and staged compatibility

Read quota from Core; remaining already subtracts committed and reserved. Show processing reservations separately from used successful turns. Refresh after completion/failure, after a pending operation settles, after a purchase applies, on foreground/shop change and at the returned boundary. Use the offset in server timestamps once; do not add seven hours a second time. nextResetAt can be null in the final paid window: show accessExpiresAt and re-read effective Free access at expiry instead of promising another paid reset.

enforcementEnabled reports the configured Core admission gate, not health or integrated acceptance. With the default false, a keyless request uses the existing legacy path; a supplied key still selects durable handling, and a new durable key is rejected while admission is paused. Do not unconditionally add keys to an unprepared deployment. Coordinate the client release and compatible stores/Core/AI before enabling; keep existing uncertain keys during rollback. The [Core guide](../../backend/core/docs/ai-chat-quota.md#rollout-and-rollback) owns activation order and recovery. Its flags are server configuration, never public client credentials.

## Current FE gaps and acceptance checklist

Source review in this feature worktree on 2026-11-08: frontend/mobile/src/lib/agentApi.ts sends chat without a key; apiStream has no idempotency option and treats every 2xx response as a stream. The assistant and quick-ask sheet restore a draft on failure without durable logical-attempt handling. Billing/catalog/checkout and quota displays are not implemented by this phase. This review does not claim that a deployed FE build matches the checkout.

- Implement the same attempt handling for the full assistant and quick-ask sheet, JSON/SSE transport switch, pending/reload retry and account/shop switch.
- Test double tap and same-key replay across transports, last slot, changed input conflict, timeout before/after save, terminal cancellation and deleted result. Show a pending state without adding a second user/assistant message on every retry.
- Test Free midnight, weekly boundary, expiry, paid activation during a Free question and early renewal without a reset. Exhaustion blocks new chat only.
- Test purchase retry after a lost 201, paid-but-pending activation, expiry, reviewRequired alongside paid/applied and an unavailable backend. Never infer activation from POST replay or ask an already-paid user to transfer again.
- Verify browser CORS/exposed Retry-After and real platform lifecycle behavior with the integrated staging build before acceptance. Local backend fixtures do not exercise Firebase issuance, FE rendering, native/web disconnect semantics, edge routing or SePay/bank delivery.

## Local integration evidence and rerun

[CoreAiQuotaIT](../../backend/core/src/test/java/com/smartledger/core/billing/CoreAiQuotaIT.java) drives actual loopback HTTP through Core controllers/security/error handling to a separate Python process running the production AI router, token check, chat service, receipt/save/cancel repositories and PostgreSQL. Model execution and Redis cache are fake; Firebase verification and the preliminary shop lookup are fixtures, while final active OWNER/shop admission and all quota persistence are real. The test application omits unrelated infrastructure lifespan and scheduling; recovery polls are invoked deterministically. This is service-integration evidence, not a full deployment or live-provider test.

Local phase-seven evidence on 2026-11-08: nine cases executed with no failures/errors/skips. The matrix below covers backend behavior under fixtures; it does not close the corresponding integrated FE/provider acceptance criteria.

| Scenario | Evidence / trace |
|---|---|
| JSON → SSE replay and fresh SSE → JSON replay | One generation/debit per key; DB counters are committed when the HTTP reader first sees done; AC-144/146 |
| Last-slot contention and same-key pending replay | Actual 202 JSON/Retry-After before stream headers, a separate new key gets 429, two total model calls; AC-141/144/148 |
| Saved AI success with Core rollback, then Core context and AI process restart | Durable receipt/message retained; a new Core application context/facade settles one debit even while payer is disabled; the Python process is restarted and does not regenerate. A separate Core JVM is not killed/restarted by this test; AC-146/147 |
| Recovery before delayed dispatch | Actual AI cancellation tombstone prevents delayed POST generation; AC-147 |
| Cancellation during a running model | Late answer cannot save after fenced cancellation; no chat rows or debit; AC-143/147 |
| Definitive technical failure | Release once, replay stored failure, no private provider diagnostics; AC-143/144/147 |
| Deleted successful answer | Public 410, no regenerated chat, successful debit retained; AC-144/146 and the approved deletion contract |
| Disabled receipt protocol and internal authentication | Unauthenticated internal read gets 401; unavailable protocol retains reservation until a later durable cancel; AC-147/149 |
| Free exhaustion, fixture paid epoch and exact expiry | Public quota reads follow 300/week and then Free at expiry; counters remain in original buckets. Paid epoch is a SQL fixture, not a SePay purchase/grant acceptance test; AC-140/141/142/148 |

Use JDK 21 and the AI dependencies from the checked-in uv.lock. From backend/ai, run `uv sync --frozen --group dev`; set CORE_TEST_AI_PYTHON to the absolute resulting .venv interpreter path (Scripts/python.exe on Windows, bin/python on Linux/macOS). From backend/core, set CORE_TEST_POSTGRES_URL/USERNAME/PASSWORD to a dedicated disposable loopback PostgreSQL whose database name contains test. Do not use business, staging or production settings. The test creates/drops only core_ai_it_<UUID> schemas, applies V21 and the existing AI migrations there, binds both HTTP servers to loopback on OS-selected ports, and passes only test settings to the child process. It reads no local .env and calls no external model/provider.

```powershell
.\mvnw.cmd --batch-mode --no-transfer-progress '-Dtest=CoreAiQuotaIT' '-DfailIfNoTests=true' test
```

On Linux/macOS use `./mvnw` with the same arguments. The IT suffix keeps this two-language process suite out of ordinary Core Surefire runs; invoke it explicitly in addition to the normal full verify/PostgreSQL gate. Missing settings/interpreter/dependencies fail the explicit run, never skip it. Use fresh report output and inspect TEST-com.smartledger.core.billing.CoreAiQuotaIT.xml: zero failures/errors/skips and all listed cases executed. Locally retained fixture logs under backend/core/target/core_ai_it_<UUID>/ are test-only and ignored by Git; do not turn them into production startup files or expose their control endpoints.
