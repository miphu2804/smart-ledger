### [2026-10-05 14:10 UTC+07:00] — [Core] Allow browser calls from listed origins (CORS)

**Done:** Core enables Spring Security CORS with a `CorsConfigurationSource` built from `smartledger.cors.allowed-origins` (env `CORS_ALLOWED_ORIGINS`, comma-separated, wildcard patterns such as `https://smart-ledger-*.vercel.app`). Empty means no browser origin is allowed. Preflight passes without a token; credentials stay off because auth uses a bearer header. Edited `backend/core` with the owner's explicit approval.

**Changed files:**
- `backend/core/src/main/java/com/smartledger/core/config/SecurityConfiguration.java` — modified
- `backend/core/src/main/resources/application.yml` — modified
- `backend/core/src/test/java/com/smartledger/core/config/CorsWebTest.java` — created
- `docs/development/ci-cd.md`, `frontend/mobile/README.md` — modified

**Flow explained:** Browser → OPTIONS preflight → `CorsFilter` inside the security chain answers before the bearer filter. **Check:** `mvnw test` 359 tests pass, `CorsWebTest` 2/2 (allowed origin 200, unknown origin 403). Not verified: a call from a Vercel preview to Core staging.

### [2026-10-05 13:23 UTC+07:00] — [Mobile] Point the dev machine at Core staging on Railway

**Done:** Mobile dev now calls the deployed Core staging (`https://core-staging-01d2.up.railway.app`) instead of a Core started with Docker Compose on the dev machine. `dev-cors-proxy.js` picks `https` or `http` from `CORE_URL`, so the web build can reach the HTTPS staging Core.

**Changed files:**
- `frontend/mobile/.env.example` — modified (staging endpoint preset)
- `frontend/mobile/README.md` — modified ("Nối Core thật", `dev-client`, web proxy)
- `frontend/mobile/scripts/dev-cors-proxy.js` — modified (HTTPS upstream)

**Flow explained:** The Railway domain belongs to the `core` service in the staging environment and does not change between deploys. A local backend is only needed while changing backend code. **Check:** `/v3/api-docs` returned 200 through the proxy and `/api/v1/me` returned 401 with `Access-Control-Allow-Origin`. Not verified: a Firebase sign-in from the app against staging (needs the app's Firebase project to match Core staging's `FIREBASE_PROJECT_ID`).

### [2026-10-05 13:00 UTC+07:00] — [Core] Read the Firebase service account from an env variable

**Done:** `core` crashed on Railway staging with "Your default credentials were not found" because Railway cannot mount the key file `GoogleCredentials.getApplicationDefault()` needs. `FirebaseAdminConfiguration` now builds credentials from `firebase.service-account-json` (env `FIREBASE_SERVICE_ACCOUNT_JSON`) when set and otherwise falls back to Application Default Credentials, so local and Compose setups are unchanged. Edited `backend/core` with the owner's explicit approval, despite the AGENTS.md rule.

**Changed files:**
- `backend/core/src/main/java/com/smartledger/core/config/FirebaseAdminConfiguration.java` — modified
- `backend/core/src/main/java/com/smartledger/core/config/FirebaseProperties.java` — modified
- `backend/core/src/main/resources/application.yml` — modified
- `backend/core/.env.example` — modified
- `backend/core/src/test/java/com/smartledger/core/config/FirebaseAdminConfigurationTest.java` — created
- `docs/development/ci-cd.md` — modified

**Flow explained:** the unit test generates an RSA key, builds a service-account JSON and checks `firebaseApp` initializes without any key file; it passed with `FirebaseAdminTokenVerifierTest`. Unverified on Railway until `FIREBASE_SERVICE_ACCOUNT_JSON` is set and the service restarts.

### [2026-10-05 12:45 UTC+07:00] — [Config] EAS dev client profile to run the app on an emulator against a local Core

**Done:** Added the `dev-client` profile to `frontend/mobile/eas.json` (extends `development`, `environment: preview`, Android APK). The EAS `development` environment has no variables, so a build from the old `development` profile has no `google-services.json` and Firebase phone sign-in cannot start on Android. `dev-client` takes `GOOGLE_SERVICES_JSON` from the `preview` environment. The resulting dev client loads its JavaScript from Metro, so pointing the app at a Core running on the developer machine needs only `EXPO_PUBLIC_API_ENDPOINT=http://10.0.2.2:8000` in `.env` and a Metro restart, not a new APK. The mobile README lists the profile and uses it in the Android build step.

**Changed files:** `frontend/mobile/eas.json`, `frontend/mobile/README.md`, `PROGRESS.md` — modified.

**Flow explained:** `eas build --profile dev-client` produces a debug dev client signed with the default EAS keystore, the same one `phone-test` used, so its SHA-1/SHA-256 are already registered in Firebase and the APK installs over a `phone-test` build. The three `EXPO_PUBLIC_MOCK*` flags and `USE_MOCK` must be `false` in `.env` for the app to call a real Core.

**Check:** `eas build --platform android --profile dev-client` finished (build `e53593c4`, APK). `eas env:list` shows `GOOGLE_SERVICES_JSON` only in `preview`. `adb install -r` of this APK over the installed `phone-test` build succeeded, which confirms one keystore for both. On a Pixel 9 emulator (Android 16, API 36) with Core and AI from Compose against the shared staging Supabase, a Firebase phone sign-in with a test number reached `POST /auth/session` and `POST /shops`, and the sale and void calls returned 2xx. Not verified: another EAS account, iOS, a physical device with this profile; the `production` profile is unchanged.

### [2026-10-05 12:00 UTC+07:00] — [CI/CD] Inline the Railway deploy job into ci.yml

**Done:** Deleted `.github/workflows/cd.yml` and moved its `deploy` job into `ci.yml` with `environment:` set on the job itself. The reusable-workflow version received an empty `RAILWAY_TOKEN` (`secrets.RAILWAY_TOKEN` evaluated to `null` in the run debug log) even though the `railway-staging` environment secret existed. Updated `docs/development/ci-cd.md`.

**Changed files:**
- `.github/workflows/ci.yml` — modified
- `.github/workflows/cd.yml` — deleted
- `docs/development/ci-cd.md` — modified

**Flow explained:** `deploy` still runs only on a push to `staging` or `main` after `ai`, `core`, `mobile-web` and `container-images` pass; the environment branch policy and the `railway-production` approval apply as before. Unverified until the first run on `staging` shows `RAILWAY_TOKEN: ***`.

### [2026-10-05 11:20 UTC+07:00] — [CI/CD] Split CD workflow and merge environments into the ci-cd diagram

**Done:** Moved the Railway deploy into `.github/workflows/cd.yml`, called from `ci.yml` after `ai`, `core`, `mobile-web` and `container-images` all pass on a push to `staging` or `main`; it writes a `deploy-summary-<branch>` artifact. Merged the environments diagram into `ci-cd.drawio` (dev machine, per-provider infra boxes, CI PostgreSQL) and removed `environments.mmd`/`.svg`. Added `docs/architecture/diagrams/README.md` with the diagram guide.

**Changed files:** `.github/workflows/ci.yml`, `.github/workflows/cd.yml`, `docs/development/ci-cd.md`, `docs/architecture/diagrams/src/ci-cd.drawio`, `docs/architecture/diagrams/images/ci-cd.svg`, `docs/architecture/diagrams/README.md`, `docs/README.md`, `docs/architecture/technical-design.md`, `docs/architecture/diagrams/src/environments.mmd` (deleted), `docs/architecture/diagrams/images/environments.svg` (deleted), `PROGRESS.md`.

**Flow explained:** `workflow_call` keeps the pushed ref, so the `railway-staging`/`railway-production` branch policies still apply; a `workflow_run` trigger would run on the default branch and break them. `mobile-web` now also gates deploy. Not verified: the called workflow on GitHub (first push to `staging`), Railway ports, the Vercel edge status.

### [2026-10-04 10:40 UTC+07:00] — [Config] Keep Flyway off against the shared dev/staging database

**Done:** Compose now passes `FLYWAY_ENABLED` to Core with a default of `false`, and the host run command sets it to `false`, so a developer machine no longer migrates the database it shares with staging. A new README section, "Database migrations", says to develop migrations on a disposable PostgreSQL and to migrate staging only from merged `staging` code, done once by one person until a staging deploy exists.

**Changed files:** `compose.yaml`, `README.md`, `CONTRIBUTING.md`, `backend/core/README.md`, `backend/ai/README.md`, `docs/architecture/technical-design.md`, `docs/architecture/diagrams/src/environments.mmd`, `docs/architecture/diagrams/images/environments.svg`, `PROGRESS.md`. No Core or AI code change.

**Flow explained:** With Flyway off, Core still runs Hibernate `validate`, so it starts only when the shared schema matches its entities. A branch that needs an unmerged migration must run against a disposable database. `FLYWAY_ENABLED=true` in the shell or an `--env-file` turns migration back on for the migration owner.

**Check:** `docker compose config` gives `FLYWAY_ENABLED: "false"` by default and `"true"` when it is set in the shell or an env file; the environments diagram re-rendered with `mmdc`; relative links and anchors resolve. Not verified: the current Flyway and AI migration version of the staging database.

### [2026-10-04 10:15 UTC+07:00] — [Docs] Refresh docs sync after merging #84–#86

**Done:** Merged `staging` into `docs/sync-docs-with-staging` and updated the docs that #84–#86 made stale. The mobile README now documents the `/profile` save to Core, `useCoreData` and `checkoutSession`, and the EAS profiles with `GOOGLE_SERVICES_JSON`. Technical design §1 says the business screens read and write through Core. CONTRIBUTING now says a dated release branch must also be added to the `release-policy.yml` allow-list.

**Changed files:** `frontend/mobile/README.md`, `docs/architecture/technical-design.md`, `CONTRIBUTING.md`, `PROGRESS.md` (conflict resolved by keeping every entry in time order).

**Flow explained:** No code or behavior change.

**Check:** Relative links and anchors across tracked Markdown resolve; the screen-to-API claims were checked by grepping `app/` for the API clients each screen imports.

### [2026-10-04 03:00 UTC+07:00] — [Feature] Void a sale and record the refund from the order screen

**Done:** The order detail screen has a "Huỷ đơn" button that voids a confirmed sale with `POST /api/v1/sales/{saleId}/void`, and a voided sale shows the refund read with `GET /api/v1/sales/{saleId}/refund`. The form asks for a reason, whether to return the items to stock and, when money was collected, how it is refunded (cash or bank transfer, with an optional transfer reference). Core refunds everything collected, including debt repayments made after the sale, cancels the remaining debt and does not move money itself, so the form says so. The request carries an `Idempotency-Key`: after a network failure or timeout the same form sends the same key, so a retry cannot void or refund twice. An already voided sale (409 `sale_already_voided`) reloads the screen instead of showing an error. The debt of a voided sale (`VOIDED`) is no longer counted as owed or as paid on the debts screen and in the totals. Vietnamese messages added for the sale, refund and idempotency error codes.

**Changed files:** `frontend/mobile/src/lib/saleVoid.ts` — created; `frontend/mobile/app/invoice/[id].tsx`, `frontend/mobile/app/debts.tsx`, `frontend/mobile/src/lib/{salesApi,mockCore,coreAdapters,errors}.ts`, `frontend/mobile/src/data/types.ts` — modified; `PROGRESS.md`.

**Flow explained:** `buildVoidRequest` turns the form into the body Core accepts: the reason is required, a refund method is sent only when money was collected (Core rejects it for an unpaid sale), and the transfer reference only for a transfer. `saleApi.void` goes through the shared idempotent sender. The mock Core now implements the void and refund endpoints with the same rules, so the screen can be tried without a Core. The mock keeps no per-line "stock deducted" snapshot, so it treats every line of a tracked product as deducted.

**Check:** `tsc --noEmit` clean; 52 scratch cases (not in the repo) cover the form rules, the request path, body and key reuse after a failure, the refund and debt arithmetic in the mock for a paid, a partly paid, an unpaid and a repaid-then-voided sale, stock restoring once and not on a replay, and the VOIDED debt being left out of the totals. In the browser with the mock Core: validation messages for a missing reason and refund method; voiding a partly paid order showed the refund and transfer reference, the overview revenue fell by the order total and the owed amount by the cancelled debt, and the debts screen dropped that customer; an unpaid order showed no refund choice. Not verified: a real Core with Firebase sign-in, the UI after a network failure or a 503, a sale whose stock cannot be restored, and a phone.

### [2026-10-04 02:40 UTC+07:00] — [Feature] Save the shop profile to Core

**Done:** The "Chỉnh sửa thông tin" screen now saves the shop name, address and industries to Core with `PATCH /api/v1/shops/{shopId}`; before, every field stayed on the device and was lost on another phone or after signing in again. Only the fields that changed are sent, and nothing is sent when none changed, because each update writes a `SHOP_UPDATED` audit row. On a Core error the screen stays open with a Vietnamese message and nothing is reported as saved. Save is blocked while no industry is selected, since Core rejects an empty `industry`. Also fixes reading the industries back: Core keeps the selection as one string such as `food, drink`, and the session mapping turned it into a single entry, so the screen showed "Chưa chọn ngành" after the next sign-in for a shop with several industries. Vietnamese messages added for `shop_update_required`, `shop_access_denied`, `shop_not_found` and `invalid_shop_id`.

**Changed files:** `frontend/mobile/src/lib/shopProfile.ts` — created; `frontend/mobile/src/lib/{sessionApi,errors}.ts`, `frontend/mobile/src/store/AppStore.tsx`, `frontend/mobile/app/profile.tsx` — modified; `PROGRESS.md`.

**Flow explained:** On save the screen compares the form with the stored shop (trimmed, industries as a set), calls `sessionApi.updateShop` only for the changed fields and, once Core answers, copies the returned name, address and industries into the local store. An empty address clears it, as Core treats a blank `address` as a delete while an absent field keeps the old value. The shop ID is in the path, so no `X-Shop-Id` header is sent. Full name, email, Facebook and the bank account have no field in Core, so they are still kept on the device only, and the screen now says so.

**Check:** `tsc --noEmit` clean; 29 scratch cases (not in the repo) cover the request path, method and body, the industry mapping both ways, the changed-field diff, the Vietnamese error messages and the mock mode. In the browser with the mock Core: editing the name and address updates the Management screen, reopening the screen shows the saved values, and deselecting every industry shows the hint and blocks Save. Not verified: a real Core with Firebase sign-in, the error toast on a failed save in the UI, and a phone.

### [2026-10-04 01:55 UTC+07:00] — [Config] EAS phone-test profile to check phone sign-in on a device

**Done:** Add an EAS build profile `phone-test` that builds an APK with real Firebase and a mocked Core session, so phone sign-in can be checked on a device before a Core is deployed. `preview` now builds an APK too. `app.config.js` reads `google-services.json` from the EAS file variable `GOOGLE_SERVICES_JSON`, because the file is git-ignored (the repository is public) and an EAS cloud build never sees it. `.env` is not on EAS either and `USE_MOCK` defaults to true, so the profile sets the `EXPO_PUBLIC_*` flags itself.

**Changed files:** `frontend/mobile/eas.json` — modified; `frontend/mobile/app.config.js` — created; `PROGRESS.md`.

