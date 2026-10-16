# CORE-015 local verification evidence

The initial records below describe the pre-V17 Core-only iteration. On
2026-10-16 the user approved migration/canonical-doc/progress preparation and
confirmed LOGIN with the real-provider local helper. Current preparation
evidence is appended below; older results are retained as dated checkpoints.

Scope: Core-only implementation on `feat/zalo-login`, issue #238. No migration,
frontend, canonical `docs/`, root progress, commit, push or deployment in this
iteration. The user approved the implementation design. This evidence is not
staging acceptance or a new source of product requirements.

## Test-first checkpoints

| Checkpoint | Observed result |
| --- | --- |
| Existing Core compile before implementation | Passed `mvnw -q -DskipTests compile`. |
| New gateway/persistence tests before new classes | RED: test compilation could not resolve the new Zalo classes. |
| New coordinator/controller tests before their implementation | RED: missing coordinator/DTO/controller/page classes. |
| First focused run, 59 cases | 12 errors: Spring could not select the limiter constructor and two HTTP test stubs nested Mockito stubbing. Added explicit constructor injection and corrected stubs. |
| Rerun of nine focused suites, 67 cases | GREEN, exit 0. |
| First full disposable-PostgreSQL run, 1,251 cases | One test-only failure: replacing an existing Mockito answer recorded an empty matcher UID. Changed to `doAnswer` to avoid invoking the old answer while arranging the test. No production mapping failure. |
| New transaction-start regression | RED: `CannotCreateTransactionException` escaped as an infrastructure exception. Catch `TransactionException` alongside `DataAccessException` and return sanitized `zalo_unavailable`. |
| Real loopback HTTP deadline regression | RED: partial response stalled past the one-second request timeout; the test hit its four-second wait bound. Replaced synchronous send with an asynchronous response future with an explicit full-transfer deadline and cancellation. No change to the fixed production provider hosts. |

Checkpoint commits were deliberately not created: the user has not authorized
committing implementation changes.

## Verification commands and boundaries

Run from `backend/core`; set `CORE_TEST_POSTGRES_URL`,
`CORE_TEST_POSTGRES_USERNAME`, `CORE_TEST_POSTGRES_PASSWORD` only to a disposable
database. This run uses PostgreSQL 16 in an isolated container bound to loopback,
synthetic credentials, generated per-suite schemas and the existing V1–V16.
Only Zalo tests install `src/test/resources/zalo-auth-schema.sql` after validating
the old schema. It is not a Flyway migration or runtime DDL.

```powershell
.\mvnw.cmd -q '-Dtest=ZaloAuthServiceTest,ZaloHttpDeadlineTest,HttpZaloProviderGatewayTest,FirebaseZaloGatewayTest' test
.\mvnw.cmd -q clean org.jacoco:jacoco-maven-plugin:0.8.14:prepare-agent verify org.jacoco:jacoco-maven-plugin:0.8.14:report
python scripts/test_verify_postgres_tests.py
python scripts/verify_postgres_tests.py target/surefire-reports
node --test scripts/test_zalo_popup.mjs
git diff --check
```

If Python is not installed locally, the Python checks can run in an existing
Python-bearing image with `--network none` and Core mounted read-only. This
run uses that alternative; no package installation or AI code change is needed.
JaCoCo is invoked as a verification tool, not added to the application POM.

## Final local results — verified on 2026-10-16

