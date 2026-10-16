# CORE-015: Zalo authentication implementation plan

Status: design and V17/document preparation approved on 2026-10-16; Core implementation locally verified, not
enabled or accepted on staging. The user confirmed real LOGIN through the local helper, not LINK/FE acceptance. This file is a consumer handoff, not a replacement for the canonical
[API contract](../../../docs/contracts/api-contracts.md).

Issue: [CORE-015 #238](https://github.com/miphu2804/smart-ledger/issues/238).
Branch: `feat/zalo-login`.

## Approved boundaries

- Initial implementation was Core-only/no migration. The user subsequently approved
  preparing V17, canonical API/BRD/PRD/AC/design/ERD and an append-only progress entry.
- Run migrations/tests on disposable PostgreSQL schemas only. Do not apply this
  feature branch to a business, staging or production DB; no deploy/runtime setting changes.
- Support login and explicit, safe linking to an existing Firebase account.
- Do not commit, push implementation changes, open a PR or deploy until asked.
- Keep Firebase ID tokens as the only Bearer credential for Core APIs, with the
  existing database role/status/shop checks. Zalo OAuth does not create a Core
  profile or shop; the client still opens `/auth/session` after Firebase sign-in.

Traceability is [BR-009 / BR-022](../../../docs/product/business-requirements.md) →
[FR-010 / NFR-003 / AC-079–084](../../../docs/product/product-requirements.md).
UI remains forthcoming until FE implements and accepts the canonical
[Zalo contract](../../../docs/contracts/api-contracts.md#zalo-core-015). This plan does not claim staging/consumer acceptance.

## Local Core consumer contract (not deployed)

Initial target: web popup flow. Native Android/iOS integration and deep links
are not implied by passing a web test. No frontend implementation in this slice.

| Operation | Request | Result |
| --- | --- | --- |
| `GET /api/v1/auth/zalo/authorize` | `purpose=LOGIN\|LINK`, exact allowlisted `clientOrigin`, client-generated `requestId` and PKCE-style `clientChallenge` | Persist OAuth session and browser cookie, then redirect to Zalo. No Firebase UID or credential in URL. |
| `GET /api/v1/auth/zalo/callback` | Single-valued provider `code/state`, or consent rejection, plus the matching browser cookie | Claim the session once, exchange code/read profile, then deliver a short-lived opaque proof to the exact frontend origin by popup `postMessage`. No access/custom token or proof in a redirect URL. |
| `POST /api/v1/auth/zalo/exchange` | JSON `{ proof, clientVerifier }`; no Bearer required; exact Origin must match the session | LOGIN purpose only. Consume proof, resolve canonical Firebase UID and return `{ firebaseCustomToken, displayName }` with `Cache-Control: no-store`. |
| `POST /api/v1/auth/zalo/link` | Same proof body plus a recent, verified Firebase ID token | LINK purpose only. Link the Zalo identity to the UID from that token. `204` on success; no custom token and no account merge. |

The client keeps the random `clientVerifier` locally for this attempt and sends
only its SHA-256 challenge at authorization. The proof exchange verifies the
challenge in addition to the one-time proof and matching Origin. This is
separate from provider PKCE, whose verifier stays on the backend.

The callback message contains a fixed message type, requestId, purpose and
opaque proof (or a fixed failure code). The frontend must check BOTH
`event.origin` against the configured Core origin and `event.source` against
the popup it opened, then match requestId/purpose. Never broadcast to `*`.
No opener or a severed opener must fail safely and offer restart, not fall back
to placing a secret in the URL.

Use a per-attempt cookie bound to the Core domain: Secure, HttpOnly,
SameSite=Lax, Path=/, short Max-Age. Cookies are only needed during top-level
Core authorization/provider callback. Cross-origin JSON exchange/link relies
on proof plus clientVerifier, so the existing global CORS
`allowCredentials=false` can remain unchanged. Do not globally weaken CORS,
CSRF or Bearer requirements.

## Durable models — V17

Use JDBC and internal records for these new stores. Do not add globally scanned
JPA entities while their tables do not exist: Hibernate validates entities even
when the feature using them is disabled.

### External identity mapping

| Field | Purpose |
| --- | --- |
| `provider`, `provider_app_id`, `provider_subject` | Compound primary/unique key; app ID and subject remain strings. |
| `firebase_uid` | Canonical, stable Firebase account. Several login attempts for the same external identity must resolve the same UID. |
| `created_at`, `updated_at` | UTC timestamps. |

Keep the existing Firebase-only `auth_identities` table and OneToOne model.
Do not require an external mapping to reference a Core profile that has not yet
been created by `/auth/session`. Never use name, picture or unverified email to
find or merge accounts.

### OAuth session

| Fields | Purpose |
| --- | --- |
| `id`, unique `state_hash` | Flow lookup without storing raw state. |
| `browser_binding_hash` | Enforce the browser that initiated authorization. |
| `purpose`, `client_origin`, `client_request_id`, `client_challenge` | Bind handoff to the intended operation and originating frontend attempt. |
| `verifier_ciphertext` | AES-GCM protected provider verifier, authenticated to the flow ID; never plaintext or irrecoverably hashed. |
| `status` | PENDING → EXCHANGING → VERIFIED → CONSUMED, or terminal FAILED. |
| `provider_app_id`, `provider_subject`, `display_name` | App-scoped, bounded, verified provider result needed for mapping and first-login name hint. |
| unique nullable `proof_hash`, `proof_expires_at` | One-time handoff; do not persist raw proof or custom token. |
| `created_at`, `expires_at`, `completed_at` | UTC TTL and lifecycle. |

No provider access/refresh token is persisted. Start with a 5-minute OAuth
session and a proof lifetime at most 90 seconds, bounded by session expiry.
The verifier is cleared on verification/failure and the proof hash on consumption.
Terminal rows retain only their bounded metadata/profile until session expiry;
the scheduled cleanup deletes expired rows, including their remaining profile
data. Cleanup is feature-gated and must not query nonexistent tables when Zalo
  is disabled. Identity mappings are durable and are not TTL session data.

## Concurrency and account safeguards

1. Atomically claim a matching, unexpired PENDING session under its browser
   binding; commit before provider HTTP. Parallel/replayed callbacks cannot both
   exchange the authorization code. Provider timeout is not permission to retry
   the same code blindly; start a fresh flow.
2. Atomically consume a VERIFIED proof for the correct purpose/origin/challenge
   before external side effects. A lost response requires a new flow, not a
   replay that mints additional tokens.
3. Login mapping uses a database unique key and canonical insert/read result.
   Commit the selected UID before Firebase work, so network failure/retry does
   not select a different UID. A DB transaction cannot roll back Firebase.
4. Linking takes the target UID only from a revoked-token-checked Firebase ID
   token with a recent `auth_time` (initially 5 minutes, not merely a fresh
   `iat`). Validate the local account remains ACTIVE/OWNER under a fresh lock.
   Do not bind an arbitrary target UID to a transferable authorization ticket
   before Zalo consent.
5. The same Zalo identity already linked to that UID succeeds with a new valid
   proof. If linked to another UID, return `409 zalo_identity_conflict`. Do not
   move identity mappings, merge users/shops, or delete another Firebase user.
6. Login to a mapped UID must not bypass local/Firebase disabled state. Preserve
   display name, role, status, custom avatar and existing business data. New Core
   accounts still default to OWNER via the existing session service.

## Runtime boundaries

- `zalo.enabled=false` by default; disabled requests return a fixed unavailable
  error without provider calls, new-table queries or new-key requirements.
- Enabled configuration needs app ID, app secret, exact HTTPS callback URL,
  allowlisted frontend origins and a separate 32-byte session encryption key.
  Environment variable names are defined in Core configuration/tests and
  [Core README](../README.md#zalo-authentication-core-015-local-backend-implementation),
  not inferred from the smoke helper's file.
- Missing/unapproved schema is fail-closed, not auto-DDL. The feature must not be
  enabled on an application database until V17 from merged code is applied and rollout is approved.
- Reuse FirebaseAdminConfiguration's existing FirebaseAuth instance; confirm
  signing capability later on the actual runtime. Do not read or rotate live
  secrets for unit tests.
- Fixed official Zalo hosts, explicit timeouts, bounded response bodies, no
  redirects and no automatic code-exchange retry. Sanitize errors.
- Never log provider response bodies, callback query, verifier, proof or custom
  token. Callback HTML uses nonce-based CSP, no-store, no-referrer and no third-
  party scripts/resources. Reverse-proxy access-log redaction is a later
  deployment verification, not proved by Core tests.
- Add abuse controls for public authorization/exchange and TTL cleanup; document
  per-instance versus shared limits honestly. They are not a substitute for
  deployment-level rate limiting.

## Local implementation checklist

- [x] Define Core OpenAPI/DTOs and error matrix, feature-off tests first.
- [x] Configuration validation, cryptographic helpers and fixed-host provider
  gateway; verify request shape and sanitized failure cases with stubs.
- [x] JDBC session/mapping repositories; V17 atomic claim/consume/unique-mapping
  concurrency and migration fresh/upgrade/rollback tests on disposable PostgreSQL.
- [x] OAuth coordinator, authenticated link completion and Firebase adapter;
  account-disable/profile/concurrent linking regression tests.
- [x] Controller/public method boundaries, popup handoff and browser regression
  tests. Existing auth/session and CORS tests must remain green.
- [x] Core README, canonical contract/BRD/PRD/design/ERD and append-only progress
  preparation approved. FE remains unchanged; commit/push still require approval.

## Verification and known gaps

Tests cover cancel/error/timeout, state and cookie mismatch, duplicate
parameters, expired sessions, callback/proof replay and concurrency, wrong
purpose/origin/challenge, invalid/revoked/stale Firebase auth, disabled users,
foreign identity conflicts and unchanged existing account data. Provider tokens
must not appear in callback HTML, redirect locations, logs or error responses.

Local runtime code and tests have been added. Commands, actual results and
remaining gaps are recorded in [verification evidence](zalo-auth.tdd.md).
The earlier 13 smoke-helper tests are not Core feature verification.

## Error matrix

| HTTP | Code | Meaning / recovery |
| --- | --- | --- |
| 400 | `invalid_zalo_request` | Invalid Origin, parameter, proof/verifier shape or extra/duplicate parameter. Fix request; do not guess a target UID. Bean validation/malformed JSON still uses the existing `invalid_request` handler. |
| 400 | `zalo_session_invalid`, `zalo_session_expired` | Wrong browser/purpose/challenge, consumed flow or expiry. Start a fresh flow. |
| Popup payload | `zalo_consent_denied` | User denied consent; nothing is linked or minted. Other post-claim failures also return a fixed popup error instead of credentials. |
| 401 | `zalo_reauthentication_required` | Reauthenticate the existing Firebase account before linking; revocation and recent auth_time are checked. Missing/invalid ordinary Bearer still uses the existing security handler. |
| 403 | `account_disabled`, `zalo_account_not_allowed` | Local/Firebase disabled or ineligible account; no role escalation or reactivation. |
| 404 | `auth_profile_not_found` | Linking requires an existing Core OWNER profile. |
| 409 | `zalo_identity_conflict` | Already bound to another UID; never move/merge automatically. |
| 413 | `invalid_zalo_request` | Completion body exceeds 8 KiB. |
| 429 | `zalo_rate_limited` | Per-instance guard; Retry-After 60 seconds. |
| 503 | `zalo_unavailable`, `zalo_provider_unavailable` | Disabled/bad configuration/missing schema/storage failure, or sanitized external provider/Firebase failure. Resolve configuration/infrastructure, then use a new flow. |

Full login Zalo → Firebase → Core on staging, frontend popup behavior, native
platforms and approved migration/rollout remain separate acceptance work. With
this iteration's scope, do not claim the live app's Zalo button is enabled.

Technical references:

- [Zalo User Access Token V4](https://docs.zaloplatforms.com/docs/Social/social-api/tham-khao/user-access-token-v4)
- [Firebase custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
- [Firebase client custom authentication](https://firebase.google.com/docs/auth/web/custom-auth)