**Flow explained:** On EAS, `GOOGLE_SERVICES_JSON` (a secret file variable in the `preview` environment) gives the path of the file; on a developer machine the variable is absent and `./google-services.json` is used as before. Before sign-in works on a build, the SHA-1 and SHA-256 of that build's keystore (`eas credentials --platform android`) must be added to the Android app in Firebase. After sign-in the business screens call the real API, so they show network errors until a Core is reachable.

**Check:** `eas build --platform android --profile phone-test` finished (build `ac00cc4e-ceb9-48dd-9fe0-022a4266e2c4`); `expo config` resolves `googleServicesFile` both without and with the variable; the SHA-1 and SHA-256 read from the installed APK match the ones in Firebase. The owner reports the APK signed in with a Firebase test phone number on a real Android phone. Not verified: sign-in with a real SMS number, automatic SMS reading, and the Android emulator, whose DNS failed on the development machine until it was started with `-dns-server 8.8.8.8,8.8.4.4`.

### [2026-10-04 00:57 UTC+07:00] — [Docs] Sync documentation with staging code and add a reading guide

**Done:**
- Added a "How to read the docs" guide, a target-versus-implemented rule and a "which document to update" table to `docs/README.md`; implementation status now lives only in technical design §1 and per-endpoint status in the API contract.
- Corrected docs that described Core as auth-only, AI as uncalled, Agent routes as target-only, Flyway as V1–V9, AI env names with `__`, a Compose `postgres` service and an all-mock mobile app.
- Removed Qdrant from the architecture drawio/SVG/PNG, added chat summary columns and current migration ranges to `erd.dbml`, and mapped `FR-019`, `FR-026`, `FR-027` in the BRD hand-off table.