| Check | Status | Result |
| --- | --- | --- |
| Fresh Surefire reports from the full PostgreSQL/JaCoCo run | Verified | 1,256 tests; 0 failures, 0 errors, 0 skipped. This includes 79 Zalo tests across 11 suites; the two Zalo PostgreSQL suites executed 16 and 6 tests. |
| Build/package recheck | Verified | `mvnw -q -DskipTests verify`, exit 0. This separate build does not replace the full test reports above. |
| Zalo coverage | Verified | Aggregate JaCoCo class counters for production class names containing `Zalo`, including nested classes: 451/489 lines (92.23%) and 243/324 branches (75.00%). These are scoped feature metrics, not whole-Core coverage or complete path coverage. |
| PostgreSQL CI gate | Verified | `verify_postgres_tests.py target/surefire-reports`, exit 0; all required suites and critical methods present, executed, and passing. |
| Gate self-tests | Verified | 13 tests passed, exit 0, including rejection of missing/skipped Zalo reports and removed critical methods. |
| Browser handoff recheck | Verified | `node --test scripts/test_zalo_popup.mjs`, exit 0; one Node test file exercises all three popup scenarios with actual Java HTML/headers and synthetic data. |
| Diff/scope | Verified | Changes confined to `backend/core`; existing untracked `.idea/` preserved. No Flyway migration, FE/AI, canonical docs or root progress changes. No commit/push/deploy. |

Raw local reports are under `target/surefire-reports` and
`target/site/jacoco`; the latter's `index.html` and `jacoco.xml` support coverage
inspection. They are generated artifacts, not files to commit. Earlier failed
or focused runs are diagnostic checkpoints, not the final acceptance report.

## Coverage matrix

| Boundary | Evidence |
| --- | --- |
| Disabled / pre-Zalo database | Coordinator makes no new-table/provider calls; Hibernate validates old schema; existing Firebase session still works. Enabled without tables fails closed without creating tables. |
| OAuth state and proof | Exact browser cookie, hashed state/binding/proof, authenticated encrypted PKCE, TTL, origin/purpose/client-challenge checks, replay and duplicate-parameter rejection. |
| Atomicity / concurrency | Real PostgreSQL: competing callback claims, proof consumption, first-login UID reservations, conflicting links, and linking vs account disable. Only one winner; provider calls follow committed claims. |
| Existing account preservation | Real coordinator/JDBC/existing JPA session service: repeated login keeps one UID/profile; link then login preserves shop/profile/role/status/custom avatar. Provider/Firebase/media are stubs. |
| Firebase boundary | Mock SDK checks UID and disabled status, custom-token mint, revocation-enabled verification and recent `auth_time`; no profile/custom-claim mutation. This is not a real signing/revocation test. |
| HTTP transport | Fixed official URLs, secrets in headers/body rather than URL, no redirects/code retry, capped 64 KiB response, sanitized errors, interruption and actual loopback stalled/oversized body tests. |
| Browser handoff | Chrome headless, actual Java-rendered HTML and original nonce CSP headers, two loopback origins, synthetic proof only: correct origin/source/requestId/purpose and popup closure; orphan restart without visible proof/URL fallback; wrong target origin receives nothing. Initial run passed all three scenarios, exit 0. |
| Abuse controls | Per-path/socket-address limiter, spoofed forwarding headers ignored, bounded map/reset, 8 KiB body limit before JSON parse; no change to unrelated endpoints. |
| CI gate | Both new PostgreSQL suites and critical methods required; gate tests reject missing/skipped reports or removed critical methods. Python gate self-tests: 13 passed. |

## Review and remaining acceptance

Local verification found the constructor issue; independent code/security reviews
and real-transport tests identified the transaction-error and HTTP deadline
issues recorded above. All corresponding regression tests are GREEN.
No other confirmed P1/P2 was found in the reviewed mapping, lock order, linking,
state/proof or account guards. This is scoped review evidence, not a guarantee
that no defect exists.

Still required before rollout:

- Separately approved migration and ERD/schema review; never apply the test fixture
  to a business database or enable the feature there without that migration.
- Permission to update canonical API/BRD/PRD/AC/design/ERD and root progress.
- FE implementation with strict message origin/source/requestId/purpose checks,
  recent Firebase reauthentication for LINK and clear conflict/restart handling.
- HTTPS Zalo → Core callback/cookie and opener/COOP behavior with the real FE,
  actual Firebase signing/ID-token exchange/revocation and external-user UAT.
