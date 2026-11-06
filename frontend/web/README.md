---
type: Service Guide
title: "Sổ Nghe Lời — Web (landing + admin)"
description: "How to run and deploy the landing page and the admin pages, in mock and real mode."
owner: FE owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-06T22:18:48+07:00 }
stale_after: 2027-01-05T22:18:48+07:00
---
# Sổ Nghe Lời — Web (landing + admin)

An AI sales ledger for small shops: say one sentence and the AI records the items, quantities and prices. EXE201 project of Team HEXA (FPT University).

The landing page and admin pages. Built with Vite, React 19, TypeScript and react-router-dom.

## Run

Requires Node.js 20 or later.

```bash
cd frontend/web
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check (tsc), then build into dist/
npm run preview    # serve the build locally
npm run typecheck  # TypeScript check only
npm run lint       # oxlint
npm run userflow   # build the user flow diagram into docs/product/userflow, see Userflow
```

Environment variables (see `.env.example`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_ENDPOINT` | `http://localhost:8080` | Core address, without `/api/v1` |
| `VITE_USE_MOCK` | (on) | Set `false` so the admin pages read the real Core API instead of sample data |
| `VITE_FIREBASE_API_KEY` | (empty) | Real mode: the Web API key of the Firebase project Core uses to verify tokens (admin sign-in with email and password) |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST` | (empty) | Local runs only: the Firebase Auth Emulator host, e.g. `localhost:9099` |
| `VITE_ANDROID_APK_URL` | (empty) | Android APK download link on the landing page (see [Publish the APK for the landing page](../../docs/development/ci-cd.md#publish-the-apk-for-the-landing-page)). When empty, the download button shows "Sắp ra mắt" and cannot be clicked |
| `VITE_ADMIN_ENABLED` | (off) | `true` enables the `/admin` pages. When off, the build contains no admin code and the demo accounts do not leak into the bundle. Set `true` in `.env.local` during development |

Public contact details live in [`site.yaml`](site.yaml), not in environment variables: `contact_email` (shown in the Contact section, `/privacy` and `/data-deletion`) and `social.facebook`, `social.tiktok`, `social.instagram` (icons in the navigation bar and footer). An empty entry hides that item.

## Admin pages

Runs only when `VITE_ADMIN_ENABLED=true` (off by default). During development, set it in `.env.local`. A deploy enables admin when the GitHub environment `landing-*` sets `VITE_ADMIN_ENABLED=true` together with `VITE_API_ENDPOINT` and `VITE_FIREBASE_API_KEY`: the admin pages live at `/admin` of the landing site itself and read real Core data (see [Landing page on Vercel](../../docs/development/ci-cd.md#landing-page-on-vercel)).

**Two modes:**

- **Real data** (`VITE_USE_MOCK=false`): the pages in `src/pages/admin/core/` read the Core admin API (`/api/v1/admin/*`, [API contracts §7](../../docs/contracts/api-contracts.md)) through `src/services/adminApi.ts`. Firebase sign-in uses email and password over REST (`src/services/firebaseAuth.ts`, without the `firebase` SDK), then `GET /api/v1/me`: only a Core account with `role` ADMIN gets in. An admin account is an email/password user in that environment's Firebase with an ACTIVE Core profile `system_role=ADMIN` (Core never elevates roles by itself). The ID token stays in memory and refreshes itself; the refresh token is stored (localStorage with "Ghi nhớ đăng nhập", sessionStorage without) so reloading the page does not require signing in again; signing out clears both. Core has the overview, owners, shops (with status history, suspend / reopen through `PATCH /api/v1/shops/{id}/status`) and the ADMIN's own access log; Core has no tasks, AI Support, quick search or notifications, so those items are hidden.
- **Sample data** (default): the older pages run on `localStorage`, with AI Support and Tasks added for demos (see [Mock data](#mock-data)).

To try real mode locally: run Core on `localhost:8080` with `CORS_ALLOWED_ORIGINS` including `http://localhost:5173`, then `VITE_ADMIN_ENABLED=true VITE_USE_MOCK=false VITE_FIREBASE_API_KEY=<key> npm run dev`.

"Calm operations" look: warm neutral background, green accent (#2F7A43 / #8FD17D), radius 16/10/999, the Geist font, Phosphor icons (regular). Tokens sit at the top of `src/styles/admin.css`, and all admin CSS is scoped under `.adm` so it does not affect the landing page.

| Path | Content |
| --- | --- |
| `/` | Landing page |
| `/privacy` | Redirects to `/chinh-sach` |
| `/chinh-sach` | Policy submitted to Google Play: privacy, terms, payments |
| `/data-deletion` | User data deletion guide (required by Meta for Facebook Login) |
| `/delete-account` | Same page as `/data-deletion`, the account deletion URL declared on Google Play |
| `/admin/login` | Sign in (ADMIN only) |
| `/admin` | Real: owners and shops by status, new counts over 7/30/90 days, the 5 newest shops, recent access. Mock: 4 KPIs, support trend, needs attention, new shops/OWNERs |
| `/admin/customers?tab=owners\|shops` | Owners / Shops tabs with search, status filter and pagination. Clicking a row opens the detail drawer (`&owner=` / `&shop=`); the shop drawer has status history and the suspend / reopen button (real mode). Every search and open is logged |
| `/admin/access-logs` | Real mode only: the ADMIN's own admin access log, filtered by action, shop ID and date range |
| `/admin/ai` | Mock only: AI Support (conversations, chat, shop context); a task draft is created only when the ADMIN confirms |
| `/admin/tasks` | Mock only: support Kanban with drag and drop; detail drawer and history |
| `/admin/settings/profile\|appearance\|security\|audit` | Profile, Appearance (stored in the browser), Security and permissions (read-only), Log (mock only; real mode redirects to `/admin/access-logs`) |

Old URLs still work: `/admin/customers/:id` → shop drawer, `/admin/logs` → log, `/admin/accounts` → `/admin/customers`. In real mode, `/admin/ai` and `/admin/tasks` go to the Dashboard.

**Authorization:** not signed in → `/admin/login`. A non-ADMIN account (e.g. OWNER) sees a **403** page on every `/admin/*` URL, with no admin menu.

**Not available:** impersonating / signing in as an OWNER, viewing or editing invoices/expenses/debts/stock, self-elevation, disabling audit. AI does not create or move tasks by itself.

**Writes and concurrency:** creating a task sends an idempotency key (clicking twice or confirming the same proposal again does not create duplicates). Every task edit sends `version`; if another tab/person edited first, the page shows "Xung đột phiên bản" and loads the new version. Every status change, assignment and severity change records history and audit.

**Responsive:** ≥1280 a 248px sidebar; 768–1279 a 72px sidebar with the side column moved below; <768 the sidebar becomes a drawer, KPIs scroll horizontally, tables become lists, and the Kanban scrolls horizontally with snap. Includes a skip link, clear focus, 40px hit areas, and respects `prefers-reduced-motion`.

**Demo accounts** (mock mode only; the sign-in page has a "Điền" button):

| Email | Password | Role | Result |
| --- | --- | --- | --- |
| `admin@songhloi.vn` | `admin123` | ADMIN | Opens the dashboard |
| `owner@songhloi.vn` | `owner123` | OWNER | 403 page |

## Landing and legal pages

The look follows the new mobile app: brand purple `#482AAC`, cream background `#F7F6F2`, green `#8FDB6E` as the accent. Tokens live in `.lp` of `src/styles/landing.css` so they do not affect the admin pages. The content describes only what the app already has; printers, paid plans and e-invoices are not in the current scope, so they are not advertised here.

**Images** live in `public/`:

| Path | Source |
| --- | --- |
| `screens/{home,voice,checkout,orders,pos,reports,products,debts}.webp` | Screenshots of the mobile app in mock mode (`EXPO_PUBLIC_USE_MOCK=true`), full screen on the iOS Simulator iPhone 17 Pro Max (440×956 pt), exported at 660×1434. The status bar (time, signal, battery, Dynamic Island) is removed. The data in the images is sample data; the floating mascot is hidden while capturing so it does not cover content. `debts.webp` alone is captured from the mock web build (`npm run web` in `../mobile`, a 440×956 frame, leaving 62 pt at the top for the status bar) |
| `brand/logo.webp`, `favicon.png`, `apple-touch-icon.png` | `frontend/mobile/assets/brand-logo.png` (the app icon) |
| `brand/robot.webp`, `brand/agent-*.webp` | `frontend/mobile/assets/bubblelogo.png`, `assets/voice/agent-*.png` |
| `brand/icons/*.webp` | 3D icons in `frontend/mobile/assets/tab1-overview` and `tab4-management` |
| `brand/app-icon-1024.png` | 1024×1024 icon for the Meta app settings page (Facebook Login), built from `bubblelogo.png` |

Recapture the images when the app UI changes: run a dev build on the simulator in mock mode (`npx expo start --dev-client` in `../mobile` with the three variables `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE`, `EXPO_PUBLIC_MOCK_SHOPS` set to `true`), capture with `xcrun simctl io booted screenshot`, cover the top 186 px (the status bar at @3x) with the pixel row just below it, then `cwebp -q 82 -resize 660 0`. Keep the 440:956 ratio so the images fit the phone frame in `landing.css`.

**Legal pages** (`src/pages/legal/`) are public text. When a provider, the data collected or the deletion handling commitment (`DELETION_DAYS`) changes, update the content and `POLICY_UPDATED` in `legalConfig.ts`.

**Deployment:** the `deploy-landing` job in [`cd.yml`](../../.github/workflows/cd.yml) (called by CI after the `landing` job passes) builds this web app and pushes it to a separate Vercel project named `landing`. Vercel Git does not deploy (`git.deploymentEnabled: false` in `vercel.json`). Pull requests do not deploy previews for now (the Vercel Hobby daily deploy limit). Environments, with details in [CI/CD](../../docs/development/ci-cd.md#landing-page-on-vercel):

| Environment | Branch | Address |
| --- | --- | --- |
| Staging | `staging` | `LANDING_URL` of the `landing-staging` environment |
| Production | `main` (needs approval) | `LANDING_URL` of the `landing-production` environment |

One-time setup on Vercel: New Project → import this repo → Root Directory `frontend/web` (the Vite framework is detected). Take the project ID and set it as the `VERCEL_PROJECT_ID` secret in the three `landing-*` environments. Set `LANDING_URL` as a Variable of each environment.

`rewrites` in `vercel.json` sends every path to `index.html` so `/privacy` and `/data-deletion` open directly.

## Userflow

The source of the [user flow diagram](../../docs/product/userflow/README.md) lives in `src/userflow`. `npm run userflow` builds it (config `vite.userflow.config.ts`) into a self-contained file `docs/product/userflow/index.html` that opens directly in a browser; screenshots live in `docs/product/userflow/screens/`. The web `vite build` does not touch this page, so it is not part of the deploy.

## Shared states

`src/components/States.tsx` — `LoadingState`, `EmptyState`, `ErrorState` (Retry button), `ForbiddenState`, `ReadOnlyState`.
`src/hooks/useAsync.ts` — returns `{ data, error, loading, reload }`.

Quick check (mock mode): add `?mock=slow`, `?mock=empty` or `?mock=error` to an admin URL, or pick it in the **Dữ liệu mẫu** box at the bottom of the sidebar. `?mock=normal` turns it off. When AI Support fails, the question text is kept so Retry can be clicked.

## Mock data

- `src/types.ts` describes an **assumed** API contract (`AdminOverviewView`, `AdminUserItem`, `AdminShopDetailView`, `SupportTask`, `AiMessage`…). The `AdminOverviewView` fields are assumptions and must be locked with the backend.
- `src/mocks/accounts.ts` generates 48 OWNERs / 53 shops; `src/mocks/tasks.ts` generates 11 support tasks. Only support data exists. "Today" in the sample data is `MOCK_TODAY` (2026-09-16).
- `src/services/mockStore.ts` is a "fake backend" stored in `localStorage` (`snl_mock_db`, `snl_mock_tasks`, `snl_mock_ai`, `snl_mock_audit`, `snl_mock_idem`). The **Khôi phục dữ liệu mẫu** button resets it. Personal preferences are stored in `snl_admin_prefs`.
- AI Support in mock mode is a rule-based responder (`src/services/aiService.ts`) and calls no real model.
- The mock pages (`DashboardPage`, `CustomersPage`, `AiSupportPage`, `TasksPage`, the log in Settings) use the assumed contract in `src/types.ts` and `accountService`/`taskService`/`aiService`, which differ from the real Core API; real mode uses `src/pages/admin/core/` instead. Core has no tasks, members, AI conversations, plans, devices or trends, so those parts exist only in mock mode.

## Structure

```
src/
  App.tsx, main.tsx          routing
  config.ts                  USE_MOCK, API_ENDPOINT, plan limits
  types.ts                   data types / assumed API contract
  mocks/                     sample data, sample tasks, simulated API scenarios
  services/                  api, auth, account, task, ai, preferences, mockStore
  components/admin/          ui (Panel, Pill, Avatar, DetailDrawer…), charts
  components/                States, Pagination, RequireAuth, Modal, Toast
  pages/landing/             landing page, shared footer
  pages/legal/               privacy policy, data deletion guide
  pages/admin/               Login, AdminLayout (AppShell), Dashboard, Customers, AiSupport, Tasks, Settings
  pages/admin/tasks/         TaskFormModal
  pages/ForbiddenPage        403 page
  userflow/                  userflow diagram built into docs: flows.ts (nodes, edges, coordinates), FlowCanvas, NodeSheet
  styles/                    base, landing, admin (tokens per plan)
```

## Mobile app

The Expo app lives in the sibling folder `../mobile`; see `../mobile/README.md`.

### Landing feedback form

The `/#gop-y` section is a preview built on request: full name, phone number, feedback type and content. Required fields use browser validation; the Send button only shows a preview notice, calls no API, stores nothing in localStorage and never reports a successful send. There is no receiving service yet; Core business scope and the requirement for real feedback intake are unchanged.
