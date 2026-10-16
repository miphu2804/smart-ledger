# CORE-016 — Android Core preparation (migration intentionally absent)

Scope approved in chat: external browser/Custom Tabs, verified HTTPS App Links, LOGIN and explicit secure LINK on `feat/zalo-android` (#276). Core and the approved related documentation only. No Zalo Android SDK, embedded WebView, FE/AI changes, production migration or deployment is included here. Canonical behavior is defined by the [API contract](../../../docs/contracts/api-contracts.md#zalo-android-core-016), [PRD AC-087–092](../../../docs/product/product-requirements.md#nghiệm-thu-zalo-android-core-016) and [implementation status](../../../docs/architecture/technical-design.md#zalo-android-core-016).

## Rollout boundary

`ZALO_NATIVE_ENABLED=false` by default. This branch **does not add or alter a Flyway migration**. V17 alone remains sufficient for the existing web flow. Native authorization/completion requires the approved future columns and fails with `503 zalo_unavailable` when they are absent. Runtime never executes DDL, creates/adopts tables, or queries native columns on startup. Keep native OFF in every deployed environment until a separately reviewed migration and APK acceptance are approved.

`src/test/resources/fixtures/zalo-native-schema.sql` represents the prospective schema ONLY in disposable UUID-named PostgreSQL test schemas. It is not a migration or a rollout script. Existing users, Firebase identities and shops need no backfill. Durable `external_auth_identities` mappings remain shared between web and Android.

## Deployment-specific configuration

Keep the existing `ZALO_*` provider/Firebase settings. Each deployment explicitly configures one public Android client and fixed return target; client ID, package and certificate are not authentication credentials.

| Setting | Staging | Production |
|---|---|---|
| `ZALO_NATIVE_CLIENT_ID` | `android-staging` | `android-production` |
| `ZALO_NATIVE_RETURN_TARGET_ID` | `core-staging` | `core-production` |
| `ZALO_NATIVE_RETURN_URL` | `https://core-staging-01d2.up.railway.app/mobile/auth/zalo/complete` | `https://core-production-c0c8.up.railway.app/mobile/auth/zalo/complete` |
| `ZALO_NATIVE_PACKAGE_NAME` | `vn.teamhexa.songheloi` | `vn.teamhexa.songheloi` |
| `ZALO_NATIVE_CERTIFICATE_SHA256` | `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C` | `87:2C:CC:33:4C:2B:34:73:FF:63:15:A0:A7:AC:66:74:D1:92:79:9F:1E:4F:66:FC:55:5D:D3:FA:74:69:A8:48` |
| `ZALO_NATIVE_HANDOFF_TTL_SECONDS` | `90` (15–90) | `90` (15–90) |

The return URL must be exact HTTPS on the same origin as `ZALO_CALLBACK_URL`, with path `/mobile/auth/zalo/complete`, no query/fragment/userinfo. App Link association is served at `GET /.well-known/assetlinks.json` once explicit association configuration is valid, even while native login stays OFF; it does not query DB or call providers. Only configured certificates are published. Do not add the staging certificate to production automatically. The app must capture only the return path, not the Zalo provider callback or all Core routes. Android manifest/path enforcement and actual certificate/domain verification remain APK acceptance work.

## API and app integration

1. APK generates separate 32-byte cryptographically random `clientVerifier` (43-character unpadded base64url) and random `requestId` (16–100 URL-safe characters). Keep verifier local to that pending flow, never in the browser URL or logs. Compute `clientChallenge = BASE64URL(SHA256(ASCII(clientVerifier)))`. Abandoned/lost verifier means start a fresh flow.
2. Open **external browser** `GET /api/v1/auth/zalo/native/authorize?nativeClientId=android-staging&purpose=LOGIN|LINK&requestId=...&clientChallenge=...`. No fake Origin header, bearer/UID or caller-controlled return URL. Core stores channel/client/target, hashed state/browser binding/client challenge, encrypted provider PKCE verifier, and sets a unique Secure/HttpOnly/SameSite=Lax host cookie. Session lifetime defaults to 300 seconds. Then Core redirects to Zalo.
3. Keep the registered Zalo callback at `https://<core-host>/api/v1/auth/zalo/callback`. This endpoint dispatches from the persisted session channel, not callback parameters. It verifies cookie/state/app/target/expiry, atomically claims the pending session, then calls Zalo outside the DB transaction. Existing WEB sessions retain their popup `postMessage` contract.
4. Android callback returns 302 to the fixed return target with **fragment**:

   ```text
   #nativeClientId=android-staging&requestId=...&purpose=LOGIN&handoffReference=...
   ```

   A bound consent/provider failure uses `error=<fixed_code>` instead of a reference. Invalid state/cookie/context does not redirect. No provider code, Zalo token, Firebase token, client verifier or web proof is sent to the App Link. The reference is random, only its hash is stored, lifetime at most 90 seconds and never beyond session expiry. Fragment avoids sending the reference to the fallback HTTP endpoint. Browser fallback removes the fragment from history and exposes an explicit “Quay lại ứng dụng” link only for a structurally valid payload. It does not redeem credentials or prove login.
5. APK accepts only its expected exact HTTPS host/path, `nativeClientId`, pending `requestId` and `purpose`. Ignore unrelated/replayed links. LOGIN sends JSON to `POST /api/v1/auth/zalo/native/exchange` (no Origin required):

   ```json
   {"nativeClientId":"android-staging","requestId":"<pending-request-id>","handoffReference":"<43-character-reference>","clientVerifier":"<43-character-local-secret>"}
   ```

   Matching purpose/channel/client/request/target/provider app/verifier and BOTH expiries are checked in one atomic consume. Success returns existing `{firebaseCustomToken,displayName}` JSON with `Cache-Control: no-store`. Use Firebase `signInWithCustomToken`, then the resulting **ID token** with `/api/v1/auth/session`. Do not send the custom token to business APIs. Display name is only an initial hint; session display-name limits still apply.
6. LINK uses the same body at `POST /api/v1/auth/zalo/native/link`, plus the existing Firebase Bearer ID token after recent reauthentication. Core checks revocation and `auth_time` within 300 seconds, matching verified UID and local ACTIVE OWNER. It returns 204 without minting a token. Target UID is never accepted in the body/URL. `409 zalo_identity_conflict` never moves another account's mapping. An already-owned mapping is idempotent with a fresh flow. Disabled/ADMIN accounts cannot be restored or promoted by either channel.

Native endpoints accept only documented fields, share the bounded rate/body guard (30/minute per endpoint/IP bucket, 8 KiB body), and do not loosen web CORS or web Origin validation. Wrong request/channel/purpose/verifier, expiry or replay returns `400 zalo_session_invalid`; disabled/missing schema/config returns `503 zalo_unavailable`. Start a new flow after cancel, timeout, consume or lost verifier. If Firebase fails after consume, the next flow reuses the committed canonical UID, not the consumed reference.

## Verification still required before enabling

- Core real-PostgreSQL suite `ZaloNativeFlowPostgresTest` is mandatory in the Core report gate; provider/Firebase are stubs. It covers V17 web compatibility, missing schema fail-closed, reference/callback concurrency, cross-channel/purpose/replay, both expiries, consent/failure recovery, UID consistency, recent LINK/account conflicts and suspension.
- Core HTTP/controller/OpenAPI tests cover exact anonymous routes, authenticated LINK, no-Origin native completion, unchanged CORS, cookie/redirect payload, request validation, environment-specific association and rate/body guard.
- Separately approve/create/review the actual migration, integrate FE, and run physical APK tests for Android domain verification, browser return, cold/warm start, process exit/cancel, concurrent flows, LINK reauthentication and real Zalo/Firebase signing/revocation. These tests are not implied by Core unit/DB tests. The [ERD](../../../docs/architecture/erd-description.md#zalo-android-core-016-pending-schema) distinguishes prospective columns from deployed V17.
- Verify TLS, trusted proxy/edge throttling, callback query/body/Authorization/cookie redaction and operational backup/recovery before enabling. Rollback disables native and retains durable identity mappings; never delete accounts or mappings as application rollback.

Design references: [RFC 8252 native OAuth external browsers](https://www.rfc-editor.org/rfc/rfc8252.html), [Android domain association](https://developer.android.com/training/app-links/configure-assetlinks).

## Local verification — 2026-10-16

Verified on a disposable PostgreSQL 16 container (loopback-only, tmpfs, no business/staging/production DB):

| Check | Result |
|---|---|
| Maven `verify` with JaCoCo 0.8.14, fresh Surefire reports | 1,349 tests / 98 suites; zero failures, errors or skips |
| Mandatory PostgreSQL report gate | All 14 suites accepted; Android flow suite ran 14 tests |
| CI gate self-tests | 13 passed; missing/skipped/removed Zalo cases are rejected |
| `node --test scripts/test_zalo_native_landing.mjs` | 3 passed; actual Java-rendered script, synthetic fragments, not an Android device |
| Existing `test_zalo_manual.mjs` | 8 passed |
| Existing Chrome popup regression | 3 scenarios passed with loopback/synthetic data |

Native repository/controller/service/page and handoff DTO/result reached full measured Java line coverage; native properties reached 39/42 lines. Coverage is not proof of real-provider or physical-APK acceptance. The future schema was installed only as a test fixture; Flyway migration files and shared databases remain unchanged.
