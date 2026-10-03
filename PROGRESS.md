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
