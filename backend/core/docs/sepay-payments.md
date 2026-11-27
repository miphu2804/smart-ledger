# SePay fee payments — setup and verification

Core phase three implements the authenticated plan catalog, OWNER payment requests/status and HMAC-authenticated SePay ingress for [issue #570](https://github.com/miphu2804/smart-ledger/issues/570). The [API contract §9](../../../docs/contracts/api-contracts.md#9-sepay-fee-payments--570) owns wire behavior; [the approved schema](../../../docs/architecture/billing-schema-proposal.md) owns V21 storage. This guide does not authorize enabling a shared environment, running migrations or transferring real money.

Money acceptance stops at PAID plus fulfillment PENDING. Phase four adds a separate default-off grant worker plus effective-subscription and read-only-quota GETs; enabling that worker can move fulfillment to APPLIED. Phase six adds independently gated [AI quota admission/recovery](ai-chat-quota.md), default off; refunds and manual confirmation remain unimplemented. Existing sales/payments/debts/expenses/stock/role data is unchanged. Defaults keep collection and processing off.

## Configuration

These are source-level variable names; private values, account assignments and environment/domain mappings belong in the private operations knowledge base. Start with [Core .env.example](../.env.example), which carries no usable provider credentials. Java/Spring do not automatically load an env file; load the intended variables into the process as in the [Core setup guide](../README.md).

| Variable | Default | Meaning |
|---|---|---|
| `BILLING_ENABLED` | false | Allows new requests only when the receipt path and recipient are also configured; catalog/status and valid old-key replay remain available when off |
| `BILLING_FULFILLMENT_ENABLED` | false | Independent automatic grant/recovery writer; no provider secret needed, no AI quota enforcement |
| `SEPAY_WEBHOOK_ENABLED` | false | Independent receipt-processing gate; false returns an unsuccessful response, never a fake ACK |
| `SEPAY_INTEGRATION_KEY` | blank | Stable company plus Test/Live namespace, 1–64 ASCII letters/digits/underscore/hyphen; appears in the webhook path and is not a credential |
| `SEPAY_WEBHOOK_SECRET` | blank | Exact HMAC secret, 32–512 characters; backend only, never a SePay API token or Firebase key |
| `BILLING_RECIPIENT_BANK_CODE` | blank | Provider/QR bank identifier, 2–32 ASCII letters/digits; must agree with incoming gateway after case normalization |
| `BILLING_RECIPIENT_ACCOUNT_NUMBER` | blank | Main collection account identifier, 1–64 ASCII letters/digits/hyphen; preserve leading zeros |
| `BILLING_RECIPIENT_ACCOUNT_NAME` | blank | Display name, at most 255 characters and no control characters |

Local Compose forwards these eight variables, with all three gates defaulting false. The secrets template lists the same names. No Dopbase value is updated by this change. The credential-map source adds the Core→SePay connection and code-backed symptoms; environment map generation was attempted but could not complete because the Dopbase CLI is unavailable. Do not invent the resulting inventory or publish private generated pages in Git.

New requests require both gates plus valid recipient/HMAC configuration. Stopping new collections means turning BILLING_ENABLED off while retaining webhook processing, the same integration scope and secret. Do not change integration_key on recipient/secret rotation; outstanding requests match their stored recipient snapshot. This first adapter has one configured integration per process. Migrating companies/modes requires keeping the old ingress/configuration available until issued requests are reconciled; changing a flag or URL is not a migration plan.

Use distinct HMAC secrets per company and Test/Live environment. The provider signature authenticates timestamp/body, not the host or integration path; a namespace alone cannot prove the event's environment if an operator reuses secrets. Separate configuration review is required before enabling Live.

## Provider Test mode preparation

The owner has prepared a simulated bank account. Continue with simulated transactions; do not scan a mock-account QR using a real bank app. A Test mode success does not prove that a chosen Live bank/account type is supported.

After the implementation/migration is reviewed and merged and a shared test endpoint is explicitly authorized:

1. In SePay Test mode, use the simulated main account. This adapter auto-matches main-account transfers only; a nonempty subAccount is retained as RECIPIENT_MISMATCH for review. VA/TKP matching needs a separately reviewed recipient mapping.
2. Add a Test mode payment-code pattern: prefix SLP, minimum and maximum suffix length 12, letters and digits A–Z/0–9. Configure code recognition, but keep the webhook's missing-code/prefix filters off so unknown payments still arrive for reconciliation.
3. Add a JSON webhook for the exact `/api/v1/webhooks/sepay/{integrationKey}` endpoint. Choose HMAC-SHA256 and put its secret into the intended Core process privately; never paste it into chat, a screenshot, FE variables or source. Only this POST route is exempt from Firebase; GET, other prefixes and nested routes remain protected.
4. Enable retry for HTTP status outside 200–299. Core returns 201 with success=true only after commit; an ACK can mean ACCEPTED, REVIEW_REQUIRED or IGNORED_OUTGOING. It does not mean a plan is active.
5. Use an authorized active OWNER session to read the catalog and POST a paid plan/version with a fresh Idempotency-Key. No X-Shop-Id is needed. Keep the returned request ID/code, then create a SePay simulated incoming transaction for its exact amount/code/recipient before the 30-minute deadline.
6. Poll the owned GET status endpoint. The expected result is PAID, paidAt present and fulfillmentStatus PENDING, with no active subscription. Replay the event and confirm no second transaction/term is created. Run review/expiry/error cases before integrated acceptance.

Provider references, verified 2026-11-08: [raw-byte HMAC and signing timestamp](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc), [ACK and optional non-2xx retry](https://docs.sepay.vn/tich-hop-webhooks.html), [payment-code settings](https://developer.sepay.vn/vi/sepay-webhooks/cau-hinh-ma-thanh-toan), [QR URL parameters](https://developer.sepay.vn/vi/sepay-webhooks/tao-qr-va-form-thanh-toan), [simulated events](https://developer.sepay.vn/vi/sepay-webhooks/test-mode/bat-dau-nhanh). Provider/account configuration has not been executed by these local tests.

## Processing and recovery boundaries

OWNER creation accepts at most 4 KiB of JSON and only planCode/planVersion; webhook input is at most 64 KiB of JSON. Duplicate keys and trailing JSON documents are rejected locally without changing global Jackson behavior. HMAC verifies exact raw bytes using the provider timestamp within ±300 seconds; signature timestamps do not decide payment expiry. Do not forward provider secrets from a browser.

The receiver captures Core time after valid authentication, then normalizes lossless IDs and positive whole VND. Financial fingerprints exclude balance, sender text, referenceCode, JSON formatting and delivery signing time. Codes and bank identifiers normalize ASCII case; ambiguous/contradictory candidate codes cannot auto-pay. Raw bodies/signatures/descriptions/balances are not persisted or logged by this feature.

The immutable bank outcome cannot be inserted as a mutable PENDING placeholder. A transaction-scoped advisory lock reserves company/mode plus provider ID, followed by a request-row lock. The durable UNIQUE keys remain final guards. Classification, bank insert and PAID/PENDING change commit together; the controller only ACKs after transaction completion. A same-ID changed-facts conflict retains the first record. Two different transactions on one request produce at most one ACCEPTED plus review for the other.

Both the bank insert and accepted-request update must affect exactly one row. A silent skipped write (for example an unexpected trigger) causes rollback and unsuccessful delivery, never an ACCEPTED/PENDING mismatch or a false ACK.

GET expiry is a projection and makes no expiry write. A pre-deadline authenticated receipt can commit after expiry if it waited for a lock; an attempt that fully rolled back establishes no durable first receipt, so a retry received after expiry requires review even if bank time was earlier. Disabling a payer after issuance does not discard authentic incoming money; it remains PAID/PENDING without changing account status or granting access.

Transactions use lock_timeout 2 seconds, statement_timeout 3 seconds and a Spring transaction timeout of 5 seconds. These do not bound time waiting to acquire a connection from the existing shared pool. Before shared activation, profile pool acquisition/queueing and end-to-end provider latency with the deployed pool limits; local SQL tests do not establish a 5-second HTTP deadline or a load guarantee. Receiver availability, edge request/rate limits, NTP, HTTPS, redacted access logs and restricted SQL-role access remain rollout checks.

## Phase-four subscription fulfillment and reads

`GET /api/v1/billing/subscription` and `GET /api/v1/agent/quota` use Firebase plus the active OWNER guard, no X-Shop-Id, and no-store responses. They read the real effective period even if the writer is paused. Free/expired accounts have null subscription timestamps but retain the last fulfilled plan code. Access becomes Free at exact expiry without a cron mutation. Quota GET is a read-only policy/counter projection and reports enforcementEnabled from AI_QUOTA_ENABLED (default false). Phase six adds the independently gated [chat admission/recovery writer](ai-chat-quota.md) on V21; this read endpoint never mutates usage or starts AI work. Existing technical chat guards remain unchanged.

The worker polls after an initial ten seconds, then every ten seconds after its previous poll completes. A poll scans at most twenty eligible request IDs, one transaction per request, in increasing-ID cursor batches; each scan captures the highest existing request ID when it starts and finishes at that boundary or when the batch contains fewer than twenty candidates. Requests with higher IDs wait for the next scan, so continuous arrivals cannot postpone older retries. Failed requests remain pending for the next scan while the cursor advances past them, and restart rescans pending evidence. The scan excludes disabled/non-OWNER users and unsupported purchase versions. A worker obtains FOR UPDATE SKIP LOCKED on the request, locks its user and current period, then applies the unique accepted-transaction grant. Different requests for one OWNER serialize on that user; same-request workers cannot both grant. Each affected write must return exactly one row; a skipped or failed write rolls back the entire grant attempt.

Only an ACCEPTED transaction joined to the same request, payer and integration can grant. Offer and quota-policy version 1 are supported; future versions require compatible writers first. New/expired accounts start their calendar and seven-day anchors when activation actually applies; active terms preserve their original Vietnam calendar anchor and cumulative purchased months. For example Jan 31 plus a first month clamps to Feb 28, but renewal to two total months ends Mar 31. Early mixed one/three-month renewals keep the current weekly counter and can extend a clipped final window without a new bucket. Unsupported existing epoch policies remain pending instead of silently changing limits. A server clock earlier than an existing activation anchor also leaves renewal pending, preventing overlapping epochs after a backward clock correction. Disabled payers keep received money pending until eligible again; no account/role/ledger changes are made.

After a separately approved Test-mode rollout, first verify PAID/PENDING with the worker off. Enable only BILLING_FULFILLMENT_ENABLED privately, recreate the Core process through the authorized deployment procedure, and verify APPLIED plus one immutable grant and the correct OWNER GET term. Replay/parallel delivery must not add another term. Turning collection or receipt gates off does not disable the grant worker; turning the grant gate off pauses new grants without revoking already-applied terms. Preserve V21 and all financial/period/quota evidence on rollback. Do not enable Live or advertise enforced chat allowances before the later Core–AI/FE protocol and acceptance are complete.

Run SubscriptionPostgresTest for independent-worker races, mixed renewals, leap/month-end arithmetic, exact expiry/new epoch, disabled owners, silent-write rollback/retry, Free midnight and paid final-window counters, unsupported snapshots and unavailable storage. SubscriptionControllerWebTest covers Firebase/no-store/time/error envelopes; SubscriptionPolicyTest covers original-anchor calendar cases; SubscriptionFulfillmentWorkerTest covers failed-row progress and cursor wrap. These are local tests, not provider or FE acceptance. No new migration is added in phase four.

## Restricted reconciliation

An authorized operator may inspect these projections using an approved read-only role; do not expose them through OWNER endpoints or give Grafana/AI bank-table access automatically:

```sql
BEGIN READ ONLY;
SELECT id, integration_key, provider_transaction_id, matched_request_id,
       disposition, reason, amount_vnd, first_received_at
FROM billing_bank_transactions
WHERE disposition = 'REVIEW_REQUIRED'
ORDER BY first_received_at, id;
SELECT id, payment_code, amount_vnd, paid_at, fulfillment_status
FROM billing_payment_requests
WHERE status = 'PAID' AND fulfillment_status = 'PENDING'
ORDER BY paid_at, id;
ROLLBACK;
```

The second list remains pending while the grant gate is off, the payer is disabled/non-OWNER, the snapshot version is unsupported, or a grant attempt is failing. Operators must not set APPLIED or edit quota/expiry manually. When the approved independent grant gate is enabled, retry is automatic; verify the grant and effective subscription after recovery. There is no resolution/refund write endpoint, and append-only triggers intentionally reject mutation of financial evidence. Read-only queries do not certify a legal retention period. Reconciliation with the provider UI and a separately approved decision/audit design is required for manual financial changes.

Rollback stops issuing new requests and preserves ingress/reconciliation for outstanding money. Keep V21 and all records; do not run a destructive DOWN, rewrite a migration checksum or silently ACK unavailable storage. After fixing a temporary error, retry provider delivery using its current signing timestamp or the provider's authorized resend action.

## Local regression

Run against a disposable PostgreSQL only, following [Core verification](verification.md). `SePayPaymentsPostgresTest` exercises real creation/replay, guards, money classification, concurrent same/different provider IDs, scope isolation, post-expiry lock races, rollback, changed snapshots, disabled payers and lack of entitlement/ledger side effects. `BillingControllerWebTest` verifies Firebase boundaries, HMAC-route handling, body/header bounds, no-store responses and safe error projections. The PostgreSQL report gate requires the financial suite to execute; a skip is not a pass.

The payment and phase-four subscription/quota-read APIs are implemented with gates off by default. SePay-to-deployed-Core delivery, FE checkout, read-only operator permissions, real-bank transfers and Live acceptance have not been verified. No new migration is needed beyond the separately approved phase-two V21/AI receipt files; no migration was run against a shared database.