**Changed files:** `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `backend/{ai,core}/README.md`, `frontend/{README.md,mobile/README.md,mobile/.env.example,web/README.md}`, `docs/README.md`, `docs/product/{project-overview,business-requirements,product-requirements}.md`, `docs/architecture/{technical-design,erd-description}.md`, `docs/architecture/adr/0001-vector-store-pgvector.md`, `docs/architecture/diagrams/{src/architecture.drawio,src/erd.dbml,images/architecture.svg,images/architecture.png}`, `docs/contracts/api-contracts.md`, `docs/design/*.md`; deleted `docs/architecture/diagrams/assets/icons-sources.md` (it credited logos the diagram does not contain).

**Flow explained:** No code or behavior change.

**Check:** Relative links and anchors across all tracked Markdown resolve; `erd.dbml` converts with `@dbml/cli`; the diagram re-export was inspected visually.

### [2026-10-03 22:25 UTC+07:00] — [Integration] Merge staging UI/UX and agent history into the mobile real-data branch

**Done:** Merged `origin/staging` (UI/UX revamp #79, agent conversation history #80, AI English-only #78, staging/production database config #71, CodeRabbit #68) into `feat/mobile-real-data`. Home, More, Reports, Best sellers and Notifications keep the new layouts and read Core data through `useCoreData`; checkout keeps the draft session. The redesigned voice screen collected spoken expenses but had no button to save them, so the "Khoản chi chờ lưu" card saves them to Core again. The voice screen now starts with an empty order and a greeting: the redesign seeded two sample items with ids 101 and 102 and a canned "Đã ghi 8 Sting" chat, which do not exist in Core and would fail or sell the wrong product at checkout. The 56 `PROGRESS.md` entries that #79 dropped (earlier PRs, including #73, #74 and #77) are restored, because the log is append-only.

**Changed files:** conflicts resolved in `frontend/mobile/app/{(tabs)/index,(tabs)/more,analytics,bestsellers,checkout,notifications,voice}.tsx` and `PROGRESS.md`; no change to Core or AI.

**Flow explained:** each conflicted screen takes staging's layout and re-applies the Core data wiring on top: `ready = !loading && !error` gates the numbers, a skeleton shows during the first load and an error card with a retry button on failure. `PROGRESS.md` was rebuilt as the union of the base, staging and branch entries in time order, and the result only adds lines to staging's file.

**Check:** `tsc --noEmit` clean; the 29 idempotency and checkout scratch cases pass on the merged code; every `require()` asset exists. In mock-Core mode in a browser: Home shows 3 orders, 265.000đ revenue and 748.000đ debt, which match the mock data; a spoken expense was saved and listed under Expenses; a voice order was checked out and sale #7 appeared exactly once. Not verified: a real Core with Firebase sign-in, and the Docker stack, because staging's `compose.yaml` now needs `.env.staging`, `backend/core/.env` and `backend/ai/.env`, which are not on this machine. `expo start` and `expo export` need `npm install` for the new `expo-build-properties` plugin.

### [2026-10-03 10:42 UTC+07:00] — [Fix] Mobile reads real Core data and cannot record a money write twice

**Done:** Home, Reports, Best sellers, Notifications and More read Core data instead of the mock store, and the canned "AI suggestion" and "data backed up" notifications are gone. A spoken expense is now created in Core (it used to go to the mock store and vanish). The barcode scanner no longer adds sample products that do not exist in Core. Checkout keeps its draft between taps, so retrying after a lost `confirm` response no longer records a second sale. Expense and debt-repayment retries reuse one `Idempotency-Key`, two quick taps send one request, and a `503 resource_busy` is retried with the same key.

**Changed files:** `frontend/mobile/src/lib/{useCoreData,coreAdapters,checkoutSession}.ts` — created; `frontend/mobile/src/lib/{idempotency,api,mockCore,stats,notifications}.ts`, `frontend/mobile/src/data/types.ts`, `frontend/mobile/app/{checkout,voice,analytics,bestsellers,notifications}.tsx`, `frontend/mobile/app/(tabs)/{index,more}.tsx`, `frontend/mobile/src/components/BarcodeScannerModal.tsx`, `frontend/mobile/.gitignore` — modified; `frontend/mobile/src/lib/useReport.ts` — deleted. No backend, docs or compose files changed.

**Flow explained:** `useCoreData` loads sales, products, debts and expenses on screen focus and maps them to the shapes `stats.ts` already uses; only the first load shows a spinner. `createCheckoutSession` remembers the draft id: on a retry it asks Core for that draft first, returns the sale if it is already CONFIRMED, re-confirms the same draft if the cart is unchanged, and cancels it and creates a new one if the cart changed. `createIdempotentSender` keeps a key only after a network, timeout or 5xx failure and drops it after success or a 4xx; `mockCore` now mimics Core's key rules (400 without a key, 409 for a different body, replay for the same body).

**Check:** `tsc --noEmit` clean; scratch harnesses (not checked in) passed 22 data-logic cases and 29 idempotency and checkout cases, including a control showing the old checkout recorded two sales after a lost confirm response; in mock mode in the browser a checkout, an expense and a debt repayment each recorded once. Not run against real Core (no sign-in), and the keys are kept in memory only, so closing the app mid-request loses them.

### [2026-10-03 07:54 UTC+07:00] — [UI/UX] Floating Cart Bar Elevation, Free-floating 3D Robot Mascot & Realistic Product Photos

**Done:**
1. **Floating Cart Bar (POS / Sales Tab)**:
   - Elevated position (`bottom: insets.bottom + 104px`) to prevent collision with bottom TabBar.
   - Conditional rendering (`count > 0`) with smooth spring entry/exit animation (`Animated.spring`, `translateY` + `scale` + `opacity`).
   - Dynamic ScrollView `paddingBottom` (`190px` when active, `96px` when empty).
2. **Free-Floating 3D Assistant Mascot (ZenRing)**:
   - Replaced old badge with transparent 3D mascot (`bubblelogo.png`) floating freely without white circular bounding box or clipping.
   - Enlarged `RING_SIZE` from `64px` to `72px`.
   - Decreased idle fade (`IDLE_OPACITY: 0.85`), keeping the robot crisp and bright.
3. **Voice Screen Refinements (Đọc đơn)**:
   - Updated manual input button and inline keyboard icon to keyboard symbol (`MaterialCommunityIcons: keyboard-outline`).
   - Sổ Nghe Lời chat avatar mapped to glossy 3D robot.
   - Voice button calm breathing animations with soft ambient ripples.
4. **Realistic Product Photos**:
   - Created `src/lib/productImages.ts` mapping Vietnamese grocery, beverage, and retail items to realistic product photos.
   - Replaced generic placeholder icons/letters in Voice order notebook, POS Grid & List cards, Cart Sheet, and Checkout review with real product photos.
5. **Safe Navigation**:
   - Guarded all `router.back()` calls with `router.canGoBack()` fallback to prevent unhandled `GO_BACK` exceptions.

**Changed files:**
- `frontend/mobile/src/lib/productImages.ts` — created product image resolver
- `frontend/mobile/assets/bubblelogo.png` — added transparent 3D mascot asset
- `frontend/mobile/assets/glossy-robot-notebook.png` — added robot mascot asset
- `frontend/mobile/src/components/MascotBadge.tsx` — updated to free-floating mascot
- `frontend/mobile/src/components/ZenRing.tsx` — updated size, opacity, and transparent ring container
- `frontend/mobile/app/voice.tsx` — updated keyboard icon, product photos, safe goBack
- `frontend/mobile/app/pos.tsx` — elevated floating cart bar, product photos, safe goBack
- `frontend/mobile/app/checkout.tsx` — product photos in order review
- `frontend/mobile/app/profile.tsx` & `frontend/mobile/app/(auth)/email.tsx` — safe goBack
- `PROGRESS.md` — logged entry

### [2026-10-02 23:58 UTC+07:00] — [Feature] Core proxies the agent API to AI

**Done:** Core forwards `/api/v1/agent/*` (chat, list, detail, rename, delete) to AI `/internal/v1/agent/*` with `X-Internal-Token`, taking `user_id` and `shop_id` from the verified owner's shop. AI `404` maps to `conversation_not_found`; timeouts, connection failures and other AI errors map to `503 ai_unavailable`. The AI read timeout is 40 s, below the mobile 45 s chat timeout. Follow-up to the entry below: `AgentService` now requires `guardrail_limits: GuardrailLimits` instead of an optional middleware list, so a caller cannot run the agent without guardrails, and `LEAK_PATTERN` takes view names from `SqlGuard`; AI test placeholder data is English.

**Check:** AI `ruff` clean, `pytest` 233 passed / 22 skipped, and the 48 integration tests pass with `POSTGRES_TEST_URL`; Core `mvn test` 122 passed (Docker, Temurin 21). No end-to-end mobile → Core → AI chat with a live model was run.

### [2026-10-02 23:35 UTC+07:00] — [Refactor] Split the AI agent service by use case

**Done:** `AgentService` now owns only one chat turn. The rolling-summary workflow moved to `ChatSummaryFolder` in `src/agent/summary.py`, next to the pure fold planning it uses. The four conversation list/detail/rename/delete forwarding methods are gone: those routes call `AgentConversationRepository` directly. The two tool factories are now `build_history_tools` and `build_shop_data_tools`, and the agent's guardrails are assembled in `main.py` instead of being read from global config inside the service. No HTTP contract or migration changed.

**Changed files:** `backend/ai/src/agent/{service,summary,routers,tools}.py`, `backend/ai/src/main.py` — modified; `backend/ai/tests/unit_tests/{test_agent_service,test_agent_guardrails,test_shop_data_tool}.py`, `backend/ai/tests/integration_tests/{test_agent_chat,test_agent_conversations,test_internal_auth}.py` — modified; `PROGRESS.md` — updated.

**Flow explained:** `AgentService(model, conversations, sql_executor=None, guardrails=None)` keeps `chat` and `_context_messages`; the summary model is no longer a constructor dependency and the service reads no global settings, so `main.py` builds the middleware with `build_guardrails(app_config.AGENT_*)` and passes it in. `ChatSummaryFolder(summary_model, conversations).fold(conversation_id, user_id, shop_id)` holds the batch loop and `_rewrite_summary`, while `plan_fold`, `split_into_batches` and `FoldPlan` stay pure. `main.py` puts `conversations`, `agent` and `summary_folder` on app state; the chat route resolves the folder for the post-reply background fold, and the conversation routes resolve the repository. Fold behavior, watermark chaining, and the 404/503 mapping are unchanged; the conversation routes no longer 503 when the chat model is absent, a state that was unreachable in production because `app.state.agent` is always an `AgentService`.

**Check:** `uv run ruff check` and `uv run ruff format --check` clean; `uv run pytest`: 255 passed with `POSTGRES_TEST_URL` against a temporary local PostgreSQL 16 (233 passed, 22 skipped without it), matching the pre-refactor baseline. No live model call was made.

### [2026-10-02 22:35 UTC+07:00] — [Refactor] Unify AI prompts in English and simplify the SQL guard, executor and guardrails

**Done:** All prompt text moved into one package, `backend/ai/src/prompt_templates/`, and rewritten in English as short numbered rules for a small model; the agent still always answers the owner in Vietnamese. The custom exceptions `UnsafeSqlError`, `SqlQueryError` and `SqlUnavailableError`, the `SqlResult` dataclass, the `GuardrailSettings` protocol, `InputLengthGuard`, `OutputGuard` and `ToolErrorMiddleware` are gone. No change to the HTTP contract, the migration or the guard's rules.

**Changed files:** `backend/ai/src/prompt_templates/{__init__,shop_agent,sql_agent,chat_summary}.py` — created; `backend/ai/src/agent/prompt_template.py`, `backend/ai/src/sql/schema_prompt.py` — deleted; `backend/ai/src/sql/{guard,executor}.py`, `backend/ai/src/agent/{guardrails,tools,service}.py`, `backend/ai/README.md`, `backend/ai/tests/unit_tests/{test_sql_guard,test_shop_data_tool,test_agent_guardrails,test_agent_service}.py`, `backend/ai/tests/integration_tests/test_sql_reader.py`, `PROGRESS.md` — updated.

**Flow explained:** `SqlGuard(row_limit).validate_and_wrap(sql)` holds the allowlists as class constants and raises `ValueError("CODE: detail")`. `ReadOnlySqlExecutor.run` returns a plain dict and raises `ValueError("QUERY_TIMEOUT: ...")` or `ValueError("SQL_ERROR: ...")`; `psycopg.OperationalError` and `InterfaceError` propagate, so the router still answers `503 ai_unavailable`. The `query_shop_data` tool catches a `ValueError` that starts with an upper-case code and returns `Error[CODE]: reason. Rewrite the query and retry.` as text; any other exception fails the turn. `AgentGuardrails` is one `AgentMiddleware` with `before_agent` (input length) and `after_agent` (empty or leaking answer); `build_guardrails(max_input_chars, model_call_limit, tool_call_limit)` returns it with the PII and call-limit middleware. The schema moved from the tool description into the system prompt, and the tool descriptions are one line.

**Check:** `uv run ruff check` and `uv run ruff format --check` clean; `uv run pytest`: 255 passed with `POSTGRES_TEST_URL` against a temporary local PostgreSQL 16.14 (233 passed, 22 skipped without it). Combined system prompt 4856 chars before, 4563 after; tool description 845 before, 74 after. No live model call was made, so the new prompts are untested against a real model.

### [2026-10-02 22:19 UTC+07:00] — [Feature] Read-only text-to-SQL tool for the shop agent and mobile chat wiring

**Done:** Closes AI-010 (#76) on the AI and mobile side. The agent gains a `query_shop_data` tool that runs one model-written `SELECT` over three shop-scoped views (shop profile, categories, products) as the read-only role `ai_sql_reader`; there is no SQL HTTP endpoint. Deterministic LangChain middleware guardrails wrap the agent. The mobile assistant screen now sends messages through `agentApi` instead of a local regex mock.

**Changed files:** `backend/ai/migrations/004_create_ai_read_views.sql`, `backend/ai/src/sql/{__init__,guard,executor,schema_prompt}.py`, `backend/ai/src/agent/guardrails.py`, `backend/ai/tests/unit_tests/{test_sql_guard,test_shop_data_tool,test_agent_guardrails}.py`, `backend/ai/tests/integration_tests/test_sql_reader.py`, `frontend/mobile/src/lib/agentApi.ts` — created; `backend/ai/src/agent/{service,tools,prompt_template}.py`, `backend/ai/src/{app_config,main}.py`, `backend/ai/{pyproject.toml,uv.lock,.env.example,README.md}`, `compose.yaml`, `frontend/mobile/app/ai.tsx`, `frontend/mobile/src/data/types.ts`, `frontend/mobile/src/lib/mockCore.ts`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, `PROGRESS.md` — updated.

**Flow explained:** The views filter on the transaction setting `smartledger.shop_id`, hide `shop_id` and are `security_barrier`. The tool reads the shop from `ToolRuntime[AgentContext]`, so the model only passes `sql`. `SqlGuard` (sqlglot AST) accepts one `SELECT`/`WITH`/`UNION` over the views with allowlisted functions and casts, re-parses its own rendering, and wraps it in `LIMIT`. The executor opens its own connection, runs `READ ONLY` with a bound shop id, `statement_timeout` 3000 ms and 100 rows, and always rolls back. Guard and database errors return to the model as `Error[CODE]` through `ToolErrorMiddleware`; an unreachable reader fails the turn as `503 ai_unavailable`. Guardrails: input length, `PIIMiddleware` (card mask, key/token redaction on input, stored redacted), model 4 / tool 3 call limits, and an output check for empty or leaking answers. Migration number `004` is used because `002` is reserved for pgvector. Core still has no `/api/v1/agent/*` proxy, so the mobile client works only in mock mode until that lands.

**Check:** `uv run ruff check`, `uv run ruff format --check` clean; `uv run pytest`: 253 passed with `POSTGRES_TEST_URL` against local PostgreSQL 16.14 (two shops with the same product name, cross-shop attempts, reader role privileges, `security_barrier` error leak, statement timeout, chat turn after a timeout). Mobile `npm run typecheck` and `npm run export:web` passed; mock `/agent/*` endpoints exercised in Node. No live model call was made.

### [2026-10-02 UTC+07:00] — [Docs] Add OWNER audit requirements and acceptance traceability

**Done:** Added `BR-017`, `FR-028`/`FR-029` and `AC-033`–`AC-039` for existing transactional success audit and OWNER-only history. Corrected the outdated BRD statement that general audit was not implemented and replaced the API contract's missing-FR/AC note with links to the canonical requirements.

**Changed files:** Approved `docs/product/business-requirements.md`, `docs/product/product-requirements.md`, `docs/contracts/api-contracts.md` and this new root progress entry. No Core/FE code, entity, migration, CI or legal/tax requirement change. Earlier progress entries remain unchanged.

**Flow explained:** Traceability now connects business audit integrity to recording/query behavior and acceptance criteria for actor/context, full void effects, rollback/replay, shop authorization, filters/pagination, append-only storage and metadata privacy/legacy readability. Replay guarantees remain limited to the existing protected flows, not every create API. OWNER audit history is separate from deferred ADMIN support-read/security/failure auditing and FE screens; business tables remain the source of money/debt/stock totals.

**Check:** Reran four existing audit/web/migration suites with Java 21 and a disposable PostgreSQL 16 database: 44 tests passed, zero failures/errors/skips (20 audit PostgreSQL, 9 migration, 10 audit service, 5 audit web). Confirmed new IDs/references and document links, unchanged legal/tax sections, code/schema alignment and clean diff whitespace. Existing suites plus source inspection support the criteria; no new tests were added for every HTTP authorization/method or ordering-boundary combination. No existing local database or real Firebase credential was used.

**Remaining boundaries:** Requirements and API/DB evidence do not establish FE/staging/production acceptance or completion of ADMIN audit `NFR-009`/`AC-017`. The separately identified FE unknown-result idempotency risk remains unchanged. This documentation change is local only: no commit, push, PR comment resolution or merge was performed.

### [2026-10-02 UTC+07:00] — [Integration] Synchronize latest staging and preserve Core review fixes

**Done:** Fast-forwarded local `feat/core-business` from `635c80f` to remote `dde20d9`, preserving the eight newer review-fix commits, then merged staging `8af60b7`. Resolved only the two document conflicts without replacing either branch's history. This checkpoint supersedes the earlier integration entry's outdated frontend-header and pending API-contract wording notes.

**Changed files:** Manual edits are limited to `PROGRESS.md` and `docs/contracts/api-contracts.md`, explicitly approved for this merge. AI and `compose.yaml` are imported unchanged from staging. Core, frontend and CI are unchanged from remote Core `dde20d9`; no entity or Flyway V1-V10 change is introduced. Existing progress entries from both branches remain verbatim; `.idea/`, local secrets and build artifacts are excluded.

**Flow explained:** The contract preserves implemented Core business/audit APIs while incorporating staging's AI rolling summaries, history search and mandatory `X-Internal-Token` for internal routes. The AI health endpoint stays public; Core has no AI proxy yet. The newer Core fixes retain precise database-conflict responses, centralized audit actions and rejection of mixed catalog/custom draft items. Imported FE now supplies financial idempotency headers, but its ten-minute in-memory key lifetime is not a safe guarantee for retries with an unknown result after timeout/restart.

**Check:** Java 21 Maven clean verify with JaCoCo passed 346 tests, zero failures/errors/skips, including 99 contract cases, 34 required PostgreSQL migration/business/rollback/concurrency cases and two PostgreSQL timestamp mapping cases. The six CI-gate tests and the gate against actual PostgreSQL reports passed. Overall line coverage is 90.6%, branch coverage 77.9%. Built the Core Docker image and started it against a disposable PostgreSQL 16 database with synthetic credentials: Flyway V1-V10 succeeded, Hibernate validation passed, runtime UID is 10001, OpenAPI exposes 44 operations and returns HTTP 200, and a protected API without a token returns 401. Compose configuration validation with explicit synthetic environment values passed. Code-preservation comparisons, conflict-marker and whitespace checks passed; no existing local DB or real Firebase credential was used.

**Remaining boundaries:** Push updates existing PR #73, not a new PR or a direct staging push. Staging merge remains gated on new-head CI, review and the FE unknown-result idempotency policy; this merge does not fix that FE risk or prove live FE/Firebase/AI integration. Static-analysis/CVE plugins are not configured and were not installed/run. Imported AI code was checked for equality with staging, not locally exercised against live model providers. Older progress entries remain historical checkpoints, not current deployment claims.

### [2026-10-02 UTC+07:00] — [Integration] Merge staging into Core and verify business contracts

**Done:** Resolved all 43 Core conflicts while integrating staging `3333227` into `feat/core-business`. Preserved current idempotency, custom sale items, full void/refund, debt cancellation, event-time reports and transactional audit. Incorporated staging's expense write locks, paid-draft archived-customer handling and precise year-boundary assertions. Included the previously prepared Core contract/checkout rollback tests and PostgreSQL CI execution gate.

**Changed files:** Core expense repository/service, draft confirmation service, expense/report and draft unit tests, `AuditLogPostgresTest`, new `CoreBusinessContractWebTest`, two Core CI-verification scripts, the approved Core step additions in `.github/workflows/ci.yml`, and this new progress entry. Frontend, release-policy and contribution updates are imported unchanged from staging, not manually edited. Existing entities and Flyway V1-V10 are unchanged relative to pre-merge Core; no new migration, secret, IDE file or build artifact is included.

**Flow explained:** Expense PATCH/archive serialize on the same active row; unrelated PATCH fields cannot overwrite an earlier committed change and a writer waiting for archive is rejected rather than resurrecting the row. A fully paid draft whose selected customer was archived may confirm using the draft's name/phone snapshot with sale.customerId null and no new debt/customer; unpaid/partial drafts still require an active selected customer. Barcode handling keeps Core's stricter constraint recognition rather than mapping every database failure to 409. Contract checks cover 22 Category/Product/Draft/Sale/Payment/Refund operations; CI now enables real PostgreSQL suites and fails if reports are missing, skipped, failing or missing required checkout rollback methods.

**Check:** Maven clean verify with JaCoCo and all opt-in PostgreSQL tests enabled passed 340 Java tests, 0 failures/errors/skips, including 99 contract cases and 34 real PostgreSQL cases (20 audit/business, 5 repayment/void, 9 migration). New deterministic PostgreSQL concurrency tests observe actual lock waits and verify merged PATCH values/audit plus archive rejection. Checkout late-write failure/retry, earlier stock-change rollback and cross-shop tests pass. Six Python gate tests pass; the gate passes on actual PostgreSQL reports; CI YAML/wiring checks and diff whitespace checks pass. Overall line coverage is 90.4%, branch coverage 77.4%. Tests used a disposable PostgreSQL 16 database, not an existing local DB or real Firebase credentials.

**Remaining boundaries:** Remote CI and live FE/Firebase integration are not established by local tests. Imported FE still omits required Idempotency-Key for expense creation and debt repayment; the FE owner must align these requests without weakening Core protections. Additional BRD/PRD/API-contract wording for archived-customer confirmation awaits separate permission to edit docs. Static-analysis and dependency-CVE scan plugins are not configured and were not installed/run. Shared history is preserved without rebase/force-push; the scoped pre-merge stash is retained as a recovery copy and `.idea/` is untouched.

### [2026-10-02 UTC+07:00] — [Feature] Add approved Flyway V10 for Core audit history

**Done:** Added `V10__create_audit_logs.sql` after explicit migration approval, superseding the no-migration boundary in the entry below. The migration creates or adopts the compatible local Hibernate table, adds actor/shop references, context/action/JSON checks and query indexes, and rejects UPDATE/DELETE/TRUNCATE through append-only triggers. It does not modify V1-V9 or delete/backfill historical audit data.

**Changed files:** Core V10 migration, `SaleRefundMigrationPostgresTest`, `AuditLogPostgresTest`, and this new `PROGRESS.md` entry. The audit implementation and tests described below are included in the same feature delivery; other modules/docs/default runtime configuration remain unchanged.

**Flow explained:** Flyway now supplies the audit schema before Hibernate `validate`. Existing valid Hibernate-created rows and identity sequence are preserved; invalid references/context/JSON shape stop migration and all V10 DDL rolls back. Audit business integration tests now use the actual V1-V10 migrated schema rather than Hibernate-created tables or a hand-written idempotency fixture. DB triggers protect append-only DML, but a schema owner/superuser can disable them; separate restricted application and migration DB roles are still required for production hardening.

**Check:** Core Maven clean verify with JaCoCo and all opt-in PostgreSQL tests enabled passed 229 tests with 0 failures/errors/skips. The 9 migration tests cover fresh schema and all entity mappings, V8 upgrades, adoption of real Hibernate-created audit rows, every current action/target mapping, invalid audit context/references, blocked UPDATE/DELETE/TRUNCATE, atomic failure/retry and no-op reruns. The 11 audit PostgreSQL business tests pass with Flyway enabled and Hibernate validation, including concurrent replay and full rollback. Audit line coverage remains 96.9%. Tests ran only against a disposable PostgreSQL 16 DB; no existing local database or Firebase credentials were used.

**Remaining boundaries:** Local configurations previously disabling Flyway should use `FLYWAY_ENABLED=true` and `SPRING_JPA_HIBERNATE_DDL_AUTO=validate` when adopting V10. Existing manually created invalid rows need review before migration can succeed; no automated repair is supplied. Docs/API-contract alignment, ADMIN support-read/failure/security auditing, remote CI, real Firebase/FE integration and production role/backup/retention readiness remain unverified or deferred. Older progress entries are preserved as historical checkpoints.

### [2026-10-02 UTC+07:00] — [Feature] Add transactional Core audit history without migration

**Done:** Added success-only audit events for sale confirmation/void/refund, debt repayment/cancellation, stock changes/restoration, expense writes, product/category/shop writes and existing ADMIN shop status actions. Added an OWNER-scoped, paginated/filterable `GET /api/v1/audit-logs` endpoint. No audit write/update/delete API is exposed.

**Changed files:** New Core `AuditLog` entity, `AuditAction` enum, append-only repository fragment, writer/query service interfaces and implementations, response DTOs/controller and audit unit/web/PostgreSQL tests; existing Core services, error code and regression tests; this new `PROGRESS.md` entry. Existing business entities, migrations V1-V9, default configuration, `pom.xml`, docs and other project modules are unchanged.

**Flow explained:** Success events join the business transaction; failed business/audit writes roll back money, debt, stock, audit and idempotency reservations together. Confirm and idempotent repayment/expense/void replays do not duplicate events. Actor/shop come from authorized server-side context, including the real ADMIN actor for status changes. Metadata accepts only whitelisted fields/types and excludes raw request/entity snapshots, customer contact values, credentials and transfer references. UTC timestamps and trusted server request IDs group related events. OWNER audit reads require an owned ACTIVE shop and do not create new events; unsupported ADMIN support/dashboard reads are not invented.

**Check:** Reran Maven `clean verify` with JaCoCo and all opt-in PostgreSQL tests enabled against a disposable PostgreSQL 16 database: 226 tests, 0 failures/errors/skips. Audit line coverage is 96.9% (125 covered, 4 missed lines). Tests cover real audit INSERT failures and full transaction rollback, same-key serial/concurrent replay, cross-shop access denial, correct ADMIN attribution, decimal JSONB hydration, unpaid/custom-item voids, SETTLED debt preservation, catalog/expense/shop changes, bounded filters/pagination and absence of audit mutation endpoints. Existing migration/concurrency regression tests also passed. Staged diff/whitespace and sensitive-key-pattern checks passed; no generated reports, local secrets or `.idea/` files are included.

**Remaining boundaries:** No audit Flyway migration or DB-role UPDATE/DELETE restriction was created; append-only is currently enforced by the application entity/repository/API. A fresh/default Flyway + Hibernate-validate startup is not ready for this new entity until its schema is supplied. Local-only manual testing can use `FLYWAY_ENABLED=false` and `SPRING_JPA_HIBERNATE_DDL_AUTO=update`; existing local DBs were not modified by this verification. Migration tests validate the already-migrated business entities, not pending `AuditLog`. Docs/API-contract alignment, failure/security-event auditing, ADMIN support-read auditing, remote CI and staging/production readiness remain unverified or deferred. This entry is added with explicit approval; earlier progress entries are preserved.

### [2026-10-02 UTC+07:00] — [Feature] Verify Core sale void and refund before audit-log work

**Done:** Completed custom sale items, full sale cancellation/refund, remaining-debt cancellation audit, consistent repayment/void lock order, explicit restock selection, event-time revenue/cash reporting, UTC storage with Vietnam API display, and forward-only Flyway V8/V9. Aligned the approved BRD/PRD, API contract and ERD/technical descriptions with Core. General-purpose audit logging remains the next phase; it is not implemented by these debt audit fields.

**Changed files:** Core sale/debt/report DTOs, entities, repositories, services, timestamp configuration, tests and `backend/core/README.md`; `backend/core/src/main/resources/db/migration/V8__allow_custom_sale_items.sql` and `V9__add_sale_refunds_and_debt_void_audit.sql`; `docs/product/business-requirements.md`, `docs/product/product-requirements.md`, `docs/contracts/api-contracts.md`, `docs/architecture/diagrams/src/erd.dbml`, `docs/architecture/erd-description.md`, `docs/architecture/technical-design.md`; `PROGRESS.md`. Existing V1-V7 migrations are unchanged.

**Flow explained:** Custom draft items require a name/unit but no product reference and never create or change catalog stock. Voiding a confirmed sale preserves sale/items/payments, refunds all money actually received, cancels only remaining OPEN debt, and preserves SETTLED history. Required `restockItems` controls full stock restoration using the deduction snapshot; unknown historical snapshots cannot be guessed. Repayment and void lock sale before debt/products, and same-key void retries replay one result. Reports distinguish gross/voided/net revenue from collected/refunded cash by each event's timestamp. Idempotency currently covers repayment, expense creation and sale void; other create endpoints are not covered. Partial returns/refunds and the inventory movement ledger remain deferred.

**Check:** Reran Core `clean verify` with the opt-in PostgreSQL tests enabled against an isolated PostgreSQL 16 database: 202 tests, 0 failures/errors/skips. This includes migration upgrade/rollback constraints and repayment/void concurrency tests. Built the Core Docker image and started it with Flyway enabled and Hibernate schema validation; V1-V9 all succeeded. A separate Firebase Auth emulator and disposable DB passed 16 HTTP smoke assertions covering authentication, confirm replay, partial-payment sale, repayment, full refund/debt cancellation, required restock validation, one-time stock restoration, retained payments, report totals, +07:00 timestamps, cross-shop denial and custom items. SQL independently confirmed refund 60,000 VND, cancelled debt 40,000 VND and two unchanged payments totalling 60,000 VND for the checked sale. OpenAPI exposes 43 operations and marks `X-Shop-Id`, `Idempotency-Key`, `reason` and `restockItems` as required for void. `git diff --check` passed. No business code was changed during this verification; no real Firebase secret or existing local DB was used.

**Remaining verification:** Coverage/static-analysis/dependency-security plugins are not configured, so these gates were not run. Existing Commons Logging/open-in-view warnings remain. Real Firebase, FE integration, remote CI and staging/production migration/backup readiness are not established by this local run. No commit or push was made; `.idea/` and ignored local secrets/build artifacts are excluded from the proposed push. Fetch/recheck the remote branch before the requested push/PR.

### [2026-10-02 17:40 UTC+07:00] — [UI/UX] 3D Metallic Action Cards, Sharp White-to-Grey Gradient & AI Processor Icon

**Done:** Updated "Đơn hàng mới" 4 action buttons on tab Tổng quan:
1. **Longer Rectangular Cards (3D Shape)**: Increased card height to ~68px (`minHeight: 68`, `borderRadius: 14`), providing a comfortable rectangular form factor for title, abstract script, icon, and trailing chevron.
2. **Sharp White-to-Grey 3D Shading**: Built with `LinearGradient` from silvery light grey down to metallic dark grey (`['#27292C', '#17181A', '#0D0E10']`), crisp 3D top-rim highlight border (`borderTopColor: 'rgba(255, 255, 255, 0.36)'`), and depth drop shadow.
3. **Larger Icons with Fine Strokes**: Increased icon optical size to `24px` while keeping strokes fine (`strokeWidth: 1.6`), ensuring high sharpness without thickening borders.
4. **AI Processor Chip Icon**: Replaced assistant headset with a high-tech AI microchip icon featuring circuit connector pins and an internal neural spark core.
5. **Trailing `>` Affordance**: Added chevron `›` on the right side of each card (`Feather` `chevron-right` with subtle contrast).
6. **Abstract Script Subtitles**: Added concise 3-6 word abstract explanations beneath large titles (half size ~10.5px):
   - Đọc đơn: *Lên đơn bằng giọng nói*
   - Chọn hàng: *Chọn sản phẩm thủ công*
   - Quét mã: *Nhận diện mã vạch nhanh*
   - Trợ lý AI: *Phân tích và gợi ý thông minh*

**Changed files:**
- `frontend/mobile/src/components/icons.tsx` — updated ActionIcon with size 24, stroke 1.6, and high-tech AI processor chip
- `frontend/mobile/app/(tabs)/index.tsx` — implemented 3D rectangular cards with LinearGradient, trailing chevrons, and abstract script subtitles
- `PROGRESS.md` — logged entry

**Check:** `npm run typecheck` passed (0 errors); `npm run export:web` passed (code 0).

### [2026-10-02 17:08 UTC+07:00] — [UI/UX] Floating Bubble Navigation, Authoritative Status Bar Rule & Minimalist Outline Actions

**Done:** Refined the UI following user feedback:
1. **Authoritative Status Bar Rule**: Fixed rule applied — `Tổng quan` (`index`) is ALWAYS `light` (white text/icons for time, battery, wifi, signals), and all other tabs (`invoices`, `sales`, `more`) are ALWAYS `dark` (black text/icons). Single authoritative controller in `(tabs)/_layout.tsx` with dynamic key flushing; removed all conflicting `<StatusBar>` instances from child tab screens.
2. **Floating Bubble Navigation**: Redesigned bottom navigation into a floating bubble capsule:
   - Bar: solid white background (`#FFFFFF`), capsule shape (`borderRadius: 32`), thin delicate border (`#ECEAE4`), clean elevation shadow.
   - Indicator: soft dark bubble (`#262522`, `borderRadius: 26`), lighter and softer than harsh solid black.
   - Bubble elastic physics: on press, bubble squashes/softens (`scaleX: 1.05`, `scaleY: 0.95`); on release, springs back. On tab transition, indicator stretches in flight (`scaleX: 1.10`, `scaleY: 0.94`) and springs into shape at the target tab. Reduced motion preserved.
3. **“Đơn hàng mới” Minimalist Outline Actions**:
   - Eliminated solid card backgrounds and container boxes. The 4 actions (Đọc đơn, Chọn hàng, Quét mã, Trợ lý) now blend directly into the deep black header background (`backgroundColor: 'transparent'`).
   - Clean, thin white outline border (`borderWidth: 1`, `borderColor: 'rgba(255, 255, 255, 0.18)'`, moderate `borderRadius: 13`).
   - Fine outline icons (stroke ~1.7) placed directly inline next to labels without circle/square containers:
     - Đọc đơn: fine outline microphone with subtle grill detailing.
     - Chọn hàng: fine outline goods/cart.
     - Quét mã: scanner frame with barcode strips and laser beam.
     - Trợ lý: human assistant headset / support operator symbol, avoiding generic AI sparkles.

**Changed files:**
- `frontend/mobile/src/components/icons.tsx` — updated ActionIcon with fine outline stroke (1.7) and assistant headset icon
- `frontend/mobile/app/(tabs)/_layout.tsx` — implemented solid white capsule floating bar, soft dark bubble indicator with elastic stretch/squash spring physics, authoritative status bar rule
- `frontend/mobile/app/(tabs)/index.tsx` — updated "Đơn hàng mới" to transparent outline cards directly on black, refined collapsed quick actions, removed local StatusBar
- `frontend/mobile/app/(tabs)/invoices.tsx` — removed redundant local StatusBar
- `frontend/mobile/app/(tabs)/more.tsx` — removed redundant local StatusBar
- `frontend/mobile/app/pos.tsx` — conditioned StatusBar to only render when not embedded in tab
- `PROGRESS.md` — logged entry

**Check:** `npm run typecheck` passed (0 errors); `npm run export:web` passed (code 0).

### [2026-10-02 16:50 UTC+07:00] — [UI/UX] Visual System Overhaul: Icon Family, Floating Navigation, Action Cards & Header 2-Tier Hierarchy

**Done:** Implemented the UI/UX visual system overhaul requested:
1. **Icon Design System**: Created `frontend/mobile/src/components/icons.tsx` with unified SVG geometric rounded icons (`viewBox="0 0 24 24"`, stroke ~2.2-2.3, balanced optical weights):
   - `TabIcon`: 4 bottom tabs with paired geometric representations — INACTIVE outline (lighter weight) vs ACTIVE solid/filled (high contrast).
   - `ActionIcon`: `mic`, `scan`, `cart`, `assistant`, `chevron`, `bell`.
2. **Bottom Navigation**: Renamed tab `Tiện ích` → `Quản lý` in `_layout.tsx` and `more.tsx`. Connected moving single active indicator with dark/translucent surface, tactile micro-bounce spring animation (~1.09) on tab press, and reduced motion support.
3. **Status Bar Synchronization**: Synchronized native status bar appearance dynamically across all tabs — `light` style for dark header on `Tổng quan` (`index`), `dark` style for light backgrounds on `invoices`, `sales`/`pos`, and `more` (`Quản lý`).
4. **ActionCard Component**: Created reusable `ActionCard` (`minHeight: 74-80`, `flexDirection: 'row'`, `alignItems: 'center'`, left visual anchor, middle title + optional subtitle, trailing chevron affordance, subtle border/elevation, dark/light surface variants, press scale spring animation).
5. **Tổng quan — "Đơn hàng mới"**: Replaced giant buttons with a 4-action functional grid: Đọc đơn (`/voice`), Quét mã (`BarcodeScannerModal`), Chọn hàng (`/pos`), and Trợ lý (`/ai`).
6. **Tổng quan — Collapsed Header**: Redesigned collapsed header into 2 clear horizontal tiers: Tier 1 (Context on left, prominent right-aligned revenue `xxx.xxxđ` without squeezing); Tier 2 (4 compact quick action chips with touch target >= 44). Smooth non-clipping transition between expanded and collapsed states.

**Changed files:**
- `frontend/mobile/src/components/icons.tsx` — created unified TabIcon and ActionIcon system
- `frontend/mobile/src/components/ui.tsx` — added ActionCard primitive with dark/light themes
- `frontend/mobile/app/(tabs)/_layout.tsx` — updated to TabIcon, Quản lý label, dynamic status bar, and refined bounce
- `frontend/mobile/app/(tabs)/more.tsx` — renamed title to Quản lý, added StatusBar dark
- `frontend/mobile/app/(tabs)/invoices.tsx` — added StatusBar dark
- `frontend/mobile/app/pos.tsx` — added StatusBar dark
- `frontend/mobile/app/(tabs)/index.tsx` — implemented 4-action grid for "Đơn hàng mới" and 2-tier collapsed header with prominent revenue
- `PROGRESS.md` — logged entry

**Check:** `npm run typecheck` passed (0 errors); `npm run export:web` passed (code 0).

### [2026-10-02 15:55 UTC+07:00] — [UI/UX] Mobile UI/UX overhaul across all screens

**Done:** Completed mobile UI/UX overhaul: bottom navigation floating bar with animated single-indicator, collapsible headers, standardized Feather icons, natural merchant wording, destructive action confirmations, haptic/feedback integration, and reduced motion coverage.

**Changed files:**
- `frontend/mobile/app/*`, `frontend/mobile/src/*` — UI/UX overhaul, animations, feedback, and destructive states
- `docs/design/mobile-wording-review.md` — mobile wording review table updated
- `PROGRESS.md` — updated

**Flow explained:** Navigation uses a floating bar with active tab indicator spring motion. Long screens (Home, Invoices, Products) implement collapsible headers. Destructive operations (delete product, remove expense, clear POS cart, logout) are guarded with consistent confirmation dialogs. Primary actions and status confirmations provide tactile/sound feedback while respecting accessibility reduced motion preferences.

**Check:** `npm run typecheck` passed (0 errors); `npm run export:web` passed; `git diff --check` passed.

### [2026-10-01 UTC+07:00] — [Config] Run Core and AI locally against staging with Firebase

**Done:** Database credentials live only in the repo-root `.env.staging`/`.env.production`; `backend/core/.env` keeps Firebase settings and `backend/ai/.env` keeps model settings. Compose reads `backend/core/.env` for the Firebase project and key path and loads `backend/ai/.env` through `env_file`, replacing the root `.env` and `FIREBASE_CREDENTIALS_PATH`. Mobile iOS dev build is configured through `app.json` (`disableSPM`, `usePrecompiledModules: false`, iOS `googleServicesFile`). Correction to the 2026-09-30 config entry: `AppConfig` does not load `.env.<APP_ENV>`; the code reads only the process environment and `backend/ai/.env`, so hosts export `.env.staging` before starting AI.

**Changed files:** `compose.yaml`, `.github/workflows/ci.yml`, `README.md`, `backend/ai/README.md`, `backend/ai/.env.example`, `frontend/mobile/app.json`, `frontend/mobile/package.json`, `frontend/mobile/package-lock.json`, `frontend/mobile/.gitignore`, `frontend/mobile/README.md`, `PROGRESS.md`.

**Flow explained:** `docker compose --env-file .env.staging --env-file backend/core/.env up --build` starts Core (:8000) and AI (:8001) against staging Supabase. On the host, `set -a && source ../../.env.staging && source .env && set +a` precedes `mvnw spring-boot:run`. The first Flyway run on staging needed a one-off baseline at version 0 because Supabase's `rls_auto_enable` function makes `public` non-empty; production will hit the same on its first migration.

**Check:** Core on staging applied V1–V6 and started; Compose stack up with Core `/v3/api-docs` 200 and AI `/health` 200. iOS simulator: `expo prebuild --clean` generates both Podfile settings, clean build launches, email sign-up created the Firebase user, `POST /auth/session` 200 and `POST /shops` 201, rows present in staging `users`, `auth_identities`, `shops`. AI ruff and tests (23 passed, 1 skipped) and mobile typecheck pass. Redis in `.env.staging` still points at localhost; AI logs a warning and continues. Real-number phone OTP returns `auth/internal-error` and is unverified.

### [2026-09-30 UTC+07:00] — [Config] AI loads per-environment credentials (ADR-0001 option A)

**Done:** Team chose pgvector only (ADR-0001 option A). `AppConfig` now loads the Git-ignored repo-root `.env.<APP_ENV>` (`staging` by default, or `production`) and then the local `backend/ai/.env`; an invalid `APP_ENV` fails at import. Removed `QDRANT_URL`.

**Changed files:** `backend/ai/src/app_config.py`, `backend/ai/.env.example`, `backend/ai/README.md`, `PROGRESS.md`.

**Flow explained:** Precedence is process environment, then local `.env`, then `.env.<APP_ENV>`; empty values are ignored. Containers have no such files and keep reading Compose environment variables.

**Check:** Default config resolved `POSTGRES_URL` to the staging Supabase pooler and `check_health()` succeeded against it; environment variables override the file; `APP_ENV=dev` raises `ValueError`. AI tests 23 passed, 1 skipped (no `POSTGRES_TEST_URL`); `ruff check` and `ruff format --check` clean. `.env.staging` still has no `REDIS_URL`.

### [2026-09-30 UTC+07:00] — [Architecture] Propose pgvector instead of Qdrant (ADR-0001)

**Done:** Added ADR-0001 (Proposed) to store embeddings in Supabase PostgreSQL with `pgvector`; removed Qdrant from the technical design and architecture diagram. Added AI migration `002_enable_pgvector.sql` and switched the AI CI database image to `pgvector/pgvector:pg17` to match Supabase PostgreSQL 17.

**Changed files:** `docs/architecture/adr/0001-vector-store-pgvector.md`, `docs/architecture/technical-design.md`, `docs/architecture/diagrams/src/architecture.mmd`, `docs/README.md`, `backend/ai/migrations/002_enable_pgvector.sql`, `backend/ai/README.md`, `.github/workflows/ci.yml`, `PROGRESS.md`.

**Check:** Migration applied twice on `pgvector/pgvector:pg17` (idempotent, `vector` 0.8.6, distance query works); AI tests 24 passed on that image. Staging Supabase has `vector` 0.8.2 available but not yet enabled; the migration has not been run there. `architecture.drawio`/`.svg`/`.png` still show Qdrant.

### [2026-09-30 UTC+07:00] — [Ops] Dev shares staging Supabase and Redis Cloud; production separate (#8)

**Done:** Removed the local PostgreSQL and Redis containers from `compose.yaml`; Core and AI now read database and `REDIS_URL` credentials only from env, pointing at Supabase and Redis Cloud. Added `docs/architecture/diagrams/src/environments.mmd` (clients, backend, Supabase, Redis Cloud, CI/CD). Dev and staging share the staging Supabase project via `.env.staging`; production has its own project in `.env.production` (both Git-ignored). Trimmed this log to the 20 newest entries; older entries remain in Git history.

**Changed files:** `compose.yaml`, `.github/workflows/ci.yml` (placeholder DB values for `docker compose build`), `README.md`, `backend/ai/README.md`, `backend/ai/.env.example`, `CONTRIBUTING.md`, `docs/architecture/technical-design.md`, `PROGRESS.md`.

**Flow explained:** `docker compose --env-file .env --env-file .env.staging up --build` starts Redis, Core, and AI against the staging Supabase pooler; a missing variable fails interpolation before any container starts. Automated tests keep using a disposable PostgreSQL (`POSTGRES_TEST_URL`, CI service container).

**Check:** `docker compose config` with `.env.staging` lists only `redis`, `ai`, `core`, both apps resolving to the staging Supabase pooler. Starting the stack against Supabase, a deploy workflow, and GitHub Environment secrets are not done.

### [2026-09-29 UTC+07:00] — [Feature] Add Flyway V7 for API idempotency keys

**Done:** Added the `api_idempotency_keys` migration matching the Core repository and existing local test table. Updated the API contract to reflect the migration.

**Changed files:** `backend/core/src/main/resources/db/migration/V7__create_api_idempotency_keys.sql`, `docs/contracts/api-contracts.md`, `PROGRESS.md`.

**Flow explained:** A fresh PostgreSQL database now creates the idempotency table with shop/user references, a unique `(shop_id, operation, idempotency_key)` constraint, expiry check and index. An existing matching local test table is preserved.

**Check:** Core Maven `verify` passed 119 tests and `docker compose build core` succeeded. Core started with Flyway enabled against an isolated clean PostgreSQL 16 database; V1–V7 all succeeded and the expected constraints/index exist. V7 ran against the pre-existing local table inside a rolled-back transaction without changing its two rows. The local database itself remains at Flyway V4; its pending V5/V6 upgrade was not applied or verified here.

### [2026-09-29 UTC+07:00] — [Fix] Guard retry writes and shop archive; normalize selected API errors

**Done:** Added idempotency handling for debt repayments and expense creation, blocked OWNER archive of an ADMIN-inactivated shop, and normalized missing-header and barcode-race errors. Updated BR/FR/AC and API contract for these provisional Core behaviors. Added a Core local-run README.

**Changed files:** Core controllers, services, repository, error handling, configuration, tests and `backend/core/README.md`; `docs/product/business-requirements.md`, `docs/product/product-requirements.md`, `docs/contracts/api-contracts.md`, `PROGRESS.md`.

**Flow explained:** Both POST endpoints now require `Idempotency-Key`; the same shop/operation/key/request returns the original response without a second write, while a changed request conflicts. The key and business write share one transaction. Default key expiry is 30 days. The `api_idempotency_keys` table was created **only in the local `smartledger` PostgreSQL DB** for testing; no Flyway migration was added, so this is not ready for a fresh DB or deployment.

**Check:** Core Maven `verify` passed 119 tests with no failures/errors. Local HTTP smoke test on port 8080 replayed an expense with the same ID, rejected changed content with 409, and archived the test expense. OpenAPI listed both required headers; `docker compose config --quiet` passed. Docker image build could not run because Docker Engine was unavailable. No commit or push made.

### [2026-10-02 19:59 UTC+07:00] — [Refactor] Pass model settings to the AI container and simplify AI error handling

**Done:** The `ai` Compose service now receives `MODEL_NAME`, `SUMMARY_MODEL_NAME` and `MODEL_REASONING_EFFORT`, and the default `MODEL_NAME` is `gpt-5.6-luna`, because the image excludes `.env` and the old `gpt-4o-mini` default does not accept `reasoning_effort`. Removed the unused `ProviderResult` and both unused `check_health` methods, and replaced the five per-route `try/except` blocks with two app-level exception handlers.

**Changed files:** `compose.yaml`, `backend/ai/src/app_config.py`, `backend/ai/src/agent/routers.py`, `backend/ai/src/main.py`, `backend/ai/src/infra/postgre_db_client.py`, `backend/ai/src/infra/redis_db_client.py`, `backend/ai/tests/integration_tests/test_agent_chat.py` — modified; `backend/ai/src/providers/base.py` — deleted.

**Flow explained:** `ConversationNotFoundError` still maps to `404 conversation_not_found` and any other failure to `503 ai_unavailable` with the cause logged; the mapping moved from each route to `main.py`. An uncaught exception that previously surfaced as `500` now returns `503 ai_unavailable`.

**Check:** `ruff check` and `ruff format --check` clean; `uv run pytest`: 75 passed against `postgres:16`. `docker compose up --build ai` ran `gpt-5.6-luna` with `high` reasoning; chat returned 401 without the token and 200 in 4.0s with it, called from inside the container because the OrbStack host port forward reset connections.

### [2026-10-02 18:40 UTC+07:00] — [Feature] Rolling chat summary, history search and internal service auth

**Done:** Closes AI-009. Chat now sends the stored summary followed by every message not yet folded into it, and a background task folds older messages into that summary, so a message leaves the model context only after it is written into the summary. The agent's first tool, `search_chat_history`, recovers exact details from folded messages that the summary condensed. Every `/internal/v1/*` route now requires the shared `X-Internal-Token` header and fails closed when no token is configured.

**Changed files:** `backend/ai/migrations/003_add_chat_summary.sql`, `backend/ai/src/security.py`, `backend/ai/src/agent/summary.py`, `backend/ai/src/agent/history_search.py` — created; `backend/ai/src/agent/tools.py`, `backend/ai/src/agent/service.py`, `backend/ai/src/agent/repository.py`, `backend/ai/src/agent/routers.py`, `backend/ai/src/agent/prompt_template.py`, `backend/ai/src/app_config.py`, `backend/ai/src/main.py`, `backend/ai/src/providers/factory.py`, `backend/ai/tests/`, `backend/ai/README.md`, `backend/ai/.env.example`, `compose.yaml`, `docs/contracts/api-contracts.md`, `PROGRESS.md` — updated.

**Flow explained:** `context_for` returns the summary plus every message above `summary_through_message_id`, and `chat()` injects the summary as a second system message. `fold_summary` runs as a FastAPI background task after the reply: it folds only once the unfolded window exceeds 60 messages, keeps the newest 50 verbatim, splits a longer backlog into roughly 3000-token batches, and advances the watermark with `WHERE summary_through_message_id IS NOT DISTINCT FROM <value it read>`, so a concurrent fold drops the later writer instead of losing messages. `SUMMARY_MODEL_NAME` selects the summarization model and falls back to `MODEL_NAME`. Auth is one router-level dependency; `/health` is unaffected. `search_chat_history` scores folded messages by shared diacritic-free words and receives its scope from `AgentContext` through `ToolRuntime`; `ChatOpenAI` uses the Responses API because `gpt-5.6-luna` rejects tools on chat completions. The shop prompt no longer carries the shop id, admits missing data instead of estimating, and names the source of a figure; the summary prompt copies figures verbatim under fixed English headings; every prompt is written in English. Both models run with `MODEL_REASONING_EFFORT=high` by default. The chat router now logs the cause behind a 503. Core does not send the header yet, so a staging deploy needs the Core update first.

**Check:** `ruff check` and `ruff format --check` clean. `uv run pytest`: 75 passed with `POSTGRES_TEST_URL` against `postgres:16`, covering migration 003, the watermark guard, cross-scope rejection, a fold whose fact survives into a later turn, and the search tool's scope. Live `uvicorn` with `gpt-5.6-luna`: `/health` 200 without a token; chat 401 without or with a wrong token, 422 for a blank message, 404 for another shop's conversation; a 63rd message folded 18 messages in the background and a later turn recalled the folded fact; with a deliberately vague summary the agent called `search_chat_history` and answered the exact amount and date, also for a query typed without diacritics.

### [2026-09-28 18:57 UTC+07:00] — [Tooling] Review feature PRs on staging

**Done:** Enabled automatic CodeRabbit review for pull requests targeting `staging`; reviews of the default branch remain enabled.

**Changed files:** `.coderabbit.yaml` — created; `PROGRESS.md` — updated.

**Flow explained:** CodeRabbit reads the root configuration from the PR branch and includes `staging` among eligible base branches.

**Check:** Parsed YAML and confirmed the expected settings; `git diff --check` passed. Live GitHub App review is unverified until the configuration is pushed in a PR targeting `staging`.

### [2026-09-28 17:28 UTC+07:00] — [Docs] Vietnamese code review rule

**Done:** Added a Code review section to `AGENTS.md`: review summaries and PR review comments are written in Vietnamese, and review comments carry no verified/inferred markers. `CLAUDE.md` picks this up through `@AGENTS.md`.

**Changed files:**
- `AGENTS.md`, `PROGRESS.md` — modified

**Flow explained:** Agents reviewing a branch or PR write their findings in Vietnamese as problem, scenario, and fix or decision needed.

**Check:** Re-read `AGENTS.md`; `git diff --check` passed.

### [2026-09-28 UTC+07:00] — [Fix] Serialize product edits with checkout stock updates

**Done:** Product PATCH and archive now acquire the same product row lock used when confirming a sale. Added a regression test that patches product metadata after a stock deduction without restoring the old quantity.

**Changed files:** `backend/core/src/main/java/com/smartledger/core/service/impl/ProductServiceImpl.java`, `backend/core/src/test/java/com/smartledger/core/service/ProductServiceTest.java`, `PROGRESS.md`.

**Flow explained:** Mutating an active product waits for concurrent checkout stock changes before reading and merging its fields. Ordinary product reads remain unlocked. No entity or migration changed.

**Check:** Targeted Product/Sale Draft tests and the full Core Maven test suite passed (111 tests, 0 failures/errors); `git diff --check` passed. A live PostgreSQL concurrency test has not been run.

### [2026-09-28 UTC+07:00] — [Feature] Add shop expenses and period summary

**Done:** Added shop-scoped manual expense create/list/detail/patch/archive APIs, a period summary for confirmed revenue, payments received, active expenses, current debt and order count, plus Flyway V6 for expenses.

**Changed files:** `backend/core` expense/report controllers, DTOs, entity, enum, repositories, services, error codes and tests; `backend/core/src/main/resources/db/migration/V6__create_expenses.sql`; `PROGRESS.md`.

**Flow explained:** An OWNER records expenses for an owned ACTIVE shop. Reports use the Vietnam calendar for `today`, `yesterday`, `this_week`, `week`, `month` and `year`; revenue sums confirmed sale totals after discounts, while collected cash sums payments received in the selected period. Archived expenses and voided sales are excluded. Current debt is a shop-wide balance, not a period flow. This summary does not yet include estimated profit or best sellers from the wider PRD.

**Check:** `mvnw.cmd verify` passed 110 tests. V1–V6 SQL succeeded in an isolated PostgreSQL schema; V5–V6 also succeeded against the existing local schema in a rolled-back transaction, preserving eight expense rows. Local API/DB checks covered period totals, draft exclusion, voided sales, cross-period debt repayment, archive, inactive shop access and Vietnam day boundaries. Docker image build was not rerun because Docker Engine was unavailable.

### [2026-09-28 00:11 UTC+07:00] — [Feature] Add customer directory and debt repayment flow

**Done:** Added shop-scoped customer CRUD with archive, customer-linked sale drafts, partial/unpaid sale confirmation, per-sale debt records, and append-only debt repayments. Added Flyway V5 for customers, debts, and their sale/payment references.

**Changed files:** `backend/core` customer/debt controllers, DTOs, entities, repositories, services, error codes, sale draft/sale/payment integration, migration `V5__create_customers_and_debts.sql`, service/controller tests; `PROGRESS.md`.

**Flow explained:** An owned ACTIVE shop can record a customer, confirm a sale with less than full payment, and collect later payments against the resulting debt. A zero initial payment creates no payment row. Confirmation and repayment update sale/debt balances transactionally; archived customers remain available for historical references.

**Check:** Core Maven package and 99 tests passed. V1–V5 applied and schema validation passed against an isolated PostgreSQL 16 container; Core OpenAPI returned 200, unauthenticated debt access returned 401, and Firebase-emulator login through the container opened an OWNER session. The Dockerfile image build itself remains unverified because Maven dependency resolution stalled inside Docker; runtime was checked by mounting the newly built JAR into an existing Core image. Isolated smoke-test containers and volume were removed.

### [2026-09-28 00:10 UTC+07:00] — [Feature] Support partial product updates

**Done:** Changed product update from full `PUT` replacement to `PATCH` with an optional-field request model and tests.

**Changed files:** `backend/core` product controller, request DTO, service interface/implementation, controller/service tests; `PROGRESS.md`.

**Flow explained:** The caller sends only fields to change; omitted product fields retain their current values. Explicitly provided category, barcode, and stock fields still undergo business validation.

**Check:** Core Maven tests passed (99 tests, 0 failures/errors); `git diff --check -- backend/core` passed.

### [2026-09-25 23:59 UTC+07:00] — [Mobile] Week period, report loading skeleton, AssistiveTouch-style ZenRing

**Done:** Report tabs are now `Hôm nay / Tuần này / Tháng này` (calendar week, Monday to now) and sit above the revenue card with a sliding indicator. Analytics shows a 7-column day chart for the week; Best sellers accepts the new period. The revenue card, suggestion and best-seller sections show same-size skeletons while a report loads, then reveal with a count-up (mock latency 700 ms in `useReport`; an already-loaded period switches instantly). ZenRing docks to the left/right edge after a drag, keeps one saved `{side, y}` across tabs (nudged up on Sales to clear the cart), dims when idle, and its menu fans out with a scrim and a hold-to-talk progress ring. Priority icons are amber for debt and red for low stock; the bell has no container; user-facing emoji were replaced with Feather icons. Docs updated: design spec, PRD `FR-026`/`AC-019`, API contract (`this_week`), mobile README.

**Changed files:**
- `frontend/mobile/src/motion.ts`, `src/components/reveal.tsx`, `src/lib/useReport.ts` — created
- `frontend/mobile/src/lib/stats.ts`, `src/components/ReportPeriodTabs.tsx`, `src/components/ZenRing.tsx`, `src/components/ui.tsx` — modified
- `frontend/mobile/app/(tabs)/index.tsx`, `app/(tabs)/invoices.tsx`, `app/analytics.tsx`, `app/bestsellers.tsx`, `app/products.tsx`, `app/expenses.tsx`, `app/profile.tsx`, `app/(auth)/setup.tsx`, `src/data/mock.ts` — modified
- `docs/design/mobile-ui-style-migration.md`, `docs/product/product-requirements.md`, `docs/contracts/api-contracts.md`, `frontend/mobile/README.md`, `PROGRESS.md` — modified

**Flow explained:** `useReport(period)` returns `null` until a period is loaded, then one snapshot (totals, previous day, top sellers) so the cards never disagree; its cache resets when invoices or products change. `ZenRing` keeps the user's chosen `{side, y}` in a module variable and only clamps the displayed position, so obstacles never overwrite the saved spot. `thisWeek` is a new period; `week` (last 7 days) is unchanged for Invoices, notifications and AI chat.

**Check:** `tsc --noEmit` passed. On the iPhone 17 Pro simulator: skeleton, tab indicator, `Tuần này` on Home, Analytics week chart, left/right docking with logged decisions, the same ring position across Tổng quan/Đơn hàng/Bán hàng/Khác, menu open/close, and the priority icons were observed. Not observed: the hold-to-talk progress ring, idle-dim timing, Reduce Motion, a real device or Android, and the Sản phẩm/Chi phí/Setup/Profile screens.

### [2026-09-25 23:20 UTC+07:00] — [Feature] Add Core business flow from shop to paid sale

**Done:** Committed Core shop management, category and product CRUD, manual sale-draft lifecycle, confirmed-sale reads, and payment reads in `dba9bd5`. Added Flyway V2–V3 for shop archive/status reasons and V4 for categories, products, sale drafts/items, sales/items, and payments. Refactored Core service interfaces/implementations, enums, business errors, and entity boilerplate.

**Changed files:** `backend/core` controllers, DTOs, entities, repositories, services, enums, migration files `V2__add_shop_archive.sql`, `V3__add_shop_inactive_reason.sql`, `V4__create_catalog_and_paid_sales.sql`, and tests; `PROGRESS.md`.

**Flow explained:** OWNER manages shops by ID; shop-scoped catalog and checkout endpoints require an owned ACTIVE shop via `X-Shop-Id`. Categories and products are archived instead of physically deleted. Manual drafts can be created, reviewed, replaced, cancelled, and confirmed; drafts do not affect stock or revenue. Confirmation currently requires full payment and atomically creates a sale, item snapshots, an initial payment, and tracked-stock deductions. Sales and payments have read endpoints. Partial payment, debt repayment, and AI-origin drafts remain outside this implemented flow.

**Check:** `backend/core/mvnw.cmd -q test` passed 79 tests with no failures or errors; `git diff --cached --check` passed before the Core commit. Flyway V4 has not been independently smoke-tested on a clean PostgreSQL database after the final file restoration; runtime migration and end-to-end API verification remain pending.

### [2026-09-25 22:58 UTC+07:00] — [Mobile] Clean up duplicate navigation and add transfer account

**Done:** Removed the home "Chọn hàng" shortcut that duplicated the Sales tab, moved Expenses to a stack screen with a back button, dropped the mock printer notification (printers are outside MVP), and let owners set the bank account shown for transfer payments.

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/app/(tabs)/_layout.tsx`, `frontend/mobile/app/expenses.tsx` (moved from `app/(tabs)/`), `frontend/mobile/app/checkout.tsx`, `frontend/mobile/app/profile.tsx`, `frontend/mobile/src/data/mock.ts`, `frontend/mobile/src/lib/notifications.ts`, `frontend/mobile/src/store/AppStore.tsx`, `PROGRESS.md`.

**Flow explained:** Khác → Chi phí now opens above the tabs and returns with back. Checkout transfer shows the account from shop info, or links to shop info when none is set; real accounts never inherit the mock sample account. The account is kept in app state only, like the shop address.

**Check:** Typecheck and Expo web export passed; `git diff --check` passed. Home and Expenses were checked on the iPhone 17 Pro simulator in mock mode; the transfer account flow was checked on the web build.

### [2026-09-25 00:35 UTC+07:00] — [Feature] Prepare Product CRUD without a migration

**Done:** Added Product create, list, detail, full replacement, and soft archive APIs in Core using the current BIGINT Product/Category ERD. Product access uses the owned ACTIVE shop guard; category references must be ACTIVE in the same shop. Barcode uniqueness follows the current ERD, including archived products.

**Changed files:** `backend/core` Product and Category entities, repositories, Product service/controller, request/response DTOs, catalog enum, error codes, unit tests, and `PROGRESS.md`. No database migration was added.

**Check:** Core unit tests passed 30 tests, 0 failures, 0 errors. Runtime API verification is pending: the local database has no `products` or `categories` tables, and JPA schema validation will reject startup until a reviewed migration supplies them.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests, including 7 ShopService tests.

### [2026-09-25 00:15 UTC+07:00] — [Refactor] Keep status API with the Shop resource

**Done:** Moved the status-change endpoint and request DTO into the Shop module. Removed the separate `AdminShopController`.

**Flow explained:** Status changes are now served at `PATCH /api/v1/shops/{shopId}/status`. Authorization remains enforced in the service layer and is currently ADMIN-only, so controller organization does not weaken access control.

**Check:** `clean test` passed 22 tests with 0 failures and 0 errors.

### [2026-09-25 00:05 UTC+07:00] — [Fix] Restore V3 checksum to the applied status-reasons schema

**Done:** Restored V3 with both `inactive_reason` and `archived_reason`, matching the schema already installed locally. Removed the redundant V4 source migration.

**Flow explained:** V3 was applied before its later rename/refactor; Flyway requires its original version, description, and SQL checksum to remain stable. Both reason fields therefore remain grouped in the applied V3 history.

### [2026-09-24 23:55 UTC+07:00] — [Fix] Preserve applied Flyway V3 and add archive reason as V4

**Done:** Restored applied V3 to its original `inactive_reason` schema and added `archived_reason` as V4. V3 had already been installed in the local database, so changing its name/content caused Flyway validation to fail.

**Changed files:** Core migration V3 restored, migration V4 added, `PROGRESS.md`.

**Check:** V4 must be applied after a clean rebuild. Existing V1–V3 migration history remains intact.

### [2026-09-24 23:45 UTC+07:00] — [Feature] Enforce shop lifecycle ownership and reasons

**Done:** Added owner archive reason input and an ADMIN-only shop-status operation. OWNER can edit only active shops and archive an owned shop with an archive reason. ADMIN can set an active shop to `INACTIVE` with a required reason, then reactivate it. Session responses include non-archived owned shops and their applicable status reason.

**Changed files:** Core shop DTOs, entity, repository, services, owner/admin controllers, error codes, migration V3, tests, and `PROGRESS.md`.

**Flow explained:** `ACTIVE` permits owner operations. `INACTIVE` preserves data and shows the ADMIN/system reason while blocking owner updates and future business operations. `ARCHIVED` is owner soft deletion, records its separate reason, and stays hidden from normal owner access.

**Check:** `clean test` passed 22 tests with 0 failures and 0 errors. Only `V3__add_shop_status_reasons.sql` exists in build output; it remains pending until Core restarts.

### [2026-09-24 23:32 UTC+07:00] — [Mobile] Simplify AI chat conversation UI

**Done:** Removed avatars from assistant and user messages and widened message bubbles for the chat content.

**Changed files:** `frontend/mobile/app/ai.tsx`, `PROGRESS.md`.

**Check:** Opened the AI chat route on the iPhone 17 Pro Max simulator and confirmed the avatar-free layout. `git diff --check` passed.

### [2026-09-24 23:30 UTC+07:00] — [Schema] Keep separate inactive and archive reasons

**Done:** Updated pending migration V3 to add both `inactive_reason` and `archived_reason` to `shops`.

**Flow explained:** `inactive_reason` explains an ADMIN/system temporary suspension; `archived_reason` records why an OWNER soft-archived a shop. The fields are intentionally separate because the actors and business meanings differ.

### [2026-09-24 23:25 UTC+07:00] — [Schema] Correct shop reason to INACTIVE only

**Done:** Replaced the pending V3 archive-reason migration with `inactive_reason` (maximum 500 characters). No archive reason is stored.

**Changed files:** Replaced the pending V3 migration file; `PROGRESS.md`.

**Flow explained:** `inactive_reason` is reserved for an ADMIN/system suspension message that the owner can see. The future ADMIN/system operation must set the reason when it changes a shop to `INACTIVE`.

### [2026-09-24 23:15 UTC+07:00] — [Schema] Record a shop archive reason

**Done:** Added pending Flyway migration V3 with nullable `shops.archived_reason` (maximum 500 characters). It is nullable so shops archived before this field exists remain valid.

**Changed files:** `backend/core/src/main/resources/db/migration/V3__add_shop_archive_reason.sql`, `PROGRESS.md`.

**Check:** Migration is pending and will be applied by Flyway at the next Core startup. The archive API payload is intentionally unchanged until the team confirms whether an archive reason is optional or required.

### [2026-09-24 22:50 UTC+07:00] — [Feature] Add soft archive for shops

**Done:** Added owner-initiated soft archive for shops. `DELETE /api/v1/shops/{shopId}` now marks a shop as `ARCHIVED` and records `archived_at`; it does not physically delete the row.

**Changed files:** Core shop migration, entity/status/service/controller/error handling, shop-service tests, and `PROGRESS.md`.

**Flow explained:** Archived shops are no longer returned by `/api/v1/me`; direct read and update requests treat them as unavailable. Changing a shop to `ARCHIVED` through `PATCH` is rejected so archiving always uses the explicit delete route. No ADMIN suspension status or restore endpoint was added.

**Check:** Core unit tests passed: 20 tests, 0 failures, 0 errors. Flyway will apply V2 on the next Core startup.

### [2026-09-24 22:32 UTC+07:00] — [Docs] Reconcile implementation status with code

**Done:** Reviewed project documentation against the `staging` checkout and corrected stale descriptions of frontend location, mock behavior, Core auth, AI conversation routes, API payloads, and mobile integration status. Kept proposed MVP requirements separate from implemented endpoints.

**Changed files:** `README.md`, `backend/ai/README.md`, `frontend/mobile/README.md`, `docs/architecture/technical-design.md`, `docs/contracts/api-contracts.md`, `docs/design/mobile-ui-style-migration.md`, `docs/product/project-overview.md`, `docs/product/product-requirements.md`, and `PROGRESS.md`.

**Flow explained:** The current mobile and web apps use mock business data by default. Mobile can call Core's Firebase session endpoints; Core has no shop or ledger API and does not proxy AI. AI persists internal Agent conversations. The remaining API and architecture sections describe the MVP target.

**Check:** Compared documented routes and payloads with Core controllers/DTOs, AI routers/schemas, and frontend config/services; `git diff --check` passed; all local links in changed Markdown files resolved. No runtime behavior changed.

### [2026-09-24 22:15 UTC+07:00] — [Docs] Show success responses only in Swagger

**Done:** Removed Swagger `default` error response rows from all current Auth and Shop endpoints.

**Changed files:** `backend/core/.../controller/AuthController.java`, `backend/core/.../controller/ShopController.java`, `PROGRESS.md`.

**Flow explained:** Swagger now presents only each endpoint's success DTO. Runtime error envelopes and HTTP status behavior are unchanged.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.

### [2026-09-24 21:18 UTC+07:00] — [Release] Prepare branch histories for production release

**Done:** Prepared the history sync needed to release `staging` into `main`, keeping the mobile tree from `staging` across the 39 overlapping additions. Added the missing required `container-images` check.

**Changed files:** `.github/workflows/ci.yml`, `CONTRIBUTING.md`, and `PROGRESS.md`; no application source changes.

**Flow explained:** Including `main` in the staging release history lets the required `staging` → `main` release PR merge without repeating mobile add/add conflicts. CI now builds the custom Docker Compose images for the required `container-images` status.

**Check:** The merged mobile tree matches `origin/staging` and the web tree matches `origin/main`. CI for `c9bcf43` passed; the new image job and this sync PR's checks are pending.

### [2026-09-24 17:43 UTC+07:00] — [AI] Verify persisted chat CRUD before merge

**Done:** Manually called the live AI HTTP service with two short model requests and verified create, list, detail, rename, continue, delete, scope isolation, and post-delete behavior against disposable PostgreSQL 16 and Redis. The staging database was not used.

**Changed files:** AI conversation API integration coverage, the AI CI PostgreSQL service, and the PRD chat requirement mapping.

**Flow explained:** CI runs the real-PostgreSQL CRUD check as an AI API/database integration test. Authenticated Core-to-AI E2E remains a later CI step after that product flow exists.

**Check:** Manual HTTP flow passed; AI suite passed 24 tests; Ruff and format checks passed. Local Core Maven verification could not start because Java is unavailable; the PR's Core CI job must pass before merge.

### [2026-09-24 17:18 UTC+07:00] — [CI] Gate Core migrations and mobile web preview

**Done:** Added a fresh-PostgreSQL Flyway smoke check to Core CI and a mobile TypeScript/web-export job to the backend CI PR. Declared the Firebase JS SDK used by the web adapter, configured Vercel for Expo SPA exports, and documented preview setup.

**Changed files:** `.github/workflows/ci.yml`, `frontend/mobile/.gitignore`, `frontend/mobile/package.json`, `frontend/mobile/package-lock.json`, `frontend/mobile/vercel.json`, `frontend/mobile/README.md`, `CONTRIBUTING.md`, and `PROGRESS.md`.

**Flow explained:** CI now checks AI, Core, and browser export before merge; Vercel can deploy PR/staging previews when connected. Browser preview defaults to mock auth and sample data.

**Check:** `npm ci --offline`, TypeScript, Expo web export with mock mode and Firebase enabled, JSON validation, and `git diff --check` passed. Flyway 13.7.0 applied V1 to disposable PostgreSQL 16 and created `users`, `auth_identities`, and `shops`. Maven verification will run on GitHub Actions because no Java runtime is installed locally.

### [2026-09-24 12:28 UTC+07:00] — [UI] Add feature tour and simplify mascot actions

**Done:** Extended the post-login intro to three steps for the assistant, sales/orders, and overview/store management. Kept direct assistant actions on step one; added Next, Back, Start, and Skip paths. On the Zen ring menu, removed decorative connectors, renamed the options Chatbot/Giọng nói/Gợi ý, and added stronger hover shadow with pressed feedback. Updated the mobile notes, visual spec, and `FR-025`/`FR-026` with `AC-018`/`AC-019`.

**Changed files:** `frontend/mobile/src/components/AssistantIntroModal.tsx`, `src/components/ZenRing.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, `docs/product/product-requirements.md`, and `PROGRESS.md`.

**Check:** TypeScript and `git diff --check` passed. On web at 320×568, all three intro steps kept their primary action visible; Next, Back, Start and Skip worked, and returning to Home did not reopen the intro. At 390×844, the intro Giọng nói shortcut opened `/voice`. The three mascot actions stayed within a 320px viewport, hover changed the card shadow, Chatbot opened `/ai`, Gợi ý opened `/analytics?period=today`, and a 650ms hold opened `/voice`. Native rendering was not checked in this pass.

### [2026-09-24 12:17 UTC+07:00] — [UI] Open three quick actions around the mascot

**Done:** Replaced the single Zen ring menu card with three separate rounded actions modeled on the supplied reference: Agent chat, Voice, and Gợi ý. Added restrained green connectors and individual soft shadows. The menu opens beside the mascot when space permits and above/below it after a drag to the center; Gợi ý opens today's existing analytics. Tap, drag, and the 500 ms hold shortcut remain available. Updated the intro copy, mobile route note, design reference, and `FR-026`/`AC-019`.

**Changed files:** `frontend/mobile/src/components/ZenRing.tsx`, `src/components/AssistantIntroModal.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, `docs/product/product-requirements.md`, and `PROGRESS.md`.

**Check:** TypeScript and `git diff --check` passed. Web runtime screenshots at 390×844 and 320×700 showed all three actions; at 320×568 they stayed inside the viewport on Sales and More. Web interactions verified dragging the mascot to the center, opening the fallback menu, routing Voice, Agent chat, and Gợi ý, and holding to open Voice. Native device rendering of this menu was not checked in this pass.

### [2026-09-24 12:06 UTC+07:00] — [UI] Introduce the assistant after mobile sign-in

**Done:** Added a compact post-sign-in assistant modal based on the supplied preview and the current minimal mobile palette. It uses the supplied mascot, explains the tap/hold gesture, and provides direct Voice, Agent chat, close, and later actions. The existing guide flag now opens the modal after explicit sign-in and stays dismissed within that session; silent session restoration does not show it. Added `FR-025` and `AC-018` for the observable behavior.

**Changed files:** `frontend/mobile/src/components/AssistantIntroModal.tsx`, `src/components/MascotBadge.tsx`, `src/components/ZenRing.tsx`, `src/store/AppStore.tsx`, `app/(tabs)/index.tsx`, `frontend/mobile/README.md`, `docs/product/product-requirements.md`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript, web export, and `git diff --check` passed. Browser views at 320×568 and 390×844 showed the actions inside the modal; Voice and Agent chat buttons navigated to their screens, and dismissing remained effective after tab navigation. iPhone 17 Pro Simulator showed the modal and confirmed Agent chat opens and returning Home keeps the modal closed. Voice/chat internals remain mock implementations; silent Firebase session restoration was checked in code, not in a live Firebase session.

### [2026-09-24 11:56 UTC+07:00] — [UI] Use supplied mascot for the floating AI entry

**Done:** Replaced the star graphic in the floating Zen ring with the circular mascot badge supplied by the user. The original PNG is kept unchanged as a mobile asset and cropped only while rendering. Enlarged the visible target to 64px and moved its short hold hint clear of the Home date.

**Changed files:** `frontend/mobile/assets/assistant-mascot-badge.png`, `frontend/mobile/src/components/ZenRing.tsx`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript passed. Web screenshots at 320px and 390px and an iPhone 17 Pro Simulator view showed the supplied badge on Home. Web interaction verified tap opens the Voice/Agent chat menu, dragging changes position, and a 650ms hold opens `/voice`. On Sales, dragging toward checkout stopped with the mascot bottom at y=732, above the checkout button at y=786.

### [2026-09-24 11:50 UTC+07:00] — [UI] Keep revenue card height stable across report periods

**Done:** Reserved a fixed comparison area in the Home revenue card so switching between Today, Yesterday, and This month does not shift the period tabs or following sections. On narrow screens the comparison badge uses its own row; percentage text still appears only when a valid comparison is available.

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript and `git diff --check` passed. Browser measurements at 320px showed 211px card height and the priority heading at y=461 for all three periods; at 390px, the corresponding values were 187px and y=437. Visual screenshots at both widths showed the badge and long month revenue without clipping.

### [2026-09-24 11:44 UTC+07:00] — [UI] Restore Home grouping and remove duplicate AI entry points

**Done:** Restored the Home reading order from the earlier layout: revenue card, period selector, two priorities in one card, sales action, then data suggestion and best sellers. Kept the revenue card as the analytics drilldown. Made the shared Zen ring the Voice/Agent chat entry across tabs; removed duplicate AI shortcuts from Home and More. The Sales tab now opens the product grid directly, with the ring resting near the title and clear of the fixed checkout bar.

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `app/(tabs)/sales.tsx`, `app/(tabs)/more.tsx`, `app/pos.tsx`, `src/components/ZenRing.tsx`, `src/components/ui.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript, web export, and `git diff --check` passed. Browser walkthrough at 320px and 390px verified Home hierarchy, direct Sales entry, Zen ring navigation, one-item checkout, and ring drag clamping above checkout. iPhone 17 Pro Simulator verified the Home layout and Sales grid with the ring clear of the cart bar. Web export still emits the existing missing `android.googleServicesFile` warning; it exits successfully.

### [2026-09-24 11:26 UTC+07:00] — [UI] Add mobile sales analytics drilldown

**Done:** Moved the Home period selector above the rounded revenue card and linked the card to a new `/analytics` screen. The screen follows the chosen period with revenue, order count, hourly/weekly trend, recorded expenses, estimated gross profit, best sellers, shop-wide debt, and invoice drilldown. Added the report to `Khác` and kept the selected period when opening best sellers.

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `app/(tabs)/more.tsx`, `app/analytics.tsx`, `app/bestsellers.tsx`, `src/components/ReportPeriodTabs.tsx`, `src/components/charts.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Flow explained:** The Home card now opens analytics instead of invoices. Report metrics use non-cancelled, finalized invoices and the selected date range; outstanding debt is explicitly shop-wide. Gross profit is shown separately from recorded expenses to avoid counting ingredient purchases twice. Expense-inclusive net profit remains unresolved pending a cost/expense rule for `AC-007`.

**Check:** TypeScript and web export passed. Browser walkthrough at 320px and 390px verified Home → analytics → invoices, period changes with distinct totals, top-seller drilldown, and no horizontal overflow. Native layout remains unverified.

### [2026-09-24 11:12 UTC+07:00] — [UI] Remove preview labels from mobile review flow

**Done:** Removed “demo/giả lập” labels from the visible sign-in, Home, Zen ring, Voice, Chat, expense, and More screens. Removed fake social sign-in and sample-data reset from regular navigation; actions without a real printer or invitation no longer report success. Updated the mobile README with the current reviewer sign-in steps.

**Changed files:** `frontend/mobile/app/`, `frontend/mobile/src/components/ZenRing.tsx`, `frontend/mobile/README.md`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Check:** TypeScript, web export, and `git diff --check` passed. The web flow was exercised from phone sign-in with mock OTP through Home, Zen ring, Chat, and More; no preview label appeared in those screens. Data, OTP, Voice, and Chat remain mock implementations, documented for reviewers; this is a UI review build, not a production release.

### [2026-09-24 10:45 UTC+07:00] — [Feature] Migrate mobile owner UI to minimal style

**Done:** Created `feat/mobile-minimal-ui` from `origin/feat/mobile-firebase-auth` in an isolated worktree. Set the visual direction from the user image in `docs/design/mobile-ui-style-migration.md`: warm neutral surfaces, charcoal primary actions, restrained green accent, one prominent revenue card, four bottom tabs, and clear demo labeling. Two delegated coding passes covered Home/tokens and remaining routes; the main pass reviewed visuals and corrected data labels, period navigation, narrow product cards, and mock voice presentation.

**Changed files:** `docs/design/mobile-ui-style-migration.md`, its reference image, `docs/README.md`, `frontend/mobile/src/theme.ts`, shared components and mock category colors, and the owner-facing mobile routes. `backend/core` and storage/API code were not changed.

**Flow explained:** Home filters finalized-order revenue by Today/Yesterday/This Month, labels shop-wide debt separately, and sends the selected period to Orders. The new Sales tab leads to POS or the clearly labeled sample-voice flow. More retains access to expenses, debts, products and reports while removing out-of-MVP entries. Mock insights state their data source or lack of evidence.

**Check:** `npm run typecheck`, `npm run export:web`, and `git diff --check` passed. In the running web app, checked Home layout, period numbers and repeat navigation to Orders, Sales → POS → Checkout, More → Expenses, sample-voice expense parsing, and sample-voice order parsing. Visual review covered 320px and 390px web widths; no clipped controls found. Native iOS/Android rendering, system font scaling, and backend/real microphone acceptance criteria remain unverified.

### [2026-09-24 01:01 UTC+07:00] — [CI] Verify compact summary artifact

**Done:** The final PR run passed AI, Core, and summary jobs. Downloaded `ci-summary` and verified the board reports 12 Python tests and 11 Java tests, with zero failures, errors, or skips.

**Changed files:** `PROGRESS.md`.

**Check:** GitHub Actions run `35899451138` passed; one 261-byte `ci-summary` artifact was attached.

### [2026-09-24 00:58 UTC+07:00] — [CI] Publish compact test summary artifact

**Done:** Added one compact Markdown board to the Actions run summary and as a downloadable artifact. It shows each backend job result and test totals, failures, errors, and skips.

**Changed files:** `.github/workflows/ci.yml`, `PROGRESS.md`.

**Flow explained:** A final job runs after AI and Core even when either fails, then uploads one `ci-summary` artifact retained for 14 days.

**Check:** Pending.

### [2026-09-24 00:53 UTC+07:00] — [CI] Run release source guard from base branch

**Done:** Moved the main source-branch policy into a separate `pull_request_target` workflow. It reads PR metadata without checking out or running proposed code, allowing same-repository `staging` and `hotfix/*` only.

**Changed files:** `.github/workflows/ci.yml`, `.github/workflows/release-policy.yml`, `PROGRESS.md`.

**Flow explained:** Once this workflow is present on `main`, configure `Release policy / Release source branch` as a required check in the `main` ruleset.

**Check:** Pending.

### [2026-09-24 00:50 UTC+07:00] — [CI] Confirm Java and Python checks on PR #38

**Done:** GitHub Actions passed the AI job and Core Maven `verify`; Core ran 11 tests with no failures. The release source check skipped as expected because PR #38 targets `staging`.

**Changed files:** `PROGRESS.md`.

**Check:** PR #38 checks passed.

### [2026-09-24 00:45 UTC+07:00] — [CI] Validate Java and Python; guard release source

**Done:** Added Core Java 21 Maven verification alongside the existing AI Python lint, format, and test checks. Added a source-branch check for PRs into `main`, allowing same-repository `staging` and `hotfix/*` branches.

**Changed files:** `.github/workflows/ci.yml`, `PROGRESS.md`.

**Flow explained:** The `release-source` check is only required for pull requests targeting `main`; it must be configured as a required check in the `main` ruleset after this workflow reaches `main`.

**Check:** AI Ruff check and format check passed; Python tests passed (12). Local Core verification could not start because no Java runtime is installed; GitHub Actions validation pending. Workflow YAML parsed; `git diff --check` passed.

### [2026-09-24 UTC+07:00] — [AI] Add PostgreSQL-backed agent chat history

**Done:** Implemented Agent conversation persistence, history context, and conversation management against the chat history ERD.

**Changed files:** AI PostgreSQL migration, repository, service, internal API, tests, and related API/technical documentation.

**Flow explained:** Chat turns are committed atomically; later turns load up to 20 scoped messages; OWNER can list, rename, view, and delete conversations.

**Check:** Ruff and format passed; 15 AI tests passed; PostgreSQL 16 migration and end-to-end persistence/scope/delete check passed.

### [2026-09-24 UTC+07:00] — [Feature] Restore mobile shadows and Zen ring

**Done:** Increased native/web card and CTA depth and added a draggable Zen ring across the four mobile tabs. Tap opens demo Voice/Agent chat choices; hold opens Voice directly. Updated the visual reference to describe the implemented demo behavior.

**Changed files:** `frontend/mobile/src/theme.ts`, `src/components/ui.tsx`, `src/components/ZenRing.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/_layout.tsx`, `docs/design/mobile-ui-style-migration.md`, and `PROGRESS.md`.

**Flow explained:** The ring stays above tab screens, is clamped above the tab bar and safe areas, and disappears on child screens. Voice/chat remain sample-data demos; business writes and audio capture are unchanged.

**Check:** TypeScript and web export passed. In the web demo, card shadow rendered, ring menu and Voice navigation worked, dragging moved the ring, and a 500 ms hold opened Voice. An iOS simulator screenshot showed the card shadows and ring; Android remains unverified.

### [2026-09-23 22:27 UTC+07:00] — [Refactor] Use shop ID paths for shop management

**Done:** Changed Shop read and update endpoints to `GET/PATCH /api/v1/shops/{shopId}`.

**Changed files:** `backend/core` Shop controller, service contract/implementation, error details, tests, and `PROGRESS.md`.

**Flow explained:** Shop management now identifies the resource in its URL and still verifies OWNER ownership. The `X-Shop-Id` guard is retained only for future shop-scoped business APIs.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress clean test` passed 18 tests; retired `/current` API names are absent.

### [2026-09-23 22:12 UTC+07:00] — [Docs] Reconcile Phase 1 ERD with staging schema

**Done:** Aligned the ERD, diagram, description, and technical design with Core's `shops`/`shop_id` schema and one Firebase identity per user. Documented validation for custom draft items and debt sales that require a customer. Preserved all earlier progress entries while merging the latest `staging` into the ERD branch.

**Changed files:** `docs/architecture/diagrams/src/erd.dbml`, `docs/architecture/diagrams/src/erd.dbdiagram`, `docs/architecture/erd-description.md`, `docs/architecture/technical-design.md`, and `PROGRESS.md`.

**Flow explained:** The ERD remains a logical target. Core #12 must add the product migration before AI #37 can test a shop-scoped catalog query against the real database.

**Check:** DBML and diagram agree on 20 tables and 44 relationships; `git diff --check` passed; AI Ruff check and format check passed; `uv run pytest -q` passed 12 tests with one upstream deprecation warning. Remote PR review and checks remain pending.

### [2026-09-23 22:12 UTC+07:00] — [Docs] Simplify Swagger error response display

**Done:** Collapsed detailed Swagger error status rows into one `default` standard error response for each Auth and Shop endpoint.

**Changed files:** `backend/core/.../controller/AuthController.java`, `backend/core/.../controller/ShopController.java`, `PROGRESS.md`.

**Flow explained:** Runtime still returns the exact HTTP status and `ErrorCode`; Swagger now presents only the success payload plus a shared error envelope to keep each endpoint readable.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.

### [2026-09-23 22:08 UTC+07:00] — [Docs] Correct Swagger response schemas

**Done:** Declared the success DTO and shared `ApiErrorResponse` schema explicitly for every documented Auth and Shop endpoint response.

**Changed files:** `backend/core/.../controller/AuthController.java`, `backend/core/.../controller/ShopController.java`, `PROGRESS.md`.

**Flow explained:** Swagger now shows a success payload only for 200/201 responses and the standard error envelope for 400/401/403/404 responses.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.

### [2026-09-23 21:54 UTC+07:00] — [Refactor] Separate Core service contracts from implementations

**Done:** Added `AuthSessionService` and `ShopService` interfaces, with their Spring implementations moved to `service/impl`.

**Changed files:** `backend/core` service interfaces, service implementations, and unit tests; `PROGRESS.md`.

**Flow explained:** Controllers depend only on service contracts; Spring injects the single `@Service` implementation. Future alternate implementations or mocks do not require controller changes.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress clean test` passed 18 tests.

### [2026-09-23 21:49 UTC+07:00] — [Refactor] Centralize Core business error codes

**Done:** Replaced individual Core business exception classes with `BusinessException` and centralized `ErrorCode` definitions.

**Changed files:** `backend/core` business services, exception handler, tests, `enums/ErrorCode.java`, and `exception/BusinessException.java`; `PROGRESS.md`.

**Flow explained:** Services throw one typed exception with an enum code; the shared handler derives the HTTP status, stable API code, message, and optional field details from it. Firebase/Spring Security authentication failures remain separate.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests; no source references to the retired business exception classes remain.

### [2026-09-23 21:41 UTC+07:00] — [Refactor] Apply Lombok consistently to Core entities

**Done:** Applied Lombok getter generation and protected JPA constructors to all current Core entities: `UserAccount`, `AuthIdentity`, and `Shop`.

**Changed files:** `backend/core/.../entity/UserAccount.java`, `backend/core/.../entity/AuthIdentity.java`, `PROGRESS.md`.

**Flow explained:** Entity factory and domain methods remain the only supported mutation paths; Lombok supplies read access and the JPA constructor without exposing setters.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.

### [2026-09-23 21:38 UTC+07:00] — [Refactor] Reduce Shop entity boilerplate with Lombok

**Done:** Added Lombok and replaced handwritten `Shop` getters and JPA no-argument constructor with `@Getter` and protected `@NoArgsConstructor`.

**Changed files:** `backend/core/pom.xml`, `backend/core/.../entity/Shop.java`, `PROGRESS.md`.

**Flow explained:** `Shop.create` and `Shop.update` remain explicit business operations; Lombok generates only read access and the JPA-required protected constructor, not public setters.

**Check:** `mvnw.cmd --batch-mode --no-transfer-progress test` passed 18 tests.

### [2026-09-23 21:30 UTC+07:00] — [Feature] Add shop management and tenancy guard

**Done:** Added OWNER shop create/read/update APIs, including the reusable active-shop ownership guard used by later business APIs. Moved Core enum types out of `entity` into `enums`.

**Changed files:** `backend/core` controller, service, DTOs, entity/repository, exception handling, enum package, and tests; `PROGRESS.md`.

**Flow explained:** An active OWNER can create shops and access or update only the selected owned shop via `X-Shop-Id`; inactive shops can remain visible for management but are rejected by the shared business-operation guard.

### [2026-09-21 23:40 UTC+07:00] — [Feature] Mobile Firebase sign-in wired to Core session

**Done:** The mobile app signs in with Firebase (phone OTP and email/password) and sends the Firebase ID token to Core `POST /api/v1/auth/session`. A first sign-in asks for a display name because Core requires it. Added dev-only logging, a diagnostics screen, a 15 s request timeout and a local CORS proxy for web testing. Mock mode (`EXPO_PUBLIC_USE_MOCK=true`) is unchanged.

**Changed files:**
- `frontend/mobile/src/lib/auth/`, `src/lib/api.ts`, `src/lib/sessionApi.ts`, `src/lib/errors.ts`, `src/lib/debug.ts` — created
- `frontend/mobile/app/(auth)/email.tsx`, `app/(auth)/profile.tsx`, `app/debug.tsx` — created
- `frontend/mobile/scripts/dev-cors-proxy.js`, `frontend/mobile/eas.json` — created
- `frontend/mobile/app/(auth)/welcome.tsx`, `otp.tsx`, `setup.tsx`, `app/index.tsx`, `app/(tabs)/more.tsx` — modified
- `frontend/mobile/src/store/AppStore.tsx`, `src/config.ts`, `src/data/types.ts` — modified
- `frontend/mobile/app.json`, `package.json`, `package-lock.json`, `.env.example`, `README.md` — modified

**Flow explained:** Firebase verifies the phone or email, then the app sends `Authorization: Bearer <ID token>`. Core verifies the token, upserts the account and returns role, shops and `needsOnboarding`. A new account must send `displayName` (400 otherwise). On start Firebase restores the session and the app calls `GET /me` (404 asks for the name again, 401 signs out). Core has no `POST /shops` yet, so shop creation stays local (`EXPO_PUBLIC_MOCK_SHOPS=true`).

**Check:** `tsc --noEmit` is clean. Node logic tests ran against a stub of Core built from the `feat/auth-session` code (session, `/me`, 401/403/404, timeout). The web UI was walked through in mock mode. Unverified: Firebase sign-in on Android (no development build has run yet) and the app against the real Core end to end. `google-services.json` is not committed because the repository is public; provide it from the Firebase Console. Open contract mismatches with backend: Core returns camelCase, numeric ids and a single `industry`, while the docs say snake_case, uuid and `industries`; Core has no CORS configuration.

### [2026-09-21 21:35 UTC+07:00] — [Chore] Validate Java Core in CI

**Done:** Added Core CI jobs for Java 21 Maven verification and Docker image build. Docker build runs only after Core tests pass and does not require Firebase credentials.

**Changed files:** `.github/workflows/ci.yml`, `PROGRESS.md`.

**Flow explained:** Pull requests and pushes to integration branches run the existing AI job alongside Core tests; a passing Core test job unlocks a Dockerfile build check.

**Check:** `mvn --batch-mode --no-transfer-progress verify` passed 11 tests; `docker build -t smartledger-core:ci -f Dockerfile .` passed from `backend/core`.

### [2026-09-21 21:20 UTC+07:00] — [Chore] Dockerize Java Core service

**Done:** Added a multi-stage Java 21 Core image and wired Core into Compose. Core receives its database settings through Compose, waits for PostgreSQL health, and reads Firebase credentials only from a read-only local bind mount; no credentials are committed.

**Changed files:** `backend/core/Dockerfile`, `backend/core/.dockerignore`, `backend/core/.env.example`, `compose.yaml`, `PROGRESS.md`.

**Flow explained:** A developer creates a Git-ignored root `.env` with local ports and the local Firebase credential path, then runs `docker compose up --build`. Inside the Docker network, Core and AI connect to PostgreSQL at `postgres:5432`; the host may map that port to another unused local port.

**Check:** Maven tests passed (11 tests). `docker compose config` and `docker compose build core` passed. Local Compose startup completed; PostgreSQL became healthy, Flyway applied V1, and Core returned `200` from `/v3/api-docs` on port 8000.

### [2026-09-20 17:26 UTC+07:00] — [Docs] Finalize Phase 1 ERD and core validation rules

**Done:** Scoped product barcode uniqueness to `(store_id, barcode)`, moved `store_id` to `notification_events`, converted `auth_identities` to 1:N, and documented tenant consistency and payment-debt validation rules.

**Changed files:**
- `docs/architecture/diagrams/src/erd.dbml` — updated product barcode index, notification tables, and auth identities
- `docs/architecture/diagrams/src/erd.dbdiagram` — synchronized store-notification relationship
- `docs/architecture/erd-description.md` — added core business validation rules and updated entity descriptions

**Flow explained:** Barcodes are unique per store; notifications and auth identities support multi-recipient and multi-provider flows; business integrity is enforced at service layer.

**Check:** Verified DBML schema syntax and cross-document references.

### [2026-09-19 10:30 UTC+07:00] — [Feature] AI agent chat endpoint on LangChain

**Done:** Added stateless `POST /internal/v1/agent/chat` backed by a LangChain `create_agent` loop and configurable `ChatOpenAI` model. The endpoint returns `503 ai_unavailable` when the provider is absent or fails; service-credential auth and DB-backed tools remain deferred. Updated the API contract to use snake_case and document the baseline internal route.

**Changed files:** `backend/ai/src/agent/`, `backend/ai/src/providers/`, `backend/ai/src/main.py`, `backend/ai/src/app_config.py`, AI dependencies and tests, environment/Compose configuration, READMEs, and `docs/contracts/api-contracts.md`.

**Check:** Ruff check and format passed; `uv run pytest` passed 12 tests; Compose E2E connected PostgreSQL and Redis, returned `200` from `/health`, and returned the expected `503` from chat without a configured model.

### [2026-09-18 UTC+07:00] — [Docs] Align Phase 1 ERD and technical design

**Done:** Updated the Phase 1 ERD, its description, and technical design to use Firebase Phone/Google, `store_id`, persisted sale drafts, sales/payments/debts, simple stock, AI trace, idempotency, archive/void lifecycle, `BIGINT` VND, and UTC timestamps.

**Changed files:** `docs/architecture/diagrams/src/erd.dbml`, `docs/architecture/erd-description.md`, and `docs/architecture/technical-design.md`.

**Check:** Ran `git diff --check`; DBML remains a logical schema and PostgreSQL constraints/indexes must be implemented in Flyway migrations.

### [2026-09-17 21:00 UTC+07:00] — [Docs] Document release merge flow and align branch rules

**Done:** Updated `CONTRIBUTING.md` to require squash merges into `staging` and merge commits for `staging` → `main` releases, citing the GitLab Flow production-branch pattern. Resolved the `PROGRESS.md` convention as newest-first. Repo rules now match: `staging-squash` (squash only), `main-release-merge` (merge only), and `required_linear_history` disabled on `main` so release merge commits are allowed. Merged #28 to `main` via merge commit `ecf9f83`.

**Changed files:** `CONTRIBUTING.md`, `PROGRESS.md`; repo rulesets `staging-squash`/`main-release-merge` and `main` branch protection.

**Flow explained:** Feature branches come from `staging`, squash-merge back into `staging`, and release PRs merge (not squash) into `main` so `staging` history stays linked and no post-release resync is needed.

**Check:** `gh api` rulesets and branch protection verified after edits; `gh pr merge 28 --merge` succeeded as merge commit.

### [2026-09-17 12:30 UTC+07:00] — [Feature] AI Postgres and Redis clients at startup

**Done:** Closed #7 without `GET /ready`. AI connects Postgres and Redis in FastAPI lifespan and logs `connected` / `unconfigured` / `connect failed`. `/health` stays liveness. Compose default remains Postgres + Redis + AI.

**Changed files:** `backend/ai/src/infra/postgre_db_client.py`, `backend/ai/src/infra/redis_db_client.py`, `backend/ai/src/infra/__init__.py`, `backend/ai/src/main.py`, `backend/ai/src/data_clients.py` (deleted), `backend/ai/tests/conftest.py`, `backend/ai/tests/integration_tests/test_ready.py` (deleted), `backend/ai/README.md`, `README.md`, `AGENTS.md`, `PROGRESS.md`

**Flow explained:** Lifespan constructs clients with `POSTGRES__URL` / `REDIS__URL`, calls `connect()`, stores them on `app.state`, and `close()` on shutdown. `/health` returns `{"status": "ok"}` without pinging. `/ready` is not served.

**Check:** `uv run ruff check`, `ruff format --check`, `pytest` (1 passed). Compose AI log `postgres connected` / `redis connected`; `/health` 200; `/ready` 404.

### [2026-09-16 17:10 UTC+07:00] — [Feature] AI Postgres and Redis clients plus /ready

**Done:** Implemented #7 on `feat/ai-postgres-redis-clients` in the backend worktree. AI pings Postgres and Redis. `/health` stays liveness. Default Compose is Postgres + Redis + AI. No LiteLLM, Qdrant, Langfuse, `/internal/v1`, or invoice/expense endpoints.

**Changed files:** `backend/ai/src/data_clients.py`, `backend/ai/src/main.py`, `backend/ai/tests/integration_tests/test_ready.py`, `backend/ai/pyproject.toml`, `backend/ai/uv.lock`, `backend/ai/Dockerfile`, `backend/ai/.dockerignore`, `backend/ai/.env.example`, `backend/ai/README.md`, `compose.yaml`, `.env.example`, `README.md`, `AGENTS.md`, `PROGRESS.md`

**Flow explained:** `GET /ready` returns 200 when both `POSTGRES__URL` and `REDIS__URL` ping; 503 if either is missing, blank, or down. Compose injects those URLs. Langfuse is not in the default stack.

**Check:** `uv run ruff check`, `ruff format --check`, `pytest` (8 passed). Compose `/health` 200 and `/ready` 200 `postgres=ok, redis=ok`; `/ready` 503 after Postgres stop while `/health` stayed 200.

### [2026-09-16 00:00 UTC+07:00] — [Fix] Pin setup-uv action version

**Done:** Replaced unresolved `astral-sh/setup-uv@v10` with `v10.1.0` so CI can resolve the action.

**Changed files:**
- `.github/workflows/ci.yml` — modified

**Flow explained:** GitHub Actions has no floating `v10` tag; the workflow now pins a released tag.

**Check:** Confirmed `v10` 404 and `v10.1.0` exists via GitHub API. CI run on the PR is unverified until Actions starts.

### [2026-09-15 23:41 UTC+07:00] — [Feature] Set up Python AI runtime; leave Java Core

**Done:** Scaffolded FastAPI `/health` for AI (`:8001`) with uv, ruff, and pytest. Left Core as Java; did not record an ADR for the scaffold.

**Changed files:**
- `backend/ai/` — created FastAPI app, config, tests, lockfile
- `backend/core/` — left as Java placeholder; Python files removed
- `docs/architecture/technical-design.md` — Java Core, Python AI env names
- `README.md`, `AGENTS.md`, `docs/README.md` — Core is Java, do not modify
- `.github/workflows/ci.yml`, `.pre-commit-config.yaml` — AI only

**Flow explained:** AI starts on `:8001`; `GET /health` returns `{"status": "ok"}`. Core stays Java. Internal `/internal/v1` is not implemented.

**Check:** `uv run ruff check`, `uv run ruff format --check`, and `uv run pytest` passed in `backend/ai` (1 test).

### [2026-09-15 21:50 UTC+07:00] — [Docs] Initialize project documentation

**Done:** Initialized the MVP product, architecture, API contract, delivery workflow, and backlog documentation.

**Changed files:** `README.md`, `CONTRIBUTING.md`, `docs/`, `PROGRESS.md`, and `BLOCKERS.md`.

**Flow explained:** `Business requirements → product requirements → technical design → API contract → sprint issues`.

**Check:** Validated Markdown whitespace, DBML, and draw.io sources; visually inspected the architecture export.
