# Manual Zalo login against local Core

This is opt-in test tooling for CORE-015 #238, not a deployed feature or the
canonical API contract. Tooling stays under Core; the later V17/document
preparation is separate and does not deploy or run shared-DB migrations.

## Boundaries

- Core: `127.0.0.1:18081`, a separate process from normal development Core.
- PostgreSQL: container `smartledger-zalo-manual`, label
  `smartledger.purpose=zalo-manual-disposable`, port `127.0.0.1:55449`, database
  `zalo_manual`, schema `core_zalo_manual`. Synthetic credentials are hard-coded
  exclusively for this disposable container. The launcher rejects other mounts,
  labels, ports or database settings. It does not load the repo `.env.staging`.
- Existing V1–V17 migrations are applied only there. The test entry point is in
  `src/test`, not the packaged application. The earlier separate schema fixture
  is retired; V17 is now the single SQL source.
- Database data is in **tmpfs**: stopping/restarting the container or Docker
  loses it. Keep the container running between repeated-login checks. A Core
  restart alone preserves identity mappings, but invalidates in-flight OAuth
  sessions because the test encryption key changes.
- The HTTPS tunnel forwards **only to gateway port 8792**, never normal Core
  `8080/8000`, test Core `18081`, or PostgreSQL. The gateway binds loopback and
  allows only authorize/callback/exchange, `POST /auth/session`, `GET /me`,
  its own test page and the domain verifier. Business APIs and LINK are blocked.
- The test page's temporary unlock cookie is Secure/HttpOnly/SameSite=Lax.
  Its key is generated per gateway run and stored only in a private local
  shortcut under ignored `target/`. The gateway expires after two hours. Do not
  share the shortcut or its URL fragment. The gateway is not a production proxy.
- Zalo and Firebase calls during manual login are **real**. Firebase is pinned
  to dev/staging project `smart-ledger-c2892`; production service accounts and
  Auth Emulator configuration are rejected. This can create a real Firebase Auth
  user even though Core business data is isolated. Use your own disposable test
  accounts and acknowledge the checkbox. No automatic Firebase user deletion.
- LOGIN does not automatically link an existing Email/Google/Facebook account.
  To preserve an existing account, test the separate LINK flow before its first
  Zalo LOGIN. This helper intentionally has no LINK UI or raw ID-token input.

## 1. Prepare the database

Open PowerShell, with Docker Desktop running:

```powershell
Set-Location D:\Ki-8\EXE201\project\smart-ledger\backend\core
.\scripts\start-zalo-manual.ps1 -Mode Database
```

The same command may be rerun without clearing an already running test DB.
Do not use the ordinary Compose command: it may select the shared staging DB.

## 2. Obtain an HTTPS test origin

Use an existing, trusted HTTPS tunnel to `http://127.0.0.1:8792`. The tunnel
provider terminates TLS and can see this test traffic: do not use production
credentials/accounts, request-body inspection or DEBUG/TRACE logging. Zalo must
accept/verify the chosen hostname; that is a manual acceptance step, not proved
by local tests.

On the preparation machine, the official Windows amd64 `cloudflared` 2026.10.1
binary has been downloaded into ignored `target/zalo-manual/cloudflared.exe`,
not installed globally. SHA-256 was checked against the official release asset:
`4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6`.
The opt-in gateway mode rechecks that checksum before running it. Start both
gateway and tunnel in one terminal:

```powershell
node scripts/zalo-manual-server.mjs --tunnel
```

This mode prints only the assigned public origin, does not log/persist tunnel
request messages and closes its own tunnel when the gateway stops/expires.
Keep the terminal open; restarting changes the origin and invalidates the old
shortcut/cookie. It writes the current public origin to
`target/zalo-manual/current-origin.txt`, with no credentials.

