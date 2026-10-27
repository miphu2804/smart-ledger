# CORE-016 — Android Core integration and V18 rollout

Scope approved in chat: external browser/Custom Tabs, verified HTTPS App Links, LOGIN and explicit secure LINK on `feat/zalo-android` (#276), followed by V18 and staging-configuration preparation. Core and the approved related documentation only. No Zalo Android SDK, embedded WebView, FE/AI changes, shared-DB execution or deployment is included here. Canonical behavior is defined by the [API contract](../../../docs/contracts/api-contracts.md#zalo-android-core-016), [PRD AC-087–092](../../../docs/product/product-requirements.md#nghiệm-thu-zalo-android-core-016) and [implementation status](../../../docs/architecture/technical-design.md#zalo-android-core-016).

## Rollout boundary

`ZALO_NATIVE_ENABLED=false` remains the runtime default. Following migration/enablement approval, this branch now includes `V18__add_zalo_android_handoff.sql` and a reviewed public staging configuration. The user chose **configuration preparation in this branch, Railway activation only after merge**. This is not a live Railway change or shared-DB migration. Production remains off pending separate release approval.

V18 adds channel/client/target/reference/expiry fields to the existing OAuth session store, defaults existing rows to WEB and replaces the WEB-only VERIFIED constraint with channel-aware constraints. V1–V17 are unchanged; the duplicate prospective SQL fixture has been removed and native tests use actual Flyway V18. Existing users, Firebase identities, identity mappings, shops and WEB session values are not rewritten. Runtime repository code never executes DDL or adopts/repairs schema; V17 WEB remains supported, and native enabled before V18 fails closed with `503 zalo_unavailable`.

## Staging activation after merge

1. Review/merge this branch into `staging` through the normal checks. Confirm the migration owner, intended staging DB/history, backup/recovery and maintenance window. Do not migrate the shared DB from the feature branch; do not edit V18 once applied.
2. Keep `ZALO_NATIVE_ENABLED=false`; temporarily stop new OAuth starts during the migration window. Check `FLYWAY_ENABLED`: feature-off does not stop automatic Flyway startup. Apply V18 only from merged staging code using the [repository migration workflow](../../../docs/development/local-development.md#database-migrations), and verify successful history/checksums and Core's private-store access.
3. V18 is one PostgreSQL transaction with 5-second lock timeout and 60-second statement timeout. Its ordinary unique-index/constraint build locks the transient OAuth table; it is **not zero-downtime** and has not been benchmarked on a production-sized table. Lock/schema conflicts roll back the whole V18 and leave V17 usable. Correct the cause, then retry normally; do not baseline/repair or manually adopt unexpected columns.
4. Review/copy the public variables in [config/zalo-native-staging.env.example](../config/zalo-native-staging.env.example) into **Railway staging only**, after the schema step. This sets native on with the exact staging callback, client, return URL, package and certificate. The file is not auto-loaded by Spring/Railway and contains no secret or DB/migration switch. Keep existing Zalo app credentials, session encryption key and Firebase signing credentials in Railway's secret configuration; never replace them with blanks or use production credentials.
5. Confirm Zalo Developer's exact Core staging callback and verified domain, HTTPS/proxy/redaction/throttling, and the staged `assetlinks.json`. The APK must match its signing certificate and exact App Link path. Run LOGIN/LINK and the physical-device checks below on the signed staging APK; configuration approval does not mean those checks have passed.
6. Recovery: set `ZALO_NATIVE_ENABLED=false`, retain V18 columns and all durable mappings/UIDs. WEB remains usable with native off; do not remove columns, delete users/mappings or restore an old schema over live data as application rollback. Any later destructive removal requires a reviewed forward migration. Production activation is a separate release, not implied by copying the staging example.

## Deployment-specific configuration

Keep the existing `ZALO_*` provider/Firebase settings. Each deployment explicitly configures one public Android client and fixed return target; client ID, package and certificate are not authentication credentials. The production column below is reference metadata, **not approval to activate production**.

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

## Provider failure diagnostics (WEB and Android)

Filter **Core Deploy Logs** for `zalo_provider_failure` after deploying this change. These are application logs, not Railway's HTTP access log. Each failed provider operation emits one WARN line with fixed metadata only:

```text
zalo_provider_failure stage=profile reason=invalid_error_field http_status=200 provider_error=unknown error_shape=absent elapsed_ms=120
```

This is a synthetic example, not a finding from staging. `stage=token` means the code-to-token operation; `stage=profile` means the subsequent user-profile operation. The client still receives the existing `zalo_provider_unavailable`; diagnostic details are not returned to FE or placed in the callback/App Link.

| Field / reason | Interpretation |
|---|---|
| `http_status` | Received status; `0` means no complete HTTP response was available to the gateway (including a body-transfer failure after headers). It is not a provider status code. |
| `provider_error` | Signed 32-bit integer from a parsed JSON `error` field, or `unknown`. Non-200 responses are not parsed for this field. Never infer a particular cause from `unknown`. |
| `error_shape` | `absent`, `non_integer`, `integer`, `out_of_range`, or `unknown`; never the raw value. |
| `http_error`, `provider_error` | HTTP status rejected, or a parsed provider error. Compare the numeric provider code with Zalo's documentation before changing credentials or permissions. |
| `missing_access_token`, `invalid_access_token` | Token field absent/invalid, or unsafe for an HTTP header. |
| `invalid_error_field`, `invalid_profile` | Profile/error structure fails existing validation. Missing `error` remains rejected; this logging change does not relax authentication. |
| `invalid_json`, `invalid_response`, `response_too_large` | JSON parsing, shape/empty body, or the existing 64 KiB body bound failed. |
| `timeout`, `dns_error`, `tls_error`, `connect_error`, `io_error`, `transport_error`, `interrupted` | Allowlisted transport classification; exception messages/stack traces are not logged. |
| `elapsed_ms` | Monotonic elapsed time for the failed operation, not total login time. |

Never enable raw HTTP wire/request/response logging to diagnose this flow. This event excludes app secret/ID, authorization code, verifiers, tokens, cookies, URLs, headers, provider messages, user IDs/names and arbitrary exception details. Success does not produce a provider diagnostic line. Existing rate limits/deadlines/no-retry behavior remain unchanged.

An `authorize` response of `503 zalo_unavailable` happens before provider I/O and will not produce this event; check the active deployment's feature/config/schema/store instead. No provider event also does **not** prove success or that Firebase/FE/App Links work. After a fresh test, share only the timestamp and sanitized diagnostic line. This change needs no migration or new environment variable; it does not activate or deploy itself.

Local validation on 2026-10-17: test-first diagnostics RED (19 assertion failures, no errors, across 20 cases), followed by GREEN and expanded coverage. All 160 Zalo unit/HTTP/loopback tests in 19 suites pass with zero failures/errors/skips; PostgreSQL suites were explicitly excluded, not executed against shared databases. A separate fresh JaCoCo run of 37 focused tests measures gateway coverage at 94/95 lines and 89/104 branches. These tests use synthetic payloads, including hostile provider messages/exception details, and assert one sanitized WARN per failure, unchanged public error codes, no retries, deadline/cancellation behavior and no raw identity/credential output. They do not verify a real Zalo account, Railway log delivery or the actual cause of the reported staging failure.

## Callback outcome diagnostics (WEB and Android)

After merge/deploy, use **Core Deploy Logs**, not Network Logs or the browser Console:

1. Clear the log filter and locate the INFO startup marker `zalo_callback_diagnostics_ready version=1` in the active deployment. It identifies this instrumentation being initialized, not provider/config/schema readiness or a successful login. If absent, check the deployed revision, log time range and logger level before inferring an auth failure. This marker requires INFO enabled for `com.smartledger.core.controller.ZaloAuthController`; do not enable raw HTTP logging.
2. Start one fresh login from the app/web. Note its time and channel; do not reuse old callback URLs.
3. Filter for `zalo_callback_result` and share only that fixed-metadata line and timestamp. Error outcomes are WARN; prepared handoffs are INFO. No extra variable or migration is required; changes are not active before the new code is deployed.

Synthetic examples (not findings from staging):

```text
zalo_callback_result channel=web outcome=error_returned http_status=200 error_code=zalo_provider_unavailable credential_present=false elapsed_ms=545
zalo_callback_result channel=android outcome=handoff_ready http_status=302 error_code=none credential_present=true elapsed_ms=320
```

| Field / outcome | Meaning and next boundary |
|---|---|
| `channel` | `web` or `android` selected by existing server session dispatch; `unknown` if rejection/failure happens before dispatch completes. Never taken from a callback channel parameter. |
| `handoff_ready` | Core constructed the existing HTML/redirect response with a proof/reference and no error. It does **not** prove delivery to `window.opener`, Android App Link handling, `/exchange`, Firebase or Core-session completion. Check those next if login still fails. |
| `error_returned` | Core constructed an error handoff; WEB can still have HTTP 200 and Android HTTP 302. `credential_present` only indicates whether a proof/reference exists, never its value. |
| `rejected` | A business exception escaped the callback; the original exception and HTTP mapping remain unchanged. `http_status` is its existing mapped status. Missing/duplicate binding cookie or invalid state/parameters can reject before calling Zalo. |
| `exception` | A runtime exception escaped dispatch, service or rendering. `http_status=0` means no controller response was constructed, **not** the final edge HTTP status. The exception is rethrown unchanged; no exception message/cause/stack is added to this event. |
| `error_code` | Only `invalid_zalo_request`, `zalo_session_invalid`, `zalo_session_expired`, `zalo_consent_denied`, `zalo_unavailable`, `zalo_provider_unavailable`, `none` or `other_error`. Unknown text and incomplete handoffs become `other_error`; the existing client response is unchanged. |
| `elapsed_ms` | Monotonic elapsed time within the callback controller, not complete login time. |

For `zalo_provider_unavailable`, also look for the existing `zalo_provider_failure` event near the same time to distinguish token/profile/transport failures. No provider event by itself proves neither failure nor success. For a prepared handoff but no exchange, examine FE reception/browser return next; do not conclude the provider failed from HTTP 200 alone. Timestamp/channel help during a single controlled test, but do not uniquely correlate simultaneous attempts.

One outcome event is emitted per callback **invocation reaching this controller**, including early validation failures. Requests rejected by the edge, security/rate filters or argument binding before controller invocation are outside this event; inspect their sanitized HTTP status separately. Log filtering/levels/retention can also hide events.

Both events exclude query data, request/session IDs, state, code/challenge/verifier, cookies, URLs/origins, proof/reference values, tokens, profile and arbitrary errors. Never share a callback URL, response HTML/Location, HAR export, cookie, token or secret. This instrumentation preserves callback payloads, nonce/CSP, cookie clearing, routing, status codes, validations and service calls; it does not retry, change login behavior or diagnose the current staging root cause without a fresh event.

Local validation on 2026-10-17: the initial 25 callback-diagnostic cases failed assertions before implementation (zero test errors); the expanded 28 cases pass. The fresh Zalo non-PostgreSQL regression passes 188 tests across 20 suites, with zero failures/errors/skips. A separate JaCoCo data file records full line/branch coverage of `callback`, `handoffDiagnostic`, `callbackDiagnostic` and `diagnosticError`; the complete controller reaches 72/72 lines and 44/46 branches. Tests assert response/cookie/CSP compatibility, unchanged exception identity, one outcome event per invocation, hostile-error sanitization and absence of synthetic sensitive data in formatted logs, arguments and throwable metadata. PostgreSQL, real-provider/APK acceptance and Railway log delivery were not rerun or verified by this diagnostic-only change.

## Verification and remaining APK acceptance

- Core real-PostgreSQL suites `ZaloNativeMigrationPostgresTest` and `ZaloNativeFlowPostgresTest` are mandatory in the Core report gate; provider/Firebase are stubs. Migration tests cover fresh/upgrade/no-op, data preservation, early/late rollback, lock timeout and RLS; flow tests use actual V18 for concurrency/replay/expiry/UID/LINK safeguards and a separate real V17 schema for WEB compatibility/missing-V18 fail-closed behavior.
- Core HTTP/controller/OpenAPI tests cover exact anonymous routes, authenticated LINK, no-Origin native completion, unchanged CORS, cookie/redirect payload, request validation, environment-specific association and rate/body guard.
- Integrate FE and run physical APK tests for Android domain verification, browser return, cold/warm start, process exit/cancel, concurrent flows, LINK reauthentication and real Zalo/Firebase signing/revocation. These are not implied by Core unit/DB tests. The [ERD](../../../docs/architecture/erd-description.md#zalo-android-core-016-v18) documents V18 and the distinction between checked-in migration and actual shared-DB rollout.
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

Native repository/controller/service/page and handoff DTO/result reached full measured Java line coverage; native properties reached 39/42 lines. This dated preparation run used the former test-only schema fixture, before V18 approval. Coverage is not proof of real-provider or physical-APK acceptance. See the new V18 verification entry in [PROGRESS.md](../../../PROGRESS.md) for the subsequent migration-backed run; shared databases remain untouched by local tests.

## V18 verification — 2026-10-17

Fresh Java 21 Maven `verify` with JaCoCo 0.8.14 passed **1,358 tests / 100 suites, zero failures/errors/skips**, using actual V1–V18 in disposable loopback/tmpfs PostgreSQL 16. The mandatory report gate accepts all 15 PostgreSQL suites, including 7 V18 migration cases and 14 native-flow cases; its 13 self-tests pass. The staging example has 2 passing configuration/default-off tests. All 11 Node helper/landing tests and 3 real Chrome popup scenarios pass with synthetic data. The V17 compatibility test uses a separate migrated schema rather than deleting V18 columns.

The production JAR contains all 18 migrations but no test fixture, manual tooling, staging env example or private credential file. Native repository/controller/service/page and DTO/result retain full measured Java line coverage; properties reach 40/42. This proves local Core/migration behavior, not Railway activation, shared-DB rollout, real native-provider/Firebase or signed-APK acceptance.
