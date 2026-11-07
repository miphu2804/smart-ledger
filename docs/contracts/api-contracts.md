---
type: API Contract
title: "API Contract — SmartLedger"
description: "Implemented FE ↔ Core and Core ↔ AI endpoint contracts, authorization, errors and stream semantics."
owner: Core, AI and FE owners
status: stable
author: miphu2804
stale_after: 2027-01-05T22:18:48+07:00
---
# API Contract — SmartLedger

| Metadata | Value |
|---|---|
| Status | Implemented source contracts; live enablement, deployment and integrated acceptance are separate verification boundaries |

## Related documents

CORE-018 #409 adds internal telemetry under `FR-036`; it adds no endpoint and changes no JSON or HTTP status of an existing API. Recording successfully authenticated requests, V19/retention and the DAU/MAU SQL belong to the [Core guide](../../backend/core/docs/user-daily-activity.md); a statistics failure does not change the business response and does not replace the mandatory ADMIN audit. The feature is off by default and has not been accepted on staging.

- [PRD](../product/product-requirements.md): the `FR-*` that this contract must cover.
- [Technical design](../architecture/technical-design.md): modules and flows.

## Scope

- Business APIs for the mobile OWNER and the web ADMIN dashboard live under `/api/v1`; the base URL is configured per environment. The domain-verification routes, HTTPS App Link routes and probes are deliberate public exceptions and do not open ledger read access.
- Core ↔ AI APIs live under `/internal/v1` and are not public to FE.
- Do not use the ports in the architecture diagram as the API contract.
- Bifrost and HoneyHive have no public API. FE does not call these components directly.

**Source review:** endpoint availability was checked against `staging` revision `a2766ee3a37e23c0f03fd43383b608c1b2fac898`. The checked-in Core includes stock-in, media, paginated OWNER lists, filtered sales totals, notifications and ADMIN growth. Source availability does not establish live migration, flags, deployment or integrated acceptance. Historical branch evidence belongs to the [Core verification guides](../../backend/core/docs/index.md), not the consumer contract.

**AI and the Agent proxy:** AI has `GET /health` and ten `/internal/v1/agent/*` endpoints (chat, chat/stream, list, detail, rename, delete, `GET`/`PUT` memory/settings, `GET`/`DELETE` memory/items); Core proxies all ten endpoints. Every `/internal/v1/*` path requires `X-Internal-Token`; a missing or wrong token, or AI without `INTERNAL_API_TOKEN` configured, returns `401`, except `/health`, which stays public; `GET /metrics` (request counts and latency per route for Grafana) also needs no token because AI publishes no port and only containers on the same project network, such as Alloy, can call it. Core proxies `/api/v1/agent/*` to these ten paths, sends `X-Internal-Token` and takes `user_id`/`shop_id` from the authenticated OWNER's shop; AI `404` becomes `conversation_not_found`; AI `422` carrying a guardrail code (section 6) keeps `422` and that code in `code`; any other error or timeout becomes `503 ai_unavailable`. An error before the first event of `/api/v1/agent/chat/stream` is JSON, so the client sends `Accept: text/event-stream, application/json`; if it accepts only `text/event-stream`, Core cannot write the JSON error. This source audit does not establish end-to-end acceptance of the FE → Core → AI flow with a real model.

## Request conventions