For another machine, use the official [Cloudflare download instructions](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
and review the checksum before changing the pinned helper version. Alternatively
start an already installed/trusted tunnel separately and use the fixed-origin
gateway in step 4. Account/config prerequisites and limitations are in
[Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
No global install or ngrok account is required by the bundled preparation.

## 3. Create private configuration

Copy [the example](../scripts/zalo-manual/.env.example) into a private file outside
the repository, for example:

`D:\Ki-8\EXE201\project\secret\zalo-manual.env`

For this preparation a blank-secret local config is also provided at
`backend/core/target/zalo-manual/.env`, with the current test origin already set.
Fill `ZALO_APP_SECRET` and the absolute `ZALO_MANUAL_FIREBASE_CREDENTIALS` path
there, or use the private file outside Git. The file in `target/` is ignored
but **will be removed by Maven clean**; do not run clean while using this setup.
If the tunnel restarts, update the origin manually in your chosen config.

Fill these five fields (plain `KEY=value`, optional surrounding quotes;
comments must be on their own line):

```dotenv
ZALO_MANUAL_ORIGIN=https://your-current-test-host.example
ZALO_APP_ID=3632655625730637557
ZALO_APP_SECRET=YOUR_REAL_ZALO_APP_SECRET
ZALO_MANUAL_FIREBASE_CREDENTIALS=D:/private/firebase-dev-staging-service-account.json
ZALO_MANUAL_CONFIRM_FIREBASE_STAGING=true
```

Use the exact HTTPS origin **without trailing slash**. The service-account file
must have `project_id=smart-ledger-c2892` and signing credentials. This file is
for Core only; never enter it or the Zalo App Secret into the browser. Do not
reuse the old smoke helper env file without adapting its field names. Do not
paste credentials into chat or use them as command-line arguments.

## 4. Start the gateway and register the temporary callback

If you used `--tunnel` in step 2, the gateway is already running: skip the next
command. Only for a separately managed tunnel, use another PowerShell terminal:

```powershell
Set-Location D:\Ki-8\EXE201\project\smart-ledger\backend\core
.\scripts\start-zalo-manual.ps1 -Mode Gateway -ConfigFile D:\Ki-8\EXE201\project\secret\zalo-manual.env
```

In Zalo Developers → Login with Zalo → Web, **add** and save:

```text
https://your-current-test-host.example/api/v1/auth/zalo/callback
```

Keep the existing Railway callback for future staging use. The URL for this
manual run must point to the **same gateway** that opens authorization, because
its browser binding cookie cannot move between Railway and the test hostname.

If Zalo requests hostname/URL-prefix verification, the gateway serves the
previously downloaded public verifier at:

```text
https://your-current-test-host.example/zalo_verifierMysnBA7R831YqgKCwDCT0HgaYGlsqb9MCpOu.html
```

The verifier is public and ungated but is not the callback. Do not use the
staging verifier HTML as the login callback. If Zalo rejects this tunnel's
hostname, stop and use a verified, stable test hostname; do not weaken Core's
state/cookie/HTTPS guards or redirect codes through staging.

## 5. Start isolated Core

In a third PowerShell terminal:

```powershell
Set-Location D:\Ki-8\EXE201\project\smart-ledger\backend\core
.\scripts\start-zalo-manual.ps1 -Mode Core -ConfigFile D:\Ki-8\EXE201\project\secret\zalo-manual.env
```

Keep it running. The launcher compiles test tooling and runs the actual Core
application with the pinned local database, real gateways and Hibernate
validation. It rejects a production credential file. It does not replace any
normal IntelliJ Core run or change Railway variables.

The launcher copies only `ZaloManualServer` and its inner classes into a fresh
`target/zalo-manual/runtime-*` directory; migrations come from production classes. The whole
`target/test-classes` directory must **not** be on the running application's
classpath: unrelated test `@Configuration` classes disable JPA auto-configuration
and cause missing repositories such as `AuthIdentityRepository`. Test the
runtime isolation after compiling with:

```powershell
.\scripts\test_zalo_manual_launcher.ps1
```

**V17 transition:** a manual DB created by the earlier fixture has tables but
no V17 history. The new launcher refuses to adopt/reset it automatically. The
currently running old manual session can continue; before a new run, decide
explicitly whether to discard its disposable data by stopping only
`smartledger-zalo-manual` and rerunning Database mode. This loses temporary
Core mappings and can lead to a new real Firebase test UID on the next LOGIN.
Keep any real Firebase cleanup a separate approved action. Do not apply this
procedure to a shared/business DB or use Flyway repair to force V17 acceptance.

When using the prepared ignored config instead, the command is:

```powershell
.\scripts\start-zalo-manual.ps1 -Mode Core -ConfigFile .\target\zalo-manual\.env
```

## 6. Log in from the generated shortcut

Open `backend/core/target/zalo-manual/open.html` **on your own machine**. It opens
the HTTPS test page, unlocks it with the one-run key and removes that key from
the visible URL. Do not open the source `index.html` directly or use plain
`http://127.0.0.1:8792`: the public HTTPS origin is part of the security binding.

1. Enter the Firebase **Web API key** from project `smart-ledger-c2892` settings.
   This is not the service-account private key or the Zalo secret. If API-key
   referrer restrictions are enabled, allow only this test origin temporarily.
2. Read/acknowledge real dev/staging Firebase account creation, then click login.
3. Allow the popup and authenticate in Zalo. Keep the opener page open.
4. The callback returns an opaque proof to the opener. The page checks exact
   origin/source/requestId/purpose and consumes the browser attempt once.
5. `/zalo/exchange` returns a custom token; the page sends it to the official
   Firebase REST `accounts:signInWithCustomToken` operation, then uses only its
   Firebase **ID token** with `/auth/session`. See the
   [Firebase REST reference](https://firebase.google.com/docs/reference/rest/auth#section-verify-custom-token).
6. Success shows only Core user ID, display name, role, onboarding and shop
   count. Tokens, proof, Zalo subject, email and refresh tokens are not printed
   or written to local/session storage. Browser DevTools can still expose
   network credentials; never export/share a HAR or sensitive screenshots.

Repeat LOGIN with the same Zalo account without restarting the database: the
same Core user ID should return. This manual test checks the actual Core flow;
the older port-8791 smoke helper checked Zalo permission only.

## Failure checks and shutdown

- Consent denied: fixed error, no successful Core session; start a new attempt.
- Close popup/expiry: click the reset button then start a fresh attempt; do not
  reuse callback URLs/codes.
- `502`: local Core is not running or not reachable on its test port.
- `503 zalo_unavailable`: check private config/test schema, not shared DB config.
- `503 zalo_provider_unavailable`: Zalo/Firebase/signing/network needs checking;
  do not print raw provider errors or retry the same authorization code.
- `401` gateway: reopen the local shortcut; gateway may have restarted/expired.
- Firebase REST error: confirm API key matches the dev/staging project and its
  restrictions. The page intentionally does not display raw Firebase responses.
- Do not infer native Android/iOS, LINK or production readiness from this test.

Stop the tunnel first, then Core/gateway with Ctrl+C. Remove the temporary
callback/domain entries from Zalo and any temporary API-key restriction change.
Stopping **only the disposable container** discards its tmpfs data:

```powershell
docker stop smartledger-zalo-manual
```

No Firebase user is automatically deleted. A later Core-only test after DB loss
may reserve a new Firebase UID, so keep a record of your own test users in the
Firebase console if you plan a separate, explicitly approved cleanup.

## Local preparation evidence

The helper is prepared, not proof of a successful live OAuth run. Current local
checks and remaining setup are recorded in [the verification log](zalo-auth.tdd.md).