- Deployment log redaction, trusted proxy socket-address behavior and edge/shared
  rate limiting. The in-memory limiter is per instance, not distributed.
- Native Android/iOS flow is not implemented by this web-popup slice.

Configured project tooling has no Checkstyle/PMD/SpotBugs or OWASP dependency
scan gate. Those checks have not been claimed as passed; no broad tooling/POM
change is included in this feature.

## Opt-in manual login preparation — 2026-10-16

The user approved preparing a temporary HTTPS manual page and a disposable DB,
still Core-only and without migration/commit/push. This is separate from the
full-suite result above; the full 1,256-case suite was not rerun in this step.

- Test-first Node import run failed before helper implementation. The new Java
  configuration tests failed compilation before the manual entry point existed.
- Focused Maven/JaCoCo run: **98 tests across 15 suites**, 0 failures/errors/skips,
  including 3 manual-configuration tests and the two actual PostgreSQL Zalo
  suites. Firebase/Zalo external calls are stubs in these automated suites.
- `node --test scripts/test_zalo_manual.mjs`: **5 passing tests**, real loopback
  gateway requests plus synthetic popup validation/login sequencing. Includes
  exact host/origin/gate, endpoint/method allowlist, body cap and cookie/header
  relay. An initial sandbox loopback denial and a test-client Host header issue
  were resolved; the passing HTTP run uses actual `http.request` headers.
- `node --test scripts/test_zalo_popup.mjs`: **3 Chrome popup scenarios passed**
  again with actual Java HTML/CSP and synthetic proof, not real provider login.
- `mvnw -q -DskipTests verify`: passed after the helper changes. The packaged JAR
  contains neither the manual entry point nor the test SQL/manual page. No new
  migration files or out-of-Core edits were introduced.
- `start-zalo-manual.ps1 -Mode Database` applied existing V1–V16 and the test
  fixture only to labeled loopback PostgreSQL `smartledger-zalo-manual` on
  port 55449. Repeating `ZaloManualServer --check-db` validated version 16 and
  did not recreate/drop existing tables; both Zalo tables are present.
- Official Cloudflare Windows binary 2026.10.1 downloaded only into ignored
  `target/`, SHA-256 verified before execution. The paired gateway/tunnel mode
  starts a public HTTPS origin and stops its own tunnel on exit/two-hour expiry.
  Public HTTPS checks returned page **200**, verifier **200** with the expected
  meta tag and no-store; unauthenticated authorization without the temporary
  gate returned **401**. These checks did not send provider credentials.
- No real App Secret/service-account file was loaded for this preparation.
  Real local Core startup/signing, user Zalo consent, Firebase REST exchange,
  `/auth/session`, repeated-user UAT and Zalo hostname acceptance still require
  the user's private configuration and manual run. A public 200 HTML/verifier
  alone is not proof of login success.

Usage and shutdown are in [the manual guide](zalo-manual-login.md). No production
Spring security rule was opened for the test page; it lives in a loopback Node
gateway and the Java manual launcher is on the test classpath only.

### Manual runtime startup regression — 2026-10-16

The user's first real startup reached and validated the disposable database,
then failed with missing `AuthIdentityRepository`. The old launcher included
all of `target/test-classes`; component scanning picked up unrelated test
`@Configuration` classes that exclude DataSource/JPA auto-configuration. The
earlier isolated/unit checks did not cover this full startup boundary.

The launcher now stages only `ZaloManualServer` and its inner classes plus the
test SQL into a fresh runtime directory, alongside production classes and Maven
dependencies. It does not change application repositories, security or schema.
`test_zalo_manual_launcher.ps1` passed under both PowerShell 7 and Windows
PowerShell, checking the runtime contains no test configurations/properties and
retains the exact SQL fixture; the initial test failed before the runtime helper
existed. The five Node helper tests passed again.