- Core business APIs use `Authorization: Bearer <Firebase ID token>`; Core issues no access/refresh token of its own. Only the authorize/callback/exchange steps of [Zalo](#zalo-core-015) are a public pre-login step; the custom token returned by exchange is used only to sign in to Firebase and is not a Core Bearer token.
- Auth/me and the shop APIs use the ID in the path and do not need `X-Shop-Id`. Category/Product/Customer/Draft/Sale/Payment/Debt/Expense/Report require `X-Shop-Id` of an `ACTIVE` shop belonging to the active OWNER. ADMIN does not use ledger-write APIs.
- Administration: `PATCH /api/v1/shops/{shopId}/status` and the `/api/v1/admin/*` GETs are for an active ADMIN only; the dashboard uses its own IDs and filters, does not require `X-Shop-Id` and does not open OWNER API permissions.
- Core JSON uses camelCase; IDs are `BIGINT` numbers, money is an integer in VND; quantity uses `numeric(15,3)`. The AI API and the `/api/v1/agent/*` routes that Core forwards keep snake_case.
- Core and the DB handle instants as UTC/`TIMESTAMPTZ`; Core JSON timestamps use ISO 8601 with the Vietnam offset `+07:00`. Input timestamps need an offset (`Z` or `+07:00`); report periods follow `Asia/Ho_Chi_Minh`.
- JSON bodies use `Content-Type: application/json`; the `?` below marks only optional fields and does not implicitly allow explicit null.
- Media upload uses `Content-Type: multipart/form-data` with exactly one `image` part. Core accepts only JPEG/PNG bytes, at most 5 MiB and 1–2048 px; it does not trust the MIME type or file extension. The response URL is read-only; no Cloudinary credential, public ID or file hash is returned.

### Pagination of OWNER lists

This applies to exactly six GETs, `/products`, `/sales`, `/sale-drafts`, `/customers`, `/debts` and `/expenses`, under `/api/v1`. These endpoints **always return an object**, even when no query is sent; there is no `/page` or legacy mode that returns the whole array. Category, payment, shop/session, audit, notification and ADMIN keep their own contracts.

`PageResponse<T> = { items: T[], page, size, totalElements, totalPages }`. Example with no results:

```json
{ "items": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

- Defaults are `page=0`, `size=20`; page ≥ 0, size 1–100, `(long) page * size <= 2147483647`. A page past the end has empty items but still keeps the real totals; the total is the number of records **after tenant and filters**, not an amount of money or a DISTINCT customer count.
- Filtering, searching and sorting happen in the DB **before** pagination. Content and count come from the same snapshot within one request; there is no snapshot guarantee across requests. Insert, archive or status change can shift offset pages even though the order has an ID tie-break.
- Omitting a filter means no filtering on that field, except the ACTIVE condition stated below. `q` is trimmed, empty means no filter, at most 200 characters after trimming; substring search ignores case and Vietnamese diacritics. `%`, `_`, `!` are literal characters, not wildcards controlled by the client. Only products accepts a sort allowlist; the other lists use a fixed order.

| List | Filters besides page/size | Order |
|---|---|---|
| Products | `q`: name/barcode; `categoryId`: positive ID; `stockStatus`: LOW/OUT/NEEDS_RESTOCK. ACTIVE products only. | `sort=ID_ASC` by default; NAME_ASC: name/id ascending; PRICE_ASC: sellingPriceVnd/id ascending; STOCK_DESC: stockQuantity descending, null last, id ascending. |
| Sales | `from`, `to` by soldAt; `saleStatus=CONFIRMED\|VOIDED`; `q`: customer name/snapshot item name or an **exact numeric sale ID** match, not an arbitrary code substring search. Omitting saleStatus returns both statuses. | soldAt descending, id descending |
| Sale drafts | `status=DRAFT\|CONFIRMED\|CANCELLED\|EXPIRED`; omitting the filter returns every status. A DRAFT past expiresAt counts as EXPIRED when filtering, counting and mapping; GET does not write a status change. | id descending |
| Customers | `q`: name or normalized phone number stored in Core; ACTIVE only. Customers with the same name/phone are not merged automatically. | id ascending |
| Debts | `status=OPEN\|SETTLED\|VOIDED`, `customerId`: positive ID; omitting status returns every status. Shop scope is inherited through the sale. The DTO adds no customer name/phone. | id descending |
| Expenses | `period`: the period in section 4; or `from`, `to` by expenseAt; `category`: exact match after trimming, at most 150 characters, empty removes the filter. ACTIVE only. Omitting both period and range returns a page of all time. | expenseAt descending, id descending |

The stock filter considers only tracked=true: OUT when stock is 0, even without a threshold; LOW when stock is positive and ≤ a non-null lowStockThreshold; NEEDS_RESTOCK is LOW or OUT. A fixed threshold of 6 is not used.

`from/to` are ISO 8601 timestamps **with an offset**, for example `2026-10-09T12:30:00+07:00` or `2026-10-09T05:30:00Z`; plain dates and timestamps without an offset are not accepted. Supported years are 1–9998. The range is `[from, to)`: field ≥ from and field < to; either bound may be omitted, and if both are present then from < to **by real instant**, not by comparing local time. This is not an inclusive `fromDate/toDate`. When the UI takes calendar dates, FE converts the start of the Vietnam day and the start of the next day into the two timestamps; encode the `+` sign as `%2B` in the URL. Expenses must not combine period with any from/to bound; the existing period still follows the Vietnam calendar.

Errors for page/size/offset limits, an over-long q, a non-positive filter ID or an invalid range return `400` with a dedicated code:

| List | Code |
|---|---|
| Products | `invalid_product_query` |
| Sales | `invalid_sale_query` |
| Sale drafts | `invalid_draft_query` |
| Customers | `invalid_customer_query` |
| Debts | `invalid_debt_query` |
| Expenses | `invalid_expense_query` |

A wrongly typed param or enum, or a timestamp with a wrong format or missing offset, returns `400 validation_failed` with details naming the field. An unsupported Expenses period returns `400 invalid_report_period`; a period combined with a range returns `400 invalid_expense_query`. Permission, token and shop rules stay as in section 0; ADMIN or an INACTIVE/ARCHIVED shop is not given access.

**FE rollout coordination (#144):** change the client from `T[]` to `PageResponse<T>` and read items; mocks must change too; load more or reset when the shop or filter changes; handle loading, error, end and duplicate IDs. Do not filter or sort only on the loaded page; do not compute revenue/profit, total debt/expense/stock or group debt by customer from one page. Use the appropriate report API; a missing aggregate or DTO needs its own contract and task, and pagination must not be treated as having solved it. Keep the detail APIs to look up a selected record that is not on the current page. An old FE is incompatible and must be coordinated at deploy time before acceptance; see `FR-033`, `AC-059`–`AC-063` and the [technical design](../architecture/technical-design.md#42-owner-list-pagination).

## 0. Error contract and duplicate-write protection

Core returns `{ code, message, details?: [{ field, issue }], traceId }`; details is omitted when empty. A missing or wrong token returns `401 unauthorized`; no Core profile yet returns `404 auth_profile_not_found` (open the session first); a shop owned by someone else returns `403 shop_access_denied`; an INACTIVE shop returns `403 shop_inactive` with the reason. A missing required header returns `400 missing_required_header`; Bean Validation on the body and query/path params of the wrong type (for example an unknown enum, an instant that is not ISO 8601) return `400 validation_failed` with `details[].field` being the param name. Unreadable JSON or an extra field rejected on deserialization returns `400 invalid_request`; it is not merged with Bean Validation. A contested unique barcode returns `409 product_barcode_conflict`; two first-time session opens at the same moment for one Firebase account return `409 auth_session_conflict` to the losing request, and FE calls `POST /auth/session` again; an unrecognized DB error returns `500 internal_error` without exposing internal details. A deadlock or a failure to acquire a DB lock returns `503 resource_busy`: FE resends the exact same request, keeping the same `Idempotency-Key` if there is one.

For the duplicate-barcode error only, ApiErrorDetail has two additional **optional** fields, `productId` and `status`; the service returns the ACTIVE Product of the same shop that holds the code. Ordinary errors do not have these two fields; a 409 from a DB race may omit details. Format and example are in [Barcode CORE-012](#barcode-core-012).

**`Idempotency-Key` is required (1–255 characters, non-empty; trimmed when stored)** on eight POSTs: `/debts/{debtId}/payments`, `/expenses`, `/sales/{saleId}/void`, `/products/{productId}/stock-in`, `/products/{productId}/stock-adjustments`, `/products/{productId}/image`, `/shops/{shopId}/logo`, `/me/avatar`. FE creates a new key for each action and keeps it on retry with the same body/path/file. Expense/repay/void/stock-in/stock-adjustment use the shop + operation key in V7; media uses the SHOP or USER scope in V14 (see the media rules below). A replay returns the original response (`200` for stock-in/stock-adjustment/media, `201` for the other three flows) without repeating the effect. A different user or content returns `409 idempotency_key_conflict`; a completed key that has expired returns `409 idempotency_key_expired`; an empty or over-long key returns `400 invalid_idempotency_key`. The default TTL is 30 days, there is no job that cleans keys yet, and expired keys are not deleted automatically. A business error rolls back the reservation of a money/stock operation. Media reserves separately before the provider and, on failure, releases only the PENDING attempt owned by the current request; see lease/reclaim below.

V7 creates the key table. Draft confirm is protected against duplicates by draftId and does not require a key. The POSTs that create customer/category/product/draft/shop have no key protection yet; do not treat idempotency as covering the whole API. GET does not need a key.

### CORE-019 operation limits

Implemented in the CORE-019 change, off by default through `USER_RATE_LIMIT_ENABLED=false`; enabling on staging or production is not confirmed. When enabled after V20, the quota is stored in PostgreSQL per Core user ID and group, survives restarts and is shared across instances.

| Group | POST routes | Limit |
|---|---|---|
| `MEDIA_UPLOAD` | `/api/v1/me/avatar`, `/api/v1/products/{id}/image`, `/api/v1/shops/{id}/logo` | 10 new successful operations in total per 60 seconds, counted together across all image types and shops |
| `SHOP_CREATE` | `/api/v1/shops` | 5 new successful operations per 24 hours |

A fixed window starts when the server receives a request in the group from an authenticated account with an active Core profile; it does not reset by calendar day. A validation failure does not consume a slot but does not change a window already created. Success means the DB has committed; losing the response after the commit does not refund quota. A PENDING reservation holds a slot temporarily to prevent concurrent overshoot and is not yet a success; a failure releases it, and a dead request is reclaimed by the media lease (300 seconds by default). A late completion whose lease is still valid counts in the window that held the slot and does not move to a new window.

A media replay with the same key and payload still returns the old result when the quota is full, without calling the provider or incrementing the counter or audit; the same key with a different payload still returns `409 idempotency_key_conflict`. Shop creation has no idempotency yet; sending a new POST may create another shop and counts as a new slot. GET/DELETE/OPTIONS, other business APIs and AI chat quota are out of scope; OWNER/ADMIN/DISABLED permissions and ownership still apply.

| HTTP | Code | Client behavior |
|---|---|---|
| `429` | `rate_limited` | Has a positive-seconds `Retry-After` and `Cache-Control: no-store`; wait and retry, keeping the same media Idempotency-Key. When full because of PENDING, the delay takes the earlier of the first lease expiry and the window end; when full of successes, wait until the window ends. |
| `503` | `rate_limit_unavailable` | The quota cannot be proven; no in-memory counter fallback. Do not treat as success; retry in a controlled way. |
| `409` | `rate_limit_reservation_expired` | The old request lost or exhausted its quota lease; start a media retry with the same key to check the result or obtain a new lease. |

Errors use the common envelope `code/message/details?/traceId`. CORS exposes `Retry-After` to allowed origins. This is a quota on successful operations and does not replace the edge layer that guards against spam of failing or replayed requests. The Zalo 30/60-second guard remains per-instance as described separately; handling the native forwarded header only fixes the visible IP and does not turn the Zalo quota into a distributed quota.

## 1. Auth and shop

| Method | Path | Body / request | Response |
|---|---|---|---|
| `POST` | `/api/v1/auth/session` | Token + `{ displayName? }`; the name is required when the profile is first created | `200 AuthSessionResponse` |
| `GET` | `/api/v1/me` | Token | `200 AuthSessionResponse` |
| `POST` | `/api/v1/me/avatar` | multipart `image`, header `Idempotency-Key` required | `200 UserResponse` |
| `DELETE` | `/api/v1/me/avatar` | — | `204` |
| `POST` | `/api/v1/shops` | `{ name, industry, phone?, address? }` | `201 ShopResponse` |
| `GET` | `/api/v1/shops/{shopId}` | ID in path | `200 ShopResponse` |
| `PATCH` | `/api/v1/shops/{shopId}` | `{ name?, industry?, phone?, address? }` | `200 ShopResponse` |
| `POST` | `/api/v1/shops/{shopId}/logo` | multipart `image` + `Idempotency-Key` | `200 ShopResponse` |
| `DELETE` | `/api/v1/shops/{shopId}/logo` | — | `204` |
| `DELETE` | `/api/v1/shops/{shopId}` | Body required `{ archivedReason }` | `204` (archive) |
| `PATCH` | `/api/v1/shops/{shopId}/status` | ADMIN: `{ status: ACTIVE\|INACTIVE, inactiveReason? }` | `200 ShopResponse` |

`AuthSessionResponse = { user, role: OWNER|ADMIN, shops, needsOnboarding }`; user has the form `UserResponse = { id, displayName, email, phone, avatarUrl }`, and shops is a list of ShopResponse. ADMIN has empty shops and needsOnboarding false. Core decides the role on the server; a role the client tries to raise on its own is not accepted. The list of accessible shops comes from `/me`; there is no `GET /shops` or `/shops/current`.

`ShopResponse = { id, name, industry, phone, address, logoUrl, status, inactiveReason, archivedReason }`. name and industry are required on create. PATCH must carry at least one value to update; null is treated as omitted, and an empty phone/address can clear the content. OWNER may edit or archive only an ACTIVE shop; archivedReason is non-empty, at most 500 characters. An INACTIVE shop can still be fetched with GET for its profile and reason, but business APIs are blocked; GET on an ARCHIVED shop returns `404 shop_not_found` and it is excluded from the session list. The logo is a public delivery URL; upload and delete do not use PATCH logoUrl.

When ADMIN sets INACTIVE, a non-empty inactiveReason is required; setting ACTIVE clears that reason. The status endpoint does not accept ARCHIVED and does not reopen an archived shop. An OWNER calling status gets `403 admin_access_required`. A status change writes one `SHOP_INACTIVATED`/`SHOP_REACTIVATED` audit with the ADMIN actor, beforeStatus/afterStatus and the reason; this event serves both the shop history and the ADMIN projection, with no duplicate writes. If the audit cannot be written, it returns `503 admin_audit_unavailable` and rolls back the status/reason change (see [Admin dashboard](#7-admin-dashboard--implemented-in-core)).

Core maps `auth_identities.provider_subject` by Firebase UID. Linking of Firebase providers happens in Firebase; Zalo alone uses an external mapping and proof of ownership of both accounts as described in the section below. Do not infer real UI or provider testing merely from Core authenticating a token.

Covers `FR-010`, `FR-011`, `NFR-003`; the dashboard `FR-022` still needs integration.

### Zalo CORE-015

**Status:** WEB authorize/callback/exchange and LINK are implemented in the audited Core source with V17. `ZALO_ENABLED=false` is the code default. Historical local LOGIN evidence is retained in the Core guide; live provider behavior, configuration and integrated acceptance were not audited.

| Method | Path | Request | Response / permission |
|---|---|---|---|
| `GET` | `/api/v1/auth/zalo/authorize` | Required query `purpose=LOGIN\|LINK`, `clientOrigin`, `requestId`, `clientChallenge` | Public; `302 Location` to Zalo, with a cookie binding the attempt; returns no token |
| `GET` | `/api/v1/auth/zalo/callback` | Query `state`, one of `code` or `error`, `code_challenge?`; the cookie for the right attempt | Public for the provider; a WEB session returns `200 text/html` that posts a message to the opener; an ANDROID session follows CORE-016 below |
| `POST` | `/api/v1/auth/zalo/exchange` | Header `Origin` with exactly one value; `{ proof, clientVerifier }` | Public; LOGIN only, `200 { firebaseCustomToken, displayName }` |
| `POST` | `/api/v1/auth/zalo/link` | Same body/Origin; recent Firebase ID token as Bearer | ACTIVE OWNER only; LINK only, `204`, no token response |

These four paths do not use `X-Shop-Id`, `Idempotency-Key` or a client-supplied target UID. The query accepts only the names above and one value per name; the body accepts no extra fields. The provider ID/subject is an internal string, not a numeric Core ID.

- `clientOrigin`: an exact HTTPS origin in the allowlist, with no trailing slash, path, query or wildcard; it is not the callback URL. FE generates a `requestId` of 16–100 characters from `[A-Za-z0-9_-]`, keeps a random 32-byte `clientVerifier` in base64url (43 characters), and sends only its SHA-256 base64url as `clientChallenge` (43 characters). This is a separate client binding; the provider PKCE is kept private by Core.
- The per-attempt cookie `__Host-sl_zalo_<opaque>`: Secure/HttpOnly/SameSite=Lax/Path=/, no Domain, expires with the session (300 seconds by default). The callback must return to the exact Core hostname that opened authorize; do not redirect a local callback to the VPS. Cancelling consent goes through a callback with `error`; only a callback whose claim has completed returns a fixed error HTML. A wrong parameter, state or cookie before the claim returns JSON 4xx under the common convention.
- The popup message always has `{ type: "smartledger:zalo", requestId, purpose, proof, error }`; `proof` is a 43-character string on success and null otherwise; `error` is a fixed code or null. FE checks at the same time `event.origin` against the Core origin, `event.source` against the popup it opened, requestId and purpose. Do not use `*`; do not keep the token or proof in the URL, logs or storage. With no opener, close the page and start a new attempt; an incompatible `noopener`/COOP can break the flow.
- The proof lasts at most 90 seconds by default and does not exceed the session expiry; it is single-use and bound to the right purpose, origin and challenge. The JSON body is at most 8 KiB; `proof` and `clientVerifier` are both required and non-null, exactly 43 base64url characters. A replay or lost response starts a new attempt; do not resend the callback code on your own. Auth responses carry `Cache-Control: no-store`; the callback has a CSP nonce and no-referrer.
- LOGIN: the client uses `firebaseCustomToken` with Firebase custom sign-in, then uses the **Firebase ID token** to call `/api/v1/auth/session` (passing the name hint on first creation). `displayName` is a verified name string, not a command to rename the profile. The hint from Zalo is at most 255 characters; the session request currently limits it to 150 characters, so the client must check and let the user edit the name before sending, and must not overwrite an existing profile name. LOGIN does not create a Shop by itself; `needsOnboarding` continues to decide the shop-creation step.
- LINK: the user must reauthenticate the existing account; Core re-verifies the ID token with a revocation check and `auth_time` within 300 seconds, compares the UID with the principal and locks/checks a local ACTIVE OWNER. The same Zalo/app has only one canonical UID; a different UID returns a conflict, with no move, merge or delete. To keep the old account, LINK before a separate Zalo LOGIN; nothing is matched by name, email or photo. There is no unlink, merge or account-migration API in this batch.
- Role, status, custom avatar and shop data are preserved; a mapped DISABLED/ADMIN account gets no custom token through this OWNER flow. A Zalo access token or Firebase custom token is not accepted as a business Bearer. Core does not sync the Zalo photo or store Zalo access/refresh tokens.
- The public abuse guard hashes the path/socket IP with a per-instance salt into 4096 fixed buckets, at most 30 requests per 60-second window per bucket; keys that collide in the hash share quota and may get a 429 sooner. There is no threshold that blocks all new keys because the map is full, nor any bucket deletion that resets quota. `Retry-After: 60` on 429. This is a per-instance bounded guard and is no guarantee against DDoS; X-Forwarded-For is not trusted directly. Proxy/log redaction and a limit shared across instances are rollout conditions, not an SLA from local tests.

| HTTP | Code / client handling |
|---|---|
| `400` | `invalid_zalo_request`, `zalo_session_invalid`, `zalo_session_expired`; fix the request or start a new attempt. Bean Validation and JSON/deserialization use their own codes per [section 0](#0-error-contract-and-duplicate-write-protection). |
| Popup | `zalo_consent_denied` or a fixed error after the claim; do not treat `200 HTML` as a successful sign-in. |
| `401` | `zalo_reauthentication_required`; reauthenticate before LINK. A missing or wrong Bearer still uses the existing `unauthorized` handler. |
| `403` | `account_disabled`, `zalo_account_not_allowed`; do not reopen or elevate the account on your own. A disallowed CORS origin is rejected by Spring before the controller. |
| `404` | `auth_profile_not_found` when LINK has no Core profile yet. |
| `409` | `zalo_identity_conflict`; direct the user to keep the account that currently owns it, with no automatic merge. |
| `413` / `429` | `invalid_zalo_request` / `zalo_rate_limited`; reduce the body or wait, then start again. |
| `503` | `zalo_unavailable` (feature off/config/schema/storage), `zalo_provider_unavailable` (provider/Firebase); do not show the raw provider body. |

V17 and the rollout/recovery order are in the [ERD description](../architecture/erd-description.md#zalo-core-015-v17); configuration is in the [Core README](../../backend/core/docs/zalo-auth-implementation-plan.md#runtime-configuration). Do not put `ZALO_MANUAL_*`, tunnels, test pages or JSON paths from a dev machine onto the VPS. Covers `BR-022` → `FR-010`/`NFR-003` → `AC-081`–`AC-086`; consumer and staging acceptance are separate.

### Zalo Android CORE-016

**Status:** Native handoff and V18 are implemented in the audited Core source. Native is default-off; shared-DB migration, runtime enablement, provider/device behavior and integrated acceptance were not audited. A checked-in staging sample does not establish any of those states.

| Method | Path | Request | Response / permission |
|---|---|---|---|
| `GET` | `/api/v1/auth/zalo/native/authorize` | Required query `nativeClientId`, `purpose=LOGIN\|LINK`, `requestId`, `clientChallenge` | Public; per-attempt cookie and `302` to Zalo Web OAuth; accepts no return URL or UID |
| `GET` | `/api/v1/auth/zalo/callback` | Same parameters/cookie as CORE-015; the channel is chosen from the persisted session | A valid ANDROID session returns `302` to the fixed HTTPS return target with a fragment; a wrong state/cookie/context does not redirect |
| `POST` | `/api/v1/auth/zalo/native/exchange` | JSON `{ nativeClientId, requestId, handoffReference, clientVerifier }`; Origin not required | Public; LOGIN only, `200 { firebaseCustomToken, displayName }`, `Cache-Control: no-store` |
| `POST` | `/api/v1/auth/zalo/native/link` | Same JSON; recent Firebase ID token as Bearer | ACTIVE OWNER; LINK only, `204`, mints no token |
| `GET` | `/mobile/auth/zalo/complete` | Fragment handled by the APK/browser, not sent to the HTTP server | Unauthenticated fallback HTML; no-store/no-referrer/CSP nonce; removes the fragment from history, shows a fixed link only for a valid payload |
| `GET` | `/.well-known/assetlinks.json` | No business parameters | Android domain-association JSON for the package/certificate explicitly configured for the environment; a valid configuration may be served even when native login is off |

- Each deployment configures one `nativeClientId` and one return target. The ID, package and certificate are public metadata and **not authentication proof**. The return URL is an exact HTTPS URL on the same origin as the Core callback, with path `/mobile/auth/zalo/complete` and no query, fragment or userinfo; the client does not choose the target. Staging/production configuration and certificates are in the [Core guide](../../backend/core/docs/zalo-android-preparation.md#deployment-specific-configuration).
- The APK separately generates a random `requestId` of 16–100 characters from `[A-Za-z0-9_-]` and a random 32-byte `clientVerifier` in unpadded base64url (43 characters). At authorize it sends `clientChallenge = BASE64URL(SHA256(ASCII(clientVerifier)))`; the verifier is kept only for the attempt inside the APK and is not placed in a URL or log. The other provider PKCE is kept encrypted by Core. The query/body accept no extra fields or multi-valued query; X-Shop-Id and Idempotency-Key are not used.
- The callback uses the same HTTPS hostname that opened authorize; Core checks state, browser cookie, provider app, client, target and expiry, and claims atomically before provider I/O. Success redirects to `#nativeClientId=...&requestId=...&purpose=LOGIN|LINK&handoffReference=...`; a consent or provider error after the claim uses `error=<fixed_code>` instead of the reference. The App Link carries no provider code or token, Firebase token, client verifier or WEB proof. The `302` or the fallback page does not by itself prove a successful sign-in.
- The reference is a random 43-character base64url string, and the DB stores only its hash. The configured TTL is 15–90 seconds and does not exceed the session (300 seconds by default). Consume succeeds only once, with the reference hash, client verifier challenge, client, request, purpose, channel, target and provider app all matching and both expiries not yet reached; the reference is not exchanged for a WEB proof. The APK must check the pending host/path/client/request/purpose exactly before sending the completion body. Cancellation, expiry, replay, a lost verifier or an error after consume must start a new attempt.
- LOGIN/LINK keep the CORE-015 account rules: they share the app-scoped/canonical UID mapping, no merging by name or email, no editing of profile, role, status or avatar, and no shop creation. LOGIN exchanges the custom token through Firebase for an ID token and then calls `/auth/session`; LINK checks revocation + auth_time ≤300 seconds + UID equal to the principal + local ACTIVE OWNER, an identity with a different UID returns 409, and the mapping is not moved. Business APIs still accept only a Firebase ID token. No Zalo access/refresh token is stored.
- Native requires no forged Origin, does not loosen WEB CORS and does not waive Bearer for LINK. Keep the bounded per-endpoint/socket-IP guard of CORE-015 (30 requests/60 seconds/bucket; 8 KiB body); proxy/edge throttling and log redaction are needed before rollout.

| HTTP / where received | Code / handling |
|---|---|
| `400` | `invalid_zalo_request` for a wrong parameter; `zalo_session_invalid` for a wrong, expired or replayed handoff. Bean Validation `validation_failed` and JSON/extra field `invalid_request` per section 0. Start a new attempt; do not retry the provider code. |
| Fixed error in the fragment | `zalo_consent_denied`, `zalo_session_invalid`, `zalo_session_expired`, `zalo_provider_unavailable`, `zalo_unavailable`; no reference or token on error. |
| `401` / `403` / `404` / `409` | The same LINK/account codes as CORE-015: `zalo_reauthentication_required`, `unauthorized`, `account_disabled`, `zalo_account_not_allowed`, `auth_profile_not_found`, `zalo_identity_conflict`. |
| `413` / `429` | `invalid_zalo_request` / `zalo_rate_limited`; reduce the body or wait according to Retry-After. |
| `503` | `zalo_unavailable` when off or when config/schema/storage is missing; `zalo_provider_unavailable` when the provider/Firebase fails; the raw upstream response is not exposed. |

The schema is managed by the real migration `V18__add_zalo_android_handoff.sql`, and the old native fixture has been removed: [ERD V18](../architecture/erd-description.md#zalo-android-core-016-v18). Do not migrate the shared DB from a feature branch. The [approved staging configuration](../../backend/core/config/zalo-native-staging.env.example) sets native to true but is not loaded by the runtime on its own; copy it to the staging VPS only after merge/V18, following the [runbook](../../backend/core/docs/zalo-android-preparation.md#staging-activation-after-merge). Enabling staging to accept `AC-092` does not mean FE/APK acceptance or permission to enable production. Implementation and testing details are in the [technical design](../architecture/technical-design.md#zalo-android-core-016).

## 2. Category, Product and Customer

**CORE-012 #163/#164:** lookup, normalization and conflict details are implemented in Core. V16 enforces ACTIVE-only barcode uniqueness; current runtime migration and integrated acceptance require separate evidence.

The APIs below require a Bearer token and `X-Shop-Id`. GET list/detail return only ACTIVE records; DELETE is an archive and does not delete related history.

### 2.1. Category

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/v1/categories` | `{ name }` | `201 CategoryResponse` |
| `GET` | `/api/v1/categories` | — | `200 CategoryResponse[]` |
| `GET` | `/api/v1/categories/{categoryId}` | — | `200 CategoryResponse` |
| `PUT` | `/api/v1/categories/{categoryId}` | `{ name }` | `200 CategoryResponse` |
| `DELETE` | `/api/v1/categories/{categoryId}` | — | `204` |

name is non-empty, at most 150 characters; not unique. A category groups products within a shop and does not classify shops. Archiving while ACTIVE products remain returns `409 category_has_products`.

`CategoryResponse = { id, shopId, name, status, createdAt, updatedAt }`.

### 2.2. Product

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/v1/products` | Product create as below | `201 ProductResponse` |
| `GET` | `/api/v1/products` | page/size, q, categoryId, stockStatus, sort; see the pagination convention | `200 PageResponse<ProductResponse>` |
| `GET` | `/api/v1/products/lookup` | required query `barcode`; [exact match](#barcode-core-012) | `200 ProductResponse` (CORE-012 on the branch) |
| `GET` | `/api/v1/products/{productId}` | — | `200 ProductResponse` |
| `PATCH` | `/api/v1/products/{productId}` | Optional fields as below | `200 ProductResponse` |
| `POST` | `/api/v1/products/{productId}/image` | multipart `image` + `Idempotency-Key` | `200 ProductResponse` |
| `DELETE` | `/api/v1/products/{productId}/image` | — | `204` |
| `POST` | `/api/v1/products/{productId}/stock-in` | `{ quantity, reason? }` + `Idempotency-Key` | `200 ProductResponse` (exists on the stock-in branch) |
| `POST` | `/api/v1/products/{productId}/stock-adjustments` | `{ quantity, reason }` + `Idempotency-Key` | `200 ProductResponse` (CORE-021; on the branch, FE/staging acceptance not done) |
| `DELETE` | `/api/v1/products/{productId}` | — | `204` |

Create: `{ categoryId?, name, barcode?, unit, sellingPriceVnd, costPriceVnd?, tracked, stockQuantity?, lowStockThreshold? }`. `imageUrl` is not a new input, and a non-empty raw URL value is rejected; use POST image after creating the Product. name and unit are non-empty (max 255/50), sellingPriceVnd and costPriceVnd if present are ≥ 0; barcode is max 100 after normalization. categoryId if present must be ACTIVE in the same shop. tracked=true requires stockQuantity ≥ 0; tracked=false does not accept a non-null stockQuantity. After V16, barcode is unique only among ACTIVE Products of the same shop; archiving frees the code but keeps history. Another shop can use the same barcode, and null or empty means no barcode. DBs at V1–V15 still keep uniqueness including ARCHIVED, so V16 must be migrated through the process before rolling out code reuse.

PATCH accepts only `{ categoryId?, name?, barcode?, unit?, sellingPriceVnd?, costPriceVnd?, tracked?, lowStockThreshold? }`: an omitted field is kept; explicit null is allowed only for categoryId/barcode/costPriceVnd/lowStockThreshold. `imageUrl` (even null) returns `400 product_image_url_unsupported`; use the image endpoint. null is not allowed for name/unit/sellingPriceVnd/tracked. **stockQuantity is not accepted, even as null**, and returns `400 invalid_request` with the field detail and a message to use stock-in. Changing false→true initializes stock to 0, true→true keeps the current stock; tracked=false clears stock. PATCH/archive lock the product row so concurrent checkout/void/stock-in do not overwrite stock. Create and responses still carry stockQuantity.

Stock-in is for an active OWNER only, an ACTIVE shop owned by that OWNER, and an ACTIVE product of the same shop with tracked=true. quantity is required > 0, at most 12 integer digits and 3 decimals; reason is optional/null, at most 500 characters, trimmed, and blank becomes null. An invalid body returns `400 validation_failed`; a non-positive or malformed productId returns `400 invalid_product_id`; a missing, other-shop or ARCHIVED product returns `404 product_not_found`; a product without stock tracking returns `409 product_stock_in_unavailable`. A total stock above `999999999999.999` returns `409 product_stock_overflow` and changes no data.

#### CORE-021 stock decrease adjustment

`POST /api/v1/products/{productId}/stock-adjustments` requires a Firebase Bearer, `X-Shop-Id`, `Idempotency-Key` and the body `{ quantity, reason }`. Only an ACTIVE OWNER of an ACTIVE shop may decrease the stock of an ACTIVE Product of the same shop with `tracked=true`; `quantity` is a positive decrease amount (not the actual stock count), at most 12 integer digits and 3 decimals. `reason` is required, non-empty, at most 500 characters before trimming. Stock 10 decreased by 2.125 returns `200 ProductResponse` with stock 7.875; decreasing to 0 is valid. No enum-type reason category is added, and stock cannot be increased through this endpoint.

A missing or wrong token returns 401; an OWNER who is not the owner, an ADMIN, or an INACTIVE shop gets 403 under the existing permission check. A missing header returns `400 missing_required_header`; a wrong body returns `400 validation_failed`; a wrong ID returns `400 invalid_product_id`; a missing, other-shop or ARCHIVED Product returns `404 product_not_found`; a product without stock tracking returns `409 product_stock_adjustment_unavailable`; a decrease exceeding stock returns `409 product_stock_insufficient`. Stock is not clamped to 0 and never goes negative.

Core reserves the key by shop + operation `PRODUCT_STOCK_ADJUSTMENT`, locks and refreshes the Product, then deducts stock. The hash covers the product ID, the normalized quantity (2 and 2.000 are equivalent) and the trimmed reason. A retry with the same key, user and content returns the original `200 ProductResponse` snapshot even if the current stock has changed; changing product, quantity or reason returns `409 idempotency_key_conflict`, an expired key returns `409 idempotency_key_expired`, and an empty key or one over 255 characters returns `400 invalid_idempotency_key`. Stock-in and adjustment have separate operations.

One `STOCK_ADJUSTED` has source `STOCK_ADJUSTMENT`, a positive quantity and beforeStock/afterStock; the reason and key are in separate audit fields. Stock, audit, LOW_STOCK/OUT_OF_STOCK reconciliation and the idempotency result are in the same transaction; a failure rolls everything back, and a replay does not deduct stock or emit an alert again. It creates no sale/draft/expense/payment/refund/debt and changes no selling or cost price. No migration, environment variable, ledger table or separate history API is added; history uses the existing OWNER audit. FE keeps the key on a retry of the same action and creates a new key for a different decrease; do not send stockQuantity through PATCH, and do not let AI call writes on its own. Traceability `BR-025` → `FR-038` → `AC-111`–`AC-115`; currently on the `feat/core-stock-adjustment` branch, FE/staging acceptance not done.

#### Existing stock-in rules

Core reserves the key with operation `PRODUCT_STOCK_IN` and then locks the product row; new stock = current stock + quantity. The hash covers the product ID, the normalized quantity (5 and 5.000 are equivalent) and the normalized reason. A retry of the same request returns the **ProductResponse snapshot at the time of entry**, not the current stock after other operations. It writes one `STOCK_ADJUSTED` audit with source `STOCK_IN`, quantity/beforeStock/afterStock, reason and key; adding stock, the audit and the replay result are in the same transaction. It creates no expense/payment/debt/sale and does not update cost price; there is no new stock-in receipt/ledger and no negative entry; a standalone stock decrease uses the separate CORE-021 endpoint. AI suggestions do not call write operations on their own.

**Mobile coordination before integration:** remove stockQuantity from the PATCH DTO/payload, even when turning tracking off; false→true receives stock 0 and then calls stock-in when the OWNER receives goods. Add an API/UI to enter quantity/reason, keep the key on retry and refresh the product from the result or a new GET. Mocks must also follow the new contract; this pass did not change FE and has no end-to-end acceptance.

`ProductResponse = { id, shopId, categoryId, name, barcode, imageUrl, unit, sellingPriceVnd, costPriceVnd, tracked, stockQuantity, status, createdAt, updatedAt, lowStockThreshold }`.

`lowStockThreshold` is nullable, non-negative, at most 12 integer digits and 3 decimals. Create with it omitted or null sets no threshold; PATCH omitted keeps it, null turns LOW_STOCK off. tracked=false can store a threshold but does not alert; turning tracking on initializes stock to 0 and OUT_OF_STOCK. A threshold of 0 alerts only on out of stock. Product/stock changes reconcile notifications in the same transaction per section 8; the UI's threshold of 6 is not applied automatically.

Product/logo media is for the OWNER of an ACTIVE shop only. The write transaction relocks and checks that the Shop/Product is still ACTIVE; avatar checks that the user is ACTIVE; an INACTIVE shop error carries `inactiveReason` when there is a reason. DELETE is a no-op `204` when there is no custom image, even when media is disabled; if there is a reference and media is disabled, it returns `503 media_unavailable` and changes no DB, audit or job. When enabled, DELETE enqueues deletion of the old asset after commit; archiving does not delete media. Avatar is only for the ACTIVE user themselves; the authenticated URL is created when the response is built. `avatar_url` keeps the Firebase fallback and continues to sync; DELETE avatar only drops `avatar_public_id`, and the next read returns to the fallback. If a Cloudinary avatar exists but media is disabled, the session still succeeds with avatarUrl null. Input errors: `400 image_required`, `413 image_too_large`, `415 image_type_invalid`, `400 image_dimensions_invalid`.

All three uploads require `Idempotency-Key`. V14 `media_upload_keys` uses the SHOP scope for Product/logo and the USER scope for avatar. A PENDING reservation commits before the provider; the same key/file already running returns `409 media_upload_in_progress`, and a different payload returns `409 idempotency_key_conflict`. A PENDING whose lease has expired is reclaimed atomically with a new token; the old token cannot complete or release the new attempt. The final write locks the reservation, checks the lease, then stores the entity/audit/replay in the same transaction. Cloudinary uses a public ID determined by target/key/file and `overwrite=true`; a completed replay does not upload or add an audit. An avatar replay stores an internal snapshot and recreates the delivery URL. The authenticated URL is signed but has no delivery TTL yet; do not treat it as a self-expiring URL. Cleanup uses the `SKIP LOCKED` job lock and the public-ID lock together with the writer; it skips an asset attached to an entity and defers an asset with a PENDING upload whose lease is still valid. COMPLETED does not revert to PENDING. V13/V14 must be migrated before the runtime on the shared DB; FE/staging UAT is not confirmed.

### Barcode CORE-012

Create/PATCH/lookup trim leading and trailing Unicode whitespace, including CR/LF/TAB from a scanner. After trimming, the code is at most 100 Unicode code points (not UTF-16 code units, bytes or grapheme clusters); a character outside the BMP counts as one code point, matching the PostgreSQL `varchar(100)` limit. It contains no whitespace or control characters inside. Letters, case, diacritics and leading zeros are preserved: `ABC-123`, `123`, `abc-123` and `00123` are different codes. Historical barcodes are not bulk-normalized; lookup matches the stored code. `%`/`_` are literal characters, not wildcards. Invalid input returns `400 validation_failed` with details having the field barcode.

- Create with it omitted, null or a whitespace-only string stores null. PATCH omitted keeps it, null/blank removes the code; PATCH with the Product's own code succeeds. No entity field or barcode table is added.
- `GET /api/v1/products/lookup?barcode=ABC-123` returns a single ProductResponse, with no page or array and without reading the whole catalog. A missing or empty barcode is invalid. A Bearer and X-Shop-Id are required, an ACTIVE OWNER account, and an ACTIVE shop owned by that OWNER; permission is checked before the Product query, per section 0. Lookup reads only ACTIVE Products: a missing code, a code only on an ARCHIVED Product, or another shop's code returns `404 product_not_found`. An ARCHIVED Product is not returned for the UI to restore; there is no restore API.
- Create/PATCH check duplicates only among ACTIVE Products of the same shop, and PATCH excludes the ID being edited. If the service detects a duplicate, `409 product_barcode_conflict` returns the example below. The two extra fields are optional on ApiErrorDetail only; other errors keep `{field, issue}`. No ID from another shop is returned.

```json
{
  "code": "product_barcode_conflict",
  "message": "The product barcode is already in use in this shop.",
  "details": [{ "field": "barcode", "issue": "already_in_use", "productId": 123, "status": "ACTIVE" }],
  "traceId": "server-generated-trace-id"
}
```

`message` is a description; FE branches on code/field. If two writers pass the precheck at the same time, the V16 partial unique index blocks the losing write; the handler maps `uq_products_shop_barcode_active` (and the old constraint during the upgrade period) to the same 409, **possibly without details**. No extra query is made on a DB transaction that has already failed in order to fill in details. A lookup that sees 404 does not guarantee that the next create succeeds; FE must handle 409 and may look up again. Create/PATCH have no replay guarantee through Idempotency-Key.

**Rollout:** V16 is reviewed and merged into staging before the migration owner runs it on the shared DB; do not run a feature-branch migration against the business DB. The transactional index build happens in a maintenance window that stops catalog writes; it is not zero-downtime. Archiving and reuse do not edit the productId or snapshots of old sales and drafts. FE #162/#165 must use lookup, keep the code characters unchanged, not create a fake Product when the API fails, and handle a 409 with or without details; the UI and cart are still decided by the team and accepted separately. See `FR-034`, `AC-064`–`AC-067` and the [Core guide](../../backend/core/docs/verification.md#catalog-and-barcode-verification).

### 2.3. Customer


| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/v1/customers` | `{ name, phone? }` | `201 CustomerResponse` |
| `GET` | `/api/v1/customers` | page/size, q; see the pagination convention | `200 PageResponse<CustomerResponse>` |
| `GET` | `/api/v1/customers/{customerId}` | — | `200 CustomerResponse` |
| `PUT` | `/api/v1/customers/{customerId}` | `{ name, phone? }` | `200 CustomerResponse` |
| `DELETE` | `/api/v1/customers/{customerId}` | — | `204` |

name is non-empty (max 150), phone is optional (max 30) and normalized. Name and phone are not unique, and customers are not searched or merged automatically. FE selects by customerId from the list; there is no separate search API yet. Archiving a customer does not delete sales or debts and does not prevent collecting historical debt.

`CustomerResponse = { id, shopId, name, phone, status, createdAt, updatedAt }`.

Covers `FR-009`, `FR-013`, `FR-016`, `FR-030`, `AC-044`–`AC-048`.

## 3. Draft → Sale → Payment → Void/Refund

A sale is an internal sales record, **not an electronic invoice**. There is no `POST /api/v1/invoices` or direct POST for a sale. Only confirm creates the sale, items, payment and debt and deducts tracked stock, in one transaction.

| Method | Path | Request | Response |
|---|---|---|---|
| `POST` | `/api/v1/sale-drafts` | Draft body as below | `201 SaleDraftResponse` |
| `GET` | `/api/v1/sale-drafts` | page/size, effective status; see the pagination convention | `200 PageResponse<SaleDraftResponse>` |
| `GET` | `/api/v1/sale-drafts/{draftId}` | — | `200 SaleDraftResponse` |
| `PUT` | `/api/v1/sale-drafts/{draftId}` | Replace the whole draft/items | `200 SaleDraftResponse` |
| `DELETE` | `/api/v1/sale-drafts/{draftId}` | Cancel a still-editable draft, keep history | `204` |
| `POST` | `/api/v1/sale-drafts/{draftId}/confirm` | No body/key | `201 SaleResponse` |
| `GET` | `/api/v1/sales` | page/size, from/to, saleStatus, q; see the pagination convention | `200 PageResponse<SaleResponse>` |
| `GET` | `/api/v1/sales/summary` | q, saleStatus, from/to; not paginated; on the CORE-014 branch | `200 SaleSummaryResponse` |
| `GET` | `/api/v1/sales/{saleId}` | — | `200 SaleResponse` |
| `GET` | `/api/v1/sales/{saleId}/payments` | — | `200 PaymentResponse[]` |
| `GET` | `/api/v1/sales/{saleId}/payments/{paymentId}` | The payment ID must belong to the sale | `200 PaymentResponse` |
| `POST` | `/api/v1/sales/{saleId}/void` | Void body + Idempotency-Key | `201 SaleVoidResponse` |
| `GET` | `/api/v1/sales/{saleId}/refund` | — | `200 SaleRefundResponse` |

### Draft and confirmation

Example mixing catalog items and free-form items:

```json
{
  "discountVnd": 0,
  "initialPaidVnd": 35000,
  "initialPaymentMethod": "CASH",
  "items": [
    { "productId": 3, "quantity": 1, "unitPriceVnd": 25000 },
    { "productName": "Món tùy ý", "unit": "phần", "quantity": 1, "unitPriceVnd": 10000 }
  ]
}
```

- items is non-empty; quantity > 0; unitPriceVnd ≥ 0 (the line's selling price is chosen by the request and is not required to equal the catalog price). lineTotalVnd is rounded HALF_UP to VND; the total after discount must be > 0.
- When productId is omitted or null, a non-empty productName/unit is required (max 255/50); no Product or stock is created. A catalog item needs an ACTIVE product of the same shop, and the name/unit snapshot comes from the product; sending a non-blank productName or unit together with a productId returns `400 draft_item_invalid`. Repeating a catalog product returns `400 draft_item_duplicate`; a free-form item is an independent line.
- discountVnd/initialPaidVnd are optional, default 0, non-negative. initialPaidVnd is the amount actually collected, not the cash the customer hands over before change is returned, and does not exceed the total. > 0 requires initialPaymentMethod CASH|TRANSFER; = 0 requires the method to be null or omitted, otherwise `400 draft_payment_invalid`.
- customerId or customerName/customerPhone are optional. customerId must be ACTIVE in the same shop; the name/phone snapshot comes from this profile. With no ID, the draft may have no customer; a confirm that leaves debt needs a non-empty name (`400 customer_required_for_debt`), and phone is optional. Core creates a new customer at confirm when the sale is short, and does not look for a customer with the same name/phone. A fully paid sale may have no customer.
- A draft can be edited or cancelled only while it is a DRAFT that is still valid; it expires one month after creation and editing does not extend it. Cancelled or expired drafts can still be read; an invalid operation returns `409 draft_not_editable`.
- A confirm with insufficient stock returns `409 product_stock_insufficient` and rolls everything back. Retrying a draft that is already CONFIRMED returns the same saleId and the current sale status (which may already be VOIDED), and creates no extra payment or stock deduction.

`SaleDraftResponse = { id, shopId, customerName, customerPhone, discountVnd, estimatedTotalVnd, initialPaidVnd, initialPaymentMethod, status, expiresAt, confirmedSaleId, items, customerId }`.

`SaleResponse = { id, shopId, customerName, customerPhone, subtotalVnd, discountVnd, totalVnd, paidVnd, saleStatus, paymentStatus, soldAt, items, customerId, outstandingVnd, voidedAt, voidedByUserId, voidReason }`.

Draft/sale item: `{ id, productId, productName, unit, quantity, unitPriceVnd, lineTotalVnd }`. productId may be null. `stock_deducted` is stored in the DB only and is not a response field.

`PaymentResponse = { id, saleId, amountVnd, paymentMethod, type: INITIAL|DEBT_REPAYMENT, receivedAt }`. Payments are append-only, never edited or deleted; a payment that does not belong to the sale returns `404 payment_not_found`.

### Sales list totals under filters (CORE-014)

`GET /api/v1/sales/summary` requires the Firebase ID token Bearer of an ACTIVE OWNER and the `X-Shop-Id` of an ACTIVE shop owned by that OWNER. `Idempotency-Key` is not needed. Filters and permissions are the same as `GET /sales`; this section only adds money totals and counts over **the entire matching set**, not limited to the loaded page.

| Optional query | Rule |
|---|---|
| `q` | Trimmed, empty removes the filter, at most 200 characters; diacritic-insensitive and case-insensitive search, literal wildcards per the [OWNER convention](#pagination-of-owner-lists). Customer name and item name use the historical snapshot; the sale ID matches exactly when q is a number. The current Product name is not searched; several matching items add the sale only once. |
| `saleStatus` | `CONFIRMED` or `VOIDED`; omitted takes both current statuses. |
| `from`, `to` | ISO 8601 with offset, year 1–9998, filtering `soldAt >= from` and `soldAt < to`. Either side may be omitted; if both are present, from < to by instant. Omitting both takes the whole history. |

The endpoint does not define `page`, `size`, `period` or `sort`. FE builds the date/period buttons with `Asia/Ho_Chi_Minh` calendar boundaries and then sends the same `q/saleStatus/from/to` to both list and summary; encode the `+` sign in the URL as `%2B`. List and summary are two separate HTTP requests and do not promise a shared snapshot when writers run concurrently.

HTTP 200 returns five required, non-null, non-negative signed 64-bit integer VND/count fields:

```json
{
  "matchedOrderCount": 12,
  "confirmedOrderCount": 10,
  "voidedOrderCount": 2,
  "confirmedSalesVnd": 1000000,
  "voidedSalesVnd": 200000
}
```

| Field | Meaning after applying filters |
|---|---|
| `matchedOrderCount` | Every matching sale; equals confirmedOrderCount + voidedOrderCount. Unconfirmed drafts contribute nothing. |
| `confirmedOrderCount`, `confirmedSalesVnd` | Count and the sum of `totalVnd` after discount of sales whose current status is CONFIRMED. Includes fully paid, partially paid and on-debt sales; it is not money actually collected or profit. |
| `voidedOrderCount`, `voidedSalesVnd` | Count and the full `totalVnd` value after discount of sales whose current status is VOIDED; it is not the amount refunded. |

With no results, all five fields are 0. With a VOIDED filter, the two confirmed fields are 0; with a CONFIRMED filter, the two voided fields are 0. A sale sold in month A but voided in month B still falls under the soldAt filter of month A: its value moves from confirmed to voided according to the current status. `/reports/summary` keeps gross by soldAt and adjusts net by voidedAt in month B, so `confirmedSalesVnd` is not the same as `netRevenueVnd`.

Errors keep the section 0 envelope: `400 invalid_sale_query` when q or the range exceeds limits; a wrong enum/type or a timestamp missing an offset returns `400 validation_failed`; a missing header returns `400 missing_required_header`; a wrong shop ID returns `400 invalid_shop_id`. A missing or wrong token returns `401 unauthorized`; ADMIN or a non-owner returns `403 shop_access_denied`, a DISABLED user returns `403 account_disabled`, an INACTIVE shop returns `403 shop_inactive`; a missing profile returns `404 auth_profile_not_found`, and an OWNER's ARCHIVED shop returns `404 shop_not_found`. If the money total of a single status exceeds `9223372036854775807`, it returns **`409 sale_summary_overflow`**; FE suggests narrowing the filter and does not replace the error with 0 or sum the loaded page.

Deploy Core before FE switches the client. FE reloads list/summary when the shop or filter changes, keeps loading/error/empty states clear, and does not replace the period report card with the list totals unless the label and business meaning have been agreed. This is an additive API change, needing no migration or ERD change; FE/staging UAT under `FR-033`, `AC-069`–`AC-072` remains separate.

### Full void and refund

There is no PATCH/DELETE for a confirmed sale and no partial refund/return API. Void body:

```json
{
  "reason": "Khách hủy đơn và đã nhận lại tiền",
  "restockItems": true,
  "refundMethod": "CASH",
  "transferReference": null
}
```

reason is required, non-empty (max 500); restockItems is a required boolean, and missing or null returns 400. refundMethod CASH|TRANSFER is required when the amount collected is > 0 (`400 sale_refund_method_required`); when nothing was collected it must be omitted or null (`400 sale_refund_method_invalid`). transferReference is optional, max 255. No amount, refund.confirmed or list of returned quantities is accepted: Core computes the whole sum of collected payments, including debt repayment after confirmation. This records a refund already made and does not transfer money through a bank.

`SaleVoidResponse = { sale: SaleResponse, refund: SaleRefundResponse|null, cancelledDebtVnd, stockRestocked }`.

`SaleRefundResponse = { id, saleId, amountVnd, refundMethod, transferReference, refundedByUserId, refundedAt }`.

- A sale has at most one refund. An order of 100.000đ with 40.000đ collected: refund.amountVnd = 40.000, cancelledDebtVnd = 60.000. Nothing collected: refund=null, no row is created; GET refund returns `404 sale_refund_not_found`.
- Only an OPEN debt with a remaining balance becomes VOIDED, storing voidedAt/cancelledVnd. A SETTLED debt keeps its settledAt and the cancel audit is null. A VOIDED sale has outstandingVnd=0 but paidVnd/paymentStatus keep the history, and payments are not deleted or negated.
- restockItems=false changes no stock. true restores the whole quantity actually deducted according to the stock_deducted snapshot; a false snapshot (including free-form items) is skipped. stockRestocked=true only when some product has its stock restored. A null historical snapshot or a product no longer tracking stock returns `409 sale_restock_unavailable` and rolls everything back. An archived product that still validly tracks stock can receive the restock.
- Restocking to exactly `999999999999.999` is allowed; a total over the limit returns `409 product_stock_overflow` before the stock is assigned. The whole void rolls back, including an earlier item already restocked or audited; there is no refund, debt cancellation, notification or partially completed key. The quantity is not clipped and restockItems is not changed. A retry with the same key/body after the stock has become valid runs once, and after success replays the old result.
- A mismatch between the sum of payments and paidVnd returns `409 sale_payment_mismatch`, and money is not corrected automatically. For an already voided sale: the same key/body replays the old result; a different key returns `409 sale_already_voided`.
- Void/repay lock in the same order: sale → debt → product (ascending ID when needed). The refund, debt cancellation, restock, sale audit and idempotency are in one transaction.

Covers `FR-003`–`FR-005`, `FR-013`, `FR-014`, `FR-016`, `AC-024`–`AC-032`.

## 4. Expenses, debts and reports

| Method | Path | Body / query | Response |
|---|---|---|---|
| `POST` | `/api/v1/expenses` | Expense create + Idempotency-Key | `201 ExpenseResponse` |
| `GET` | `/api/v1/expenses` | page/size, category, period or from/to; see the pagination convention | `200 PageResponse<ExpenseResponse>` |
| `GET` | `/api/v1/expenses/{expenseId}` | — | `200 ExpenseResponse` |
| `PATCH` | `/api/v1/expenses/{expenseId}` | Optional fields | `200 ExpenseResponse` |
| `DELETE` | `/api/v1/expenses/{expenseId}` | Archive | `204` |
| `GET` | `/api/v1/debts` | page/size, status, customerId; see the pagination convention | `200 PageResponse<DebtResponse>` |
| `GET` | `/api/v1/debts/{debtId}` | — | `200 DebtResponse` |
| `POST` | `/api/v1/debts/{debtId}/payments` | Repayment + Idempotency-Key | `201 DebtRepaymentResponse` |
| `GET` | `/api/v1/reports/summary` | optional period, default today | `200 ReportSummaryResponse` |
| `GET` | `/api/v1/reports/top-products` | `period?`, `limit=10`, `sortBy=NET_REVENUE` | `200 TopProductsReportResponse` |
| `GET` | `/api/v1/reports/sales-series` | `period?`, `granularity=DAY` | `200 SalesSeriesReportResponse` |
| `GET` | `/api/v1/reports/profit-estimate` | `period?` | `200 ProfitEstimateReportResponse` |

Expense create: `{ category?, description, amountVnd, paymentMethod?, expenseAt? }`; description is non-empty, max 500, category max 150, amountVnd > 0, method CASH|TRANSFER if present. expenseAt defaults to now. PATCH keeps omitted fields; category/paymentMethod allow explicit null, description/amountVnd/expenseAt are not null; a request with no field returns `400 expense_update_required`.

`ExpenseResponse = { id, shopId, category, description, amountVnd, paymentMethod, expenseAt, status, createdAt, updatedAt }`.

Repayment: `{ amountVnd, paymentMethod, transferReference? }`; amountVnd > 0 and not above outstanding (`400 debt_payment_invalid`), method required CASH|TRANSFER. A SETTLED debt returns `409 debt_already_settled`; a VOIDED sale returns `409 sale_already_voided`. There is no DELETE for debt and no API to create or edit a debt balance independently.

`DebtRepaymentResponse = { debt: DebtResponse, payment: PaymentResponse }`.

`DebtResponse = { id, saleId, customerId, originalVnd, outstandingVnd, status, createdAt, settledAt, voidedAt, cancelledVnd }`. A cancelled debt has outstanding=0, and cancelledVnd is the cancelled balance, not a refund.

### Period overview

period: `today`, `yesterday`, `this_week` (Monday to now), `week` (7 calendar days including today), `month` (start of month to now), `year` (01/01 to now). Periods follow Vietnam time with the window `[fromInclusive, toExclusive)`; yesterday is the full previous day, and the other periods end at the query time.

`ReportSummaryResponse = { period, fromInclusive, toExclusive, grossRevenueVnd, voidedRevenueVnd, netRevenueVnd, collectedVnd, expenseVnd, currentOutstandingDebtVnd, orderCount, refundedVnd, voidedOrderCount }`.

| Metric | Source / time basis |
|---|---|
| grossRevenueVnd / orderCount | Sale value after discount / number of sales by soldAt in the period, including sales that were later VOIDED |
| voidedRevenueVnd / voidedOrderCount | Whole-order value / number of voided orders by voidedAt in the period, including orders sold in an earlier period |
| netRevenueVnd | grossRevenueVnd − voidedRevenueVnd; may be negative, and is not money actually collected or profit |
| collectedVnd | Sum of payments by receivedAt, not excluded by the sale's current status |
| refundedVnd | Sum of sale_refunds by refundedAt |
| expenseVnd | ACTIVE Expense by expenseAt; editing or archiving an expense can change figures of an old period |
| currentOutstandingDebtVnd | Total current debt balance of the whole shop, not filtered by period and not the end-of-period balance |

Net money collected can be computed as collectedVnd − refundedVnd; the summary has no netCollected/profit field and keeps the response unchanged for compatibility. The next three endpoints use the same period/window as the summary and require an OWNER token and an ACTIVE `X-Shop-Id` owned by that OWNER.

### Top sellers, daily series and estimated profit

`top-products`: `limit` 1–100; `sortBy=NET_REVENUE|QUANTITY`, default NET_REVENUE. Response:

```text
TopProductsReportResponse = { period, fromInclusive, toExclusive, sortBy, items }
TopProduct = { itemKey, productId, productName, unit, source, grossQuantity, voidedQuantity,
               netQuantity, grossRevenueVnd, voidedRevenueVnd, netRevenueVnd }
```

Catalog items group by `productId` and remain after the product is archived; custom items (`productId=null`) group case-insensitively by the trimmed snapshot name + unit, with source=`CUSTOM`. `itemKey` is an opaque key that is stable within the response, and FE does not parse it. Gross takes the items of sales by soldAt, voided takes the items of voided sales by voidedAt, and net = gross − voided and can be negative. Each line's revenue is the part of `sale.totalVnd` after discount allocated in proportion to `lineTotalVnd`; the rounding remainder is assigned to the item with the smallest ID in the sale, so the line totals always match the sale total. The tie-break after the descending metric is ascending itemKey.

`sales-series`: currently accepts only `granularity=DAY`. Response `SalesSeriesReportResponse = { period, fromInclusive, toExclusive, granularity, items }`, each item `{ date, grossRevenueVnd, voidedRevenueVnd, netRevenueVnd, orderCount, voidedOrderCount }`. `date` is an `Asia/Ho_Chi_Minh` day; Core fills every day in the period, including 0 buckets. A sale adds at soldAt, a void subtracts at voidedAt; payments, refunds and expenses are not mixed into the revenue series.

`profit-estimate` response:

```text
ProfitEstimateReportResponse = {
  period, fromInclusive, toExclusive,
  grossRevenueVnd, voidedRevenueVnd, netRevenueVnd,
  grossEstimatedCogsVnd, voidedEstimatedCogsVnd, netEstimatedCogsVnd,
  estimatedGrossProfitVnd, expenseVnd, estimatedOperatingProfitVnd,
  isComplete, unknownCostItemCount, unknownCostRevenueVnd
}
```

When confirming a catalog item, Core snapshots `estimated_cost_vnd = round_HALF_UP(costPriceVnd × quantity)` as the line's total cost. A product without cost, a custom item and history before V12 keep NULL; nothing is backfilled from the current price or guessed at 60%. Net COGS = gross COGS by soldAt − voided COGS by voidedAt; gross profit = net revenue − net COGS; operating profit = gross profit − ACTIVE Expense by expenseAt. `isComplete=false` when any related item event lacks cost; `unknownCostItemCount` counts the sale/void contributions lacking cost and `unknownCostRevenueVnd` is the absolute total of allocated revenue affected, not a net deduction. All profit figures are operating estimates, not accounting or tax figures.

An unknown `period` returns `400 invalid_report_period`; a limit outside 1–100 returns `400 invalid_report_query`; a wrong sort/granularity enum returns `400 validation_failed`.

Covers `FR-006`, `FR-015`, `FR-016`, `AC-007`, `AC-024`, `AC-031`, `AC-049`–`AC-052`.

### Shop audit history

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/api/v1/audit-logs` | Query `action?`, `entityId?`, `from?`, `to?`, `page=0`, `size=20` | `200 AuditLogPageResponse` |

Read-only, requiring a Bearer token and the `X-Shop-Id` of an ACTIVE shop owned by the OWNER; there is no API to create, edit or delete audit. Results are newest first (createdAt, id descending). `from` is inclusive, `to` is exclusive, ISO 8601 with offset; `size` 1–100, `page` from 0 and page × size at most 2.147.483.647, `entityId` positive, `from` must be before `to`; violating these constraints returns `400 invalid_audit_query`. A nonexistent action enum or a wrongly typed param returns `400 validation_failed`; a known ADMIN read action (`ADMIN_*`) returns `400 invalid_audit_query`. Results always exclude ADMIN read events, but still include the ADMIN events that change shop status, per the list below.

`AuditLogPageResponse = { content: AuditLogResponse[], page, size, totalElements, totalPages }`; `AuditLogResponse = { id, shopId, actorUserId, actorRole, action, entityType, entityId, outcome, reason, requestId, idempotencyKey, metadata, createdAt }`. outcome is always `SUCCESS`: only successful operations are recorded, in the same business transaction; a failed or rolled-back operation leaves no audit. metadata contains only the keys declared for each action (amounts, stock before/after, changed fields), and contains no customer name/phone, token or IP.

action: `SALE_CONFIRMED`, `SALE_VOIDED`, `SALE_REFUND_RECORDED`, `DEBT_REPAYMENT_RECORDED`, `DEBT_VOIDED`, `STOCK_ADJUSTED`, `STOCK_RESTORED_ON_VOID`, `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_ARCHIVED`, `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_ARCHIVED`, `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_ARCHIVED`, `SHOP_CREATED`, `SHOP_UPDATED`, `SHOP_ARCHIVED`, `SHOP_INACTIVATED`, `SHOP_REACTIVATED`.

`STOCK_ADJUSTED` uses source `SALE_CONFIRM` on a sale, `CATALOG_EDIT` when stock tracking changes, `STOCK_IN` on stock receipt, and `STOCK_ADJUSTMENT` on a standalone stock decrease. For stock-in/stock-adjustment: entityType PRODUCT/entityId is the product, metadata is only quantity/beforeStock/afterStock/source; the reason and key are in separate audit fields. A replay creates no extra event.

The `audit_logs` table is append-only (V10, a trigger blocks UPDATE/DELETE/TRUNCATE; V11 adds the ADMIN read actions). Traceability: `BR-017` in the [BRD](../product/business-requirements.md), `FR-028`/`FR-029` and `AC-033`–`AC-039` in the [PRD](../product/product-requirements.md#8-danh-mục-tiêu-chí-nghiệm-thu). Accepting OWNER history through the API/DB does not mean the FE screen is integrated; ADMIN access audit has a [separate contract](#7-admin-dashboard--implemented-in-core) and does not open OWNER endpoints to ADMIN.

## 5. AI through Core

The implemented AI routes provide chat, read-only suggestions and conversation/memory management. They do not create ledger drafts or write sales, expenses or stock. There is no public AI draft-parsing endpoint.

| Method | Path | Input | Returns | Status |
|---|---|---|---|---|
| `POST` | `/api/v1/agent/chat` | `X-Shop-Id`, `{ conversation_id?, message }` | `AgentChatMessageView` | Implemented |
| `POST` | `/api/v1/agent/chat/stream` | `X-Shop-Id`, `{ conversation_id?, message }` | `text/event-stream`: `delta`, `reset`, `memory` (only when memory is on), `tool_start`, `tool_end`, `done` (`AgentChatMessageView`), `error` ([Stream section](#chat-answer-stream)) | Implemented |
| `GET` | `/api/v1/agent/conversations` | `X-Shop-Id` | `AgentConversationSummary[]` | Implemented |
| `GET` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id` | `AgentConversationView` | Implemented |
| `PATCH` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id`, `{ title }` (1–255 characters, non-empty) | `AgentConversationSummary` | Implemented |
| `DELETE` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id` | `204 No Content` | Implemented |
| `GET` | `/api/v1/agent/memory/settings` | `X-Shop-Id` | `{ memory_enabled, available }` | Memory is active only when `AGENT_MEMORY_ENABLED` is on (otherwise reads return `available=false` or an empty list). The PO approved the feature on 2026-11-07 and production has the flag on ([ADR-0002](../architecture/adr/0002-agent-long-term-memory.md), `FR-039`, `AC-119`–`AC-123`) |
| `PUT` | `/api/v1/agent/memory/settings` | `X-Shop-Id`, `{ memory_enabled }` | `{ memory_enabled, available }` | As above |
| `GET` | `/api/v1/agent/memory/items` | `X-Shop-Id` | `[AgentMemoryItem]` (see `/internal/v1/agent/memory/items`) | As above |
| `DELETE` | `/api/v1/agent/memory/items/{memoryId}` | `X-Shop-Id` | `204`; an id that does not belong to the shop owner becomes `404 conversation_not_found` (Core turns every AI `404` into this code) | As above |

`AgentChatMessageView` has `conversation_id`, `message_id`, `answer`. `AgentConversationSummary` has `conversation_id`, `title`, `last_message_at`. `AgentConversationView` has the summary and `messages[]` with `message_id`, `role` (`USER` or `ASSISTANT`), `content`, `created_at`. Conversation and message IDs are `BIGINT` as in the ERD.

The Agent endpoints require an authenticated OWNER and a valid `X-Shop-Id`. Core takes the user from the authenticated identity; FE does not send `user_id` to establish permissions. List, view, chat and delete are all limited to the authenticated user/shop.

`FR-007` (restock suggestions) and `FR-020` (asking about operating figures) are currently delivered through `/api/v1/agent/chat`: the agent calls AI's read-only tools and then answers in the same conversation, not through a separate endpoint. Restock suggestions have no end-to-end acceptance; `COVER_DAYS` and the two data periods currently used are defaults awaiting PO approval, see the [Restock suggestions section](../../backend/ai/docs/architecture.md#restock-suggestions).

Covers `FR-007`, `FR-008`, `FR-017`, `FR-018`, `FR-020`, `FR-021`, `FR-027`.

## 6. Core ↔ AI internal

| Method | Path | Responsibility | Status |
|---|---|---|---|
| `POST` | `/internal/v1/agent/chat` | Body `{ user_id, shop_id, conversation_id?, message }`; returns `{ conversation_id, message_id, request_id, answer, model, model_version }`. A new conversation takes the first message, collapses whitespace and truncates it to 255 characters as the `title` | Implemented |
| `POST` | `/internal/v1/agent/chat/stream` | Same body as `/internal/v1/agent/chat`; returns `text/event-stream` with the events `delta`, `reset`, `memory` (only when memory is on), `tool_start`, `tool_end`, `done`, `error` ([Stream section](#chat-answer-stream)) | Implemented; Core proxies through `/api/v1/agent/chat/stream` |
| `GET` | `/internal/v1/agent/conversations` | Query `user_id`, `shop_id`; returns the conversation list, newest `last_message_at` first | Implemented |
| `GET` | `/internal/v1/agent/conversations/{conversation_id}` | Query `user_id`, `shop_id`; returns the conversation and messages | Implemented |
| `PATCH` | `/internal/v1/agent/conversations/{conversation_id}` | Body `{ user_id, shop_id, title }`, `title` 1–255 characters after trimming both ends; returns the renamed summary | Implemented |
| `DELETE` | `/internal/v1/agent/conversations/{conversation_id}` | Query `user_id`, `shop_id`; deletes the conversation, returns `204` | Implemented |
| `GET` | `/internal/v1/agent/memory/settings` | Query `user_id`, `shop_id`; returns `{ memory_enabled, available }`. `available` is `false` (and `memory_enabled` `false`) when long-term memory is not enabled system-wide or the memory service cannot be built (missing chat model, Postgres or embedder) | Memory is active only when `AGENT_MEMORY_ENABLED` is on (otherwise reads return `available=false` or an empty list); approved by the PO on 2026-11-07 and enabled in production (ADR-0002, `FR-039`); Core proxies through `/api/v1/agent/memory/settings` |
| `PUT` | `/internal/v1/agent/memory/settings` | Body `{ user_id, shop_id, memory_enabled }`; returns as `GET`. When memory is not enabled or cannot be built it returns `409` `{ "detail": "memory_unavailable" }`, which Core turns into `503 ai_unavailable` | As above |
| `GET` | `/internal/v1/agent/memory/items` | Query `user_id`, `shop_id`; returns an array of memories still in effect (not yet replaced by a newer memory) `{ id, memory_type, content, use_count, last_used_at, created_at, source_conversation_id }`, most recently used first, at most 200 memories; an empty array when memory cannot be built. The app draws this list as a memory map in the assistant settings | As above; Core proxies through `/api/v1/agent/memory/items` |
| `DELETE` | `/internal/v1/agent/memory/items/{memory_id}` | Query `user_id`, `shop_id`; deletes the memory together with the older versions it replaced (so old versions do not come back to life), returns `204`. An id that does not belong to the shop owner returns `404` `{ "detail": "memory_not_found" }`; memory that cannot be built returns `409` `memory_unavailable` | As above |

General requirements:

- a model error (after the SDK retries itself and the models in `MODEL_FALLBACKS`, if any, also fail) returns `503` with `{ "detail": "ai_unavailable" }`. Each model request has a limit of `MODEL_TIMEOUT_SECONDS` (20 seconds by default) and the OpenAI SDK retries itself at most 2 times, so a hung model usually makes the chat turn reach `AGENT_TURN_TIMEOUT_SECONDS` first and return `422 answer_timeout`; Core does not retry the AI call on its own;
- a guardrail that stops the chat turn returns `422` with `{ "detail": "<code>" }` without saving unsuccessful generation (an already-running database write may still commit if cancellation/timeout races persistence): `input_too_long` (the new message is longer than `AGENT_MAX_INPUT_CHARS`, 2000 characters by default), `answer_unavailable` (model calls exhausted, the turn's token budget exceeded, or the answer is still blocked after the rewrite requests) or `answer_timeout` (the model run exceeded `AGENT_TURN_TIMEOUT_SECONDS`, 35 seconds by default, lower than Core's 40-second read timeout; reading history, recall and saving fall outside this limit). AI returns only the code; the display text is mapped by FE; Core forwards `422` and this code in the `code` of the Core error;
- a successful response has `request_id`, `model`, `model_version`;
- AI has no endpoint that creates, edits or deletes business data;
- Core authorizes the OWNER against the shop; AI accepts caller-supplied IDs after validating a shared service token and does not independently verify user-to-shop ownership. The token is not tenant-bound; network isolation and trusted Core context are security requirements. `user_id`, `shop_id` and a body `conversation_id` must be greater than 0, otherwise AI returns FastAPI's default `422` validation; a conversation ID in the path that matches no conversation, including 0, returns `404 conversation_not_found`;
- Core forwards the authenticated `user_id`; AI queries by both `user_id` and `shop_id`. A conversation that does not exist or is out of scope returns `404 conversation_not_found`;
- chats are kept across sessions until the OWNER deletes them; deleting a chat removes the messages from the history and the assistant context. No automatic TTL is applied at present;
- Core calls `/internal/v1/*` with the header `X-Internal-Token` carrying the environment's `INTERNAL_API_TOKEN` value. A missing header or wrong value returns `401` with `{ "detail": "unauthorized" }`. When AI has no token configured, every `/internal/v1/*` path returns `401` (fail closed), except `/health` and `/metrics` (Prometheus), which need no token; the VPS deployment publishes no AI port, so only containers on the same network can call `/metrics` there; local Compose publishes the AI port to the host for development;

### Agent tool for reading shop data

The agent has an internal tool `query_shop_data` to answer questions about the shop profile, categories, products, orders, debts, collected payments and expenses. It is not an endpoint: there is **no** `POST /internal/v1/agent/sql`, Core and FE connect only to `/internal/v1/agent/chat`, and the chat request and response do not change.

- The model passes only `sql`; `shop_id` comes from Core's authorized request context and reaches the tool through Pydantic AI's run context (`deps`), not in the tool schema or system prompt, so the model cannot change the shop scope.
- Shop-profile results include the shop's phone and address; customer-contact exclusions do not make all tool output anonymous. Enabled model/tracing integrations can receive these results.
- The query runs with the read-only role `ai_sql_reader` on eight views of the `ai_read` schema: `v_shop_profile`, `v_categories`, `v_products`, `v_sales`, `v_sale_items`, `v_debts`, `v_payments`, `v_expenses`. The views filter by the transaction's shop themselves and have no `shop_id` column; the role has no permission on the base tables. `v_sales`/`v_sale_items` do not expose the customer snapshot or `void_reason`. `v_debts`/`v_payments` filter the shop through the sale and have only `customer_id` (no name or phone number), no transfer reference or collector; `v_expenses` has only ACTIVE expenses and no `description`.
- SQL is at most 4000 characters long (longer gives `SQL_TOO_LONG`) and must pass the AST checker: exactly one `SELECT` statement (`WITH` and `UNION` allowed), using only functions and casts in the allowlist. The transaction is `READ ONLY` (`postgresql_readonly`), `statement_timeout` is 3000 ms by default, at most 100 rows; on success it commits (nothing can be written), on error it rolls back; each chat turn calls the model at most 4 times and tools at most 3 times, with a total of at most 200000 input and output tokens and at most 35 seconds of running time. These defaults are temporary, awaiting PO approval.
- A query rejected by the checker or the database, or one that times out, is returned to the model in the form `Error[CODE]: reason` (for example `UNSAFE_FUNCTION`, `QUERY_TIMEOUT`, `SQL_ERROR`) so the model can rewrite the query; the chat turn still answers. If the read database cannot be connected, the chat turn returns `503 ai_unavailable`. When AI has no `AI_SQL_READER_URL` configured, the agent still chats but has neither this tool nor `suggest_restock`.
- Deterministic guardrails around the agent: a new message longer than 2000 characters is rejected with `422 input_too_long` without calling the model; API keys, bearer tokens, JWTs, private keys, IBANs, Luhn-valid card numbers and emails in the message are replaced with `[redacted:<kind>]` before being sent to the model and before being stored; an empty answer or one that leaks internal details (view names, SQL, error codes) is sent back to the model to be rewritten, and when model calls run out it returns `422 answer_unavailable`. The system prompt limits the agent to shop matters (revenue, orders, products, categories, prices, stock, restocking, debts, collected payments, expenses, record drafts, how to use SmartLedger); an out-of-scope question gets a short refusal sentence with `200`, not an error code, and this is a prompt constraint, not a deterministic filter. The request and successful response of `/internal/v1/agent/chat` do not change; the error codes are in the general requirements above.
- The agent can read the shop profile, categories, products, orders (`v_sales`, `v_sale_items`), **debts, collected payments and expenses** (`v_debts`, `v_payments`, `v_expenses`; `AC-076`–`AC-077`); customer names/contacts, expense descriptions, refunds and stock-in history are still not exposed. Besides `query_shop_data`, the agent has the tool `suggest_restock`, which returns restock suggestions from `CONFIRMED` orders; `COVER_DAYS` and the two periods `last_7_days`/`last_30_days` are currently defaults awaiting PO approval, not final decisions. Operating details are in the [AI README](../../backend/ai/docs/architecture.md#read-only-shop-data) and the [Restock suggestions section](../../backend/ai/docs/architecture.md#restock-suggestions).
- The agent has a `calculate` tool to do arithmetic itself instead of computing in the answer: it takes an ordered list of steps (`add`, `subtract`, `multiply`, `divide`, `percentage` (a is a percentage of b), `round` half-up with `digits` 0–6, default 0, `min`, `max`), and every step except the first may use `$` for the previous step's result. The tool runs in the AI process on a closed set of operations, without calling the sandbox; results are rounded to 6 decimal places, with a per-step trace for cross-checking. A rejected plan is returned to the model in the form `Error[CODE]: reason` (`DIVISION_BY_ZERO`, `BAD_OPERATION`, `OPERAND_TOO_LARGE`, `RESULT_TOO_LARGE`, `TOO_MANY_OPERATIONS`, `INVALID_NUMBER`); operands and results are capped at `CALC_MAX_OPERAND_VALUE` (1e15 by default), and each call has at most `CALC_MAX_OPERATIONS` steps (20 by default). The tool is off when `CALC_ENABLED=false`. `calculate` is a pure in-process computation tool (no I/O), so it does not count against the per-turn tool-call cap `AGENT_TOOL_CALL_LIMIT`. The defaults are temporary, awaiting PO approval.
- When `SANDBOX_ENABLED` is on (the default), the agent has the additional tool `run_code`: the model writes a small Python program that runs in the [Monty](https://github.com/pydantic/monty) sandbox. The program cannot call any tool, uses only data from earlier tool results, and is only for what a single SQL statement or `calculate` cannot do; `query_shop_data` and `suggest_restock` remain directly called tools ([ADR-0007](../architecture/adr/0007-sandbox-without-data-tools.md)). The sandbox is not an endpoint; the chat request and response do not change. Limits per `run_code` snippet: heap at most `SANDBOX_MAX_MEMORY_BYTES` (64 MiB by default; exceeding it returns `MemoryError` to the model to rewrite, without killing the worker), runs at most `SANDBOX_MAX_DURATION_SECS` (5 by default) seconds and pauses at most `SANDBOX_MAX_SUSPENSIONS` (1000 by default) times. The heap limit only bounds the sandbox, not the AI process RAM; the OS/container RAM limit remains the final barrier. The defaults are temporary, awaiting PO approval.

### Chat context

On each chat turn, AI sends the model the static system prompt, then the most recent `AGENT_HISTORY_TURNS` exchanges of the conversation (30 turns by default, that is 60 OWNER and ASSISTANT messages), verbatim and ordered oldest to newest, except for the ```actions block of old answers (see [Chat answer stream](#chat-answer-stream)), then the OWNER's new message, followed by one line with the shop's current time (`Asia/Ho_Chi_Minh`, not stored) so the model understands "today" or "last week"; when long-term memory is on, this message is led by the recalled memories (the "Earlier facts from this owner" block); this block is sent only to the model and is not stored (the app receives the memory list only through the `memory` event of the stream route), and the stored message remains the OWNER's message after redaction. Older messages do not reach the model and are not summarized. The conversation history is not summarized or merged in the background and there is no history search tool (when long-term memory is on, the memory extraction and compaction step runs in the background after each turn, on memories rather than on the chat history): OWNERs chat little; 30 turns with the 2000-character limit per message keep a request within a 100k-token window. This contract does not change the request or response of `/internal/v1/agent/chat`.

### Chat answer stream

`POST /internal/v1/agent/chat/stream` runs the same chat turn as `POST /internal/v1/agent/chat`: the same body, the same `X-Internal-Token`, the same guardrails. Errors that occur before the stream starts keep the codes of the JSON route: `401` (`unauthorized`), `404` (`conversation_not_found`), `422` (`input_too_long`) and `503` (`ai_unavailable`, including when the model is not configured). After the stream starts, errors travel in the `error` event instead of an HTTP status.

A successful response has `Content-Type: text/event-stream`. Each event has a name and `data` that is JSON:

- `delta` `{ "text": "..." }`: append `text` to the part already displayed.
- `reset` `{}`: discard the part already displayed; a new model answer follows. This happens when the model writes text before a data-reading tool call, or when the answer screen rejects the answer and the model rewrites it. Text the model writes before calling only `suggest_screen` is part of the answer: the stream keeps it, the model is not asked again once the buttons return, and no `reset` is sent.
- `memory` `{ "used": [{ "id", "memory_type", "content", "source_conversation_id", "created_at" }] }`: the long-term memories used this turn, including at most 10 `preference` memories that are always included and at most 5 memories found by the question; `source_conversation_id` is the conversation that produced the memory, `created_at` is ISO 8601; sent once, before the first `delta`, and only when `AGENT_MEMORY_ENABLED` is on, the shop owner has not turned memory off, and some memory was used (approved by the PO on 2026-11-07, ADR-0002, `FR-039`/`AC-123`). The app shows a memory icon (with a count when there are several) on the answer; tapping it shows each memory with the date remembered and can open the source conversation through `GET /api/v1/agent/conversations/{conversation_id}`; the event does not enter the conversation history.
- `tool_start` `{ "call_id": "...", "name": "query_shop_data" }`: the model starts calling a tool; `name` is the tool name (`query_shop_data`, `suggest_restock`, `suggest_screen`, `calculate`, `run_code`). AI sends neither the tool's parameters (the SQL statement) nor its result, so the app sets its own display text for each step. A turn may call several tools, each with its own `call_id`; the event does not enter the conversation history.
- `tool_end` `{ "call_id": "..." }`: the tool with that `call_id` has finished, even if it returned an error for the model to rewrite the query. A `tool_start` with the same `call_id` always comes first.
- `done`: the same body as the response of `/internal/v1/agent/chat` (`conversation_id`, `message_id`, `request_id`, `answer`, `model`, `model_version`). `answer` is the stored answer and replaces all the text streamed.
- `error` `{ "detail": "<code>" }`: `answer_unavailable` or `answer_timeout` (a guardrail stopped the turn), `conversation_not_found` (the conversation was deleted while the turn was running) or `ai_unavailable`.

The stream ends after `done` or `error`.

Only text the model wrote that has passed the answer screen is sent; the ```actions block that AI appends after the answer screen travels in the final `delta` (see below). A short tail and text after a pending `select` are held back until the answer screen finishes checking. A turn that ends with `error`, or where the caller disconnects midway, is not stored, unless the caller disconnects exactly while AI is writing the turn to the database.

Core proxies this route through `POST /api/v1/agent/chat/stream` with the same auth, `X-Shop-Id` and body as `/api/v1/agent/chat`. An error before the first event is a Core JSON error and is mapped like the JSON route: AI `404` becomes `conversation_not_found`, AI `422` carrying a guardrail code (`input_too_long`) keeps `422` like the JSON route, and any other error becomes `503 ai_unavailable`. After that, Core forwards each AI event verbatim, except `done`, which keeps only `conversation_id`, `message_id`, `answer` like `AgentChatMessageView`. When the app disconnects, Core closes the stream to AI, so AI cancels the turn as described above. Core configures a 60-second MVC async-request timeout and a separate 40-second AI HTTP read timeout; AI's default turn limit is 35 seconds. These are distinct limits, not a promise that an upstream response can wait for 60 seconds.

The AI Assistant screen on mobile calls the stream route and shows text gradually in the answer bubble; `reset` clears the part already shown, and `done` replaces it with the stored answer. While waiting for the first text, the thinking line shows a waiting phrase; each `tool_start` replaces it with the label of the latest step, and `tool_end` adds a tick after the label. This line disappears when the first `delta` arrives. The answer, stored data and guardrails are unchanged from `/api/v1/agent/chat`.

`answer` (and the text assembled from `delta`) is plain text with a small Markdown subset defined by AI's prompt: `**bold**`, `- `/`1. ` lists, Markdown tables, and at most one chart block:

````text
```chart
{"type": "bar" | "line", "title": "…", "unit": "vnd" | "count", "data": [{"label": "…", "value": 0}]}
```
````

The `chart` block is inside `answer`, so it is stored with the answer and shown again when the history is opened; Core and AI change no route or event. Mobile uses one shared parser (`frontend/mobile/src/lib/chatMarkdown.ts`) for text being streamed and the stored answer: a `**`/`` ` `` marker still open on the last line is temporarily closed, a line whose block type is not yet clear (`#`, `-`, `` ``` ``, a table header without its dash line yet) is held back, and an unclosed `chart` block shows "Đang vẽ biểu đồ…" (Drawing the chart…). The chart is drawn only when the JSON is valid, has 1–31 points, labels are text and values are non-negative numbers; otherwise it shows "Không hiện được biểu đồ này." (This chart cannot be shown.). The numbers in the chart are copied by the model from tool results, like every number in the answer. The [PRD](../product/product-requirements.md) and AC do not yet specify how tables/charts are presented in chat.

At the end of `answer` there may be a block of buttons that open screens in the app, at most 2 buttons:

````text
```actions
["debts", "sales"]
```
````

The model does not write this block itself: the agent calls the tool `suggest_screen(screen)` with `screen` from the closed set `sales`, `voice_order`, `orders`, `products`, `debts`, `expenses`, `reports` (any other value is returned by Pydantic AI to the model to retry). After the turn, AI appends the block to the end of `answer` in call order, with duplicates removed; the block is stored with the answer and reaches the app through the final `delta` and `done`, so Core changes no route or event. When reading history for a later turn, AI drops this block from old answers. Mobile maps each name to a route and label in `SCREEN_LINKS` (`frontend/mobile/src/lib/chatMarkdown.ts`), ignores unknown names or broken JSON, and shows buttons only when the block is closed. The app usage guide in the agent's prompt (`backend/ai/src/prompt_templates/app_guide.py`) copies screen and button names from the current app; the PRD and AC do not yet specify this guidance behavior.

## 7. Admin dashboard — implemented in Core

The audited Core source includes the seven base GETs and `overview/growth` as the eighth endpoint; live deployment and acceptance were not audited. A valid Firebase ID token and a DB profile of `ADMIN`/`ACTIVE` are required; the role is not taken from the client or a self-made claim. `X-Shop-Id` is not needed; this header and the `actorUserId` param do not change the access scope. A successful response has `Cache-Control: no-store`. The web dashboard (`frontend/web`, built with `VITE_USE_MOCK=false`) reads the base contract through `src/services/adminApi.ts`, signs in with Firebase email/password and then calls `GET /api/v1/me` to check the `role` is ADMIN; the growth chart is not integrated. Core tests do not replace acceptance with real Firebase/FE and staging UAT.

| Method | Path | Query | Response |
|---|---|---|---|
| `GET` | `/api/v1/admin/overview` | `fromDate?`, `toDate?` | `200 Overview` |
| `GET` | `/api/v1/admin/overview/growth` | `fromDate?`, `toDate?` | `200 Growth` — implemented in Core |
| `GET` | `/api/v1/admin/users` | `query?`, `status?`, `page=0`, `size=20` | `200 AdminPageResponse<OwnerSummary>` |
| `GET` | `/api/v1/admin/users/{userId}` | — | `200 OwnerDetail` |
| `GET` | `/api/v1/admin/shops` | `query?`, `status?`, `ownerId?`, `page=0`, `size=20` | `200 AdminPageResponse<ShopSummary>` |
| `GET` | `/api/v1/admin/shops/{shopId}` | — | `200 ShopDetail` |
| `GET` | `/api/v1/admin/shops/{shopId}/status-history` | `page=0`, `size=20` | `200 AdminPageResponse<ShopStatusEvent>` |
| `GET` | `/api/v1/admin/access-logs` | `action?`, `shopId?`, `from?`, `to?`, `page=0`, `size=20` | `200 AdminPageResponse<AccessLog>` |

### Filters and pagination

- `page` starts at 0, `size` is 1–100; page × size at most 2.147.483.647. Path IDs, `ownerId` and `shopId` must be positive. The query is trimmed, at most 150 characters; empty or omitted does not limit the search. Search is a literal, case-insensitive substring match; `%`, `_`, `!` are search characters, not wildcard operators.
- Users returns only OWNERs; `status` is `ACTIVE|DISABLED`. Search by displayName/email/phone. `shopCount` includes shops of every status. A user that does not exist or is an ADMIN returns `404 owner_not_found` on the detail API.
- Shops returns `ACTIVE|INACTIVE|ARCHIVED` alike, with the extra filter `ownerId`. Search by shop name/phone and the owner's displayName/email/phone; industry/address are not searched. A shop that does not exist returns `404 shop_not_found` on detail/status-history; a non-matching ownerId on the list returns an empty page.
- `AdminPageResponse<T> = { items: T[], page, size, totalElements, totalPages }`, not using `content`. When the total is 0, items is empty and totalPages = 0; a page past the last page still returns empty items and keeps the total. Users/shops are sorted by createdAt then id descending; the histories are sorted by createdAt then id descending.
- Overview accepts **both dates or neither**, in the format `YYYY-MM-DD`. The default is 30 days including today; fromDate ≤ toDate, at most 366 days counting both ends, years 1–9998. The period follows `Asia/Ho_Chi_Minh`: the start of fromDate inclusive to the start of the day after toDate exclusive. Only `createdInPeriod` filters by the period; the total and the count of each status are current, not the historical state at period end. The web mock's `days=` contract is not accepted.
- Access logs: `from` is inclusive, `to` is exclusive, ISO 8601 with offset; either or both ends may be omitted, year within 1–9999, and from must be before to when both are present. The 366-day limit of overview does not apply to access logs. There is no actor filter for reading another ADMIN's history.

### Returned projection

The names below match the Core DTOs; contact information may be null. IDs are numbers, and timestamps follow the Core convention at the top of the document.

```text
Overview = { asOf, timezone, fromDate, toDate, owners, shops }
owners = { total, active, disabled, createdInPeriod }
shops = { total, active, inactive, archived, createdInPeriod }
Growth = { asOf, timezone, fromDate, toDate, points: GrowthPoint[] }
GrowthPoint = { date, ownersCreated, shopsCreated }
OwnerSummary = { id, displayName, maskedEmail, maskedPhone, status, createdAt, shopCount }
OwnerDetail = { id, displayName, email, phone, status, createdAt, updatedAt, shopCount }
OwnerContact = { id, displayName, email, phone, status }
ShopSummary = { id, ownerId, ownerDisplayName, name, industry, maskedPhone, status, createdAt }
ShopDetail = { id, name, industry, phone, address, status, inactiveReason, archivedReason,
               archivedAt, createdAt, updatedAt, owner: OwnerContact }
ShopStatusEvent = { id, actorUserId, beforeStatus, afterStatus, reason, requestId, createdAt }
AccessLog = { id, actorUserId, actorRole, action, targetType, targetId, shopId, outcome,
              requestId, occurredAt, beforeStatus, afterStatus, reason }
```

Lists mask email as `***@***` and phone as `***` + the last three characters (a phone of at most 4 characters is just `***`; missing contact returns null). OWNER/shop details carry full contact information for support; shops of a DISABLED OWNER can still be looked up. It does not return Firebase UID/identity, tokens, secrets, sale/payment/refund/debt/expense/product data or OWNER business audit. The base overview has counts only; the creation series is separate in Growth, with no revenue/profit/quota/task. There is no OWNER impersonation, no ADMIN API that edits the ledger, no `/admin/audit-logs`, no `/auth/login` and no separate Core token.

### Daily creation series — admin-growth

`GET /api/v1/admin/overview/growth` follows the `fromDate`/`toDate` pair, the default, and the year and 366-day limits of overview. The `days=`/grouping convention from the mock is not accepted.
FE chooses 7/30/90 days with `fromDate = today - (N - 1)` and `toDate = today` in Vietnam time.
`date`, `fromDate` and `toDate` are `YYYY-MM-DD`; `timezone` is fixed at `Asia/Ho_Chi_Minh`; `asOf` follows the Core timestamp convention.
The example is illustrative and is not real environment data:

```json
{
  "asOf": "2026-10-26T10:00:00+07:00",
  "timezone": "Asia/Ho_Chi_Minh",
  "fromDate": "2026-10-25",
  "toDate": "2026-10-26",
  "points": [
    { "date": "2026-10-25", "ownersCreated": 2, "shopsCreated": 3 },
    { "date": "2026-10-26", "ownersCreated": 0, "shopsCreated": 0 }
  ]
}
```

- One point per day, ascending, including days with 0; at most 366 points. The two counts are non-negative integers of type long, counted by `created_at`, not by `updated_at`.
- OWNERs are filtered by the current OWNER role, including DISABLED and excluding ADMIN; shops include every status. The two sources are counted independently, and an OWNER is not multiplied by the number of shops they own.
- The boundary `[start of fromDate, start of the day after toDate)` and the day grouping both follow Vietnam time and do not depend on the DB timezone. It does not measure login counts, usage or retention.
- Within the same snapshot/period, the total of each series equals the corresponding `createdInPeriod`. Two separate HTTP requests may differ if data or roles change between the two reads.
- Growth does not return historical status. The status chart uses `shops.active`, `shops.inactive`, `shops.archived` of the base overview, which are always current numbers.
- The guard, error codes and no-store are the same as the other ADMIN GETs. Each read uses `ADMIN_OVERVIEW_VIEWED`/`SYSTEM`, with target/shop null and metadata `{ "queryPresent": false, "resultCount": 1 }`: one overview response, not the number of days. Access logs do not distinguish growth from the base overview. An audit failure returns 503 and no chart; no action, table, index, environment variable or migration is added.
- Traceability `BR-013`/`BR-014` → `FR-024` → `AC-097`–`AC-100`. The endpoint is implemented on the feature branch; FE/staging still need acceptance. The DB aggregation is bounded in output, and the client is not required to download the whole list to count by itself.

### ADMIN audit and history boundary

It shares `audit_logs` V10/V11, and there is **no `admin_access_logs` table**. Each successful GET writes one event in the same transaction, including an empty search or page. Read metadata has only `{ queryPresent: boolean, resultCount: integer }`: resultCount is the number of items returned in the page, or 1 for overview/detail; the raw query, filter and response are not stored. reason and idempotencyKey of a read event are always null. GET is not deduplicated by key: a retry is a new access with a new event, not a replay of a money operation.

| `action` in access-logs | `action` stored in the DB | `targetType` | `targetId` / `shopId` |
|---|---|---|---|
| `OVERVIEW_VIEWED` | `ADMIN_OVERVIEW_VIEWED` | `SYSTEM` | null / null |
| `OWNERS_SEARCHED` | `ADMIN_OWNERS_SEARCHED` | `OWNER_LIST` | null / null |
| `OWNER_VIEWED` | `ADMIN_OWNER_VIEWED` | `OWNER` | userId / null |
| `SHOPS_SEARCHED` | `ADMIN_SHOPS_SEARCHED` | `SHOP_LIST` | null / null, including a search with ownerId |
| `SHOP_VIEWED` | `ADMIN_SHOP_VIEWED` | `SHOP` | shopId / shopId |
| `SHOP_STATUS_HISTORY_VIEWED` | `ADMIN_SHOP_STATUS_HISTORY_VIEWED` | `SHOP` | shopId / shopId |
| `ACCESS_LOGS_VIEWED` | `ADMIN_ACCESS_LOGS_VIEWED` | `ADMIN_ACCESS_LOG_LIST` | null / null |
| `SHOP_STATUS_UPDATED` | `SHOP_INACTIVATED` or `SHOP_REACTIVATED` | `SHOP` | shopId / shopId |

Access logs read only the current ADMIN actor and the action/target whitelist above, with outcome `SUCCESS`; they do not return raw metadata, idempotencyKey or the reason for cancelling a sale or debt. beforeStatus/afterStatus/reason have values only for shop status-change events and are null for read events. The `shopId` query matches only events attached to exactly that shop and does not pull in system-wide search events. Reading access logs picks the page first and only then writes `ADMIN_ACCESS_LOGS_VIEWED`; the event of the current read is not in that response.

Status history returns only `SHOP_INACTIVATED`/`SHOP_REACTIVATED` with actor_role ADMIN and a shop/target equal to the path; an ADMIN can see status-change history made by another ADMIN, but cannot see that ADMIN's access logs. The shop status-change event is shared with the OWNER history, and no duplicate record is created. The OWNER audit excludes all `ADMIN_*` read events, even when the event has a shopId.

### Errors and acceptance

A missing or wrong token: `401 unauthorized`; OWNER: `403 admin_access_required`; DISABLED ADMIN: `403 account_disabled`; a UID with no profile: `404 auth_profile_not_found`, with no automatic provisioning or role elevation. An invalid filter/ID/range/page: `400 invalid_admin_query`; a wrong type/date/action enum or an unknown status: `400 validation_failed`. The action filter uses the enum in the first column of the table above, not `ADMIN_*` or money/debt actions.

If the ADMIN audit cannot be stored (or the access history cannot be read): `503 admin_audit_unavailable`, with no protected data returned. A shop status change in section 1 rolls back both the status/reason and the audit when the audit write fails. A rejected, validation-failed or not-found request creates no SUCCESS audit; there is no FAILURE/security audit contract yet. V10 keeps the trigger that blocks UPDATE/DELETE/TRUNCATE; V11 does not edit history or remove that protection. Do not infer that the DB has run V11 from the service starting.

Covers `BR-013`/`BR-014` → `FR-022`–`FR-024`, `NFR-003`/`NFR-009` → `AC-015`–`AC-017`, `AC-040`–`AC-043`, `AC-097`–`AC-100`. Verification of the API/DB is separate from real Firebase, the web dashboard and staging UAT; the web mock is not acceptance evidence.


## 8. OWNER notifications — implemented in Core

Covers `BR-020`, `FR-032`, `AC-055`–`AC-058`. V15 is needed before a runtime using `ddl-auto=validate`; FE or staging UAT is not proven. This is an in-app inbox, not FCM/push.

| Method | Path | Query/body | Response |
|---|---|---|---|
| `GET` | `/api/v1/me/notifications` | `shopId?`, `type?`, `unreadOnly=false`, `page=0`, `size=20` | `200 NotificationPageResponse` |
| `GET` | `/api/v1/me/notifications/unread-count` | `shopId?`, `type?` | `200 { unreadCount }` |
| `PATCH` | `/api/v1/me/notifications/{notificationId}/read` | No body | `204` |
| `PATCH` | `/api/v1/me/notifications/read` | `{ "ids": [1, 2] }` | `204` |

- A Bearer token is required; `X-Shop-Id` and `Idempotency-Key` are not required. The actor comes from the ACTIVE OWNER profile in the DB, not from a header or the client. A UID with no profile returns 404 auth_profile_not_found; ADMIN 403 shop_access_denied; a DISABLED user 403 account_disabled.
- Omitting shopId reads all of the OWNER's valid shops. The shopId filter must be positive: a wrong value gives 400 invalid_shop_id, a shop not owned or nonexistent gives 403 shop_access_denied; ARCHIVED gives 404 shop_not_found. List, count and read all need the right user as recipient and a shop still owned by the user. INACTIVE allows only SHOP_INACTIVATED/SHOP_REACTIVATED; ARCHIVED is excluded entirely.
- type is one of LOW_STOCK, OUT_OF_STOCK, SALE_VOIDED, SHOP_INACTIVATED, SHOP_REACTIVATED; an unknown enum or a wrongly typed param returns 400 validation_failed. page ≥0, size 1–100, `(long)page * size ≤2147483647`; exceeding the limits returns 400 invalid_notification_query. Events are ordered by createdAt then id descending; unread means readAt=null. The page and the element total use the same snapshot/filter.
- `NotificationPageResponse = { items, page, size, totalElements, totalPages }`; `NotificationResponse = { id, shopId, type, title, body, targetType, targetId, createdAt, readAt, resolvedAt }`. id is the notification_event ID, not the recipient ID. targetType PRODUCT/SALE/SHOP corresponds to the type; timestamps are +07:00. dataJson and dedupKey are not returned.
- A batch accepts 1–100 positive, non-null IDs; a wrong body fails validation with 400 validation_failed. Duplicate IDs are merged; an ID that is not visible or does not exist returns 404 notification_not_found and the whole batch rolls back. A non-positive single ID returns 400 invalid_notification_query. Retries or multiple devices do not change the first readAt; new notifications outside the submitted list are not updated.
- LOW_STOCK/OUT_OF_STOCK are created per cycle: one open alert at the same level is kept; a level change resolves the old one and then creates a new one; stock recovery, turning tracking off or archiving resolves without deleting history. resolvedAt does not set readAt on its own, so an ended alert may still be unread. The body holds the stock snapshot at the time it arose, not the current stock.
- Confirm/void/stock-in/stock-adjustment/Product create/PATCH/archive reconcile within the business transaction, under the source lock. A void creates one SALE_VOIDED; an ADMIN changing ACTIVE↔INACTIVE creates one status notification per transition, and resending the same status creates nothing new. A notification failure rolls back the business operation, audit and idempotency; a replay creates no extra event or recipient. SALE_CONFIRMED/PAYMENT_RECEIVED/DEBT_REMINDER/AI_REVIEW_REQUIRED notifications are not emitted in this scope.
- FE needs to call the real inbox/count/read and add Product threshold entry; the current mock badge must not be treated as integration. There is no API to create, edit the content of, or delete a notification, or to mark everything read unconditionally. The void/status content contains no money, customer or sensitive reason; open the shop profile with proper permission to see the INACTIVE reason.
