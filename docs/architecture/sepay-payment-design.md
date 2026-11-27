# SePay fee-payment design — issue #570

This is the phase-one proposal for [#570](https://github.com/miphu2804/smart-ledger/issues/570), based on staging `875fea9` and the owner's decisions in chat on 2026-11-07. Following owner-approved phase-two storage, phase three implements Core payment endpoints and provider ingress with gates off by default; the [Core guide](../../backend/core/docs/sepay-payments.md) owns configuration and local verification. Phase four adds the independent default-off subscription/grant writer and effective-subscription/read-only-quota GETs. Provider configuration remains pending; phase five implements separately gated AI receipts and phase six adds default-off Core quota admission/debit/recovery using V21. [BR-027](../product/business-requirements.md#sepay-570--thiết-kế-nhận-thanh-toán) owns business decisions; [FR-041 and AC-128–136](../product/product-requirements.md#sepay-570--yêu-cầu-và-trạng-thái-triển-khai) own behavior and acceptance; the [proposed API contract](../contracts/api-contracts.md#9-sepay-fee-payments--570) owns HTTP semantics.

## 1. Boundary and verified source constraints

The payer and subscription beneficiary are the same active OWNER user across shops. A payment request does not require a shop. A PAID receipt does not by itself prove the entitlement grant was applied; the [subscription/quota design](subscription-quota-design.md) defines durable fulfillment separately. Free has no collection; the approved catalog is 99,000 VND/1 calendar month and 297,000 VND/3 calendar months, each with 300 AI turns/week; Free retains existing features with 2/day.

Shop `payments` are tied to sales; software fees must not enter `sales`, `payments`, `debts` or `expenses`, or affect stock and shop reports. This proposal adds no AI/Grafana/client Data API access to billing data.

Verified in the reviewed source: V7 and `IdempotencyKeyRepository` require `shop_id NOT NULL` and scope uniqueness by shop/operation/key. Do not invent a shop or borrow the payer's first shop. Billing creation instead reserves its key on its own request row; existing ledger and media idempotency semantics stay intact.

`SecurityConfiguration` currently authenticates unlisted routes using Firebase. Future OWNER routes keep Firebase plus active-user/role guards; only the exact SePay POST route may bypass Firebase and must require independent provider authentication. Do not make a whole billing/webhook prefix public.

Existing `audit_logs` constrain actor/action/entity/shop for current operations. Do not represent a bank webhook as an OWNER action or insert an unsupported billing action. The immutable received transaction and its processing outcome provide the initial reconciliation record; a future manual decision API would require its own authorized scope and audit design.

## 2. Approved storage boundary

These are logical tables and constraints, not executable DDL. The [phase-two schema proposal](billing-schema-proposal.md) now owns the detailed columns, scoped FKs, indexes and fulfillment/quota dependencies. The owner has now approved this schema and migration creation; Core V21 and the separate AI receipt migration implement storage only, with no provider or runtime activation.

| Table | Main fields | Proposed constraints |
|---|---|---|
| `billing_payment_requests` | BIGINT ID; payer user; integration scope; plan code/version, durationMonths and quota-policy snapshot; amount/currency; recipient snapshot; payment code; created/expires/paid timestamps; status; idempotency key, request hash and original creation response | User FK RESTRICT; UNIQUE(integration, payment_code); UNIQUE(payer_user_id, idempotency_key); positive VND amount; expiry after creation; PAID requires paid_at; complete response snapshot before commit |
| `billing_bank_transactions` | BIGINT ID; integration scope; SePay transaction ID; first received timestamp; bank timestamp for reconciliation; direction/amount/recipient/code; nullable matched request; disposition/reason; normalized financial fingerprint | UNIQUE(integration, provider_transaction_id); request FK RESTRICT; ACCEPTED requires request; partial UNIQUE(request_id) WHERE disposition = ACCEPTED; valid financial data and disposition checks |

A matched transaction and its request must belong to the same integration, enforced by a composite FK or equivalent constraint. Integration scope is a stable SePay company plus Test/Live boundary, not a webhook configuration ID; two webhooks for the same provider transaction must collide on the same dedupe key.

Request creation stores the price, offer version and recipient as snapshots. Later configuration changes do not rewrite them. Replaying a key hashes the normalized client body, not current server-side price/version; it returns the original creation response. The 30-minute collection deadline does not expire or delete the creation key. Owner-scoped replay is independent of a later recipient/integration rotation; provider transaction dedupe remains integration-scoped.

The request snapshots the approved plan/version and calendar term instead of depending on mutable catalog values. It has no shop FK or artificial paid term for Free. The authenticated OWNER is the beneficiary; fulfillment links an accepted transaction to a unique grant. Include a durable NOT_STARTED/PENDING/APPLIED fulfillment marker in the schema review, without treating PAID as already ACTIVE.

Do not persist raw webhook bodies, authentication headers, signatures, bank balance or free-form bank descriptions. Keep only necessary matching and reconciliation data with restricted access. Do not expose other senders' transactions to the OWNER. Follow the existing RLS/no-client-grant boundary for new tables; do not grant anon/authenticated/AI access.

No automatic deletion is introduced in the pilot. The owner has assigned an account/reconciliation operator in chat; private access procedures and data retention still need review before Live, and no legal retention period is inferred. Application rollback must retain committed requests and bank transactions.

## 3. Transaction boundaries and concurrency

Creation transaction: check active OWNER → reserve request-scoped idempotency key → resolve approved server offer and recipient → create an unpredictable payment code and immutable snapshots → store original response → commit. A failed transaction leaves no completed request/key. The future code format must match provider configuration; the contract proposes SLP plus twelve uppercase alphanumeric characters with DB uniqueness and collision retry.

Webhook transaction: verify authentication outside the DB transaction → capture a trusted receive instant → acquire a transaction-scoped advisory lock for integration plus provider ID → locate/lock request → classify → insert the immutable bank outcome and mark PAID/PENDING only if eligible → commit. The UNIQUE provider key is the durable final guard; no provisional bank row is mutated past the append-only trigger. Do not call a network provider while holding a request lock.

Same-ID retries wait on the unique reservation and reuse the committed outcome. A same-ID delivery with different financial facts never overwrites history. Two distinct transfers for one request lock the same row: at most one becomes ACCEPTED; preserve the other for reconciliation.

Expiry uses Core's receive time, not the provider signing time or bank occurrence time. Eligible receipt satisfies `createdAt <= receivedAt < expiresAt`. GET may report EXPIRED after the deadline but must not invalidate an in-flight delivery already authenticated and received before that deadline. Its transaction rechecks the persisted PAID state under lock. A fully rolled-back delivery has no accepted durable receipt; a retry first received after expiry enters review even if an earlier attempt arrived before the deadline. A retry received before the deadline can commit afterward without becoming late solely due to processing time.

`status` is PENDING/EXPIRED/PAID. Reconciliation is separate: `reviewRequired` is derived from unresolved matched review transactions, so an extra transfer cannot downgrade a PAID request. An expired request is not reopened automatically. A manual review resolution endpoint is deferred, not an undocumented direct SQL update.

## 4. Provider adapter and future subscription seam

Use SePay bank webhooks rather than assuming its payment-gateway API has the same payload/authentication contract. The [API contract](../contracts/api-contracts.md#9-sepay-fee-payments--570) specifies exact authentication, acknowledgment, duplicate and matching behavior.

The [subscription/quota proposal](subscription-quota-design.md) consumes an accepted transaction ID and the immutable plan snapshot. Acceptance and a pending fulfillment marker commit together; a retriable grant transaction applies calendar-month entitlement and marks APPLIED once. No message bus or volatile callback is required; a PAID request alone is not proof subscription is ACTIVE.

An OWNER status API is enough for FE polling. WebSocket/SSE, checkout UI changes, bank collection for each shop, refunds and recurring debit are outside this phase.

## 5. Disabled-by-default implementation and rollout boundary

The future implementation must fail closed when disabled or required recipient/integration/authentication configuration is missing. Separate accepting new requests from processing outstanding webhooks: stopping new collections must not silently discard money already on its way. If a webhook cannot be durably recorded, fail for retry rather than acknowledging false success.

Phase three adds source-level variables and templates for the independent creation/webhook gates, integration namespace, HMAC secret and recipient; values remain private and gates default false. No Dopbase value or shared configuration was changed. Credential-map generation could not complete because Dopbase CLI is unavailable; the source edge/symptoms were updated without inventing generated pages. During implementation, approve the exact variable names and regenerate the credential map following AGENTS.md. Private environment/domain mappings, credentials and access procedures belong in the private operations knowledge base.

The owner has created a simulated bank account in SePay Test mode and assigned an account/reconciliation operator. A supported Live recipient is not finalized; HMAC, QR configuration, webhook delivery and account matching have not been verified against our backend. Continue provider verification in Test mode; Live testing requires separate account-owner permission and a deliberately chosen small amount, not an automatic 99,000/297,000 VND real charge.

Before staging activation: approve/create the migration, merge the implementation, verify backup/restore and migration procedure, validate provider setup, and name the reconciliation operator. Rollback stops new creation while retaining records and a path to process/reconcile outstanding transfers. Do not drop tables or alter an applied migration checksum.

## 6. Verification plan and outstanding decisions

Future automated verification uses disposable PostgreSQL: active OWNER and cross-user access; rejected extra request fields; Free/unknown offers; price snapshots across configuration changes; replay after PAID/expiry; concurrent request creation; forged HMAC/raw body/timestamp; Test/Live separation; changed financial facts on a duplicate ID; same-ID and different-ID concurrent transfers; missing/unknown/ambiguous codes; outgoing/under/over/extra transfers; late receipt even with earlier bank time; rollback and expiry races. Confirm no sale/payment/debt/expense/stock/role/quota changes.

Phase one checks documents, links, traceability and reviewed source references only. It does not run migration SQL, Maven or a provider credentialed call and cannot mark runtime ACs passed.

Outstanding before shared activation: supported Live recipient setup, private operator access/retention and provider verification. The simulated Test account and operator assignment are confirmed, but Live bank compatibility and enrollment are not. Subscription period, OWNER scope and quotas are approved product decisions in the linked design; phase four implements status/quota reads and the grant worker, while phases five/six implement durable AI receipts and Core quota admission/debit/recovery. All writer gates default off; merged schemas, coordinated FE integration and shared acceptance remain separate rollout requirements.

## 7. Official references

Read on 2026-11-07; provider documentation is not proof the team's account is configured.

- [Webhook delivery](https://docs.sepay.vn/tich-hop-webhooks.html): transaction payload, acknowledgment and conditional retry.
- [Webhook authentication](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc): HMAC over raw bytes and timestamp.
- [Payment-code configuration](https://developer.sepay.vn/vi/sepay-webhooks/cau-hinh-ma-thanh-toan): prefix/suffix recognition and filters.
- [QR parameters](https://developer.sepay.vn/vi/sepay-webhooks/tao-qr-va-form-thanh-toan): recipient, amount and description.
- [Test mode](https://developer.sepay.vn/vi/sepay-webhooks/test-mode/bat-dau-nhanh): simulated provider data separate from Live.