The corrected actual launcher was started with the private configuration the
user had filled, without printing its contents. Core started successfully with
the real configured Firebase SDK and pinned disposable PostgreSQL. Real HTTP
`GET /actuator/health/readiness` returned **200 / UP**, while anonymous
`GET /api/v1/me` remained **401**. No OAuth authorization/code exchange/custom
token mint or account creation was initiated by this startup check. Live Zalo
login acceptance still requires the user's browser action. No migration,
out-of-Core edits, commit or push were performed for the fix.

## Approved V17 and staging preparation — 2026-10-16

This checkpoint supersedes the earlier no-migration/no-canonical-doc boundary:
the user approved preparing V17, canonical documents and append-only progress,
but not committing, pushing, opening a PR, deploying or migrating a shared DB.
The user separately reported real-provider local LOGIN success; that is not an
automated check of provider roles, real-provider LINK or the staging consumer.

| Check | Observed result |
| --- | --- |
| Branch synchronization | Fast-forwarded `feat/zalo-login` to fetched staging `120779d`; restored existing Core work. Resolved only the overlapping security hunk, preserving staging's exact verifier GET and the intended pre-auth routes. No new commit. |
| Migration test-first | Before V17 existed, five new cases were RED (2 failures / 3 errors). Actual V17 then passed; the final suite has six passing cases, including non-owner RLS reads and writes. |
| Actual migration coverage | Fresh V1–V17, V16 upgrade preserving existing owner/identity/shop, no-op repeat, transactional failure/retry, provider/app uniqueness, lifecycle/duplicate-proof constraints. Real PostgreSQL transactions; no duplicate schema fixture. |
| Database exposure | Both auth stores have RLS enabled and no public policies; PUBLIC and existing `anon`/`authenticated` grants are revoked. Broad non-owner read/write roles cannot expose or insert these rows. Core's trusted production SQL-role setup is still an operator check, not proven by a superuser test connection. |
| OpenAPI test-first | Real-HTTP checks first exposed the missing strict-body schema annotation; after the DTO/controller annotations, both tests pass and match the actual serialized exchange response. |
| Full final build | Java 21 Maven `verify` with JaCoCo exits 0. Fresh Surefire reports contain **1,281 tests / 92 suites, 0 failures / 0 errors / 0 skipped**; 104 cases are in Zalo-named suites. Older reports were moved aside within ignored `target/`, not mixed into the count. |
| PostgreSQL CI gate | All 13 required suites are present without skip/failure/error, including all six critical V17 cases. The gate's 13 self-tests also pass. |
| Manual helper regression | Five Node cases and the Windows PowerShell launcher check pass; the thin launcher contains only the manual entrypoint, with migrations supplied by production classes. |
| Browser regression | Actual Chrome passes all three synthetic loopback popup scenarios: exact-target delivery/receiver checks, orphan fail-closed, and no delivery to the wrong origin. |
| Packaging | The built executable JAR contains V17, the production Zalo controller and exact verifier; it excludes the manual launcher, retired SQL fixture and private configuration. |
| Documentation and scope | BR-022 → FR-010/NFR-003 → AC-079–084 and canonical contract/design/ERD/setup/recovery updated with approval. Relative file links resolve. `git diff --check` passes. No FE/AI implementation edits, secret files or IDE files are included in the intended change. |

All automated DB work used generated schemas in the disposable loopback
PostgreSQL 16.15 instance. The existing legacy manual-test schema was not reset,
adopted or migrated. The revised launcher refuses unversioned auth-store adoption
instead of silently rewriting history; the user must separately choose a fresh
disposable DB when using that launcher version.

Before staging merge, review `FLYWAY_ENABLED` (Zalo feature-off does not stop
startup migrations), backup/recovery ownership, intended Core SQL role and
persistent encryption/signing credentials. Real-provider LINK, FE/web/native
acceptance, edge/proxy logging and Railway behavior remain unverified. No
shared/business DB operation, commit, push, PR or deployment was performed.
