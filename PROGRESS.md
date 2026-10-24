### [2026-10-24 10:30 UTC+07:00] — [Change] Admin dashboard ships inside the landing at /admin

**Done:** For the course submission the admin needs one public link, and the separate admin Vercel project would have lived in another team's account. The landing deploy now carries the admin at `/admin` (real Core data) when its GitHub environment sets `VITE_ADMIN_ENABLED=true` with `VITE_API_ENDPOINT` and `VITE_FIREBASE_API_KEY`; without the flag the landing has no admin code, as before. Job `deploy-admin` from #342 is removed. The build check now fails on the mock demo password in any case, on missing admin routes or settings when the flag is on, and on admin code when it is off; with the flag on, the smoke test opens `/admin/login` and fails when Core still rejects a CORS preflight from the landing after 5 minutes.

**Changed files:** `.github/workflows/ci.yml`, `docs/development/ci-cd.md`, `frontend/web/README.md` — modified; this entry.

**Check:** YAML parses; the new build check, run by hand on two local builds, passes a plain landing and a landing with the admin, and fails an admin build without the flag and a plain build with the flag. **Not verified:** the job on GitHub, sign-in on the deployed landing (needs the landing origin in Core's `CORS_ALLOWED_ORIGINS` and an ADMIN account).

### [2026-10-21 20:40 UTC+07:00] — [Feature] Web admin dashboard reads the real Core admin API

**Done:** The admin pages in `frontend/web` called endpoints Core never had (`/auth/login`, `/admin/overview?days=`, `/admin/audit-logs`, no `/api/v1` prefix) and only worked on mock data. With `VITE_USE_MOCK=false` they now use Core:
- **Sign-in:** Firebase email + password through the Firebase Auth REST API (no `firebase` package added), then `GET /api/v1/me`; only a Core account with role ADMIN gets in, others see "Tài khoản này không có quyền quản trị". The ID token stays in memory and refreshes itself; only the refresh token is kept (localStorage with "Ghi nhớ đăng nhập", sessionStorage without), so a reload stays signed in; sign-out clears both.
- **Pages** (`src/pages/admin/core/`, service `src/services/adminApi.ts` typed after Core's DTOs, 0-based pages): Dashboard (owners and shops by status, new in 7/30/90 days, 5 newest shops, recent access), Khách hàng (Chủ tiệm / Cửa hàng tabs, search, status filter, paging; owner drawer with their shops; shop drawer with status history and pause/reopen through `PATCH /api/v1/shops/{id}/status`, a reason required to pause) and a new Nhật ký truy cập page (`/admin/access-logs`, filters by action, shop and dates).
- AI Support, Tasks, quick search, notifications and the settings audit tab need APIs Core does not have, so they only show in mock mode; mock mode is unchanged.
- **Deploy:** the admin is the same source deployed to a separate Vercel project by a new CI job `deploy-admin`, which reuses the `landing-staging`/`landing-production` environments (same Vercel team token, production approval) with its own `ADMIN_VERCEL_PROJECT_ID`, `ADMIN_URL`, `ADMIN_API_ENDPOINT` and `ADMIN_FIREBASE_API_KEY`, so the public landing still has no admin code. The job skips with a notice until those are set; it checks the build has the admin routes, no mock demo accounts and the right Core URL, then smoke-tests `ADMIN_URL/admin/login`.

**Changed files:** `frontend/web/src/pages/admin/core/{CoreDashboardPage,CoreCustomersPage,CoreAccessLogsPage,parts}.tsx`, `frontend/web/src/pages/admin/core/coreUtils.ts`, `frontend/web/src/services/{adminApi,firebaseAuth}.ts` — added; `frontend/web/src/{AdminRoutes.tsx,config.ts,vite-env.d.ts}`, `frontend/web/src/services/{api,authService}.ts`, `frontend/web/src/pages/admin/{AdminLayout,LoginPage,SettingsPage}.tsx`, `frontend/web/.env.example`, `frontend/web/.gitignore` (ignore `.vercel`), `frontend/web/README.md`, `.github/workflows/ci.yml`, `docs/development/ci-cd.md`, `docs/contracts/api-contracts.md` — modified; this entry.

**Check:** `npm run typecheck`, `npm run lint` (no new warnings) and `npm run build` in `frontend/web`; the landing build has no `AdminRoutes` chunk and no `admin123`; a real-mode admin build has the admin routes and no mock accounts. Local run against a fake Core and a fake Firebase Auth emulator (test data only): an OWNER account is refused, the ADMIN account reaches the dashboard, owner paging (20 + 3), search, owner and shop drawers, pausing a shop (button locked until a reason is typed, status, history and access log update), access-log filters, the invalid date range warning, reload keeping the session, mock-only routes redirecting, and sign-out clearing storage. A trial copy of this branch is deployed by hand (Vercel CLI) to a separate Vercel project, `smart-ledger-admin.vercel.app`, pointed at Core staging; its login page loads and the bundle has the admin routes, the Core staging URL and no mock accounts. **Not verified:** real Firebase and Core sign-in (Core staging still rejects that origin's CORS preflight with 403 until `CORS_ALLOWED_ORIGINS` includes it, and an ADMIN account is needed), the `deploy-admin` job on GitHub.

### [2026-10-21 20:05 UTC+07:00] — [Fix] Sign-in errors show a safe diagnostic code in release builds

**Done:** Google sign-in stopped working on the production web and Play builds while staging still works, and the app only said "Không đăng nhập được. Vui lòng thử lại", so the cause could not be told apart. Sign-in errors that are not mapped to a specific message now end with a short code, also in release builds: the Firebase code (e.g. "(mã: auth/internal-error)"), or `google-<code>` for codes from the Google Sign-In library (`google-10` for DEVELOPER_ERROR, `google-no-web-client`, `google-no-lib`, `google-no-id-token`). Only short codes of letters, digits and `/ . _ -` are shown, never SDK messages, tokens or emails; mapped errors (wrong password, cancelled…) keep their messages unchanged.

**Changed files:** `frontend/mobile/src/lib/auth/types.ts`, `frontend/mobile/src/lib/auth/firebaseErrors.ts`, `frontend/mobile/src/lib/auth/firebase.ts` — modified; `frontend/mobile/tests/authErrors.test.ts` — added; this entry.

**Check:** `node --test tests/authErrors.test.ts` 4/4; `npx tsc --noEmit` shows no new errors. **Not verified:** a real sign-in failure on a release build.

### [2026-10-21 17:40 UTC+07:00] — [Fix] Guide overlay works on Android, Bobi speaks in it, order buttons are white cards

**Done:** Tested PR #339 on the Android emulator and changed it on request:
- **Tapping the lit button opened that screen on Android** instead of moving to the next step: the invisible button sat inside the animated ring, and Android did not resize it, so it stayed 0×0 and the tap fell through. It is now placed by the measured position. The dim layer is one frame with a rounded hole, so the four corners around the ring are no longer left bright.
- **Shorter, warmer text with Bobi.** Every card shows Bobi and one short line in Bobi's voice ("mình"), at most 80 characters; the welcome and the last card call the owner by the given name (last word of the name, "bạn" when there is none or it is long).
- **Order buttons.** The tinted see-through cards looked muddy on the purple header, so they are now white cards like the revenue card above, each told apart by a soft icon tile from the brand colours: yellow Đọc đơn, blue Chọn hàng, green Quét mã, lavender Trợ lý Bobi.
- FR-025 and AC-018 mention Bobi and the name.

**Changed files:** `frontend/mobile/src/components/GuideTour.tsx`, `frontend/mobile/src/lib/guideSteps.ts`, `frontend/mobile/tests/guideSteps.test.ts`, `frontend/mobile/app/(tabs)/_layout.tsx`, `frontend/mobile/app/(tabs)/index.tsx`, `docs/product/product-requirements.md` — modified; this entry.

**Check:** `node --test tests/guideSteps.test.ts` 8/8; `npx tsc --noEmit` shows no new errors; Android emulator (CI build #39 with a locally built JS bundle and x86_64 libraries added, debug-signed): the tour opened by itself on the first sign-in of a new install; Android back steps back; all nine rings sit on their buttons, round for the mascot, with no bright corners; tapping the lit button moves on without opening it, and on the last step closes the tour; the welcome card greets the signed-in account by name. **Not verified:** a real phone; Đọc đơn on that emulator build (the speech library does not load in the hand-made x86_64 build).

### [2026-10-21 17:20 UTC+07:00] — [Change] Zalo sign-in is shown as "Sắp có" for now

**Done:** On request, the Zalo button on the sign-in screen is greyed out with "Sắp có" and cannot be tapped on every build, including builds that set `EXPO_PUBLIC_ZALO_LOGIN` or `EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID`, like the Facebook button. The Zalo sign-in code and Core's Zalo endpoints are unchanged, so turning it back on is a one-line change (noted in the code). The PRD's FR-010 says the button is "Sắp có" for now.

**Changed files:** `frontend/mobile/app/(auth)/welcome.tsx`, `docs/product/product-requirements.md` — modified; this entry.

### [2026-10-21 09:24 UTC+07:00] — [Feature] Interactive guide overlay on Overview and distinct colours for the order buttons

**Done:** On request, the guide is now an overlay that points at the real buttons instead of a picture dialog:
- **Tour.** The screen dims and a ring lights one button at a time, with a card that says what it does: welcome, Đọc đơn (order by voice), Chọn hàng (cart and payment, including Ghi nợ), Quét mã (barcode, adding a new item when the code is unknown), Trợ lý Bobi, the Bobi mascot, the bell, the quick menu ☰, the Đơn hàng tab and the Quản lý tab (where "Xem lại hướng dẫn" replays it). Tapping the lit button or "Tiếp" moves on; "Quay lại" and Android back go back; "Bỏ qua" closes it. Other buttons are blocked while it is open, and Overview scrolls to the top so every target is on screen. Steps live in `src/lib/guideSteps.ts`; targets register with `useGuideTarget` and are measured on screen, so the ring follows the real layout.
- **Runs once.** It opens on Overview only while the account has not seen it on this device (`guideSeen` in the account's local profile); finishing or skipping saves that. Signing in again no longer reopens it. "Xem lại hướng dẫn" in Quản lý opens it again.
- **Colours.** The four order buttons shared one translucent purple and looked alike. Each now has its own pastel icon tile with a matching faint border and fill on the purple header: yellow Đọc đơn, blue Chọn hàng, green Quét mã, pink Trợ lý Bobi. The compact row shown after scrolling uses the same tiles.
- The old `AssistantIntroModal` and its four pictures are removed. FR-025 and AC-018 in the PRD describe the overlay.

**Changed files:** `frontend/mobile/src/components/GuideTour.tsx`, `frontend/mobile/src/lib/guideSteps.ts`, `frontend/mobile/tests/guideSteps.test.ts` — added; `frontend/mobile/app/(tabs)/_layout.tsx`, `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/src/components/ZenRing.tsx`, `frontend/mobile/src/lib/localProfile.types.ts`, `frontend/mobile/src/store/AppStore.tsx`, `frontend/mobile/README.md`, `docs/product/product-requirements.md` — modified; `frontend/mobile/src/components/AssistantIntroModal.tsx`, `frontend/mobile/assets/guide/guide-{bobi,overview,sales,manage}.png` — removed; this entry.

**Check:** `node --test tests/guideSteps.test.ts` 4/4; mock web build at 375 px: "Xem lại hướng dẫn" opens the welcome card on Overview (also after scrolling down, which scrolls back to the top); each of the nine rings sits on its button; tapping the ring advances without opening the screen; the last step shows "Xong" without "Bỏ qua" and closes; "Bỏ qua" closes and taps reach Đọc đơn again. **Not verified:** the first-run start and the saved `guideSeen` (mock mode has no account id), a real phone.

### [2026-10-20 12:10 UTC+07:00] — [Fix] Read-only shop-data questions no longer run in the AI sandbox

**Done:** With the sandbox on, `query_shop_data` and `suggest_restock` were folded into `run_code`, so every read-only data question started Monty. They now stay native tools; only model-written `run_code` programs run in the sandbox. On staging (shop 8, 18 turns) sandbox turns fell from 18 to 0, but median latency did not drop (6.01s → 6.14s): model round trips, not Monty, dominate.

**Changed files:** `backend/ai/src/main.py`, `backend/ai/src/agent/service.py`, `backend/ai/src/prompt_templates/{__init__,calculation,restock,sql_agent}.py`, `backend/ai/tests/unit_tests/test_sandbox_option.py` — modified; this entry.

### [2026-10-20 08:58 UTC+07:00] — [Fix] Search and text boxes cut off Vietnamese accents on some Android phones

**Done:** Reported with an Android screenshot: in Sales' collapsed header the search placeholder read "Iim theo ten hoạc ma vạch", with the tops of the letters and the accents cut off. Android pads a `TextInput` by about 10dp above and below; in a box with a fixed height (32 px in the compact search) what is left is shorter than one line of text. The single-line inputs with a fixed height now have `paddingVertical: 0`, so the text uses the whole box (Android centres single-line text): Sales' search (full and compact), the shared `TabSearchBar` (Orders and Sales), the assistant chat box, the manual entry box on Đọc đơn and `Field`. Web and iOS add no such padding, so they look the same as before.

**Changed files:** `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/ai.tsx`, `frontend/mobile/app/voice.tsx`, `frontend/mobile/src/components/TabSearchBar.tsx`, `frontend/mobile/src/components/ui.tsx` — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors. **Not verified:** an Android phone or emulator (none was connected).

### [2026-10-20 08:53 UTC+07:00] — [Feature] Notification controls: read all, swipe to read, clear all, choose groups

**Done:** On request, with the reference screens as the design:
- **Manual reading again.** Opening Notifications no longer marks everything read (the change from #322 is undone, as agreed). A notification stays unread until it is opened, swiped left ("Đã đọc", the `SwipeRow` that #322 had removed), or the new ✓✓ button at the top marks all as read (device-side ones at once, Core's in batches across all pages); the button greys out when nothing is unread. The "Chưa đọc" filter and "N thông báo chưa đọc" are back.
- **Gear menu** next to it: "Xoá toàn bộ thông báo" (red, asks first) and "Cài đặt thông báo".
- **Clear all.** Core has no delete API, so clearing hides on this device only: it marks everything read, then stores a clear mark per account; anything that arrived up to that mark is hidden on Notifications and on Overview's preview, and Core paging stops once it reaches older items. The mark is the later of now and the newest notification shown, so a phone clock behind Core still hides everything on screen. The daily debt and yesterday's income and spending reminders come back the next morning with new numbers.
- **Notification settings** (new screen `/notification-settings`, also linked from Settings): switches for Đơn hàng, Kho hàng (the same setting as "Cảnh báo sắp hết hàng"), Công nợ and Thu chi, with Hệ thống (shop paused or reopened) always on because it affects selling. A switched-off group disappears from the list, its filter, Overview's preview and the bell count (Core's unread count minus the unread count of the hidden types). The choices are saved on the device with the other settings; old saved files without the new keys get them switched on.
- **Read state survives restarts.** Device-side notifications' read ids and the clear mark are now saved in the account's local profile (the last 300 ids); before, the read state lived only in memory, which auto-read had hidden.
- `SettingRow` moved to `src/components/SettingRow.tsx` for both settings screens. The PRD note on the mobile inbox describes the new behaviour.

**Changed files:** `frontend/mobile/app/notification-settings.tsx`, `frontend/mobile/src/components/SettingRow.tsx` — added; `frontend/mobile/app/notifications.tsx`, `frontend/mobile/app/settings.tsx`, `frontend/mobile/src/lib/appSettings.ts`, `frontend/mobile/src/lib/notifications.ts`, `frontend/mobile/src/lib/useCoreNotifications.ts`, `frontend/mobile/src/lib/useLocalNotifications.ts`, `frontend/mobile/src/lib/localProfile.types.ts`, `frontend/mobile/src/store/AppStore.tsx`, `frontend/mobile/tests/appSettings.test.ts`, `docs/product/product-requirements.md` — modified; this entry.

**Check:** `node --test tests/appSettings.test.ts` 8/8; `npx tsc --noEmit` shows no new errors; mock web build at 375 px: a second visit still shows "21 thông báo chưa đọc"; swiping the first row left marks it read (21 → 20); the gear menu shows both items; turning off Đơn hàng saves it and leaves 15 unread with no order row or filter; ✓✓ gives "Không có thông báo mới" and greys out; clear all asks, then empties the list without a "Tải thêm" hint, empties Overview's preview (3 → 0 rows) and clears the bell dot. **Not verified:** saving the clear mark and read ids per account (mock mode has no account id), a real phone, staging Core.

### [2026-10-19 17:03 UTC+07:00] — [Feature] Vibration and stock alerts can be switched off in Settings

**Done:** On request, "Rung phản hồi" and "Cảnh báo sắp hết hàng" in Settings are real switches again instead of "Luôn bật"; the whole row and the switch both flip it. The two choices are saved on the device, not per account (`app-settings.json` in the app's document folder on Android/iOS, `localStorage` on the web), so signing out keeps them; a saved file missing a key or with a wrong value falls back to that key's default (both on). Vibration off makes `triggerFeedback` do nothing everywhere. Stock alerts off hides the "Kiểm tra hàng sắp hết" priority on Overview (the count of things to check drops with it), hides Core's `LOW_STOCK`/`OUT_OF_STOCK` notifications from the Notifications list and the "Kho hàng" filter, and takes them out of the bell count (Core's unread count minus the unread count of those two types). Screen readers get the switch state through `aria-checked` and the "Sắp có" rows through `aria-disabled`, since React Native Web does not turn `accessibilityState` into ARIA. The PRD note on the mobile inbox mentions the switch.

**Changed files:** `frontend/mobile/src/lib/appSettings.ts`, `frontend/mobile/src/lib/appSettingsStorage.ts`, `frontend/mobile/src/lib/appSettingsStorage.web.ts`, `frontend/mobile/tests/appSettings.test.ts` — added; `frontend/mobile/app/settings.tsx`, `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/app/notifications.tsx`, `frontend/mobile/src/lib/feedback.ts`, `frontend/mobile/src/lib/useCoreNotifications.ts`, `frontend/mobile/src/store/AppStore.tsx`, `docs/product/product-requirements.md` — modified; this entry.

**Check:** `node --test tests/appSettings.test.ts` 4/4; `npx tsc --noEmit` shows no new errors; mock web build at 375 px: both switches off → saved as `{"haptics":false,"stockAlerts":false}`, Overview drops "Kiểm tra hàng sắp hết" (2 → 1 thing to check), Notifications shows 8 new instead of 16 with no stock row and no "Kho hàng" filter, tapping filters calls vibrate 0 times; after a page reload both are still off; switched back on → the priority, the filter (8 stock notifications) and 16 new come back and two filter taps vibrate twice. **Not verified:** a real phone (the native file storage and `Vibration`), staging Core.

### [2026-10-19 16:48 UTC+07:00] — [Change] Opening Notifications marks them as read

**Done:** On request, the Notifications screen no longer needs the "Đọc hết" button: once it has loaded, everything counts as seen. The device-side notifications are marked read and Core's inbox is marked read across all pages (`markAllRead`, batch by batch), so the bell on Overview loses its dot. Notifications that were unread on arrival stay bold with a dot for the rest of that visit, the header says "N thông báo mới" and the "Chưa đọc" filter is now "Mới", so it is still clear which ones came in. A notification arriving while the screen is open is marked the same way; a Core call that is still running is not repeated, and a failure shows the usual error toast, with opening a notification still marking it read. The "Đọc hết" fuse button and the swipe-to-mark-read row action are gone. The PRD note on the mobile inbox describes the new behaviour.

**Changed files:** `frontend/mobile/app/notifications.tsx`, `docs/product/product-requirements.md` — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; mock web build at 375 px: the bell had its dot, the first visit showed "16 thông báo mới" with 16 rows marked new and no "Đọc hết" button, back on Overview the dot was gone, and the second visit showed "Không có thông báo mới" with no row marked. **Not verified:** a real phone, staging Core.

### [2026-10-19 15:11 UTC+07:00] — [Change] Settings shows which options exist yet

**Done:** On request, the Settings screen no longer offers switches that do nothing. All six switches were local screen state: nothing saved them and nothing in the app read them, so they reset on leaving the screen. Checking what each option stands for: the app plays no sounds, has no spoken read-back, cannot print and has no backup, and the printer screen is a mock (its test print always reports no connection; printers are outside the MVP PRD). Those four rows are now greyed out with "Sắp có", and the printer button is disabled as "Kết nối máy in · Sắp có". Vibration and low-stock alerts do work but are always on, so those two rows say "Luôn bật" instead of a switch. The Settings hints on Manage and in the quick menu now read "Rung, cảnh báo sắp hết hàng, máy in" instead of advertising sound and printing.

**Changed files:** `frontend/mobile/app/settings.tsx`, `frontend/mobile/app/(tabs)/more.tsx`, `frontend/mobile/src/lib/quickNav.ts` — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; `node --test tests/quickNav.test.ts` 6/6; mock web build at 375 px: Manage shows the new hint, Settings has no switch left, four rows read "sắp có" and two "luôn bật" to screen readers, the printer button is disabled. **Not verified:** a real phone.

### [2026-10-19 15:10 UTC+07:00] — [Feature] Long-term memory map in Cài đặt trợ lý, with delete

**Done:** Chat answers no longer show the "· N ghi nhớ" label or the memory list. Cài đặt trợ lý now shows "Trợ lý đang nhớ N điều" and a map of live memories after Sakana's "My Fish": one quadrant per memory type, closer to the centre means used more recently, bigger dot means used more, memories unused for over 30 days sit faded on the outer ring. A dot's angle comes from its id, so dots keep their place when others are added or removed. Tapping a dot shows a fixed-height card with the full text, usage, "Mở hội thoại gốc" and "Xoá ghi nhớ". Deleting removes the memory and the older versions it superseded, so they do not come back through `superseded_by ON DELETE SET NULL`. The sheet loads settings and memories in parallel and keeps the last data while reloading. Core gains two proxy routes, approved by the owner as an exception to the no-Core-changes rule.

**Changed files:** `backend/ai/src/memory/repository.py`, `backend/ai/src/memory/service.py`, `backend/ai/src/agent/schema.py`, `backend/ai/src/agent/router.py`, `backend/core/.../AgentController.java`, `AgentService.java`, `AgentServiceImpl.java`, `frontend/mobile/app/ai.tsx`, `frontend/mobile/src/data/types.ts`, `frontend/mobile/src/lib/agentApi.ts`, `docs/contracts/api-contracts.md` — modified; `frontend/mobile/src/components/MemoryGraph.tsx` — added; this entry.

**Flow explained:** app → `GET`/`DELETE /api/v1/agent/memory/items` → Core adds `user_id`/`shop_id` from the verified owner → AI `/internal/v1/agent/memory/items` → `agent_memories`.

**Check:** AI `ruff` clean, `pytest` 398 passed, 64 skipped (DB integration tests); Core compiles and runs; mobile `tsc` clean. iOS Simulator against staging (AI :8011, Core :8090): the map shows 3 memories, deleting id 74 returns `204` and the map shows 2; the remaining dots' angles and radii match the formula within 1° and 1 px. **Not verified:** Android; the DB-backed `forget` chain test; Core maps an AI `404` on delete to `conversation_not_found`.

### [2026-10-19 13:07 UTC+07:00] — [Fix] Taps on Overview's collapsed header hit the hidden full header

**Done:** Reported on the staging web: with Overview scrolled and its header collapsed, tapping the quick menu ☰ opened "Đọc đơn" instead. Overview switched which header layer takes touches only when a drag or fling ended (`onScrollEndDrag`/`onMomentumScrollEnd`). A mouse wheel, a trackpad or any scroll without that end event left the faded-out full header on top, so taps on the collapsed bar (☰ and its compact Đọc đơn, Quét mã, Chọn hàng, Trợ lý buttons) landed on the full header's cards underneath; scrolling back up the same way left the full header unable to take taps. Overview now follows the scroll offset and flips the layer when it crosses the threshold, as Sales' header already did. The quick menu also stops taking touches as soon as it starts closing, so a tap right after closing reaches the screen instead of the fading backdrop.

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/src/components/QuickNav.tsx` — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; `node --test tests/quickNav.test.ts` 6/6; mock web build at 375 px with real mouse-wheel scrolling: on collapsed Overview the point under ☰ is the ☰ itself and it opens the menu with Tổng quan highlighted (before the fix that point was "Đọc đơn"), the compact Đọc đơn opens `/voice`, scrolling back up returns taps to the full header's ☰ and cards; the menu opens from the top of Overview, Orders, Sales and Manage with the right item highlighted (none on Manage), and from collapsed Sales; 100 ms after closing, the point under ☰ already reaches the screen. **Not verified:** a real phone.

### [2026-10-19 10:17 UTC+07:00] — [Fix] Keep the mobile landing gallery centred and tighten the gap before it

**Done:** On phones the active screen drifted off-centre while scrolling. The track overflow (`--shift`) was measured only on mount and resize, but the gap between screens depends on `--focus`, which changes with scroll. The hook now measures the overflow each frame, after it writes `--p`, so the value matches the layout. On phones the blank space between the pain list and the gallery heading is about halved, by trimming the statement section's bottom padding. The two FAQ questions about data safety and account deletion are replaced with questions that do not link to the legal pages, which are hidden at this stage.

**Changed files:** `frontend/web/src/hooks/useScrollProgress.ts`, `frontend/web/src/pages/landing/LandingPage.tsx`, `frontend/web/src/styles/landing.css` — modified; this entry.

**Flow explained:** each frame the hook writes `--p`, then reads the track `scrollWidth` once and writes `--shift`. The track's `translate` is `--a / (n-1) × --shift`, so the active screen lands in the middle of the viewport. Below 560 px the statement section's bottom padding drops from about 134 px to about 38 px, so the heading sits 137 px below the pain list at 440 px wide instead of 233 px.

**Check:** typecheck, `oxlint` on the landing files and `npm run build` pass. In the browser at 375, 440 and 1440 px the active screen centre is 0 px from the viewport centre at each sampled scroll point, with transitions disabled because the pane does not advance them, and the stored `--shift` equals the measured overflow. The footer still links to `/privacy` and `/data-deletion`; left unchanged. Scroll feel and spacing on a physical phone not verified.

### [2026-10-19 10:07 UTC+07:00] — [Feature] Swipe between landing gallery screens on touch

**Done:** A horizontal swipe on the gallery moves to the previous or next screen by scrolling to that screen's progress point; vertical scroll is unchanged (`touch-action: pan-y`). The scroll hook now reads every position before writing styles and measures the track width and screen count only on resize, so each frame does less layout work. The nav shadow shows at page load instead of after scrolling, and the nav no longer listens to scroll.

**Changed files:** `frontend/web/src/hooks/useScrollProgress.ts`, `frontend/web/src/pages/landing/LandingPage.tsx`, `frontend/web/src/styles/landing.css` — modified; this entry.

**Flow explained:** a swipe reads `data-active` from the gallery section and scrolls to `0.06 + 0.88 × index / (n-1)`, the progress point that useScrollProgress maps back to that screen.

**Check:** typecheck and build pass. In the browser at 375 px, a left swipe moves to screen 1 and a right swipe back; a vertical swipe changes nothing; no horizontal overflow. Smooth scroll stalled in the pane until the next event, so the final position was read after a second swipe. Scroll smoothness and swipe on a real device not verified.

### [2026-10-19 10:03 UTC+07:00] — [Fix] Desktop landing gallery fits tall windows

**Done:** On desktop above 1100 px of viewport height, the focused phone was scaled by 1.82 with no shorter-screen tier, so on a 1142 px window its bottom, the progress bar and the fineprint fell below the window edge. The default `--focus` is now 1.3, the value the 1100 px tier already uses; the shorter-screen tiers still apply below it. Mobile sets its own focus and is unchanged.

**Changed files:** `frontend/web/src/styles/landing.css` — modified; this entry.

**Flow explained:** the `--focus` value feeds the phone's `scale` and the `margin-top` and `gap` that leave room for the scaled phone inside the pinned screen.

**Check:** `npm run build` passes. In the browser, the phone bottom and fineprint sit inside the viewport at 1440×900, 1920×1200, 2000×1142 and 2560×1440; at 2000×1142 the heading starts 13 px below the nav. At 375×812 the focus is still the mobile value and the phone ends at 773 px.

### [2026-10-19 09:59 UTC+07:00] — [Fix] Mobile landing gallery, FAQ and pain list

**Done:** On mobile, the gallery heading was capped at 96 px, which clipped its fourth line at 375 px. The cap is now `6em` of the heading font, so the full heading shows at start and still collapses on scroll. The gallery pins for 600vh instead of 900vh, and the phones grow from 1.2x to 1.4x as the heading collapses. Bobi stays visible beside the FAQ heading, the first FAQ item starts closed, and the pain list lines no longer reveal on scroll. On desktop, overflowing gallery content aligns to the top (`safe center`) so the fixed nav does not cover the heading.

**Changed files:** `frontend/web/src/styles/landing.css`, `frontend/web/src/pages/landing/LandingPage.tsx` — modified; this entry.

**Flow explained:** `--p` from `useScrollProgress` drives the heading's `--k`, which sets its `max-height`, `margin-bottom` and `opacity`, and the phones' `--focus`.

**Check:** `npm run typecheck` and `npm run build` pass. In the browser at 320, 375 and 393 px the heading is not clipped at the top and collapses at p≈0.03 (verified). Real-device scroll feel not verified.

### [2026-10-19 09:10 UTC+07:00] — [Fix] Quick switch menu button in the collapsed headers

**Done:** CodeRabbit on #309: once Overview or Sales is scrolled and its header collapses, the ☰ button scrolled away with the full header, and with Android gesture navigation the left-edge swipe belongs to the system, so the menu could not be opened without scrolling back up. Both collapsed headers now start with a compact ☰ (36 px, the size of Sales' compact buttons; white on Overview's purple bar). `AC-096` now says that opening the menu from Manage highlights no item, since Manage has no entry of its own (CodeRabbit's second note), and `FR-035` mentions the compact buttons.

**Changed files:** `frontend/mobile/src/components/QuickNav.tsx`, `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/app/pos.tsx`, `docs/product/product-requirements.md` — modified; this entry.

**Check:** see the PR validation table.

### [2026-10-19 08:17 UTC+07:00] — [Feature] Quick switch menu on the left of the main tabs

**Done:** On request, the four main tabs get a menu that slides in from the left. It opens with a ☰ button (Overview: before the logo, in the purple header's button style; Manage: before the title; Orders and Sales: left of the shared search box) or a swipe from the left edge, and lists the core screens: Tổng quan, Bán hàng, Đơn hàng, Công nợ, Hàng hoá, Báo cáo, Chi phí, Trợ lý AI, Cài đặt, with the open tab highlighted. Picking a tab item switches tabs; the others open their screen. It closes on a pick, a tap outside, X, a swipe to the left (on the menu or the dimmed area) or Android back; it covers the tab bar and the Bobi mascot, and the status bar turns dark while it is open so its icons stay visible on the white panel. On Sales the button first sat next to the title, which pushed "Bán hàng" and its product count onto two lines at 375 px, so on Orders and Sales it sits beside the search box (`TabSearchBar` takes a `leading` element) and both headers keep the same positions when switching tabs. Gestures follow the usual Android/iOS drawer: the menu's edge stays under the finger (a drag that starts on the dimmed area moves the menu only once the finger reaches its edge), a fast swipe (over 0.3 px/ms) decides open or close by direction, a slow drag changes state only past 35% in the direction of the drag and otherwise springs back, the release continues with the finger's speed on a spring without bounce, and the button opens and closes with Material 3's emphasized curves (260/200 ms). A drag needs 8 px and must be clearly horizontal, so vertical scrolling near the edge and taps are not taken; dragging the Bobi mascot keeps working because it refuses to hand over its gesture. With Android gesture navigation the left-edge swipe is the system back gesture, so the button is the main way in. No new dependency. New `FR-035`, `AC-096` and the BRD trace.

**Changed files:** `frontend/mobile/src/components/QuickNav.tsx`, `frontend/mobile/src/lib/quickNav.ts`, `frontend/mobile/tests/quickNav.test.ts` — added; `frontend/mobile/app/(tabs)/_layout.tsx`, `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/app/(tabs)/invoices.tsx`, `frontend/mobile/app/(tabs)/more.tsx`, `frontend/mobile/app/pos.tsx`, `frontend/mobile/src/components/TabSearchBar.tsx`, `docs/product/product-requirements.md`, `docs/product/business-requirements.md` — modified; this entry.

**Check:** `node --test tests/quickNav.test.ts` 6/6 (the nine items point at real screens, active item by path, the release rule); `npx tsc --noEmit` shows no new errors; mock web build at 375 px: the button on all four tabs, the menu opens, each tab item switches tabs and closes the menu, Công nợ opens `/debts`, a tap outside closes it, touch swipes simulated in the page: the menu edge follows the finger (18→150 px), a release at 49% opens it, a slow drag to 26% falls back closed, a 70 px fast swipe opens it, a 50 px drag back on the open menu springs open again, a drag from the dimmed area moves the menu only after reaching its edge and closes it at 55%, a mostly vertical swipe at the edge does not open it, the Sales title stays on one line and the Orders and Sales search boxes line up. For that run `app.json` had the Google sign-in plugin removed locally (the shared `node_modules` lacks it); the change was reverted. **Not verified:** a real phone (Android back, gesture navigation, edge swipe with a finger).

### [2026-10-18 18:09 UTC+07:00] — [Feature] Landing page: bobbing Bobi in the hero and a Trợ lý Bobi section

**Done:** Bobi (`/brand/robot.webp`) sits on the corner of the middle hero phone again and bobs (`lpBob`). After the features grid, a new dark section "Trợ lý Bobi" (`#tro-ly`) shows four real screenshots from the staging app with test shop data: ask "Doanh thu 7 ngày qua?" while Bobi looks up data, a debt answer with real figures (16.988.324 VND from 32 customers, with a "Mở Công nợ" button), asking Bobi to remember that the shop closes its books weekly and restocks on Mondays, and a new conversation whose answer carries the "2 ghi nhớ" label listing those memories with a link to the source conversation. Below 560px the four phones become a horizontal swipe strip. The footnote says Bobi only reads data (read-only tools, see `api-contracts.md`) and that long-term memory is experimental and can be switched off in Cài đặt trợ lý, since it still awaits PO approval.

**Changed files:** `frontend/web/src/pages/landing/LandingPage.tsx`, `frontend/web/src/styles/landing.css` — modified; `frontend/web/public/screens/ai-lookup.webp`, `ai-answer.webp`, `ai-remember.webp`, `ai-recall.webp` — added; this entry.

**Check:** `tsc --noEmit`, `oxlint` and `npm run build` pass. Dev server at 1440×900: four columns fit inside the 1080px container; at 375×812: no horizontal page overflow, the swipe strip and the bobbing Bobi in the hero and the section render. Screenshots taken in the iOS Simulator from a Release build of `b02359a` against Core staging. **Not verified:** Safari/iOS rendering of the landing page.

### [2026-10-18 17:27 UTC+07:00] — [Feature] Landing page in the style of Apple's iPhone pages

**Done:** The landing page is redesigned around scroll-driven storytelling. Hero: very large centered headline, pill CTA, and three phones (Đọc đơn, Tổng quan, Báo cáo) that spread apart as you scroll away. A white statement section lights up word by word as it scrolls in, followed by three short pains. "Cách hoạt động" is a pinned black section (640vh) told like the iPhone camera intro: it opens on a tilted close-up of the screen that pulls back to the whole phone, then each stretch of scroll plays one screen of the real app flow (Tổng quan → Đọc đơn → Thanh toán → Đơn hàng → Báo cáo). New screens push in from the right like iOS navigation; a virtual tap hits the button that leads on (Đọc đơn, Thanh toán, Hoàn tất) and the last change is a finger swipe, while the step text and dots follow. Features become a bento grid; "Giao diện" is a pinned section where vertical scroll pans six phones horizontally with a progress bar. Compare and FAQ are restyled (FAQ as a hairline list), and a dark closing CTA ("Miệng nói. Sổ ghi.") raises and straightens a phone until it reaches the footer. The new `useScrollProgress` hook writes `--p` (and `data-step`, `--shift`) on `[data-scroll]` elements; CSS builds every effect from those. With reduced motion or no JS the pinned sections fall back to a static layout. Copy keeps the existing claims; the footer and legal pages are unchanged.

**Changed files:** `frontend/web/src/pages/landing/LandingPage.tsx`, `frontend/web/src/styles/landing.css` — modified; `frontend/web/src/hooks/useScrollProgress.ts` — added; this entry.

**Check:** `tsc --noEmit`, `oxlint` and `npm run build` pass. In the dev server at 800×600 and 375×812: the story zooms out over the first 14% and then shows steps 0–4 with taps and the final swipe at the expected scroll positions, the gallery pans horizontally, no horizontal page overflow, the static fallback shows all three steps. **Not verified:** real-device scroll smoothness (the browser pane was hidden, so rAF was stubbed), Safari/iOS, and `prefers-reduced-motion` with the OS setting on.

### [2026-10-17 13:50 UTC+07:00] — [Fix] Web Zalo sign-in names the error Core returns

**Done:** On the web, every error code that Core's Zalo callback page sends back showed the same "Không đăng nhập được bằng Zalo". It now shows the message for that code, as the Android app does (for example `zalo_provider_unavailable` → "Zalo chưa phản hồi. Vui lòng thử lại sau", `zalo_session_expired` → "Lượt đăng nhập Zalo đã hết hạn…"); an unknown code keeps the general message and `zalo_consent_denied` still counts as cancelled. Testing staging the same day, the browser console showed the callback sending `zalo_provider_unavailable` on the web, and the Android app got the same code: Core's call to Zalo's token or profile API is refused, which is a Core configuration matter for BE.

**Changed files:** `frontend/mobile/src/lib/zaloLogin.web.ts` — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; `node --test tests/zaloProof.test.ts` 18/18. **Not verified:** the new message in a browser.

### [2026-10-17 12:35 UTC+07:00] — [Feature] Zalo sign-in on the Android app (CORE-016)

**Done:** The Zalo button on Android now works when the build sets `EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID` (staging: `android-staging`, the public client ID in Core's staging configuration). As BE asked, there is no Zalo SDK or WebView: the app opens the external browser at `/api/v1/auth/zalo/native/authorize`, Zalo signs in on the web, Core redirects to `https://<Core>/mobile/auth/zalo/complete#…`, and the App Link brings the app back. The app accepts only that path on its own Core with its own client, `requestId` and purpose, sends the `handoffReference` with the `clientVerifier` it kept in memory to `/auth/zalo/native/exchange`, signs in to Firebase with the custom token and opens the Core session like the other methods. Coming back without a link counts as cancelled; a fixed error code in the link shows the matching message; an App Link that arrives after Android closed the app opens the start screen (its verifier is gone), and `+native-intent` keeps that path from becoming a route. Hermes has no Web Crypto, so SHA-256 is plain JS and random bytes come from Expo's native UUID (`SecureRandom`) when `crypto.getRandomValues` is missing. `app.config.js` declares the App Link (`autoVerify`, exact path only) when the client ID is set and the Core is HTTPS; the release workflow passes the new variable. LINK in the app is not built. `FR-010` updated.

**Changed files:** `frontend/mobile/src/lib/auth/sha256.ts`, `frontend/mobile/src/lib/auth/secureRandom.ts`, `frontend/mobile/app/+native-intent.tsx` — added; `frontend/mobile/src/lib/zaloLogin.ts`, `frontend/mobile/src/lib/auth/zaloProof.ts`, `frontend/mobile/src/config.ts`, `frontend/mobile/app.config.js`, `frontend/mobile/.env.example`, `frontend/mobile/app/(auth)/welcome.tsx`, `frontend/mobile/tests/zaloProof.test.ts`, `.github/workflows/mobile-release.yml`, `docs/product/product-requirements.md` — modified; this entry.

**Check:** `node --test tests/zaloProof.test.ts` 18/18 (SHA-256 against `node:crypto` around block boundaries, the UUID fallback, App Link parsing); `npx tsc --noEmit` shows no new errors; `app.config.js` gives the intent filter only with the client ID and an HTTPS Core. On 2026-10-17 12:26 Core staging still answered `503 zalo_unavailable` for native authorize (probe with an unknown client, no attempt created) and served `assetlinks.json` with the debug certificate used by the dev and staging APKs. **Not verified:** a local Android export (the shared `node_modules` lacks `@react-native-google-signin`), the APK, App Link verification on a phone, a real Zalo sign-in; `AC-092` stays open.

### [2026-10-17 09:44 UTC+07:00] — [Change] Facebook sign-in button locked; Zalo button turned on for the staging web

**Done:** On request, the Facebook button on the sign-in screen is greyed out with "Tạm khoá" and cannot be tapped, on web and in the app; the Facebook flow itself is unchanged and can be switched back by restoring the button. `SocialBtn` takes a `note` for that label (default "Sắp có"). The GitHub environment `vercel-staging` gets `EXPO_PUBLIC_ZALO_LOGIN=true`, so the staging web shows an active Zalo button after its next deploy. Core staging still answered `503 zalo_unavailable` on 2026-10-17 09:41 (probe with a deliberately wrong origin, so no sign-in attempt was created): until BE enables Zalo on Railway, tapping Zalo shows "Đăng nhập Zalo đang tạm ngưng…". `FR-010` notes the locked Facebook button.

**Changed files:** `frontend/mobile/app/(auth)/welcome.tsx`, `docs/product/product-requirements.md` (`FR-010`) — modified; this entry. Configuration: GitHub environment variable `EXPO_PUBLIC_ZALO_LOGIN` in `vercel-staging`.

**Check:** `npx tsc --noEmit` shows no new errors. **Not verified:** the deployed staging page.

### [2026-10-17 09:37 UTC+07:00] — [Fix] Zalo name hint sent only when Core accepts it

**Done:** CodeRabbit on #289: the Zalo exchange returns a name hint of up to 255 characters, but `POST /auth/session` accepts at most 150, so a long or blank Zalo name made sign-in fail with a validation error toast. The sign-in screen now trims the hint and sends it only when it is 1–150 characters; otherwise it sends no name, so an existing account signs in as usual and a new account gets Core's "name required" answer and goes to "Bạn tên gì?" (whose field is capped at 150). CodeRabbit's suggestion sent every such case to that screen, which would also ask existing accounts for a name. The code reached `staging` through #296.

**Changed files:** `frontend/mobile/app/(auth)/welcome.tsx` — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors. **Not verified:** a real Zalo account with a blank or very long name.

### [2026-10-17 09:19 UTC+07:00] — [Fix] Tester feedback: confirm password, profile kept after sign-out, money input cap, report survives a profit error

**Done:** Four problems a tester reported on production:
- **Sign-up** had one password field. Email sign-up now asks "Nhập lại mật khẩu"; different values show "Hai mật khẩu chưa giống nhau" and the account is not created.
- **Profile edits** for name, email, Facebook and the transfer bank lived only in memory and vanished after signing out, and the phone field was read-only. Core has no place for those personal and bank fields, so they are now kept on the device per account (`localProfile`: a JSON file in the app's document directory on Android/iOS, `localStorage` on the web) and laid over the Core data after each sign-in; the screen says they do not sync to other devices yet. The phone is now "Số điện thoại tiệm", editable, and saved to Core with `PATCH /shops/{id}` (`phone`, already in the contract).
- **Revenue off by 24 đồng.** The tester's shop has sales of 1–2 × 10^18 đồng (since voided). Such numbers are above `Number.MAX_SAFE_INTEGER`, so the app rounds them. The price, cost, expense and custom-item price fields now refuse anything above 10.000.000.000đ (`capMoney`); existing data still needs a Core-side fix.
- **Report "Không tải được số liệu bán hàng".** `/reports/profit-estimate` returns 500 on production for that shop; summing those amounts likely overflows Core's `bigint` casts (inferred from `ReportAggregationRepository`, not confirmed in logs). The report now loads revenue and voided orders even when the profit call fails and shows "Chưa tính được giá vốn và lãi của kỳ này (…)" with "Tính lại".

New criteria `AC-093`–`AC-095`; `FR-010` mentions the repeated password.

**Changed files:** `frontend/mobile/src/lib/localProfile.ts`, `frontend/mobile/src/lib/localProfile.web.ts`, `frontend/mobile/src/lib/localProfile.types.ts`, `frontend/mobile/tests/format.test.ts` — added; `frontend/mobile/app/(auth)/email.tsx`, `frontend/mobile/app/profile.tsx`, `frontend/mobile/app/analytics.tsx`, `frontend/mobile/app/expenses.tsx`, `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/products.tsx`, `frontend/mobile/app/voice.tsx`, `frontend/mobile/src/components/BarcodeScannerModal.tsx`, `frontend/mobile/src/data/mock.ts`, `frontend/mobile/src/lib/format.ts`, `frontend/mobile/src/lib/sessionApi.ts`, `frontend/mobile/src/lib/shopProfile.ts`, `frontend/mobile/src/lib/useReportTotals.ts`, `frontend/mobile/src/store/AppStore.tsx`, `docs/product/product-requirements.md` — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; `node --test tests/format.test.ts` 5/5; mock web build (3/3): sign-up shows the repeat field and blocks a mismatch, a matching pair creates the account, and after editing name, shop phone, bank and account number then signing out and back in, all four are still there. The full unit suite has one failure already on `staging` since #288 (`parseOrder`: "chỉ một món chứa tên đã nói thì vẫn hỏi xác nhận"), untouched here. **Not verified:** the report fallback against a real 500, a real phone.

### [2026-10-17 01:25 UTC+07:00] — [Fix] Debt answers get the Công nợ button; the memory count reads as a count

**Done:** Asked "mún xem công nợ", Bobi told the owner to open Quản lý, Công nợ but added no button, so the owner typed "link" and got "Bobi chưa hiểu ý". The `suggest_screen` rule from #267 allowed a button only when the reply asked the owner to record, pay or edit something and forbade it for replies that report figures, while the SQL prompt tells the model to point to the Debts screen to see who owes. The rule now asks for a button whenever the reply sends the owner to a screen to see, record, pay or edit something, and when the owner asks for a link or button to a screen, including one named earlier; a reply that only reports figures and sends the owner nowhere still gets none. Above an answer that used memories, the label read "Trợ lý Bobi 3": the bare memory count looked like part of the name. It now reads "Trợ lý Bobi · 3 ghi nhớ" in muted text, also for a single memory, so the tappable list is discoverable.

**Changed files:** `backend/ai/src/prompt_templates/app_guide.py`, `frontend/mobile/app/ai.tsx` — modified; this entry.

**Check:** AI `ruff check`, `ruff format --check` and unit tests (345 passed); mobile `tsc --noEmit` clean. Real model (Claude Haiku 5.5 on OpenCode Go) against staging shop 8, 5 rounds each: old prompt gave the debts button 0/5 for "mún xem công nợ", new prompt 5/5; the "link" follow-up got it 4/5; "Doanh thu 7 ngày qua?" got no button in either. **Not verified:** the label on a phone.

### [2026-10-17 00:41 UTC+07:00] — [AI] Memory reconcile against similar memories and use frequency in ranking

**Done:** After Hy Memory's `pro` mode, a new fact that replaces no recalled memory is now checked against up to three live memories with cosine 0.6 or more that the turn did not recall (`AgentMemoryRepository.similar`, which records no use); one `MEMORY_RECONCILE_PROMPT` call marks each fact `new`, `replaces` a shown id, or `known` (dropped). No candidate means no call; a failed call keeps the facts. This catches an owner updating an old fact inside a question about something else, which the extraction step alone missed. Recall ranking also multiplies by `1 + ln(max(use_count, 1))`, Hy Memory's frequency term. ADR-0002 gains "Bổ sung theo Hy Memory".

**Changed files:** `backend/ai/src/memory/repository.py`, `backend/ai/src/memory/service.py`, `backend/ai/src/prompt_templates/memory.py`, `backend/ai/src/prompt_templates/__init__.py`, `backend/ai/tests/unit_tests/test_agent_memory.py`, `backend/ai/tests/integration_tests/test_memory_repository.py`, `backend/ai/README.md`, `docs/architecture/adr/0002-agent-long-term-memory.md` — modified; this entry.

**Check:** `uv run pytest` 390 passed, 64 skipped; ruff clean. Through `POST /internal/v1/agent/chat/stream` against staging (shop 3): an old rice-supplier fact left out of recall was superseded by "anh Tâm" said inside a revenue question (`memory reconciled ... candidates=1 replaced=1`); the first try at threshold 0.7 missed it (cosine 0.652), hence 0.6. Test conversations deleted. **Not verified:** the new integration tests (need `POSTGRES_TEST_URL`, run in CI).

### [2026-10-17 00:25 UTC+07:00] — [Fix] Bobi no longer shows the same answer twice

**Done:** After #262 kept the answer a model writes before calling `suggest_screen`, a model that then wrote the same answer again (after the tool returned) had both copies joined, so the chat showed every paragraph twice ("Xóa đơn hàng #225", the matcha latte profit question). A later response that only repeats the kept answer (spacing ignored) is now dropped, both in the stored answer and in the stream; while a response still reads like the start of the kept answer, the stream holds it back until it differs, so nothing is sent and taken back.

**Changed files:** `backend/ai/src/agent/service.py`, `backend/ai/tests/unit_tests/test_screen_buttons.py` — modified; this entry.

**Check:** New tests failed before the fix (answer and stream held the list twice) and pass after; `uv run ruff check`, `uv run ruff format --check`, `uv run pytest -q tests`: 386 passed, 62 skipped. **Not verified:** against the real model on staging.

### [2026-10-16 20:10 UTC+07:00] — [Feature] Zalo sign-in on the web build

**Done:** The web build's sign-in screen can use the Zalo flow Core added in #275 (Zalo CORE-015, LOGIN only). The Zalo button opens a popup at once on tap (before any `await`, so Safari does not block it), then points it at `/api/v1/auth/zalo/authorize` with `purpose=LOGIN`, the page origin, a random `requestId` and `clientChallenge` = base64url SHA-256 of a 43-character `clientVerifier` kept in memory. The message from Core's callback page is accepted only from Core's origin, from that popup and with the same `requestId` and `purpose`; other messages are ignored. The proof and verifier go to `/auth/zalo/exchange` without any Firebase ID token (new `apiRequest` option `anonymous`, so a stale session on the device cannot get in the way), the returned custom token signs in to Firebase (`signInWithCustomToken`, added to native, web and mock auth), and the screen opens the Core session with Zalo's name as the hint for a new account, then goes to shop setup or the tabs like the other providers. A refused consent or a closed popup counts as cancelled; Zalo error codes from Core have Vietnamese messages. The button stays "Sắp có" unless the build sets `EXPO_PUBLIC_ZALO_LOGIN=true` (CI passes the `vercel-*` environment variable of that name); the Android/iOS app keeps "Sắp có" because Core has no app flow yet. LINK is not built.

**Changed files:** `frontend/mobile/src/lib/auth/zaloProof.ts`, `frontend/mobile/src/lib/zaloLogin.ts`, `frontend/mobile/src/lib/zaloLogin.web.ts`, `frontend/mobile/tests/zaloProof.test.ts` — added; `frontend/mobile/app/(auth)/welcome.tsx`, `frontend/mobile/src/config.ts`, `frontend/mobile/src/lib/api.ts`, `frontend/mobile/src/lib/errors.ts`, `frontend/mobile/src/lib/auth/types.ts`, `frontend/mobile/src/lib/auth/firebase.ts`, `frontend/mobile/src/lib/auth/firebase.web.ts`, `frontend/mobile/src/lib/auth/mock.ts`, `frontend/mobile/.env.example`, `.github/workflows/ci.yml`, `docs/development/ci-cd.md`, `docs/product/product-requirements.md` (`FR-010`, sign-in flow), `docs/contracts/api-contracts.md` (Zalo status) — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; `node --test tests/zaloProof.test.ts` 9/9 (challenge equals Node's SHA-256 base64url of the verifier; messages from another origin, window, request or purpose are ignored; consent denial is returned; a malformed proof is rejected); mock web build: the Zalo button is active and a new Zalo account goes straight to shop setup with the name hint (2/2); real-mode web build against a local fake Core that mirrors #275's checks (callback page posting to the opener, exchange verifying proof, Origin and SHA-256(verifier) = challenge): authorize gets `LOGIN`, the page origin, a valid `requestId` and a 43-character challenge with no extra parameters, the exchange passes every check with only `proof` and `clientVerifier`, and the app moves on to Firebase custom sign-in (4/4). **Not verified:** the real flow against staging Core and Zalo (Core staging has `ZALO_ENABLED=false`).

### [2026-10-16 19:53 UTC+07:00] — [Fix] Debt repayment in two steps; "Dùng tài khoản khác" on the name step; Bobi hint no longer cut

**Done:** The debt sheet showed the amount field, the cash/transfer choice and both buttons at once, and "Trả hết" recorded the whole balance on a single tap. It now opens with two buttons under "Khách trả nợ": "Trả một phần" shows the amount field ("Còn nợ …" as placeholder, an error when the amount is above the balance), the payment method and "Quay lại" / "Ghi nhận …"; after recording, the sheet returns to the two buttons. "Trả đủ" opens "Khách trả đủ nợ?" with the customer, amount, sale number and payment method; "Huỷ" records nothing and "Xác nhận đã trả" settles the debt. `AC-075` describes the two steps.

On "Bạn tên gì?" the link "Dùng số điện thoại khác" is now "Dùng tài khoản khác", like on shop setup: sign-in by phone number is gone and the link just signs out to pick another account.

A tester's phone showed the "Giữ để đọc đơn" hint beside Bobi cut to "Giữ để đọc đơ": the bubble started a fixed 94 px left of Bobi, so its end slid under Bobi, more so with large system text. The bubble is now anchored by its right edge 8 px from Bobi (by its left edge when Bobi sits on the left), stays on one line and stops growing at 1.3× system text.

**Changed files:** `frontend/mobile/app/debts.tsx`, `frontend/mobile/app/(auth)/profile.tsx`, `frontend/mobile/src/components/ZenRing.tsx`, `docs/product/product-requirements.md` (`AC-075`) — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; mock web build in headless Chrome (7/7): the sheet opens with only the two buttons and no amount field; "Trả một phần" shows the field and "Quay lại"; an amount above the balance is flagged; recording 10.000đ of 379.000đ leaves 369.000đ and returns to the two buttons; "Trả đủ" asks "Khách trả đủ nợ?", "Huỷ" keeps 369.000đ, "Xác nhận đã trả" leaves 0đ and "Khách đã trả đủ"; the hint bubble ends 8 px left of Bobi with its text uncut, also with the hint text at 15.6 px (4/4). **Not verified:** a real phone against staging Core.

### [2026-10-17] — [Chore] Resolve PR 293 progress conflict with staging

**Done:** Synchronized staging `6caa9b2` into `feat/zalo-android` for PR #293, retaining all progress entries from both parents. The only conflict was this log; the incoming AI fix and its tests are kept exactly as staged upstream.

**Changed files:** `PROGRESS.md` conflict resolution and this entry; `backend/ai/src/agent/service.py` and `backend/ai/tests/unit_tests/test_screen_buttons.py` are incoming staging content, not manual Zalo changes.

**Flow explained:** Core, V18 and Zalo configuration remain unchanged. No PR merge, deployment, shared-DB migration or native activation is performed.

**Check:** Before committing, verify preservation of every parent log block, unchanged Core index, exact upstream AI content, absence of conflict markers and clean whitespace. Existing Core regression evidence is 1,358 tests / 100 suites with no failures/errors/skips; this log-only resolution does not rerun Core, AI or APK acceptance. New remote CI checks follow the push.

### [2026-10-17] — [Chore] Sync Zalo Android with latest staging progress

**Done:** Merged staging `5e8f27b` into `feat/zalo-android` and resolved the only conflict, `PROGRESS.md`, by retaining every entry from both parents. Incoming AI prompt files are taken unchanged from staging; no manual FE/AI edit or live-environment operation is included.

**Changed files:** Progress conflict resolution and this new entry; the two AI prompt files are normal incoming staging changes, not Zalo implementation changes.

**Flow explained:** Core, V18 and staging configuration are identical to the tested feature parent. This sync does not activate Railway/native, run a shared migration or accept the APK/provider flow.

**Check:** Parent progress-block preservation, unchanged Core tree, exact incoming AI content, conflict-marker and whitespace checks are performed before the merge commit. Core regression evidence remains the preceding V18 entry (1,358 tests / 100 suites, no failures/errors/skips; 15 required PostgreSQL suites); no claim of rerunning AI/provider/APK acceptance for this merge.

### [2026-10-17] — [Feature] Add approved Zalo Android V18 and staging activation configuration

**Done:** Added the approved CORE-016 #276 migration and prepared explicit staging enablement on `feat/zalo-android`. The user chose configuration in this branch and Railway activation only after merge. Runtime defaults remain OFF; no shared/business/staging/production DB migration, Railway change, production activation or FE implementation is performed here.

**Changed files:** New `V18__add_zalo_android_handoff.sql`, public `backend/core/config/zalo-native-staging.env.example`, `ZaloNativeMigrationPostgresTest` and `ZaloNativeStagingConfigurationTest`; native flow tests, V17 test target, CI report gate, runtime/OpenAPI comments, Core examples/README/guides, canonical API/BRD/PRD/technical design/ERD and docs index; this new entry. Removed the duplicate native test-schema fixture (retained in Git history); native tests now use actual Flyway V18 and a separate actual V17 compatibility schema. Existing unrelated formatting/IDE files and all earlier progress entries are preserved.

**Flow explained:** V18 extends only transient OAuth sessions with WEB-default channel/client/target/native reference hash/expiry and channel-aware constraints; existing account/shop/mapping and WEB session values remain. One transaction, 5-second lock timeout and 60-second statement timeout bound the ordinary locked unique-index/constraint build; early/late/schema/lock failure rolls back all V18 changes without adopting unexpected schema. RLS/public-access restrictions remain. After merge and verified V18, review/copy staging variables to Railway for APK acceptance; the example contains no secret/DB/migration switch and is not auto-loaded. Recovery disables native and retains V18/mappings, never deletes users or identity history. AC-092 clarifies controlled staging testing versus separate APK/production acceptance.

**Check:** Test-first missing-migration/config RED: 9 tests, 1 failure / 7 errors / 0 skipped; focused GREEN: all 7 migration and 2 staging-configuration tests pass on isolated PostgreSQL 16 loopback/tmpfs. The first full run exposed a test-only Mockito restubbing error in the new V17 compatibility setup; corrected with doAnswer, keeping the real transaction assertion. Final fresh Java 21 Maven `verify` with JaCoCo 0.8.14 passed **1,358 tests / 100 suites, 0 failures / 0 errors / 0 skipped**; all 15 mandatory PostgreSQL suites pass, including 7 V18 migration and 14 native-flow cases. Node helpers/landing (8 + 3), three Chrome popup scenarios and all 13 report-gate self-tests pass with synthetic data. Native repository/controller/service/page and DTO/result retain full measured Java line coverage; properties 40/42. JAR includes V1–V18, no fixture/manual tooling/staging example/private config. Runtime default, public configuration allowlist, unchanged V1–V17, document links/anchors, acceptance-ID and append-only-history checks pass. Remote CI/CodeQL, real APK/provider and live rollout remain unverified.

### [2026-10-17] — [Fix] Keep Bobi in Vietnamese when the owner asks for another language

**Done:** A chat on staging showed Bobi refusing English, while the memory extractor stored "Chủ shop muốn nhận câu trả lời bằng tiếng Anh." as a preference; from the next turn the memory prompt's "shape every answer by the owner's preferences" switched Bobi to English. The extractor now never stores a wish to change the assistant's language, name or scope, the memory prompt says no fact changes them, and the shop prompt lists language among what the owner cannot change.

**Changed files:** `backend/ai/src/prompt_templates/memory.py`, `backend/ai/src/prompt_templates/shop_agent.py`; this entry.

**Flow explained:** Prompt text only; recall, storage and the number of memories shown next to "Trợ lý Bobi" (memories used by that answer) are unchanged. Memory #11 already stored for shop 8 on staging still exists; the new memory prompt keeps answers in Vietnamese even with it recalled.

**Check:** `ruff check`, `ruff format --check` and 342 AI unit tests pass. Against the configured real model (claude-haiku-5-5), the old prompts stored the English preference 3/3 times and answered in English 3/3 times with it recalled; the new prompts stored nothing 3/3 and answered in Vietnamese 3/3. Ordinary preferences and facts ("báo cáo ngắn gọn", "gọi tôi là anh Phú", opening hours) are still extracted 2/2.

### [2026-10-16] — [Feature] Prepare CORE-016 Android Zalo login and secure linking

**Done:** Prepared #276 on `feat/zalo-android`: external-browser LOGIN/LINK, verifier-bound one-time App Link handoff, environment-specific Android association, safe browser fallback and mandatory PostgreSQL regression coverage. Synchronized the approved canonical documents with BR-009/BR-022 → FR-010/NFR-003 → AC-087–092. Native remains OFF; no new Flyway migration, FE/AI changes, shared-DB operation, deployment or physical-APK acceptance is included.

**Changed files:** Core native controller/service/repository/DTO/configuration/page, shared callback dispatch and WEB guard, rate-limit coverage, OpenAPI/unit/PostgreSQL tests, test-only prospective schema fixture, report gate, Core README/config examples/integration guide and landing-script regression; `docs/contracts/api-contracts.md`, BRD/PRD, technical design, ERD description/DBML comments and `docs/README.md`; this new entry. Existing progress history, unrelated `ZaloCallbackResult.java` formatting and `.idea/` are preserved. Pulled `origin/staging` at `290312c4874291ca8596fef86ed0e13f9b31d4ed`: already up to date, no merge conflict.

**Flow explained:** APK retains its client verifier and opens Zalo through Core in an external browser. Persisted session channel selects WEB popup or fixed HTTPS Android return; only short-lived reference/request metadata cross the App Link, never provider code/token, client verifier or WEB proof. LOGIN reuses the canonical Firebase UID; LINK requires recent revocation-checked Firebase authentication and ACTIVE OWNER, never reassigns identities or merges by name/email. V17 WEB remains compatible; native without future schema fails closed. Schema approval is not migration approval: the SQL fixture runs only in disposable test schemas and is excluded from the production JAR. Migration review, FE integration and AC-092 real-device/provider/operations acceptance are required before enabling.

**Check:** Fresh Java 21 Maven `verify` with JaCoCo 0.8.14 on PostgreSQL 16 loopback/tmpfs passed **1,349 tests / 98 suites, 0 failures / 0 errors / 0 skipped**. All 14 required PostgreSQL suites pass, including 14 native-flow cases; 13 report-gate self-tests, 3 actual Java-rendered native landing-script tests, 8 existing manual-helper tests and 3 real Chrome popup scenarios pass with synthetic data. Native repository/controller/service/page and DTO/result have full measured Java line coverage; properties 39/42 lines. JAR contains only existing V1–V17 migrations and no test fixture/manual tooling/private config. Relative file links/new anchors, unchanged existing AC rows, unique acceptance IDs, staged scope/credential-pattern and whitespace checks pass. Remote CI/CodeQL/review and physical APK/Zalo/Firebase acceptance are not claimed by local checks.

### [2026-10-16] — [Fix] Share Zalo rate quota across equivalent servlet paths

**Done:** Addressed PR #275's new CodeRabbit finding at `ZaloRequestLimiter.java:54`: route matching and quota keys now use one shared endpoint-path helper, retaining the servlet-path fallback that removes the context path. Equivalent raw URI forms no longer select separate quotas for the same endpoint/socket IP.

**Changed files:** `backend/core/src/main/java/com/smartledger/core/zalo/ZaloRequestLimiter.java`, `backend/core/src/test/java/com/smartledger/core/zalo/ZaloRequestLimiterTest.java`, new `backend/core/src/test/java/com/smartledger/core/zalo/ZaloRequestLimiterHttpTest.java`; this new entry. Existing progress history, unrelated local formatting and IDE files are preserved.

**Flow explained:** Tomcat's mapped servlet path is used consistently before Spring Security. Semicolon variants share quota and are still rejected by the unchanged firewall; encoded/plain paths and differing query strings cannot obtain fresh quota. The fixed salted bucket policy, body limit, account/identity behavior, API contract and schema remain unchanged. No FE/AI, security configuration or deployment change.

**Check:** After supplying the isolated HTTP test's mock health contributor, test-first RED produced 9 assertion failures, 0 errors/skips across 18 focused cases. GREEN passes all 13 limiter unit cases and 5 real loopback HTTP cases through Tomcat 10.1.55 and the production Spring Security configuration, including a non-root context path and GET/POST semicolon variants. Java 21 Maven `verify` with JaCoCo on fresh PostgreSQL 16.15 loopback/tmpfs reports **1,295 tests / 93 suites, 0 failures / 0 errors / 0 skipped**. All 13 required PostgreSQL suites and 13 report-gate self-tests pass. Limiter coverage including inner classes: 49/53 lines (92.45%), 19/22 branches (86.36%). Whitespace and scope checks pass. No business/shared DB or real Zalo/Firebase calls; remote CI/review gates remain separate from this local verification.

### [2026-10-16] — [Chore] Reconcile Zalo branch with staging documentation

**Done:** Integrated staging `ea2c1a0` into `feat/zalo-login`, retaining both sides of the progress history and combining the in-app password requirement with the Zalo login/link requirement. Staging's AC-079/AC-080 remain unchanged; the colliding, not-yet-integrated Zalo LOGIN/LINK criteria are now AC-085/AC-086. Zalo AC-081–084 keep their IDs. Historical entries below retain their original IDs; current references use AC-081–086.

**Changed files:** Conflict resolution in `PROGRESS.md` and `docs/product/product-requirements.md`; traceability references in `docs/product/business-requirements.md`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, `backend/core/docs/zalo-auth-implementation-plan.md` and `backend/core/docs/zalo-auth.tdd.md`. Other incoming changes are taken unchanged from staging; unrelated local files are excluded.

**Flow explained:** No new product behavior, Core implementation or migration is introduced by the resolution. Both mobile requirements and the Zalo backend boundaries remain; this sync does not accept native Zalo, FE integration or production readiness.

**Check:** Conflict-marker, whitespace, acceptance-ID uniqueness, traceability and parent-history preservation checks performed before commit. All 252 feature-parent and 257 staging-parent progress blocks are preserved verbatim; all 86 acceptance IDs are unique and both parents' criteria are retained with only the two recorded ID remaps. Eight Node helper tests pass with synthetic loopback traffic after rerunning outside the sandbox's local-network restriction. Core code is unchanged from the previously tested feature commit; full Core regression is not rerun for this documentation resolution. CI/CodeQL and unresolved PR conversations remain separate merge gates.

### [2026-10-16] — [Fix] Harden Zalo review findings without changing account or native flows

**Done:** Addressed the four PR #275 review topics locally: pinned the manual proxy's HTTP destination to validated loopback configuration, replaced the permissive hostname regex with structured URL assertions, removed the limiter's map-capacity admission failure, and corrected validation-error documentation without changing the shared exception handler.

**Changed files:** `backend/core/scripts/zalo-manual-server.mjs`, `backend/core/scripts/test_zalo_manual.mjs`, `backend/core/src/main/java/com/smartledger/core/zalo/ZaloRequestLimiter.java`, its unit test, `ZaloAuthControllerTest.java`, `backend/core/README.md`, `docs/contracts/api-contracts.md`; this new entry. Existing progress history and unrelated workspace changes are preserved.

**Flow explained:** The manual helper selects an allowlisted literal route and passes only its query to a request with fixed loopback hostname/port; ambiguous targets are rejected and upstream redirects are not followed. The per-instance limiter now uses 4096 salted fixed buckets, each allowing 30 requests per 60-second window: new keys do not hit a global map-full rejection, key churn cannot evict/reset quota, and collisions conservatively share quota (possibly producing earlier 429). Distributed/edge throttling remains a rollout requirement. Bean Validation still returns `validation_failed`; unreadable JSON/rejected extra fields still return `invalid_request`. No identity, Firebase, migration or Android/native behavior is changed.

**Check:** Test-first RED reproduced three Java limiter failures and two Node URL/proxy failures. Final Java 21 Maven `verify` with JaCoCo and PostgreSQL 16 in a new loopback/tmpfs container passed **1,285 tests / 92 suites, 0 failures / 0 errors / 0 skipped**, including 108 Zalo-named cases. The 13-suite PostgreSQL report gate and its 13 self-tests passed; 8 Node tests, the Windows PowerShell manual-launcher check and 3 actual Chrome popup scenarios passed with synthetic data. Limiter coverage including inner classes: 48/52 lines (92.31%), 18/22 branches (81.82%). The JAR excludes manual tooling/private configuration; whitespace and document-link checks passed. CodeQL has not been rerun on this local patch, so this entry does not claim its alerts or PR merge restrictions are cleared. No business/shared DB operation, new migration, commit/push, remote-thread resolution or deployment was performed.

### [2026-10-16] — [Feature] Prepare CORE-015 Zalo login/link and V17 for staging review

**Done:** Prepared issue #238 on `feat/zalo-login`: Core web-popup LOGIN, explicit authenticated LINK, stable app-scoped Zalo-to-Firebase mapping, one-time browser-bound handoff and default-off configuration. Added the approved additive V17 migration and aligned BR-022 → FR-010/NFR-003 → AC-079–084, the API contract, technical design, ERD and Core setup/recovery guidance. This is local preparation, not staging or FE acceptance.

**Changed files:** Core Zalo controller/service/repository/provider/security/configuration, V17 and regression/CI-gate tests; Core-only manual-test tooling and guides; `docs/product/business-requirements.md`, `docs/product/product-requirements.md`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, `docs/architecture/erd-description.md`, `docs/architecture/diagrams/src/erd.dbml`, `docs/README.md`, `backend/core/README.md`; this new entry. Fast-forwarded the branch to staging `120779d` and resolved the overlapping Core security hunk by retaining both the exact verifier GET and the intended public pre-auth routes. Incoming staging FE/AI changes were not manually edited; existing progress history and `.idea/` remain untouched.

**Flow explained:** Zalo consent returns to Core; a short-lived proof is delivered only to the initiating popup origin and consumed with the matching client verifier. LOGIN yields a Firebase custom token, exchanged for an ID token before the existing Core session flow. LINK requires recent, revocation-checked Firebase authentication and never reassigns an existing provider identity or auto-merges by name/email. V17 creates server-only identity/session stores with RLS and no public policies; durable mappings are retained when rolling back application code. Feature-off does not disable Flyway: review Railway migration settings, backup/window and Core SQL-role access before merging/deploying. Canonical rollout and recovery: [ERD](docs/architecture/erd-description.md#zalo-core-015-v17), [Core README](backend/core/README.md#zalo-authentication-core-015-local-backend-implementation).

**Check:** Verified Java 21 Maven `verify` with JaCoCo and all opt-in PostgreSQL suites against UUID-named schemas in the disposable loopback PostgreSQL 16.15 container: **1,281 tests, 0 failures / 0 errors / 0 skipped**, including 104 Zalo-named cases. Six V17 tests cover fresh/upgrade/no-op/rollback, lifecycle and unique constraints, and non-owner reads/writes under RLS; two real-HTTP OpenAPI tests check the generated contract against the DTO/response. The PostgreSQL report gate and its 13 self-tests pass. Five Node manual-helper tests, the Windows PowerShell launcher regression and three actual Chrome popup scenarios pass with synthetic data. Packaged JAR contains V17/controller/verifier but no manual launcher, retired SQL fixture or private configuration. Relative document file links and `git diff --check` pass. The user reported real-provider local LOGIN success; real-provider LINK, FE/native integration, Railway signing/proxy/log behavior and shared-environment migration remain pending. No shared/business/staging/production DB change, commit, push, PR or deployment was performed.
### [2026-10-16 18:26 UTC+07:00] — [Fix] Guide pictures for Bán hàng and Quản lý match the app

**Done:** In the guide pictures from #274, the Bán hàng phone highlighted "Quản lý" in the tab bar and its bar ran past the screen, and the Quản lý phone lacked the "Xem lại hướng dẫn" row (#257) while its notes had a garbled character in "số lượng" and wrote "Quản lí". The Quản lý phone screen is now a capture of the real tab from the mock web build (same sample shop and numbers), with the floating Bobi and the version line hidden; the arrows that ended inside the old screen are redrawn to the same rows, and the Hàng hoá, Chi phí and Công nợ notes are rewritten in Plus Jakarta Sans. The Bán hàng phone keeps its screen but gets the real tab bar with "Bán hàng" highlighted. Same 1672 × 941 size; the bobi and overview pictures are unchanged. The manage picture's accessibility label lists the new row.

**Changed files:** `frontend/mobile/assets/guide/guide-manage.png`, `frontend/mobile/assets/guide/guide-sales.png`, `frontend/mobile/src/components/AssistantIntroModal.tsx` — modified; this entry.

**Check:** Both pictures inspected at full size and zoomed at the edited areas (tab bar, arrow heads, rewritten notes). **Not verified:** how they look inside the guide on a phone.

### [2026-10-16 18:06 UTC+07:00] — [Feature] Change the password inside the app

**Done:** Testers had to sign out and go through "Quên mật khẩu" to change a password. The Quản lý tab now has "Đổi mật khẩu" for accounts that signed up with email (Facebook and Google accounts have no password here, so the row is hidden). The new screen asks for the current password and the new one twice (at least 6 characters, different from the current one); the app re-authenticates with the current password and then updates it in Firebase, so the user stays signed in. A wrong current password shows under that field. "Quên mật khẩu hiện tại? Gửi thư đặt lại" sends the reset email to the signed-in address without signing out. `AuthClient` gains `hasPassword()` and `changePassword()` for native Firebase, web Firebase and the mock. Core is unchanged (it never stores passwords). `FR-010` mentions the in-app change; new criterion `AC-080`.

**Changed files:** `frontend/mobile/app/change-password.tsx` — added; `frontend/mobile/app/(tabs)/more.tsx`, `frontend/mobile/src/lib/auth/types.ts`, `frontend/mobile/src/lib/auth/firebase.ts`, `frontend/mobile/src/lib/auth/firebase.web.ts`, `frontend/mobile/src/lib/auth/mock.ts`, `docs/product/product-requirements.md` (`FR-010`, `AC-080`) — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; mock web build in headless Chrome (6/6): a new email account (ZZ-TEST) sees "Đổi mật khẩu" in Quản lý; a wrong current password shows "Mật khẩu hiện tại chưa đúng"; a mismatched repeat is flagged; the correct one shows "Đã đổi mật khẩu" and returns to Quản lý still signed in; after signing out the old password is refused and the new one signs in. **Not verified:** real Firebase on a phone (re-authentication and `updatePassword` against the staging project).

### [2026-10-16 17:58 UTC+07:00] — [Fix] An account without a shop no longer lands in the sample shop

**Done:** A tester creating an account pressed Android back on "Tiệm của bạn tên gì?" and landed in the tabs showing "Tiệm tạp hoá cô Thỏ". The app state starts with the sample shop until Core returns a session with a shop, and nothing stopped the tabs from opening before that, so going back from shop setup (or signing out from a screen stacked on the tabs) exposed the sample data as if it were a real account. The tabs layout now opens only for a signed-in account with a shop: before the session is restored it shows a blank screen, signed out it redirects to the sign-in screen, and without a shop to shop setup. On shop setup, Android back and a new "Dùng tài khoản khác" link ask "Dừng tạo tiệm?"; confirming signs out and returns to sign-in. New criterion `AC-079`.

**Changed files:** `frontend/mobile/app/(tabs)/_layout.tsx`, `frontend/mobile/app/(auth)/setup.tsx`, `docs/product/product-requirements.md` (`AC-079`) — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; mock web build in headless Chrome (5/5): signed out, opening `/invoices` lands on sign-in with no sample shop; "Vào app" opens Tổng quan; signing out from Quản lý returns to sign-in; on `/setup`, "Dùng tài khoản khác" asks "Dừng tạo tiệm?" and confirming returns to sign-in. **Not verified:** Android back on a real phone during a real sign-up.

### [2026-10-16 17:55 UTC+07:00] — [Mobile/AI] Tool step keeps its shimmer, screen button in brand purple, numbered lists

**Done:** A tool step in `ThoughtLine` keeps its shimmer after the tool ends, because the model is still writing the reply; the running dot is gone and the tick sits after the label, so the label starts where the waiting phrase does. `suggest_screen` gets its own step label instead of the generic one. The screen-button card under a reply drops the "Mở nhanh" label and shows brand-purple buttons with a purple shadow. The shop agent prompt asks for numbered lists only, and the mock replies follow it.

**Changed files:** `frontend/mobile/src/components/ThoughtLine.tsx`, `frontend/mobile/src/components/ChatText.tsx`, `frontend/mobile/src/lib/toolSteps.ts`, `frontend/mobile/tests/toolSteps.test.ts`, `frontend/mobile/src/lib/mockCore.ts`, `backend/ai/src/prompt_templates/shop_agent.py`, `docs/contracts/api-contracts.md` — modified; this entry.

**Flow explained:** tool `start` → the step replaces the waiting phrase, types in with shimmer → tool `end` → tick after the label, shimmer continues → first `delta` → the line is replaced by the reply.

**Check:** `tsc --noEmit` clean, `toolSteps` tests 6 passed, AI unit tests 342 passed; checked in the Expo web build with mock data. **Not verified:** on a device, and the numbered-list rule against the real model.

### [2026-10-16] — [Mobile] Thought line shows only the latest tool step, with shimmer

**Done:** `ThoughtLine` now shows one step at a time: each new tool call replaces the waiting phrase or the step before it instead of lining up beside it. A running step's label types in and then gets the same shimmer sweep as the waiting phrase; a finished step stays still in the faint color with a tick.

**Changed files:** `frontend/mobile/src/components/ThoughtLine.tsx` — modified; this entry.

**Flow explained:** tool `start` → the step slides in and its label types in with shimmer → tool `end` → tick, shimmer stops → next tool `start` → the new step replaces it.

**Check:** `tsc --noEmit` clean, `npm test` 107 passed. **Not verified:** on a device or in the Expo web build.

### [2026-10-16 15:25 UTC+07:00] — [CI] CI runs only the jobs whose area changed

**Done:** New job `changes` in `ci.yml` (`dorny/paths-filter@v4.0.3`) marks which of `ai`, `core`, `mobile`, `landing`, `containers` a pull request or push touched. Each test job, `deploy-web` and `deploy-landing` run only for their area; `deploy` runs when `ai` or `core` changed and deploys only the changed service. Skipped jobs count as passed, so required checks and the `mobile-release.yml` gate still work. A change to `ci.yml` runs everything. It replaces the landing-only `Detect landing changes` step, and keeps its rule that a re-run always deploys, now for every deploy job.

**Changed files:** `.github/workflows/ci.yml`, `docs/development/ci-cd.md`, `CONTRIBUTING.md` — modified; this entry.

**Flow explained:** `changes` → test jobs gated by area → `summary` (skipped rows) → deploy jobs gated by area and by no failed test job.

**Check:** `actionlint` passes. **Not verified:** a real run on GitHub; the PR of this change touches `ci.yml`, so it runs every job, and the skip path shows only on a later docs-only or single-area PR.

### [2026-10-16 14:15 UTC+07:00] — [Feature] App guide updated with refreshed illustrations, 16:9 ratio, and aligned copy

**Done:** The app guide in `AssistantIntroModal.tsx` now follows the updated visual mockups across all 4 steps in sequential order: Trợ lý Bobi, Tổng quan, Bán hàng, and Quản lý. The 4 legacy JPEG illustrations were replaced with clean PNG assets (`guide-bobi.png`, `guide-overview.png`, `guide-sales.png`, `guide-manage.png`) rendered at their native 1672×941 ratio (16:9) to prevent clipping callout bubbles. The step descriptions and bullet tips were rewritten and aligned with the callouts in each illustration.

**Changed files:** `frontend/mobile/src/components/AssistantIntroModal.tsx` — modified; `frontend/mobile/assets/guide/guide-bobi.png`, `guide-overview.png`, `guide-sales.png`, `guide-manage.png` — created; `frontend/mobile/assets/guide/bobi-menu.jpg`, `guide-overview.jpg`, `guide-sales.jpg`, `guide-manage.jpg` — deleted; this entry.

**Check:** `tsc --noEmit` clean (0 errors), `npm test` clean, `npm run export:web` built `dist` without errors.

### [2026-10-16] — [Chore] Core-only Zalo domain verification

**Done:** Added the supplied Zalo verification HTML as a Core static resource and allowed anonymous GET of that exact filename only. This branch does not contain the unfinished Zalo login/link implementation, new configuration, or a database migration.

**Changed files:** `backend/core/src/main/resources/static/zalo_verifierMysnBA7R831YqgKCwDCT0HgaYGlsqb9MCpOu.html`, `backend/core/src/main/java/com/smartledger/core/config/SecurityConfiguration.java`, `backend/core/src/test/java/com/smartledger/core/config/ZaloDomainVerificationHttpTest.java`; this entry. Existing progress entries retained unchanged.

**Flow explained:** After merging into staging and deploying Core, open `https://<Core-domain>/zalo_verifierMysnBA7R831YqgKCwDCT0HgaYGlsqb9MCpOu.html` without a Bearer token, then use Zalo Developers' domain-verification action. The file is not the OAuth callback. Other files, business APIs and unreleased Zalo routes remain authenticated; no wildcard exception was added.

**Check:** Verified test-first RED: 14 HTTP cases executed, with the expected GET failing as 401 instead of 200. After the fix, `mvnw.cmd '-Dtest=ZaloDomainVerificationHttpTest,ApiDocumentationHttpTest,ApiDocumentationWebTest,CorsWebTest,BearerTokenAuthenticationFilterTest' test` passes 43 tests, 0 failures/errors/skipped. The 14 new cases use a real loopback HTTP server and cover exact HTML delivery, six non-GET methods and seven unrelated paths. JaCoCo reports SecurityConfiguration line coverage 36/39 (92.31%); this is not whole-Core coverage. Supplied HTML matches after line-ending normalization. No business DB or real Firebase/Zalo calls. Railway delivery and Zalo's actual verification remain unverified until the team merges/deploys this branch.

### [2026-10-16 12:57 UTC+07:00] — [Mobile] A running tool step replaces the waiting phrase in the thought line

**Done:** When the assistant calls a tool, the step label now takes the place of the shimmering waiting phrase instead of standing beside it, so the first slot of the thought line shows the one thing happening now. The waiting phrase still rotates until the first tool call, and a finished step stays on the line with a check.

**Changed files:** `frontend/mobile/src/components/ThoughtLine.tsx` and this entry.

**Check:** `npm run typecheck` clean; `npm test` 107 passed; the Metro iOS bundle builds (HTTP 200) and carries the new comment. Not run on a real device: only the iOS simulator.

### [2026-10-16 14:00 UTC+07:00] — [Feature] Agent chat shows tool steps in a "Thought Line" and streams text smoothly

**Done:** AI emits `tool_start {call_id,name}` / `tool_end {call_id}` SSE events for each tool call (name only, never arguments or results); Core relays unknown event names verbatim, so Java is untouched. The mobile chat replaces `ThinkingStatus` with `ThoughtLine` (React Bits Thought Line port): the lattice-dots indicator in place of the star, a live clock, the steps the assistant ran (Vietnamese labels live in the app) inline after the waiting phrase and wrapping to the next line when they run out of room; the thought line has no bubble of its own, so it reads as a status line rather than a second answer, and it stays until the answer bubble takes its place. The answer then streams in a separate bubble with the Bobi label. The waiting label is semibold with a shimmer band sweeping its letters; phrase changes and each step slide up and fade in, and a step label streams in one character at a time. Streamed answer text now reveals a few characters per frame (`useSmoothText`) instead of jumping a token burst at a time. The reveal is timed in ms (half-life 80 ms), not per frame, so a slow device does not fall behind and dump the tail when the turn ends. The streaming bubble now carries the same Bobi label as a saved answer, and the label text and memory icon are larger. Reduce-motion keeps the label static.

**Changed files:**
- `backend/ai/src/agent/tool_events.py` — created (only module reading pydantic-ai tool events)
- `backend/ai/src/agent/service.py`, `router.py` — modified
- `backend/ai/tests/unit_tests/test_agent_service.py`, `tests/integration_tests/test_agent_chat.py` — modified
- `docs/contracts/api-contracts.md` — modified (`tool_start`, `tool_end`)
- `frontend/mobile/src/components/ThoughtLine.tsx` — renamed from `ThinkingStatus.tsx`, rewritten
- `frontend/mobile/src/components/ChatText.tsx` — modified (`StreamingChatText`)
- `frontend/mobile/app/ai.tsx`, `src/data/types.ts`, `src/lib/agentApi.ts` — modified
- `frontend/mobile/src/lib/toolSteps.ts`, `src/lib/smoothText.ts`, `tests/toolSteps.test.ts`, `tests/smoothText.test.ts` — created

**Flow explained:** `agent.iter()` → each `CallToolsNode` is streamed → `tool_progress` maps call/result events → `ToolStarted`/`ToolFinished` → SSE `tool_start`/`tool_end` → Core → `chatStream` `onTool` → `applyToolEvent` builds the steps → `ThoughtLine`. Draft text goes through `useSmoothText` before the markdown parser.

**Check:** backend 383 passed, ruff clean; mobile 99 node tests pass, `tsc --noEmit` clean; Expo web mock in a browser shows the shimmer sweeping, slide-in, lattice dots and the fold to "Đã suy nghĩ". **Not verified:** a real model end to end (mock emits no tool events and returns the whole answer at once, so the per-frame reveal is covered by unit tests only); on-device motion and the native driver; the contract still has no end-to-end acceptance.

### [2026-10-16 11:39 UTC+07:00] — [Fix] Mobile release scripts: Node drift, one-shot fix menu, simulator and emulator by default

**Done:** `scripts/ios-device-release.sh` and `scripts/android-release.sh` share one Node check in `scripts/lib/preflight.sh`. When the Node first on PATH is another major than `NODE_MAJOR` (or does not run, e.g. Homebrew's node after an `icu4c` upgrade) and the pinned major is installed through Homebrew `node@<major>`, nvm, fnm, Volta, asdf, mise or n, the scripts put it first on PATH for that run, also with `--skip-preflight`. The suggested fix is now `nvm install`, `fnm install` or `brew install node@<major>`, without the `brew link --overwrite --force` that failed next to Homebrew's unversioned node. `node_modules` is reinstalled when the last install ran under another Node major, and the iOS script rewrites `ios/.xcode.env.local` so Xcode's bundling phase uses the same Node. The fix menu no longer asks "Pick a number" again after a fix ran: a successful command re-runs the checks with the same arguments, an opened page or app stops the script. iOS now defaults to the iOS Simulator (a booted iPhone simulator, else the newest runtime's first iPhone), preselected in the menu next to paired iPhones; `--simulator` skips the menu and `--device` also takes a simulator's name or UDID; signing checks run only for an iPhone, and a missing runtime offers `xcodebuild -downloadPlatform iOS`. Android defaults locally to an emulator: a running one, else it boots an AVD while Gradle runs and offers to create one with `sdkmanager` and `avdmanager`; it builds only the emulator's ABI, installs and opens the app. `--build-only` keeps the previous default, which stays the default in GitHub Actions and with `--aab` or `--out`. Both builds use staging Core unless `EXPO_PUBLIC_API_ENDPOINT` says otherwise.

**Changed files:** `scripts/lib/preflight.sh`, `scripts/ios-device-release.sh`, `scripts/android-release.sh`, `frontend/mobile/README.md`, `docs/development/ci-cd.md`, `docs/development/mobile-ios-device-release.md` — modified; this entry.

**Check:** `bash -n` and `shellcheck` on the three scripts (only the earlier `pairing` unused warning remains); stubbed runs on Linux of the Node switch (nvm 22.9 and 22.11 beside Node 24 on PATH: picks 22.11), a broken node, the fix menu in a pseudo-terminal, iOS target selection (default, `--simulator`, simulator by name, untrusted and unknown device, no runtime, menu Enter and down-arrow) and the Android emulator preflight (no AVD, AVD to start, running emulator, `--abis` mismatch, CI and `--build-only` defaults). **Not verified:** a real build on a Mac in the iOS Simulator or on an Android emulator (no macOS or emulator here); whether every native library (for example `react-native-sherpa-onnx`) ships a simulator slice.

### [2026-10-16 10:25 UTC+07:00] — [Docs] AI docs and diagrams re-checked against the AI service (supersedes #212)

**Done:** Moved the 13 findings of #212 onto a fresh branch from `staging` (#212 was far behind) and re-checked them in four audit rounds against `backend/ai/src`, Core's Agent proxy, `supabase/migrations` and `ci.yml`. Docs now cover: the Core stream relay and memory settings proxy (eight Agent routes), guardrail `422` codes kept by Core, the reader pool and eight `ai_read` views, long-term memory behind `AGENT_MEMORY_ENABLED` (off by default, awaiting PO approval) with its tables in the ERD, the current-time line after the new message, `suggest_screen` and the ```` ```actions ```` block (stripped from replayed history, appended after the answer screen), and CI/CD details (landing deploy and approval, PR previews off, pool sizes, memory variables on Railway). Diagrams were re-exported from source: `ci-cd`, `auth-request-flow` (sign-in by email, Facebook or Google), `agent-memory`, and the two `06-ai` walkthrough diagrams.

**Changed files:** `README.md`, `backend/ai/README.md`, `backend/ai/.env.example` (comments and blank keys only), `docs/README.md`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, `docs/architecture/erd-description.md`, `docs/architecture/diagrams/src/erd.dbml`, `docs/architecture/adr/0002-agent-long-term-memory.md`, `docs/architecture/service-walkthrough/README.md` and `06-ai/*.svg`, `docs/development/ci-cd.md`, `docs/architecture/diagrams/src/{ci-cd,auth-request-flow,agent-memory}.drawio` and their SVGs — modified; this entry.

**Flow explained:** each round, one slice per doc group was checked sentence by sentence against the code; every claimed drift was verified against the cited code before it was applied. A claim the code cannot show (Railway, Vercel or Firebase settings) was left open, not written as fact.

**Check:** `dbml2sql` parses `erd.dbml`; every `.drawio` and SVG parses as XML; Mermaid re-rendered; local link and anchor check reports 0 bad links. **Not verified:** whether staging or production set `AGENT_MEMORY_ENABLED` or Cloudflare variables; `vercel-production` secrets, Firebase authorized domains and `CORS_ALLOWED_ORIGINS` on `railway-production`.

### [2026-10-16 10:23 UTC+07:00] — [Fix] Overview compact bar buttons on one line

**Done:** After scrolling Tổng quan, the four quick buttons of the compact bar (Đọc đơn, Quét mã, Chọn hàng, Trợ lý) showed the icon above the label (#254), which took two lines of height. Each button now has the icon tile and the label on one line, 34 px high instead of 50 px; buttons are as wide as their label instead of equal, so "Chọn hàng" fits beside the short "Trợ lý". `HEADER_COLLAPSED` goes from 115 to 99, so the collapsed bar is 16 px lower. On screens narrower than 360 px the label shrinks to fit instead of wrapping (native only).

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx` — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors; mock web build in headless Chrome at 360 and 393 px after scrolling: the four buttons share one row, each 34 px high with icon and label on one line, no label cut and no button past the bar (10/10). **Not verified:** a real phone.

### [2026-10-16 15:30 UTC+07:00] — [Feature] Shorter Bobi intro and scope, history fits a 100k-token window

**Done:** The shop prompt no longer says who Bobi is twice or lists the shop topics twice: voice, identity and the off-topic reply now take one paragraph each (3.5k → 3.0k characters); rules and the current-time line are unchanged. `AGENT_HISTORY_TURNS` defaults to 30 (was 100), so one request stays inside a 100k-token context window.

**Changed files:** `backend/ai/src/prompt_templates/shop_agent.py`, `backend/ai/src/app_config.py`, `backend/ai/.env.example`, `backend/ai/README.md`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, `docs/architecture/adr/0002-agent-long-term-memory.md` — modified; this entry.

**Flow explained:** 100 exchanges at the 2000-character input cap plus answers can pass 100k tokens of Vietnamese; 30 leaves room for the system prompt and tool results.

**Check:** AI unit tests 331 passed, ruff clean. **Not verified:** live replies to greetings and off-topic questions; whether a deployed env overrides `AGENT_HISTORY_TURNS`.

### [2026-10-16 14:30 UTC+07:00] — [Feature] Bobi guides the owner around the app and links replies to screens

**Done:** The agent prompt now describes the app's tabs, screens and buttons, so Bobi can say how to sell, record a debt payment, add an expense or open a report. A new `suggest_screen` tool lets Bobi add up to two buttons under a reply (e.g. "Mở Công nợ" after an answer about open debts); the mobile chat renders them and opens the screen with `router.navigate`.

**Changed files:** `backend/ai/src/prompt_templates/app_guide.py` — created; `backend/ai/src/prompt_templates/__init__.py`, `backend/ai/src/agent/tools.py`, `backend/ai/src/agent/service.py` — modified; `backend/ai/tests/unit_tests/test_screen_buttons.py` — created; `test_agent_service.py`, `test_shop_data_tool.py`, `test_restock_tool.py` — modified; `frontend/mobile/src/lib/chatMarkdown.ts`, `frontend/mobile/src/components/ChatText.tsx`, `frontend/mobile/tests/chatMarkdown.test.ts` — modified; `docs/contracts/api-contracts.md`, `backend/ai/README.md`, `frontend/mobile/README.md` — modified; this entry.

**Flow explained:** model calls `suggest_screen(screen)` (closed `Literal`, so an unlisted screen is retried) → the tool returns the screen as `ToolReturn` metadata → after the run `AgentService` reads it from the new messages, dedupes, caps at 2 and appends a ```` ```actions ```` block to `answer` → the block is stored and reaches the app as the last `delta` and in `done`, so Core is unchanged → history replay strips it → mobile maps names through `SCREEN_LINKS` and draws the buttons once the block is closed. A Pydantic AI `CustomEvent` was considered and not used: the answer must carry the buttons anyway to show them again from history, so a separate SSE event would duplicate it.

**Check:** AI unit tests 337 passed, ruff clean; mobile `npm test` 83 passed, `tsc --noEmit` reports only two modules missing from the local `node_modules` in an untouched file. **Not verified:** live model behaviour (when Bobi chooses to add a button) and tapping the buttons on a device.

### [2026-10-16 10:10 UTC+07:00] — [Feature] Agent prompt cache: time after the message, Anthropic cache breakpoints, cache usage in logs

**Done:** The current-time line moved out of the system instructions to the end of the owner's new message, behind a `CachePoint`, so the instructions and the whole stored history stay a byte-identical prefix from turn to turn. The Anthropic model now sets explicit cache breakpoints on tools, instructions and the last message (not the top-level automatic mode, which the gateway may not forward). Each turn logs cache read and write tokens and the hit ratio next to the usage.

**Changed files:** `backend/ai/src/agent/service.py`, `backend/ai/src/providers/factory.py`, `backend/ai/src/prompt_templates/shop_agent.py`, `backend/ai/tests/support.py`, `backend/ai/tests/unit_tests/test_agent_service.py`, `test_shop_data_tool.py`, `test_restock_tool.py`, `test_agent_guardrails.py`, `test_agent_memory.py`, `test_provider_factory.py` — modified; this entry.

**Flow explained:** request = `[instructions][stored history][new message | CachePoint | current time]`. The time is never stored, so it must come after the breakpoint: the next turn repeats the previous request up to that breakpoint and the provider finds it in its cache. Putting the time before the message was measured and rejected: cache reads stayed flat at the instructions while the history was re-written every turn.

**Check:** 320 unit tests pass, integration 40 passed / 52 skipped (no DB env), ruff clean. Live against the gateway (`claude-haiku-5-5`), real `AgentService`, three turns: cache read 0 → 992 → 1124 tokens, hit 0% → 85% → 87%, and the model answered "thứ Sáu, 16/10/2026" from the moved time line. **Not verified:** turns with tool calls and recalled memories: memory-wrapped prompts are not stored as sent, so the turn after a recall misses the history cache from that message on.

### [2026-10-16 08:30 UTC+07:00] — [Feature] Chat prompts speak as Bobi of Sổ Nghe Lời, query prompt matches the SQL guard

**Done:** The shop chat prompt now introduces the assistant as Bobi of Sổ Nghe Lời (was "SmartLedger's assistant"): Bobi refers to itself as "Bobi", addresses the owner as "anh/chị", leads with the answer, uses today when no period is named, and lists the matches when a product name is ambiguous. The query prompt now lists exactly the functions and casts `SqlGuard` accepts (it omitted CASE, row_number, substring and others), defines today/yesterday/this week/this month in shop time, shows how to fold Vietnamese names for `name_folded`, and adds examples for today, yesterday and revenue per day this month; sums use `coalesce(..., 0)` so an empty period reads as zero sales.

**Changed files:** `backend/ai/src/prompt_templates/shop_agent.py`, `backend/ai/src/prompt_templates/sql_agent.py` — modified; this entry.

**Flow explained:** `AgentService` still joins the static shop prompt, the query prompt, the restock prompt and the memory prompt in that order, then the current time, so the cacheable prefix layout is unchanged.

**Check:** `uv run pytest tests/unit_tests` 319 passed; ruff clean; all 14 example queries and every function named in rule 7 pass `SqlGuard.validate_and_wrap`. **Not verified:** the new examples against staging data, and live replies from the model.

### [2026-10-16 03:21 UTC+07:00] — [Fix] Guide button on the Quản lý tab; report cost warning no longer counts voided orders twice

**Done:** The button that replays the welcome guide sat at the bottom of Settings, two taps deep. It is now a row "Xem lại hướng dẫn" in the "Tài khoản & ứng dụng" group of the Quản lý tab, between Cài đặt and Đăng xuất; it still goes to Tổng quan and opens the guide there. Settings no longer has the button, and the guide's own tip now points to the Quản lý tab.

Testing #256 on a real phone against staging Core showed the report's missing-cost card saying 42.859.626đ of revenue lacked a cost while the day's revenue was 217.000đ. Core's `/reports/profit-estimate` counts lines without a cost both when sold and when voided (`ReportAggregationRepository.profitEstimate`), so a sale made and voided in the same period counts twice (217.000 + 2 × 21.321.313). The card now gives the item count and revenue only when the period has no voided order; otherwise it says the cost and profit above are incomplete. Core is unchanged.

The report criterion added by #256 reused the number `AC-076`, which the Agent ledger criterion already had; it is now `AC-078`.

**Changed files:** `frontend/mobile/app/(tabs)/more.tsx`, `frontend/mobile/app/settings.tsx`, `frontend/mobile/src/components/AssistantIntroModal.tsx`, `frontend/mobile/src/store/AppStore.tsx`, `frontend/mobile/app/analytics.tsx`, `docs/product/product-requirements.md` (`FR-025`, `AC-018`, `AC-078`) — modified; this entry.

**Check:** `npx tsc --noEmit` shows no new errors.
### [2026-10-16 03:00 UTC+07:00] — [CI] Deploy the landing only when it changed

**Done:** `deploy-landing` now runs on a push only when the push changes `frontend/web/` or `.github/workflows/ci.yml`; a re-run always deploys. Every push to `staging` and `main` used to spend two Vercel deployments (web and landing) even when only the backend changed, and the production deploy of release #249 hit the Hobby limit of 100 a day (`api-deployments-free-per-day`).

**Changed files:** `.github/workflows/ci.yml`, `docs/development/ci-cd.md` — modified; this entry.

**Flow explained:** push → job `landing` diffs `github.event.before`..`GITHUB_SHA` → `changed=true|false` → `deploy-landing` runs when `true` or on a re-run.

**Check:** YAML parses and actionlint passes; the step script run locally against real commit pairs gives `false` for a backend-only push and `true` for a push touching `frontend/web/`, an all-zero `before` and an unknown commit. **Not verified:** a real push on GitHub (this PR's merge into `staging` touches `ci.yml`, so it will deploy; the first push after it that leaves the landing alone should skip).

### [2026-10-16 02:47 UTC+07:00] — [Fix] Tabs switch without fading; overview compact bar and best sellers tidied

**Done:** On an Android phone, switching to Quản lý sometimes showed only a blank screen with Bobi and the tab bar. The bottom tabs still faded on phones (#224 turned the fade off only on the web) and the fade can get stuck at zero opacity (inferred from the screenshot; not reproducible on the web). Tabs now switch without animation everywhere, and the scene background is the app background so any gap is not pure white. On Tổng quan, the compact bar shown after scrolling looked as if its icons were cut: the dark purple parts of the small icons disappeared into the purple bar, and at 360 px the labels were cut ("Đọc …", "Chọ…"). Each compact button now shows its icon on a light rounded tile above the label (buttons 50 instead of 42 px tall, which still fits the 115 px bar). In "Bán chạy", product names and quantities use the same line height without Android font padding so the quantity no longer sits higher than the name.

**Changed files:** `frontend/mobile/app/(tabs)/_layout.tsx`, `frontend/mobile/app/(tabs)/index.tsx` (`CompactAction`) — modified; this entry.

**Check:** `tsc --noEmit` has no errors in this PR's files (only the 2 known errors in #230's files). Mock web build in headless Chrome at 360×780, 8/8: name and quantity centres in "Bán chạy" match (0 px), the four compact buttons show icon tiles with full labels inside the buttons, and 250 ms after tapping Đơn hàng, Bán hàng, Quản lý, Tổng quan and Quản lý again each screen's title is fully visible. **Not verified:** the blank-tab fix on an Android phone.

### [2026-10-16 02:46 UTC+07:00] — [Fix] Voice orders ask before saving a longer name as a shorter product

**Done:** With "Cà phê" in the catalog, saying "cà phê sữa" recorded "Cà phê" and dropped "sữa". When the spoken name is longer than the matched product and no other product contains it, Đọc đơn now asks: pick the matched product, or "Thêm món mới" with the spoken name, which opens the usual add-to-catalog dialog (price, quantity, unit). The choice card is titled "Chọn món cho …" and its skip button is "Bỏ qua". Words like "nữa", "thôi", "luôn", "giúp", "dùm" are treated as filler so "hai cà phê nữa" still records 2 Cà phê.

**Changed files:** `frontend/mobile/src/lib/parseOrder.ts`, `frontend/mobile/app/voice.tsx`, `frontend/mobile/tests/parseOrder.test.ts`, `docs/product/product-requirements.md` (`AC-074`) — modified; this entry.

**Check:** `tsc --noEmit` has no errors in this PR's files (only the 2 known errors in #230's files); `node --test tests/*.test.ts` 80/80 (5 new). Mock web build in headless Chrome, 3/3: "hai trà đá nữa" records 2 Trà đá, "một trà đá chanh" asks with Trà đá as the option, and "Thêm món mới" opens the dialog to add "Trà đá chanh". **Not verified:** speech on a phone.

### [2026-10-16 02:45 UTC+07:00] — [Feature] Report uses Core's estimated cost and shows the money of voided orders

**Done:** "Giá vốn ước tính" on the Báo cáo screen was computed on the phone from each product's current cost, or 60% of the price when the product had none, which FR-006 rules out. The report now reads Core: revenue is the confirmed orders sold in the period (`/sales/summary`, never negative), and cost and profit come from `/reports/profit-estimate`, which uses the cost snapshotted at sale time. Core's net cost (sold minus voided) can go negative when an earlier order is voided, so the screen shows non-negative parts that add up exactly to Core's gross profit: revenue − cost of goods sold − orders sold earlier and voided now + cost of voided orders = gross profit, then − recorded expenses = profit after expenses. When some items have no cost, it says how many and how much revenue they cover, and links to Hàng hoá. A new "Đơn huỷ trong kỳ" block shows the number and value of orders voided in the period and how much was refunded, and explains that the rest of a voided order's value is only cancelled debt; its "Xem các đơn đã huỷ" button opens Orders with a new "Đã huỷ" filter, where the summary card shows the value of voided orders and day headers count voided orders. `stats.summary` no longer estimates cost at all, and the report stops loading the whole product list for it.

**Changed files:** `frontend/mobile/app/analytics.tsx`, `frontend/mobile/app/(tabs)/invoices.tsx`, `frontend/mobile/src/lib/stats.ts`, `docs/product/product-requirements.md` (new `AC-076`) — modified; `frontend/mobile/src/lib/useReportTotals.ts` — new; this entry.

**Flow explained:** report period → `useReportTotals` → `/reports/summary` + `/reports/profit-estimate` + `/sales/summary` → `periodRevenue` → rows from `grossEstimatedCogsVnd`, `cancelledEarlierVnd`, `voidedEstimatedCogsVnd`, `estimatedGrossProfitVnd`, `expenseVnd`, `estimatedOperatingProfitVnd`; voided block from `voidedOrderCount`, `voidedRevenueVnd`, `refundedVnd`. Orders "Đã huỷ" adds `saleStatus=VOIDED` to the list, the summary and each day's summary.

**Check:** `tsc --noEmit` has no errors in this PR's files (only the 2 known errors in #230's files); `node --test tests/*.test.ts` 76/76. Mock web build in headless Chrome, 12/12: before and after voiding yesterday's 379.000đ order the rows add up (265.000 − 195.500 − 379.000 + 323.000 = 13.500) with no negative row, the old "dùng mức ước tính" note is gone, the voided block shows 1 order, 379.000đ, refunded 0đ, and "Xem các đơn đã huỷ" opens Orders with only that order and a 379.000đ "Giá trị đơn huỷ" card. **Not verified:** staging Core, a phone, the missing-cost warning (the mock has no item without cost in the period).

### [2026-10-16 02:44 UTC+07:00] — [Fix] "Xem lại hướng dẫn" replays the guide on Tổng quan

**Done:** The Settings button "Xem lại hướng dẫn" (#233) opened the guide on top of Settings. It now goes to Tổng quan and shows the guide there, as on the first sign-in; closing it leaves the user on Tổng quan. `AppStore` gains `showGuide()` (sets `guideDismissed` to false), and Settings no longer renders its own copy of the guide.

**Changed files:** `frontend/mobile/app/settings.tsx`, `frontend/mobile/src/store/AppStore.tsx`, `docs/product/product-requirements.md` (`AC-018`) — modified; this entry.

**Check:** `tsc --noEmit` has no errors in this PR's files (only the 2 known errors in #230's files). Mock web build in headless Chrome, 2/2: from Settings the guide opens on the Bobi step over Tổng quan, and after closing, Tổng quan is shown and Settings is not. **Not verified:** a phone.

### [2026-10-16 02:43 UTC+07:00] — [Fix] Sales: pinned Scan and Read buttons work after scrolling

**Done:** After scrolling the Sales list, tapping "Quét mã" or "Đọc đơn" on the pinned bar did nothing. The large header above the list only fades out when collapsed, and it sits on top of the pinned bar, so it kept taking the taps. The collapsible header now tracks when it crosses the collapse point (a listener that sets state only on crossing) and lets only the visible layer take touches: the large header while expanded, the pinned bar once collapsed.

**Changed files:** `frontend/mobile/app/pos.tsx` (`PosCollapsibleHeader`) — modified; this entry.

**Check:** `tsc --noEmit` has no errors in this PR's files (its only 2 errors are in #230's files: `expo-application` and `expo-intent-launcher` are not installed on this machine). Mock web build in headless Chrome at 393×852, 3/3: before scrolling the centre of the large "Quét mã" button hits that button; after scrolling the centre of the pinned "Quét mã" hits the pinned button and tapping it opens the scanner. **Not verified:** a phone.
### [2026-10-16 10:06 UTC+07:00] — [Feature] Memory switch moves into the chat's assistant settings

**Done:** The long-term memory switch now lives in a "Cài đặt trợ lý" sheet opened from the chat header, and the "Đã dùng ghi nhớ" text chip on answers is a small bookmark icon (with a count when several memories were used). The sheet loads on every open and shows an error with a retry button, so one failed call while the AI service wakes from idle no longer hides the switch silently. The "Trợ lý AI" section is removed from Cài đặt. No API or contract change.

**Changed files:** `frontend/mobile/app/ai.tsx`, `frontend/mobile/app/settings.tsx`, `docs/contracts/api-contracts.md`, `docs/architecture/adr/0002-agent-long-term-memory.md` — modified; this entry.

**Flow explained:** chat header → sliders button → sheet → `GET /agent/memory/settings` (`available` false shows "chưa được bật", error shows retry) → toggle → `PUT /agent/memory/settings`, reverted with an inline error on failure.

**Check:** `tsc --noEmit` reports no error in `ai.tsx` or `settings.tsx`; the only errors are missing `expo-application` and `expo-intent-launcher` in `src/lib/appUpdateInstall.native.ts`, a file this change does not touch. Not run on a device or simulator.

### [2026-10-16 10:30 UTC+07:00] — [Fix] Agent memory writes semantic facts by default

**Done:** The default for `AGENT_MEMORY_TYPES` is now `preference,procedural,semantic`, matching what staging and production run. With the old default the extractor dropped stable facts such as suppliers while the agent still told the owner "Đã ghi nhớ". ADR 0002 records the change and its reason; PO approval of the type list is still open.

**Changed files:** `backend/ai/src/app_config.py`, `backend/ai/.env.example`, `backend/ai/README.md`, `docs/architecture/adr/0002-agent-long-term-memory.md` — modified; this entry.

**Flow explained:** extractor facts → filter by `AGENT_MEMORY_TYPES` → `semantic` facts are now stored and recalled in later chats; `episodic` and other types are still dropped.

**Check:** `uv run pytest tests/unit_tests -q` and `ruff check` / `ruff format --check` in `backend/ai`. Staging E2E (supplier fact stored and recalled in a new chat) was run by the owner with the env var set.

### [2026-10-16 10:30 UTC+07:00] — [CI] Release build ignores stale Metro cache and refuses mock values

**Done:** `scripts/android-release.sh` deletes Metro's cache before Gradle and stops when a mock flag is true or the API endpoint is localhost or `10.0.2.2`. The APK published by `Mobile release` run #22 carried the values of a local test build (`http://10.0.2.2:1` API, `http://10.0.2.2:8765/version.json` update URL, no production strings), so it never offered an update and `latest.apk` served a mock build. The cause is inferred: Metro's transform cache is keyed on file contents, not on `EXPO_PUBLIC_*`, and the test build ran on the same machine as the self-hosted runner.

**Changed files:** `scripts/android-release.sh` — modified; this entry.

**Check:** `bash -n` passes. **Not verified:** a real build; the bundle of the next published APK must contain `railway.app` and the R2 `version.json` URL and no `10.0.2.2`. `latest.apk` stays a bad build until then.

### [2026-10-16 01:35 UTC+07:00] — [Feature] Welcome guide pages show the new illustrations

**Done:** The Bán hàng, Tổng quan and Quản lý pages of the welcome guide show the designer's illustrations (converted from webp to 1080 px JPEG) instead of an icon on a colour block. Each image now carries its own aspect ratio: Bán hàng and Tổng quan are 3:2 like the Bobi page, Quản lý is near-square (1080×1151) and would lose its lower part under the old fixed 3:2 height. The text of those pages was rewritten to add what the pictures do not say instead of repeating their callouts, and to correct where the pictures differ from the app: sorting and stock filters live in the funnel button (the picture shows the older buttons and a "Cá nhân" tab), the outstanding debt on Home is the whole shop's and does not follow the period (the picture's callout says "trong kỳ"), and Công nợ only tracks what customers owe (the picture shows a "Nhà cung cấp" tab the app does not have). The Bobi page is unchanged.

**Changed files:** `frontend/mobile/src/components/AssistantIntroModal.tsx` — modified; `frontend/mobile/assets/guide/guide-sales.jpg`, `guide-overview.jpg`, `guide-manage.jpg` — new; this entry.

**Check:** `tsc --noEmit` has no errors in this PR's files (its only 2 errors are in #230's files because `expo-application` and `expo-intent-launcher` are not installed on this machine). Mock web build in headless Chrome, guide opened from Cài đặt → "Xem lại hướng dẫn": at 393×852 and 360×640 each picture shows at its own ratio (3:2 pages 1.502, Quản lý 0.937–0.939 against 0.938), nothing is cut or stretched, and the footer buttons stay visible. The local install lacks the Google Sign-In package, so the Expo plugin line was removed from `app.json` only for those runs and restored. **Not verified:** a phone; the callout text inside the pictures is small (about 7–8 pt at card width).

### [2026-10-16 01:30 UTC+07:00] — [CI] Skip Vercel previews on pull requests

**Done:** `deploy-web` and `deploy-landing` now run on pushes to `staging` and `main` only. Pull-request previews used up the Vercel Hobby limit of 100 deployments a day (`api-deployments-free-per-day`), and once it ran out the staging deploys failed too and every PR showed two red checks. The PR-only steps stay in `ci.yml`, so previews come back by restoring one condition.

**Changed files:**
- `.github/workflows/ci.yml`, `docs/development/ci-cd.md`, `CONTRIBUTING.md`, `frontend/mobile/README.md`, `frontend/web/README.md` — modified

**Flow explained:** PR → tests and builds only → merge → push `staging` → `deploy-web` / `deploy-landing` → staging alias; push `main` → approval → production.

**Check:** workflow YAML parses and actionlint passes; docs re-read. **Not verified:** the first PR run without the deploy jobs (this PR's own CI).

### [2026-10-16 00:45 UTC+07:00] — [Feature] Debts screen groups by customer, searches, opens the sale and records transfers

**Done:** The Công nợ screen lists one card per customer with the total still owed, the number of open debts and how long the oldest open debt has run ("nợ 7 ngày", red from 30 days), and under it each debt by sale ("Đơn #4 · Hôm qua") with its remaining amount. Core can create a new customer with the same name and phone for each credit sale, so customers with the same phone digits are grouped as one; customers without a phone stay apart. The header counts customers, not debts (the old "Số khách nợ" counted debts), with the number of open debts under it. A search box filters by name (accent-insensitive) or phone digits. The debt sheet opens the original sale ("Xem đơn #…"), records a payment as cash or transfer with an optional transaction reference (it always sent `CASH` before), shows the method in the history, and the reminder button opens an SMS with the shop name, amount left and sale number. Core is unchanged.

**Changed files:** `frontend/mobile/app/debts.tsx`, `docs/product/product-requirements.md` (`FR-016`, new `AC-075`) — modified; `frontend/mobile/src/lib/debtGroups.ts`, `frontend/mobile/tests/debtGroups.test.ts` — new; this entry.

**Flow explained:** `GET /debts` and `GET /customers` (all pages) → join name/phone → drop VOIDED → `groupDebtsByCustomer` (key: phone digits, else customer ID; most owed first) → search with `matchesDebtSearch` → status chips filter each group's debts. Repay sends `POST /debts/{id}/payments` with `paymentMethod` and `transferReference` when given.

**Check:** `tsc --noEmit` has no errors in this PR's files; its only 2 errors are in #230's files because `expo-application` and `expo-intent-launcher` are not installed on this machine. `node --test tests/debtGroups.test.ts` 8/8. Mock web build in headless Chrome, 9/9: header shows 3 customers and 3 debts, each debt row names its sale, "minh" and "8123456" leave only the matching customer, no match shows "Không tìm thấy khách", the sheet links "Xem đơn #4 · 15/10", choosing transfer shows the reference field, a partial transfer payment shows "Khách trả nợ · Chuyển khoản", and "Xem đơn" opens that sale. **Not verified:** grouping two customers with the same phone on screen (the mock has none; covered by unit tests), the SMS reminder on a phone.

### [2026-10-16 09:00 UTC+07:00] — [Docs] Table format for commits and pull requests

**Done:** Defined one format for every future commit and pull request: a free-form scope (examples, no fixed list), body and footer rules, a `!` plus `BREAKING CHANGE:` rule that survives squash merges, and pull request descriptions built from Summary, Changes, Validation, Risks and rollback, and Config and migrations tables. Release pull requests (`staging` → `main`) get their own template that must list every commit in `origin/main..origin/staging` grouped by area, with Breaking changes and Deploy tables. Reviewed by an Opus medium pass; its findings (template default-branch caveat, release template URL, squash and breaking marks, Deploy rows, AGENTS.md duplication) are applied.

**Changed files:**
- `CONTRIBUTING.md`, `AGENTS.md`, `PROGRESS.md` — modified
- `.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/release.md` — created

**Flow explained:** GitHub reads pull request templates from the default branch (`main`), so they pre-fill only after the release that carries them; until then paste the structure from CONTRIBUTING.md.

**Check:** Markdown re-read and links checked; no code or workflow touched. **Not verified:** the templates pre-filling on GitHub (needs the change on `main`).

### [2026-10-15 23:59 UTC+07:00] — [Feature] Voice orders ask which variant when a name is shared by several products

**Done:** Saying a name that several catalog products share ("hai sting" with "Sting vàng" and "Sting đỏ") no longer treats it as a new product: Đọc đơn shows "Chọn mẫu cho "Sting" · 2" with each matching product and its price (up to 6, shortest names first). Picking one adds that product with the spoken quantity; "Không phải mẫu nào" skips it. Saying a product's exact name, or a name with a spoken price, still works as before. This also fixes a bug where "sting gold" silently became the product "Sting" (dropping "gold") when "Sting" and longer "… Sting Gold …" products both exist: a spoken name longer than the matched product now asks too. `parseOrder` fills the existing `disambiguations` field, which was always empty. Two older parsing bugs found while testing are fixed too. Two items said without a pause merged into one whenever one name was not a full catalog name: "hai sting một bánh mì thịt" gave "2 Bánh mì thịt" and lost the Sting, "hai bò húc một bánh mì thịt" the same; a quantity right after a product word now starts a new item (`chunkByQuantity`), except between the words of a number, inside a catalog name with digits ("… Lốc 6 Lon 320ml", also when only part of it is said) or after filler words. A matched product's quantity is read outside its name, so "một … lốc 6 lon 320ml" is 1, not 6. Accent folding made "bò" equal the unit "bó" (also "gỏi"/"gói", "cải"/"cái", "lợn"/"lon"…), so "hai bò húc" became "Húc": a word whose accents differ from the unit's own spelling is kept as a name word (`UNIT_SPELLINGS`, `markHomograph`), unaccented typing behaves as before, and catalog names still match when typed without accents.

**Changed files:** `frontend/mobile/src/lib/parseOrder.ts`, `frontend/mobile/app/voice.tsx`, `docs/product/product-requirements.md` (`FR-008`, new `AC-074`) — modified; `frontend/mobile/tests/parseOrder.test.ts` — new; this entry.

**Check:** `tsc --noEmit` has no errors in this PR's files; its only 2 errors are in #230's files because `expo-application` and `expo-intent-launcher` are not installed on this machine. `node --test tests/*.test.ts` 64/64 (21 new in `tests/parseOrder.test.ts`), including run-on phrases, names with digits, unit homographs and unchanged expense phrases. Mock web build in headless Chrome, 8/8: "hai sting gold" shows 3 Sting Gold options with quantity 2 and long names wrap inside the rows, picking one adds 2 of it, "Không phải mẫu nào" skips, "một sting" adds the product "Sting" directly, "hai sting gold một nước ngọt" adds 1 Nước ngọt and asks for Sting gold · 2, "hai bò húc" offers to add "Bò húc". **Not verified:** speech on a phone (the homograph fix needs the speech model to return accented words; unaccented "bo huc" still reads "bo" as a unit unless the product is in the catalog).

### [2026-10-15 23:57 UTC+07:00] — [Feature] Replay the welcome guide from Settings

**Done:** Settings has a "Xem lại hướng dẫn" button that opens the welcome guide (`AssistantIntroModal`) again from the Bobi step, as on the first sign-in. It opens on Settings itself, so closing it returns to Settings; "Hỏi đáp"/"Đọc đơn" on the first step close it and open those screens. The first-sign-in behaviour is unchanged.

**Changed files:** `frontend/mobile/app/settings.tsx`, `docs/product/product-requirements.md` (`FR-025`, `AC-018`) — modified; this entry.

**Check:** `tsc --noEmit` clean. Mock web build in headless Chrome, 3/3: Settings shows the button, it opens the guide on the Bobi step, closing returns to Settings. **Not verified:** a phone.

### [2026-10-15 23:55 UTC+07:00] — [Fix] Revenue never shows negative; orders sold earlier and voided now count as an expense

**Done:** Core's reports compute net revenue as sales in the period minus orders voided in the period, so voiding today an order sold yesterday made today's revenue negative on Home and the Orders card. The app now shows revenue as the orders sold in the period that are still confirmed (`GET /sales/summary` for the same window), which is never negative. An order sold before the period and voided in it is shown on the expense side instead: a line "Huỷ đơn bán kỳ trước … · tính vào chi phí" under Home revenue, "Chi … (gồm huỷ đơn …)" in yesterday's summary notification, and a "Huỷ đơn #…" row in the month it was voided on the Expenses screen (opens the order, cannot be deleted). Display only: nothing is written to Core's expense book, so Core's profit is not reduced twice. Orders' day headers also come from `/sales/summary` per day (fetched as days appear, a late answer from an older refresh never overwrites a newer one) instead of the report series, and count confirmed orders with voided ones shown separately ("1 đơn · 1 huỷ · 120.000đ"). `SaleView` gains `voidedAt`/`voidReason` from the contract; the mock sets them.

**Changed files:** `frontend/mobile/src/lib/homeOverview.ts` (`periodRevenue`), `saleFilter.ts` (`reportPeriodWindow`; unused `saleFilterReportPeriod`/`saleFilterYearDays` removed), `useHomeOverview.ts`, `useLocalNotifications.ts`, `notifications.ts`, `mockCore.ts`, `src/data/types.ts`, `frontend/mobile/app/(tabs)/index.tsx`, `app/(tabs)/invoices.tsx`, `app/expenses.tsx`, `tests/homeOverview.test.ts`, `docs/product/product-requirements.md` (`FR-006`, new `AC-073`) — modified; this entry.

**Flow explained:** report period → `reportPeriodWindow` → `/reports/summary` + `/sales/summary` → `periodRevenue`: revenue = `confirmedSalesVnd`, cancelled earlier = `voidedRevenueVnd − (grossRevenueVnd − confirmedSalesVnd)`, floored at 0.

**Check:** `tsc --noEmit` has no errors in this PR's files; its only 2 errors are in #230's files because `expo-application` and `expo-intent-launcher` are not installed on this machine. `node --test tests/*.test.ts` 47/47 on top of staging (4 new for `periodRevenue`). Mock web build in headless Chrome, 4/4: today sold 265.000đ, then voided yesterday's 379.000đ order (the report's net would be −114.000đ); Home stays 265.000đ with "Huỷ đơn bán kỳ trước 379.000đ · tính vào chi phí", Orders "Hôm qua" goes 379.000đ → 0đ, no negative day header. **Not verified:** the Expenses "Huỷ đơn" row (the mock has no order sold last month and voided this month), staging Core, a phone.

### [2026-10-15 22:40 UTC+07:00] — [Feature] Cloudflare Workers AI embedder for agent memory

**Done:** `AGENT_MEMORY_EMBEDDING_PROVIDER` picks `sentence-transformers` (default, local) or `cloudflare` (Workers AI `/v1/embeddings` with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`). `WorkersAIEmbeddingModel` adds embeddinggemma's query/document prompts, which Workers AI does not, and cuts vectors to `EMBEDDING_DIMENSIONS` (384, the migration's size); the local embedder cuts to it too. ADR-0002 records the local bench (embeddinggemma at 384: Recall@1 0.947 vs MiniLM 0.658). Still behind `AGENT_MEMORY_ENABLED` and PO approval.

**Changed files:**
- `backend/ai/src/memory/workers_ai_embedding.py`, `backend/ai/tests/unit_tests/test_workers_ai_embedding.py` — created
- `backend/ai/src/{app_config,main,memory/repository}.py`, `backend/ai/.env.example`, `backend/ai/README.md`, `docs/architecture/adr/0002-agent-long-term-memory.md` — modified

**Flow explained:** startup → `build_memory_embedder` picks provider → Workers AI: prompt + text → `/v1/embeddings` → 768-d → cut to 384 → same pgvector search.

**Check:** ruff clean, pytest 361 passed / 53 skipped. Live Workers AI on the bench set (34 facts, 38 queries): recall@1 0.947, MRR@10 0.961, same as local gemma@384; 300–600 ms per query. **Not verified:** the memory integration test against Postgres (needs `POSTGRES_TEST_URL`).

### [2026-10-15 18:00 UTC+07:00] — [Feature] In-app update for the R2 APK

**Done:** A published production APK now offers to update itself. CD builds it with `ANDROID_VERSION_CODE=<run number>` (new, monotonic; before, every build was versionCode 1) and `EXPO_PUBLIC_UPDATE_URL`, uploads the APK, then writes `android/production/version.json`. On launch the app fetches that file, compares `versionCode` with the installed one and, if higher, shows a dialog that downloads the APK from `builds/` and opens Android's installer. No new native module: `expo-file-system` (existing FileProvider), `expo-intent-launcher` and `expo-application`. `REQUEST_INSTALL_PACKAGES` is declared only when the update URL is set. Stacked on #225 (`feat/mobile-release-builds`).

**Changed files:**
- `frontend/mobile/src/lib/appUpdate.ts`, `appUpdateInstall.ts`, `appUpdateInstall.native.ts`, `src/components/UpdatePrompt.tsx`, `tests/appUpdate.test.ts` — created
- `frontend/mobile/{app/_layout.tsx,src/config.ts,app.config.js,.env.example,package.json,package-lock.json}`, `.github/workflows/mobile-release.yml`, `docs/development/ci-cd.md` — modified

**Flow explained:** publish → build with versionCode and update URL baked in → APK to `builds/` and `latest.apk` → `version.json` last → installed app fetches it at launch (8 s timeout, any failure is silent) → higher versionCode → dialog → download to cache → `getContentUriAsync` → `ACTION_VIEW` installer → user confirms. Required R2 variable: `R2_PUBLIC_URL` (needs the owner to set it before the next publish).

**Check:** `npm test` 42/42 (5 new for the version logic), `tsc --noEmit` clean, the check run against a local HTTP server (older → offered, equal/newer/404/down → none), `expo prebuild` gives `versionCode 57` and the install permission only with the URL, workflow YAML parses and the manifest renders. Android 14 emulator (arm64), release build with R8, two APKs signed with the same key (versionCode 1 and 2): the app asked, downloaded `app-2.apk` from a local server, Android asked once to allow installs from the app, then installed over the old one (`versionCode=2`), and the next launch did not ask. **Not verified:** a real phone, the workflow on GitHub, cancelling a download mid-way.

### [2026-10-15 21:45 UTC+07:00] — [Feature] Sign in with Google on mobile and web

**Done:** The Google button on the sign-in screen works instead of showing "Sắp có". On Android and iOS it uses `@react-native-google-signin/google-signin` (new dependency, 16.1.5): Google returns an ID token, the app signs in to Firebase with `GoogleAuthProvider.credential`, then follows the Facebook flow (Core `POST /auth/session`; a new account goes through "Bạn tên gì?" and shop setup). The web opens Firebase's Google popup; the mock signs in as `google.demo@example.com`. Signing out also signs out of Google so the account chooser shows next time. The Web client ID that Google needs is read at build time from the `google-services.json` of the build's environment (`oauth_client` with `client_type` 3) into `extra.googleWebClientId`, so no new variable or secret. A rejected signing key (`DEVELOPER_ERROR`) shows the generic "not available" message and logs the cause. Firebase setup done by the team: Google enabled in both projects; staging `smart-ledger-c2892` has the debug key's SHA-1/SHA-256, production `smart-ledger-production` the release key's; `ANDROID_GOOGLE_SERVICES_JSON` updated in `android-dev`, `android-staging` and `android-production`. Core is unchanged.

**Changed files:** `frontend/mobile/app.config.js`, `frontend/mobile/app/(auth)/welcome.tsx`, `frontend/mobile/src/lib/auth/types.ts`, `firebase.ts`, `firebase.web.ts`, `firebaseErrors.ts`, `mock.ts`, `frontend/mobile/package.json`, `package-lock.json`, `frontend/mobile/README.md`, `docs/product/product-requirements.md` (`FR-010`) — modified; this entry.

**Flow explained:** tap Google → `authClient.signInWithGoogle()` → native: `GoogleSignin.configure({ webClientId })` once, `hasPlayServices`, `signIn` → `signInWithCredential` / web: `signInWithPopup(GoogleAuthProvider)` → `app.signIn()` sends the Firebase ID token to Core → setup or tabs.

**Check:** `tsc --noEmit` clean. `app.config.js` returns the staging client for the staging file, the production client for the production file and none without a file. CI `android-dev` APK (run 38747868804, arm64, debug key, staging): signer SHA-1 matches the staging fingerprint and the APK contains the module; the user signed in with Google on a real Android phone. **Not verified:** the web popup, the production APK (release key), iOS.

### [2026-10-15 21:00 UTC+07:00] — [Fix] Notification swipe-to-read works on iOS, unread counts move to pill badges

**Done:** On iOS the swipe-to-read row (#218) did not move at all. `SwipeRow` now refuses to give the gesture back once it has taken a horizontal drag (`onPanResponderTerminationRequest: () => false`). The action is a lighter red that fills the whole revealed area (Gmail style), and the card no longer pads the list vertically so the action meets the rounded corner. The filter pills show unread counts as a badge on the pill corner instead of "· N" text, so a pill no longer grows when it has unread items.

**Changed files:** `frontend/mobile/src/components/SwipeRow.tsx`, `frontend/mobile/app/notifications.tsx` — modified; this entry.

**Flow explained:** drag right-to-left past 10 pt → `SwipeRow` becomes the responder and keeps it → release past 60% of the width or tap the action marks the notification read; a smaller drag leaves the action open. `FilterPills` takes an optional `count` per option and draws the badge over the pill corner (`99+` above 99).

**Check:** `tsc --noEmit` clean. iOS simulator (iPhone 17 Pro) against staging Core: without the change the row did not move; with it the swipe opens the action, a full swipe and a tap on the action each mark the row read (unread 7 → 6 → 5), and pills show badges 7 and 6 without growing. **Not verified:** Android, the `99+` badge, a badge clipped at the right edge while scrolling the pills.

### [2026-10-15 20:10 UTC+07:00] — [Fix] Web on iPhone: Sales grid fills the width, tabs switch without a blank screen

**Done:** The team sent screenshots and a screen recording from Safari on an iPhone: on Sales the right column of product cards stopped about 17 pt short of the edge, so the grid looked shifted, and switching tabs faded through overlapping and then blank screens. The card width was a pixel value computed from the list width measured when the screen appeared; on Safari that measurement can land while the tab's fade is running and come out smaller (inferred: not reproducible in Chrome, where every screen measures 393 px). Cards are now 50% of the row each (10 px outer margins and an 8 px gap as before), so nothing is measured. On the web the tab switch no longer animates (the fade runs in JavaScript there and stalls on Safari); the phone app keeps the fade. While a list loads for the first time, Sales shows skeleton product cards (or rows in list view) and Orders a skeleton summary card and order rows, instead of a spinner. The skeletons pulse with one animation for the whole block instead of one per block, which matters on the web where each animation runs in JavaScript.

**Changed files:** `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/(tabs)/invoices.tsx`, `frontend/mobile/app/(tabs)/_layout.tsx` — modified; `frontend/mobile/src/components/ListSkeleton.tsx` — new; this entry.

**Flow explained:** the Sales `FlatList` renders each grid item in a 50% cell padded 4 px on the inner side (`gridCellLeft`/`gridCellRight`); the measured `listWidth` and window-based estimate are gone → `TAB_ANIMATION` is `'none'` on the web and `'fade'` elsewhere → `ProductGridSkeleton` and `RowListSkeleton` wrap static grey blocks in one pulsing `Animated.View`.

**Check:** `tsc --noEmit` clean. Mock-mode web build in headless Chrome at 393 px, 6 of 6: 120 ms after tapping Sales, Orders, Quản lý and Sales again the new screen's title is fully opaque; after switching tabs and after list → grid the cards sit at 10 px from both edges with an 8 px gap and equal 183 px columns. **Not verified:** Safari on an iPhone, where the bug was seen; the skeletons on screen (the mock loads instantly).

### [2026-10-15 16:30 UTC+07:00] — [Feature] Orders summary card uses Core's filtered sales summary (#221)

**Done:** Core added `GET /api/v1/sales/summary` (CORE-014, #221), which counts and totals every sale matching the same filter as the paged sales list. The Orders tab now uses it for "Tất cả", a custom date range and a search: "Tất cả" shows the all-time total again ("Tổng doanh thu" instead of "Doanh thu năm nay"), any custom range has a revenue figure even when it reaches into last year, and a search shows the revenue of its results instead of the order count only. The preset periods (Hôm nay, Hôm qua, 7 ngày, Tháng này) keep Core's period report, as #221 asks not to change the meaning of the period cards. The summary's revenue is the value of the matching sales that are not voided now; the period report subtracts voids at the time they happen, so the two differ only when a sale from an earlier period is voided in the period shown. Day header totals are unchanged.

**Changed files:** `frontend/mobile/app/(tabs)/invoices.tsx`, `frontend/mobile/src/lib/salesApi.ts`, `frontend/mobile/src/data/types.ts`, `frontend/mobile/src/lib/mockCore.ts` — modified; this entry.

**Flow explained:** without a preset period (or while searching) the Orders tab calls `saleApi.summary` with the same `from`/`to`/`q` as the list and shows `confirmedSalesVnd`; with a preset period it still calls `reportApi.summary` and shows `netRevenueVnd` → day headers keep the period series, or this year's series for "Tất cả" and a custom range inside this year → the mock Core answers `/sales/summary` from the same filter as `/sales`.

**Check:** `tsc --noEmit` clean. Mock-mode web build in headless Chrome, 6 of 6: "Tất cả" 1.146.000đ, "7 ngày" and a 30-day range have revenue, a search for "Sting" gives 3 orders and 613.000đ, a search with no match gives 0đ, clearing the search restores the total. Android emulator against staging Core (hand-repacked staging APK): "Tất cả" shows 2 orders and 11.567.567.232đ, the voided order not counted. **Not verified:** search and custom ranges against the real Core (the emulator was taken by another app mid-test); iOS.

### [2026-10-15] — [Core] CORE-014 filtered sale counts and values (#213)

**Done:** Added `GET /api/v1/sales/summary` on `feat/sales-filter-summary`, based on staging `df69819642fc420b7686d6f66073b946df2f13c2`. OWNER totals cover the entire matching sale set with the same q/status/soldAt filters as the paginated list. The response separates current CONFIRMED/VOIDED counts and discounted sale values, includes partial/debt sales, excludes drafts, and returns five zeros for an empty set. Per-status monetary overflow returns 409 `sale_summary_overflow`. No new schema, migration or FE/AI implementation.

**Changed files:** Core Sale controller/service/repository and shared list filter/specification; new `SaleSummaryResponse` and repository fragment/implementation; Core query/service/web/OpenAPI/PostgreSQL tests, PostgreSQL CI gate and README. API contract, PRD `FR-033`/`AC-069`–`AC-072`, technical design and this new entry were aligned with user approval; previous progress entries are preserved.

**Flow explained:** verified Firebase principal → active OWNER/owned ACTIVE shop guard → shared list predicate → one PostgreSQL COUNT/SUM tuple → checked signed-64-bit conversion → response. Item search uses EXISTS, so multiple matching items cannot multiply sale totals. Summary filters by soldAt and current status; report net revenue keeps its existing soldAt/voidedAt event timing. Separate list/summary requests do not share a snapshot. Deploy Core before FE adopts this endpoint.

**Check:** Core commit `a8be3c0` was rebased onto the staging base above without conflict. `mvnw.cmd -o clean verify` against a dedicated disposable PostgreSQL 16 container passed **1,178 tests, 0 failures/errors/skipped**; the required PostgreSQL gate passed, and its own 12 tests passed. The 32-test sales/list suite covers combined filters/offset boundaries, empty sets, discounts/partial/debt sales, cross-period void, role/shop guards and Long.MAX_VALUE/overflow for both statuses using valid PAID fixtures. The 10,000-sale/50,000-item summary used one data SELECT (excluding auth/shop), with an 11 ms local observation in the post-rebase run, not a production SLA. Temporary test containers/data were removed. Documentation-only follow-up was checked separately; Firebase/FE/staging UAT remains pending.

### [2026-10-15 15:30 UTC+07:00] — [Feature] Agent memory pins preferences and links the chip to the source chat

**Done:** After Cognition's agent memory repo (an always-loaded `MEMORY.md`): every turn now leads with up to ten live `preference` memories, most important then newest, whatever the message; the cosine + decay search fills five more and skips those already pinned. Prompt lines carry date and type, and `MEMORY_PROMPT` tells the model to shape every answer by the preferences. The SSE `memory` event adds `source_conversation_id` and `created_at`; tapping a memory in the expanded chip opens the chat it came from (a memory from the open chat shows its date only). No migration, no Core change (Core relays the event as is). Still behind `AGENT_MEMORY_ENABLED` and PO approval.

**Changed files:**
- `backend/ai/src/{memory/repository,memory/service,agent/router,prompt_templates/memory}.py`, `backend/ai/tests/{unit_tests/test_agent_memory,integration_tests/test_memory_repository}.py`, `backend/ai/README.md` — modified
- `frontend/mobile/{app/ai.tsx,src/data/types.ts}` — modified
- `docs/contracts/api-contracts.md`, `docs/architecture/adr/0002-agent-long-term-memory.md` — modified

**Flow explained:** read: pinned preferences (cap 10) → search the rest by cosine × decay (top 5) → record use for all → prompt, preferences first → `memory` event with source chat and date → chip → `GET /agent/conversations/{id}`.

**Check:** AI ruff clean, pytest 359 passed / 53 skipped; mobile `tsc --noEmit` passes, `npm test` 37/37. **Not verified:** the new integration test `test_preferences_lead_whatever_the_message_and_are_not_repeated` (needs `POSTGRES_TEST_URL`); e2e on the simulator.

### [2026-10-15 12:10 UTC+07:00] — [Feature] Agent memory visibility and owner switch

**Done:** After Sakana Chat's "My Fish": recalls now record `last_used_at` and `use_count`, and decay counts from the last use. A new fact can supersede a recalled one (`superseded_by`; deleting the newer fact's chat revives the old one, so AC-022 holds). Only `preference` and `procedural` are written (`AGENT_MEMORY_TYPES`), and facts with a Vietnamese phone number are dropped. The stream sends a `memory` event before the first delta; mobile shows a "Đã dùng ghi nhớ" chip. Owners get an on/off switch (`agent_memory_settings`, default on; off stops recall and writes, deletes nothing) through AI `GET`/`PUT /internal/v1/agent/memory/settings`, a Core proxy (owner-approved exception to "do not modify Core") and a Settings row. All still behind `AGENT_MEMORY_ENABLED` and PO approval. The e2e run found that the extractor and summarizer sent no `x-opencode-session`, so the gateway refused every memory write with 400; they now pass `session_settings` like `drafts`. Branch rebased onto `origin/staging`.

**Changed files:**
- `supabase/migrations/20261015000000_agent_memory_visibility.sql` — created; applied to staging `public` with the owner's approval (rollback: `DROP TABLE agent_memory_settings; ALTER TABLE agent_memories DROP COLUMN superseded_by, DROP COLUMN use_count, DROP COLUMN last_used_at;`)
- `backend/ai/src/{memory/repository,memory/service,agent/service,agent/router,agent/schema,prompt_templates/memory,app_config,main}.py`, `backend/ai/.env.example`, `backend/ai/tests/{conftest,unit_tests/test_agent_memory,integration_tests/test_memory_repository}.py`, `backend/ai/README.md` — modified
- `backend/core/.../{AgentController,AgentService,AgentServiceImpl,AgentControllerWebTest,AgentServiceTest}.java` — modified; `AgentMemorySettingsRequest.java` — created
- `frontend/mobile/{app/ai.tsx,app/settings.tsx,src/lib/agentApi.ts,src/data/types.ts}` — modified
- `docs/contracts/api-contracts.md`, `docs/architecture/adr/0002-agent-long-term-memory.md` — modified

**Flow explained:** read: switch on? → search live rows → record use → prompt, and the memories go out as a `memory` event. Write: switch on? → extractor sees `[id] fact` lines → drop disallowed types and phone numbers → keep `replaces` only for recalled ids → insert and mark the old row superseded.

**Check:** after the rebase, AI ruff clean and 359 passed / 52 skipped (unit 319 after the session fix); `test_memory_repository.py` 10 passed against a throwaway schema on staging Supabase (pgvector), no schema left; mobile `npm run typecheck` passes; Core `mvnw test -Dtest=Agent*` 22/22 on JDK 21. E2E on the iOS simulator (local AI + Core on staging DB, gateway `claude-haiku-5-5`, shop 6): a stated preference was stored as one `preference` fact (importance 0.85); a new chat asking "Doanh thu 7 ngày qua?" showed the "Đã dùng ghi nhớ" chip and answered in bullets rounded to thousands (`use_count` 1); with the Settings switch off (`agent_memory_settings` row false) the same question showed no chip, unrounded figures and wrote nothing. Test chats deleted through the AI API, 0 memories left, switch back on. **Not verified:** Android; a real phone; summaries by the real model.

### [2026-10-15 10:57 UTC+07:00] — [Feature] Agent memory decay, 7-day summaries and shop time

**Done:** Built the two Tencent steps that were missing. Recall now re-ranks the 20 nearest memories by relevance × `importance * exp(-0.01 * age in days)`. After each memory write, memories older than 7 days are grouped by conversation and shop day; the chat model merges each group (at most 3 per turn) into 1–5 facts that replace it in one transaction, keep the latest date and carry `metadata.summarized_from`. Added the shared `get_time` (Asia/Ho_Chi_Minh): memory dates and the extraction's "today" use it, and every agent run ends its instructions with the current shop time. Corrected ADR-0002 where it had drifted from the code (no `MemoryWriter`, local embedding instead of an embedding API, the schema sketch, the memory types). Removed `backend/ai/evals/` and the `eval` dependency group at the user's request.

**Changed files:** `backend/ai/src/utils.py` — created; `backend/ai/src/memory/{repository,service}.py`, `src/agent/service.py`, `src/prompt_templates/{memory,shop_agent,__init__}.py`, `tests/support.py`, `tests/unit_tests/{test_agent_memory,test_agent_service,test_restock_tool,test_shop_data_tool}.py`, `tests/integration_tests/test_memory_repository.py`, `backend/ai/README.md`, `backend/ai/pyproject.toml`, `uv.lock`, `docs/architecture/adr/0002-agent-long-term-memory.md`, `docs/contracts/api-contracts.md` — modified; `backend/ai/evals/` — deleted.

**Flow explained:** read: embed message → 20 nearest unexpired by cosine (shop + user) → re-rank by relevance × decay → top 5 dated in shop time. Write: extract facts (with today) → embed → insert → find old groups → model merges → delete group and insert summary in one transaction (a group another run already changed is left alone).

**Check:** unit suite 279 passed, same 2 `test_provider_factory.py` failures; `test_memory_repository.py` 4 passed against a throwaway schema on staging (decay order, summary swap, second swap refused, cascade), no schema left. Live run on the local AI (staging DB, gateway model): it answered "thứ Năm, ngày 15 tháng 10 năm 2026, 10 giờ 55"; "hôm qua máy đá hỏng" was stored as an episodic fact dated 14/10/2026 and recalled in a new chat; test chats deleted, 0 memories left. **Not verified:** a summary produced by the real model (needs 7-day-old data; covered by unit and integration tests only); the diagram still shows decay and summaries as proposed.

### [2026-10-14 23:10 UTC+07:00] — [Fix] Agent memory verified end to end on staging

**Done:** Applied `20261014000000_agent_memories.sql` to staging (the user ran it; rollback is `DROP TABLE agent_memories;`). Ran the AI app locally with `AGENT_MEMORY_ENABLED=true` against staging's database and the gateway model staging uses (`claude-haiku-5-5` over the Anthropic API). The first run found two bugs: the gateway's Anthropic models reject `NativeOutput`, so every fact extraction failed; and the model told the owner it cannot remember between chats. Fixed by extracting with `PromptedOutput(MemoryFacts)` and a fourth rule in `MEMORY_PROMPT`.

**Changed files:** `backend/ai/src/memory/service.py`, `backend/ai/src/prompt_templates/memory.py` — modified.

**Flow explained:** unchanged; extraction now asks for JSON in the prompt instead of the provider's structured-output mode.

**Check:** e2e through `POST /internal/v1/agent/chat` (shop 5): turn 1 stored one `semantic` fact (importance 0.7) under the right shop, user and conversation; turn 2 in a new chat answered "anh nhập gạo ở chú Tư chợ Bà Chiểu" from memory, and the stored user message stayed raw; shop 4 asking the same got no such fact; deleting the test chats removed their memories; staging left with 0 memory rows. Unit suite 312 passed, same 2 `test_provider_factory.py` failures. **Not verified:** this branch's factory cannot build Anthropic models (that is on `origin/staging`, #204), so the test patched `build_chat_model` in a scratch launcher to mirror staging's.

### [2026-10-14 23:00 UTC+07:00] — [Refactor] Agent memory repository on the SQLAlchemy ORM

**Done:** `AgentMemoryRepository` now matches the other AI repositories: an `AgentMemory` mapped class on the shared `Base`, `select(...)` for Tencent's search (cosine distance through `pgvector.sqlalchemy`, same filters and order) and `session.add_all` for inserts. The raw `text()` SQL and the hand-built vector literal are gone.

**Changed files:** `backend/ai/src/memory/repository.py` — modified; `backend/ai/pyproject.toml`, `uv.lock` — `pgvector` added to the base dependencies (it brings `numpy` into the image).

**Flow explained:** unchanged: search filters shop, user and unexpired rows, orders by `<=>`, returns `1 - distance`.

**Check:** `ruff check` clean; full AI suite 312 passed, 42 skipped, same 2 `test_provider_factory.py` failures as before. Throwaway `memory_eval` schema on staging with real MiniLM through `pydantic_ai.Embedder`: same ranking as the SQL version (0.681 for the rice-supplier fact), other user and expired rows hidden, conversation delete cascades, schema dropped afterwards.

### [2026-10-14 22:40 UTC+07:00] — [Refactor] Agent memory reads by injection, embeds through Pydantic AI

**Done:** Memory now reads the way Tencent's guides do: before the model answers, code searches the owner's memories with the current message and places up to five dated facts before it ("Earlier facts from this owner", the shape of Tencent's Agentic RAG "reference materials" prompt). The `recall_memory` tool is gone, so memory no longer spends a tool call. The stored message stays the owner's own words; a failed search answers without memories. Embedding uses Pydantic AI's built-in `Embedder` (`sentence-transformers:` provider, normalised) instead of a hand-written adapter. Supersedes the read flow in the 21:30 entry.

**Changed files:** `backend/ai/src/memory/service.py`, `src/agent/service.py`, `src/agent/tools.py`, `src/main.py`, `src/prompt_templates/{memory,__init__}.py` — modified; `backend/ai/src/memory/sentence_transformer_embedder.py` — deleted; `tests/unit_tests/test_agent_memory.py` — rewritten (8 tests, `TestEmbeddingModel`); `backend/ai/README.md`, ADR-0002 read bullet, `docs/architecture/diagrams/{src/agent-memory.drawio,images/agent-memory.svg}` — modified.

**Flow explained:** `chat`/`stream_chat` → `_with_memories` → `Embedder.embed_query` → cosine search on shop and user, unexpired → `MEMORY_CONTEXT` + message sent to the model; `_save_turn` stores the raw message, then the background write runs as before.

**Check:** `ruff check` clean; full AI suite 312 passed, 42 skipped, same 2 `test_provider_factory.py` failures as before; diagram re-exported and checked as PNG. **Not verified:** a turn against the real chat model with real MiniLM; Tencent's decay and 7-day summarisation are not built (no scheduler in the AI service).

### [2026-10-14 21:30 UTC+07:00] — [Feature] Agent long-term memory behind AGENT_MEMORY_ENABLED

**Done:** Built ADR-0002 option A on Tencent's agent-memory pattern: `agent_memories` table (Tencent's columns, cosine HNSW index, append-only, `expires_at`), Tencent's semantic search scoped to shop and user, a model step that distills each saved exchange into facts (Tencent's summarization), and a `recall_memory(query)` tool. MiniLM runs in process through a thin adapter. Off by default; with the flag off, chat behaves as before.

**Changed files:** `supabase/migrations/20261014000000_agent_memories.sql` — created; `backend/ai/src/memory/` (`repository.py`, `service.py`, `sentence_transformer_embedder.py`) — created; `backend/ai/src/prompt_templates/memory.py` — created; `backend/ai/src/agent/{service,tools}.py`, `src/main.py`, `src/app_config.py`, `src/prompt_templates/__init__.py` — modified; `backend/ai/pyproject.toml`, `uv.lock` — `memory` group, `eval` includes it; `tests/unit_tests/test_agent_memory.py`, `tests/integration_tests/test_memory_repository.py` — created; `backend/ai/README.md`, `.env.example`, ADR-0002 status — modified.

**Flow explained:** read: model calls `recall_memory(query)` → embed → cosine search on the request's shop and user, unexpired only → JSON under a "data, not instructions" header. Write: `_save_turn` saves the exchange → background task → chat model extracts up to 5 facts → embed → INSERT; failures only log. Deleting a conversation cascades to its memories.

**Check:** 8 new unit tests pass; full suite 312 passed with the same 2 `test_provider_factory.py` failures as before. Migration and repository exercised on a throwaway `memory_eval` schema on staging with real MiniLM: correct ranking, expired/other-user/other-shop rows hidden, cascade works, RLS on, schema dropped. **Not verified:** the Postgres integration test (runs in CI only), fact extraction against the real chat model.

### [2026-10-14 21:00 UTC+07:00] — [Eval] Tencent agent-memory baseline with a local MiniLM embedder

**Done:** Built Tencent's agent-memory pattern as written (table, HNSW cosine index, `tenant_isolation` policy, INSERT, search and decay queries) in a throwaway `memory_eval` schema on staging, with `paraphrase-multilingual-MiniLM-L12-v2` computing 384-dimension embeddings locally. A synthetic Vietnamese set (35 searchable memories, 16 distractors, 40 questions) scores Hit@1 0.575, Recall@5 0.825, MRR@5 0.670. No foreign, expired or other-shop row ever came back. All five questions typed without diacritics missed.

**Changed files:** `backend/ai/evals/agent_memory/` (`README.md`, `schema.sql`, `dataset.json`, `run_baseline.py`, `results/baseline-minilm.json`) — new; `backend/ai/pyproject.toml`, `backend/ai/uv.lock` — `eval` dependency group with `sentence-transformers`; `docs/architecture/adr/0002-agent-long-term-memory.md` — link to the baseline; this entry.

**Flow explained:** `run_baseline.py` refuses to start if `memory_eval` exists → creates it from `schema.sql` → inserts each memory as `postgres` → searches each question as `authenticated` (Supabase's `postgres` bypasses RLS) with `app.tenant_id` set → repeats every search as the other shop to prove RLS → drops the schema in `finally` → writes the JSON report.

**Check:** ran twice with identical scores; `memory_eval` absent afterwards; `ruff check` and `ruff format --check` clean on `evals/`. The AI test suite shows 2 failures in `test_provider_factory.py` with and without this change (stashed and re-run), so they predate it. **Not verified:** any model other than MiniLM; real owner phrasing (the set is synthetic).

### [2026-10-14 20:10 UTC+07:00] — [Docs] ADR-0002 checked against the Tencent pages, staging and VN-MTEB

**Done:** Read the four Tencent pages themselves. They add an `importance` column, decay by importance and age, summarisation with `tencentdb_ai.chat_completions`, and a hybrid search that uses the `chinese` text search config; PostgREST `/memory/records` is confirmed. The sample `INSERT` passes a text id into a UUID column, so it does not run as written. Staging (PostgreSQL 17.11) has no `age` extension; `pg_trgm`, `unaccent` and `pgroonga` 3.2.5 are available but not enabled. The chat proxy in the AI `.env` returns 404 on `/v1/embeddings`, so option A needs its own embedding provider. A new Embedding section gives the VN-MTEB retrieval scores for the 1024-dimension candidates and the next measuring step.

**Changed files:** `docs/architecture/adr/0002-agent-long-term-memory.md` — modified; this entry.

**Flow explained:** none changed. The ADR stays Proposed.

**Check:** read-only `pg_available_extensions` query on staging through `AI_SQL_READER_URL`; one embeddings call through the configured proxy (404). **Not verified:** any embedding model on Vietnamese shop data, since no provider with an embeddings endpoint is configured.

### [2026-10-14 19:02 UTC+07:00] — [Docs] ADR-0002 proposes agent long-term memory after Tencent's PostgreSQL guide

**Done:** Recorded what Tencent's "Agent Long-Term Memory" guide for TencentDB for PostgreSQL builds (pgvector, an append-only `memory.records` table with four memory types, row-level security per tenant, in-database `bge-m3` embeddings, Apache AGE, PostgREST) and how each part maps to SmartLedger. The ADR compares building the same pattern on Supabase pgvector, moving to TencentDB, running the open-source TencentDB-Agent-Memory service, and keeping the 100-turn window. It proposes the first, only after the PO approves a requirement, and sketches it on the existing patterns: a new Supabase migration, a `recall_memory` tool built like `query_shop_data`, a writer after `_save_turn`, `shop_id` + `user_id` in every query and a cascade from the source conversation. A new draw.io diagram in the CI/CD style shows the Tencent reference and the proposed read and write flows.

**Changed files:** `docs/architecture/adr/0002-agent-long-term-memory.md`, `docs/architecture/diagrams/src/agent-memory.drawio`, `docs/architecture/diagrams/images/agent-memory.svg` — new; `docs/README.md` — modified; this entry.

**Flow explained:** none changed. The ADR is Proposed; code, contracts and the PRD are unchanged.

**Check:** SVG exported with the documented `drawio -x -f svg -e --embed-svg-images --svg-theme light -b ffffff` command and checked as a rendered PNG. **Not verified:** the Tencent guide pages were read through search excerpts, not the pages themselves; whether Supabase offers the `age` extension.

### [2026-10-15 08:20 UTC+07:00] — [Fix] Sales and Orders share one search bar in the same place

**Done:** The team sent a screen recording: switching between Sales and Orders made the header jump, because the two tabs placed their title, search box and filter button differently (Orders had a 28 pt title, 8 pt top and 16 pt side margins, and a separate funnel button that narrowed the search box). Both tabs now use one search bar (`TabSearchBar`) at the Sales coordinates: same title and subtitle sizes, same margins, a full-width box with the funnel inside on the right. On Sales the funnel replaces the scan icon in the box (scanning stays on the "Quét mã" button) and opens a "Bộ lọc" sheet with Sắp xếp (Tên A-Z, Giá tăng dần, Tồn kho giảm) and Tồn kho (Tất cả, Sắp hết, Hết hàng), plus "Đặt lại" and "Xong"; the two old sort and stock buttons are gone and a line shows the active filter. On Orders the funnel still opens the date range sheet. The funnel is tinted while a filter is active.

**Changed files:** `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/(tabs)/invoices.tsx` — modified; `frontend/mobile/src/components/TabSearchBar.tsx` — new; this entry.

**Flow explained:** `TAB_HEADER_TOP` and `TAB_HEADER_SIDE` in `TabSearchBar.tsx` set the header offsets of both tabs → each tab renders the same title row sizes and `TabSearchBar` with its own placeholder, filter state and funnel action → Sales keeps sort and stock in state and edits them in the sheet; the list query is unchanged.

**Check:** `tsc --noEmit` clean. Mock-mode web build at 390 px, 8 of 8: title, search box (x 14, y 60, 362 × 42), funnel and the first chip have the same coordinates on both tabs; the Sales filter sheet applies, shows the summary and resets. Android emulator against staging Core (hand-repacked staging APK): the search input and funnel have identical bounds on both tabs, the chip row differs by 1 px, and choosing "Giá tăng dần" in the sheet re-sorts the list. **Not verified:** iOS; a phone.

### [2026-10-14 19:20 UTC+07:00] — [CI] Sync the Logfire token and release from GitHub to Railway

**Done:** The deploy job now owns the AI tracing settings, like the model settings: step `Sync ai tracing settings` copies the `LOGFIRE_TOKEN` secret of the `railway-staging` or `railway-production` GitHub environment to Railway service `ai`, and sets `LOGFIRE_ENVIRONMENT` (`staging` or `production`, from the branch) and `LOGFIRE_SERVICE_VERSION` (the deployed commit) before `railway up`. The token is rotated in one place, each environment keeps its own token, and each trace shows the release that produced it, which Logfire could not read because the container is uploaded without `.git`. Logfire has no OIDC login for a running service, so a write token stays the credential.

**Changed files:** `.github/workflows/ci.yml`, `docs/development/ci-cd.md` (environment table, Railway `ai` variables, new "AI tracing settings" section), `backend/ai/README.md` and this entry.

**Flow explained:** push to `staging` or `main` → job `deploy` with the matching `railway-*` environment → `Sync ai model settings` → `Sync ai tracing settings` sets each non-empty value with `railway variable set --stdin --skip-deploys` → `railway up backend/ai` starts the new AI with them → `configure_tracing` turns tracing on when the token is present.

**Check:** `ci.yml` parses as YAML and the step script passes `bash -n`. With a stub `railway` CLI, the script skips an empty token and sets environment and version, and with a token sets all three, each value passed on stdin. **Not verified:** the step on a real deploy; traces in a real Logfire project.

### [2026-10-14 18:40 UTC+07:00] — [AI] Trace agent runs in Logfire without message content

**Done:** The AI service can send Pydantic AI traces to Pydantic Logfire, so a slow, failed or costly chat turn can be found by shop and inspected: one span per turn, per model request and per tool call, with timing, model, token counts, tool names, errors and `shop_id`. Content stays out (`include_content=False`): the question, history, answer, the model's SQL and tool results are never exported, per `NFR-008`. Tracing is off unless `LOGFIRE_TOKEN` is set on Railway, so this change alone sends nothing anywhere; turning it on means accepting that this metadata goes to Logfire (pick the EU or US region when creating the project). Langfuse stays deferred; PRD and API contracts are unchanged.

**Changed files:** `backend/ai/src/observability.py` and `backend/ai/tests/unit_tests/test_observability.py` — new; `backend/ai/src/main.py`, `backend/ai/src/app_config.py`, `backend/ai/src/agent/service.py` (run metadata `shop_id`), `backend/ai/pyproject.toml`, `backend/ai/uv.lock` (`logfire` 5.2), `backend/ai/.env.example`, `backend/ai/README.md`, `docs/architecture/technical-design.md`, `docs/development/ci-cd.md` and this entry.

**Flow explained:** `main.py` calls `configure_tracing(app_config)` once at import → a blank token logs "logfire unconfigured" and returns → otherwise `logfire.configure(console=False, metrics=False)` and `logfire.instrument_pydantic_ai(include_content=False, include_binary_content=False)` instrument every agent → each chat or stream turn produces `invoke_agent` (with `metadata={"shop_id": …}`), `chat` and `execute_tool` spans. FastAPI is not instrumented because its Logfire integration records endpoint arguments, including the message.

**Check:** In `backend/ai`, `uv run ruff check`, `uv run ruff format --check` and `uv run pytest` pass with **323 passed, 40 skipped** (baseline 318 passed, 40 skipped). The new test exports a traced chat turn, a streamed turn with a SQL tool call and a failed model call to memory and finds no question, answer, SQL, phone number or error text, and finds `shop_id`; with `include_content=True` the same tests fail. uvicorn with a fake token starts, `/health` returns 200 and the unreachable Logfire API only prints a warning. **Not verified:** traces arriving in a real Logfire project and their look on staging.

### [2026-10-14 13:38 UTC+07:00] — [Feature] Overview tab reads Core reports instead of whole lists

**Done:** After Sales and Orders (PR #199), the Overview tab was still slow: it downloaded every sale, product, debt, customer and expense, page by page, to add up its figures, so it got slower as a shop grew. It now makes ten small calls in parallel whatever the shop's size: Core's reports for the chosen period (summary and top products), the products that need restocking, and five small calls for the notifications computed on the phone, plus the Core inbox. Owner decisions: revenue and order count are Core's net figures (sold in the period minus voided in the period), as on the Orders tab; the debt row reads "n khoản nợ · tiền chưa thu" because Core cannot count distinct customers; debt notifications become one "Còn n khoản nợ chưa thu" for the whole shop instead of one reminder per customer; "Tổng kết ngày hôm qua" uses Core's profit estimate (no more 60% cost guess) and notes missing cost prices. Restock reminders follow each product's own threshold (Core's NEEDS_RESTOCK) instead of a fixed 6, and best sellers show the product's unit. A period already viewed shows at once and refreshes in the background. The Notifications screen uses the same source, so the bell dot and its unread count agree. More, Analytics and Best sellers still use the whole lists (they show figures Core has no source for yet, such as hourly revenue and slow sellers).

**Changed files:** `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/app/notifications.tsx`, `frontend/mobile/src/lib/notifications.ts`, `frontend/mobile/src/lib/reportApi.ts`, `frontend/mobile/src/lib/salesApi.ts`, `frontend/mobile/src/lib/debtApi.ts`, `frontend/mobile/src/lib/expenseApi.ts`, `frontend/mobile/src/lib/saleFilter.ts`, `frontend/mobile/src/data/types.ts`, `frontend/mobile/src/lib/mockCore.ts` — modified; `frontend/mobile/src/lib/useHomeOverview.ts`, `frontend/mobile/src/lib/useLocalNotifications.ts`, `frontend/mobile/src/lib/homeOverview.ts`, `frontend/mobile/tests/homeOverview.test.ts` — new; this entry.

**Flow explained:** `useHomeOverview(period)` calls `reportApi.summary`, `reportApi.topProducts` (by quantity) and `productApi.page(stockStatus: NEEDS_RESTOCK)`, keeps each period's result, and reports a section's failure only in that section → `useLocalNotifications` calls yesterday's summary and profit estimate, the 6 newest confirmed sales, today's expenses and the open-debt count, and builds the notifications with `buildLocalNotifications` (one failed call only drops its part) → the Overview takes yesterday's revenue and the open-debt count from it, so nothing is fetched twice → `homeOverview.ts` holds the pure parts (change vs yesterday, best-seller rows without net ≤ 0, restock order, quantity text) → the mock Core filters debts by status and expenses by period and answers top products and profit estimate.

**Check:** `tsc --noEmit` clean. `node --test tests/homeOverview.test.ts tests/chatMarkdown.test.ts`: 32 of 32 (`npm test` matches no file on Windows because of the quoted glob). Mock-mode web build in headless Chrome, 14 of 14: today's revenue and order count equal the Orders tab's, the debt row reads "3 khoản nợ · 748.000đ chưa thu", the restock row lists two products and "và 3 món khác", best sellers show "cái", all three periods load, the Notifications screen shows the combined debt notification and yesterday's summary with the estimated profit, and no per-customer reminder. Android emulator against staging Core (hand-repacked staging APK): Overview, "Tuần này" and Notifications load from the reports. **Not verified:** load time on a phone (the emulator timing loop was wrong); iOS; a shop with open debts and orders yesterday on the real Core.


### [2026-10-14 14:05 UTC+07:00] — [Fix] Orders shows revenue for "Tất cả" and custom date ranges again

**Done:** The team reported that the Orders summary card lost its revenue figure under "Tất cả" and after a custom date range. Since #199 the revenue comes from Core's reports, which only take preset periods, so those filters showed the order count only. The owner chose to add up Core's daily figures for this year instead: "Tất cả" now shows "Doanh thu năm nay" (Core has no all-time total), and a custom range that starts this year shows its revenue and the per-day totals in the day headers. A range that reaches into last year still shows the order count only, and so does a search. Preset periods are unchanged.

**Changed files:** `frontend/mobile/app/(tabs)/invoices.tsx`, `frontend/mobile/src/lib/saleFilter.ts` — modified; this entry.

**Flow explained:** `saleFilterYearDays` turns "Tất cả" or a custom range into Vietnam calendar days of this year (or `null`) → the Orders tab calls `reportApi.salesSeries('year')` once, keeps the days inside the range, and adds up their net revenue for the card; the same days give the day headers their totals → preset periods still use their own summary and series.

**Check:** `tsc --noEmit` clean. `saleFilterYearDays`, 7 of 7 with the device set to New York and to Vietnam time ("Tất cả", a range in this year, a range from a day only, a range into last year, a range with no start day, a preset period, 00:30 on 1 January in Vietnam). Mock-mode web build in headless Chrome, 7 of 7: "Tất cả" shows "Doanh thu năm nay" and day totals, a custom "7 ngày gần nhất" range gives the same revenue as the "7 ngày" button, a search hides the revenue and clearing it brings it back, returning to "Tất cả" keeps it. **Not verified:** against the real Core on the emulator; iOS.

### [2026-10-14 13:56 UTC+07:00] — [Feature] AI model factory speaks Responses, Chat Completions and Anthropic Messages, with fallbacks

**Done:** OpenCode Go serves its models on three endpoints of `https://opencode.ai/inference/go/v1` ([docs](https://opencode.ai/docs/go/), read 2026-10-14): `/responses` (GPT, Grok), `/chat/completions` (DeepSeek, GLM, Kimi…) and `/messages` (Claude Haiku 5.5, MiniMax, Qwen). The factory only spoke `/responses`, so `MODEL_PROVIDER` now names the API the model speaks: `openai` (unchanged), `openai-chat` or `anthropic`. All three share `OPENAI_API_KEY` and `OPENAI_BASE_URL`, as the owner asked, so one gateway key serves every model and existing `.env` and Railway values keep working. `MODEL_FALLBACKS` (JSON list of `provider:model`, default empty) wraps the primary model in Pydantic AI's `FallbackModel`. The default model is now Claude Haiku 5.5 (`MODEL_PROVIDER=anthropic`, `MODEL_NAME=claude-haiku-5-5`) at `MODEL_REASONING_EFFORT=medium`, which `anthropic` sends as `anthropic_effort`; `.env.example` points `OPENAI_BASE_URL` at OpenCode Go. Owner decision: no YAML routing catalog (cost, priority); cost tracking and routing are planned for LiteLLM, which the factory will reach by pointing `OPENAI_BASE_URL` at its proxy.

**Changed files:** `backend/ai/src/providers/factory.py`, `backend/ai/src/app_config.py`, `backend/ai/.env.example`, `backend/ai/pyproject.toml`, `backend/ai/uv.lock`, `backend/ai/tests/unit_tests/test_provider_factory.py`, `backend/ai/README.md`, `docs/architecture/technical-design.md`, `docs/development/ci-cd.md`, `backend/ai/src/agent/service.py`, `backend/ai/src/drafts/service.py`, `.github/workflows/ci.yml` — modified; this entry.

**Flow explained:** OpenCode Go answers 400 `MissingSessionID` without `x-opencode-session`, so `session_settings(session_id)` gives each run one `extra_headers` with that header and `User-Agent: smartledger-ai/0.1.0` (one dict, because a run's settings replace the model's `extra_headers` whole); the agent uses `conversation-<id>`, or a one-off id on a conversation's first turn, and each draft parse a one-off id. `build_chat_model` checks the key → builds the primary model through `_BUILDERS[MODEL_PROVIDER]` → builds each fallback entry the same way, skipping (with a warning) an entry without `:` or with an unknown provider → returns the primary alone or a `FallbackModel` in configured order. `anthropic` refuses a blank `OPENAI_BASE_URL`, so the gateway key never goes to Anthropic's own URL, and drops the trailing `/v1` because the Anthropic SDK appends `/v1/messages`.

**Check:** 280 unit tests pass, ruff clean. With mock transports, the SDKs build `…/go/v1/messages`, `…/go/v1/chat/completions` and `…/go/v1/responses`, and `extra_headers` replaces the SDK User-Agent. Live on OpenCode Go: a tool call succeeds on Claude Haiku 5.5 (`anthropic_effort=medium`), DeepSeek V4.1 Flash (`reasoning_effort=medium` accepted) and GPT 5.6 Luna; `AgentService` chat with history and streaming answer on Haiku; the 13 live draft-parse cases pass on Haiku; an invalid primary model falls back to DeepSeek. Deploy step `Sync ai model settings` copies `OPENAI_API_KEY` (secret) and `OPENAI_BASE_URL`, `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_FALLBACKS`, `MODEL_REASONING_EFFORT` (variables) from the `railway-*` GitHub environment to Railway `ai` before `railway up`, skipping unset ones; workflow parses as YAML and the step script passes `bash -n`. **Not verified:** a full turn through Core and the database; the sync step on a real deploy; whether `AGENT_MODEL_CALL_LIMIT` counts a fallback retry as one request; Railway, whose variables must be set after this deploys. With fallbacks the stored `model` reads `fallback:<models>`.

### [2026-10-14 13:16 UTC+07:00] — [Fix] Agent chat: charts stay inside their card, a loader while waiting, floating header

**Done:** A chart with many points (17 categories on staging) no longer spills its labels past the card: each point gets at least 58px, a short series still fills the card, and a long one scrolls sideways inside it. While the agent has not sent its first word, the bubble shows a 3×3 dot lattice (the "orbit" pattern of React Bits' LatticeLoader, rebuilt with React Native `Animated` because the original is web CSS), one of 80 Vietnamese waiting phrases that changes every 3.5 s, and a stopwatch; with reduce motion on, the lattice stays still. The header drops the title, the online subtitle and the avatar: back, new conversation and history float as shadowed buttons over the conversation, which scrolls beneath them.

**Changed files:** `frontend/mobile/src/components/ThinkingStatus.tsx`, `frontend/mobile/src/lib/thinkingPhrases.ts`, `frontend/mobile/tests/thinkingPhrases.test.ts` — new; `frontend/mobile/src/components/ChatText.tsx`, `frontend/mobile/app/ai.tsx`, this entry — modified.

**Flow explained:** `ChartCard` wraps `BarChart`/`AreaChart` in a horizontal `ScrollView` whose content is at least `points × 58px`, for both the streaming draft and the saved answer. `typing && !draft` renders `ThinkingStatus`; the first delta replaces it with the streaming answer as before.

**Check:** `tsc --noEmit` clean; `npm test` 27 of 27 (80 distinct phrases, the next phrase never repeats the current one). Mock-mode web at 375px, with a temporary 9 s delay and a 17-category chart answer (reverted): the lattice animates, the phrase rotates and the clock runs; the chart stays in its card and scrolls sideways; the floating buttons sit above the first message. **Not verified:** on a phone or iOS; messages scrolling under the buttons (the mock conversation was too short to scroll).

### [2026-10-14 13:10 UTC+07:00] — [Feature] Landing shows Facebook and TikTok; public contact info moves to site.yaml

**Done:** The landing page now links to the Sổ Nghe Lời Facebook page and TikTok channel: icons sit left of the download button in the desktop nav (like the reference site), in the mobile menu, and under the brand blurb in the footer (so `/privacy` and `/data-deletion` show them too). The owner asked for a YAML file instead of env variables, since these are public links, not credentials; the owner also confirmed the contact email `songheloi.vn@gmail.com`, so it moved from `VITE_CONTACT_EMAIL` into the same file.

**Changed files:** `frontend/web/site.yaml`, `frontend/web/src/pages/landing/SocialLinks.tsx` — new; `frontend/web/vite.config.ts`, `frontend/web/package.json`, `frontend/web/package-lock.json` (devDependency `yaml`), `frontend/web/src/vite-env.d.ts`, `frontend/web/src/config.ts`, `frontend/web/src/components/BrandIcons.tsx`, `frontend/web/src/pages/landing/LandingPage.tsx`, `frontend/web/src/pages/landing/SiteFooter.tsx`, `frontend/web/src/pages/legal/legalConfig.ts`, `frontend/web/src/pages/legal/LegalLayout.tsx`, `frontend/web/src/styles/landing.css`, `frontend/web/.env.example`, `frontend/web/README.md`, `docs/development/ci-cd.md`, `.github/workflows/ci.yml` — modified; this entry.

**Flow explained:** `vite.config.ts` parses `site.yaml` at startup and inlines it as `__SITE__` → `config.ts` exports `FACEBOOK_URL`/`TIKTOK_URL`, `legalConfig.ts` exports `CONTACT_EMAIL` → `SocialLinks` renders one icon per non-empty URL (single-colour Simple Icons paths, `FacebookMonoIcon`/`TiktokIcon`, opening in a new tab) → CSS hides the nav copy at ≤ 960px, where the mobile menu shows it. Editing `site.yaml` needs a dev-server restart.

**Check:** `npm run typecheck`, `npm run lint` (only existing admin warnings) and `npm run build` pass; the built JS contains the links. In the browser pane: icons in the nav at 1024px (top and scrolled), hidden from the bar and shown in the open menu at 375px, shown in the footer; `/privacy` shows the email. **Not verified:** the deployed landing; the GitHub variable `VITE_CONTACT_EMAIL` is no longer read and can be deleted from the `landing-*` environments.

### [2026-10-14 12:22 UTC+07:00] — [Feature] Sales and Orders load 20 items at a time with infinite scroll (#144)

**Done:** The team found the Sales and Orders tabs slow to load. Both called `fetchAllPages`, which reads every page of 100 one after another before showing anything, so the wait grew with the shop's catalog and order history (each round trip to staging Core took about 0.25–0.5 s from Vietnam on 2026-10-14). The owner chose infinite scroll for both, 20 items per load. Both screens now show the first 20 after one request, load the next 20 when the list nears its end, keep the loaded items when coming back to the screen, and refresh on pull. Search (after typing stops), category, stock filter and sort on Sales, and the time filter and search on Orders, are sent to Core, which filters before paging. Owner decisions: on Orders the summary card shows revenue, and each day header its order count and revenue, only for Hôm nay, Hôm qua, 7 ngày and Tháng này, from Core's reports; "Tất cả", a custom range and a search show the order count only. The "Chưa phân loại" chip on Sales is hidden because Core cannot filter products without a category. The stock filter cycles Tồn kho → Sắp hết (each product's own threshold) → Hết hàng; "Còn hàng" is gone because Core has no such filter. The cart keeps chosen products while the list shows other search results.

**Changed files:** `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/(tabs)/invoices.tsx`, `frontend/mobile/src/lib/saleFilter.ts`, `frontend/mobile/src/lib/salesApi.ts`, `frontend/mobile/src/lib/catalogApi.ts`, `frontend/mobile/src/data/types.ts`, `frontend/mobile/src/lib/mockCore.ts` — modified; `frontend/mobile/src/lib/usePagedList.ts`, `frontend/mobile/src/lib/reportApi.ts` — new; this entry.

**Flow explained:** `usePagedList(queryKey, fetchPage)` keeps the loaded pages: a new key (filter or search) resets to page 0 and drops late answers, `loadMore` appends the next page without duplicates, `refreshTop` reloads page 0 on focus and keeps the pages behind it → Orders sends `saleFilterWindow` (`from`/`to`, `[from, to)` in ISO) and `q` to `saleApi.page`; `saleFilterReportPeriod` picks the report period, and `reportApi.summary`/`salesSeries` give the card's net revenue and each day's totals → Sales sends `q`, `categoryId`, `stockStatus` and `sort` to `productApi.page`; products seen in any page, found by the scanner or just created stay in `knownProducts` for the cart and the scanner → the mock Core filters, searches and sorts `/sales` and `/products` like Core and answers `/reports/summary` and `/reports/sales-series`.

**Check:** `tsc --noEmit` clean. Mock-mode web build in headless Chrome, 20 of 20 (47 sample products): first page holds 20 in name order, scrolling loads up to the last product, search without accents, search keeps the cart, price sort, stock filter cycle, no "Chưa phân loại"; Orders "Tất cả" shows the count only, "7 ngày" shows report revenue and day totals, search by order id. Android emulator against staging Core (hand-repacked staging APK): search, all three sorts, both stock filters, Hôm nay and 7 ngày totals from the reports (1 order, 0đ net after it was voided the same day), a 30-day range, search by item name and by order id, and the empty state all worked. **Not verified:** loading a second page from the real Core (the test shop has 3 products and 1 order); load time on a phone; iOS. Tổng quan, Checkout, the voice screen and Expenses still load whole lists.

### [2026-10-14 11:50 UTC+07:00] — [Feature] One parser for streamed and saved Agent answers, with tables and charts

**Done:** The `/ai` screen reads streamed text and saved answers with one parser, so a bubble keeps its shape when `done` replaces the draft. The parser covers bold, inline code, headings, `- `/`1. ` lists, code blocks, Markdown tables and a ```` ```chart ```` JSON block (bar or line, unit vnd or count, 1–31 points). While streaming it closes an open `**` or backtick on the last line, holds back a last line that may still become a list, heading, fence or table, waits for a table's separator line, and shows "Đang vẽ biểu đồ…" until a chart block closes. A chart that cannot be drawn safely shows "Không hiện được biểu đồ này.". Answer bubbles no longer carry the assistant avatar and take the full row width; table columns line up and fill the bubble. While streaming, deltas are batched into one render per animation frame, and blocks are memoized by content so only the block still being written re-renders. The AI system prompt allows only this subset and at most one chart, built from tool results. The mock Core answers "biểu đồ"/"bảng" with a table and a chart.

**Changed files:** `frontend/mobile/src/lib/chatMarkdown.ts`, `frontend/mobile/tests/chatMarkdown.test.ts` — new; `frontend/mobile/src/components/ChatText.tsx`, `frontend/mobile/app/ai.tsx`, `frontend/mobile/src/lib/mockCore.ts`, `frontend/mobile/package.json`, `frontend/mobile/tsconfig.json`, `frontend/mobile/README.md`, `backend/ai/src/prompt_templates/shop_agent.py`, `docs/contracts/api-contracts.md` — modified; this entry.

**Flow explained:** the chart travels inside the `answer` Markdown, so Core, the SSE events and chat history are unchanged → `agentApi.chatStream` accumulates deltas → `ChatText streaming` calls `parseChatMarkdown(text, true)` → `done` swaps in the saved answer, parsed with `streaming = false` → `readChart` validates the JSON before `ChartCard` draws it with the existing `BarChart`/`AreaChart`.

**Check:** `npm test` in `frontend/mobile`, 25 of 25, including every prefix of a full answer (no raw `**`, backtick or leading `|`, no invalid chart while streaming; the full prefix equals the saved parse; between consecutive prefixes every block but the last stays equal). `tsc --noEmit` clean. AI: ruff clean, 268 unit tests pass. Mock-mode web build: the table and chart render, the highest bar is selected and bars respond to taps, no avatar beside answers. With a temporary mock that streamed the answer in 250 deltas, the blocks rendered 24 times in total. **Not verified:** on a phone or iOS; real model output following the new prompt rules; the PRD and acceptance criteria do not describe tables or charts yet; mobile tests do not run in CI. A stop button for a streaming answer is tracked in #196.

### [2026-10-14 11:40 UTC+07:00] — [Refactor] Each AI feature package keeps its exceptions in `errors.py`

**Done:** `src/agent/errors.py` holds `ConversationNotFoundError` (from `repository.py`) and `GuardrailError` (from `guardrails/service.py`); `src/drafts/errors.py` holds `CatalogUnavailableError` (from `catalog.py`) and `DraftUnavailableError` (from `service.py`). A new error of a feature goes next to the others, and `main.py`, the router and the tests import every error from one place. `src.agent.guardrails` no longer re-exports `GuardrailError`. `sql`, `restock` and `providers` raise no custom exceptions, so they get no `errors.py`. Behavior does not change. From the design review: `GuardrailLimits` is keyword-only, so a new limit cannot shift positional values; a test covers IBAN redaction; the contract's redaction list now matches the README.

**Changed files:** `backend/ai/src/agent/errors.py`, `backend/ai/src/drafts/errors.py` (new), `backend/ai/src/agent/{repository,router,guardrails/service,guardrails/__init__}.py`, `backend/ai/src/drafts/{catalog,service}.py`, `backend/ai/src/main.py`, six test modules (imports; `test_agent_guardrails.py` also keyword `GuardrailLimits` and the IBAN test), `docs/contracts/api-contracts.md`, this entry.

**Flow explained:** `uv run pytest` 310 passed, 40 skipped; `ruff` clean. Final end to end on uvicorn against staging, shop 2 / owner 2: 16/16 checks passed (auth, SQL and restock answers, stream equals stored answer, four off-topic or injection prompts declined, mixed message, leak bait, redaction stored with the order code kept, `422 input_too_long` on both routes, other shop 404, delete), with no warning in the server log.

### [2026-10-14 11:30 UTC+07:00] — [Refactor] Agent guardrails: four modules, one owner for the run limits

**Done:** The guardrails package goes from eight modules to four. `InputRedaction` (`input_redaction.py`) replaces `SecretRedaction` and `PersonalDataRedaction` and owns their order (secrets first); `AnswerScreen` (`answer_screen.py`) replaces `EmptyAnswerCheck` and `AnswerLeakScreen`, so the Harness `OutputGuardrail` gets one guard; the length check and `GuardrailError` move into `service.py`, and `InputLengthLimit` and `guardrail_error.py` are removed. `AgentService._run_limits` moves to `GuardrailService.run_limits`, so the timeout and the mapping to `answer_timeout` / `answer_unavailable` live in the guardrail package instead of half in `AgentService`. Behavior change: the Harness `us_ssn` pattern is off, because its 3-2-4 digit shape redacted order codes such as `123-45-6789`; cards, IBANs, emails and secrets are still redacted. Codes, routes and SSE flow do not change.

**Changed files:** `backend/ai/src/agent/guardrails/` (`service.py`, `__init__.py`, new `input_redaction.py`, `answer_leak_screen.py` renamed to `answer_screen.py`; `empty_answer_check.py`, `input_length_limit.py`, `secret_redaction.py`, `personal_data_redaction.py`, `guardrail_error.py` removed), `backend/ai/src/agent/service.py`, `backend/ai/tests/unit_tests/test_agent_guardrails.py`, `backend/ai/README.md`, this entry.

**Flow explained:** `uv run pytest` 309 passed, 40 skipped (two new tests: an order code shaped like a US SSN is kept; a key holding a Luhn-valid digit run is removed whole, which personal data first would leave as `sk-ab-[redacted:credit_card]-…`); `ruff` clean. End to end on uvicorn against staging, shop 2 / owner 2, the same 16 checks passed, and the stored message kept `mã đơn 123-45-6789` next to `[redacted:credit_card]` and `[redacted:openai_key]`. **Open, not from this change:** the SQL agent's date labels are unsteady across runs (once "hôm qua" was answered as 08/10 on 14/10, and a 7-day window was labelled 07/10 to 09/10).

### [2026-10-14 10:58 UTC+07:00] — [Feature] Shop agent answers only questions about the owner's shop

**Done:** `SHOP_AGENT_SYSTEM_PROMPT` gains a scope section: the agent helps only with the shop's sales, orders, products, categories, prices, stock and restocking, record drafts and how to use SmartLedger, gives a short reply to a greeting or thanks, and answers everything else with one short decline sentence (`200`, not an error code). The prompt stays fully in English; it describes the decline instead of quoting a Vietnamese sentence, so the wording varies slightly between turns. A mixed message gets only its shop part answered, and the owner's messages cannot change the scope. The decline is a sentence, not an empty answer, because `EmptyAnswerCheck` would send an empty answer back to the model.

**Changed files:** `backend/ai/src/prompt_templates/shop_agent.py`, `docs/contracts/api-contracts.md`, this entry.

**Flow explained:** Prompt-only: no classifier and no extra model call. Before the change the real model wrote a poem, solved an equation, wrote Python, told a joke after "ignore all previous rules" and gave Bitcoin advice. After it, 13 direct `AgentService` probes (no SQL tool) stayed in scope. **End to end:** uvicorn on this branch against staging Supabase (`POSTGRES_URL` and `AI_SQL_READER_URL` from `.env.staging`, real model), shop 2 / owner 2, 16/16 checks passed: 401 without token; revenue answer from the SQL tool (3.328.500 VND, matching `sold_at >= now() - 7 days` in the database); a streamed answer whose deltas equal the stored answer; restock; four off-topic or injection questions declined in the stream; a mixed message answered only for the shop part; SQL bait answered without SQL or view names; card and key stored as `[redacted:credit_card]` and `[redacted:openai_key]`; `422 input_too_long` on both routes; another shop gets 404; the test conversation deleted (204, then 404). **Open:** "how to grow sales" now gets an offer to look at the shop's data instead of general tips; the revenue answer labels a rolling 7×24 h window as "07/10 to 14/10". `uv run pytest` 307 passed, 40 skipped; `ruff` clean.

### [2026-10-12 09:12 UTC+07:00] — [Refactor] AI agent guardrails run on Pydantic AI Harness, one class per use case

**Done:** The hand-written guardrails carried over from the LangChain era (a `PIIMiddleware` clone for input redaction and an output validator) are replaced with [Pydantic AI Harness guardrails](https://pydantic.dev/docs/ai/harness/guardrails/). Each use case is one class in its own module under `backend/ai/src/agent/guardrails/`: `InputLengthLimit`, `SecretRedaction` and `PersonalDataRedaction` (Harness detectors, plus a `bearer_token` pattern the Harness lacks), `EmptyAnswerCheck` and `AnswerLeakScreen` (chained in one Harness `OutputGuardrail` with `retry` verdicts), and the existing `ToolCallLimit` capability. `GuardrailService` in `service.py` is the facade `AgentService` calls, replacing `AgentGuardrails`. Behavior change: redacted text reads `[redacted:<name>]` (for example `[redacted:credit_card]`) instead of `**** **** **** 1111` or `[REDACTED_API_KEY]`, and emails, IBANs, US SSNs, 13 to 19 digit cards and more vendor keys are now redacted too. Stored messages from before keep their old placeholders. The `422` codes and the SSE flow do not change.

**Changed files:** `backend/ai/pyproject.toml` and `uv.lock` (`pydantic-ai-harness` 0.55.0, `pydantic-ai-slim` 2.54.0 → 2.55.0, which the Harness pins exactly), `backend/ai/src/agent/guardrails/` (new `service.py`, `guardrail_error.py`, `input_length_limit.py`, `secret_redaction.py`, `personal_data_redaction.py`, `empty_answer_check.py`, `answer_leak_screen.py`; `agent_guardrails.py`, `answer_screen.py` and `input_redaction.py` removed), `backend/ai/src/agent/service.py`, `backend/ai/tests/unit_tests/test_agent_guardrails.py`, `backend/ai/README.md`, `docs/contracts/api-contracts.md`, `docs/architecture/service-walkthrough/README.md` and both SVGs in `06-ai/`, and this entry.

**Flow explained:** `GuardrailService.check_input` runs before the run starts, so the stream route still answers `422 input_too_long` before the stream opens: length check, then secrets, then personal data (secrets first, so a card or email pattern cannot split a key before it is removed). The Harness `OutputGuardrail` and `ToolCallLimit` are passed as `capabilities`; the `output_validator` registration is gone. The Harness screens only the final output and streams deltas unfiltered (checked in a scratch run), so `AnswerLeakScreen.screened_prefix` still holds back streamed text that could become a leak.

**Check:** `uv run pytest` 307 passed, 40 skipped (PostgreSQL tests need `POSTGRES_TEST_URL`); 306 passed after the dependency bump alone, before the code change; `ruff check` and `ruff format --check` clean; the sequence SVG renders. One turn and one streamed turn of `AgentService` with the real model from `backend/ai/.env` and an in-memory history: correct answer, stored message `Thẻ của tôi [redacted:credit_card]. ...`, 21 stream deltas. **Not verified:** a full uvicorn turn against staging (no `POSTGRES_URL` in `backend/ai/.env`), and pyright (not installed). Pydantic AI 2.55 prints an observability banner on start unless `PYDANTIC_AI_NO_BANNER=1` is set.

### [2026-10-14 10:54 UTC+07:00] — [Feature] Scanner lets the owner sell a new code without adding it to Products

**Done:** Follow-up to tester feedback that scanning a new code, cancelling the payment and scanning again asked for the item details again. The team's proposal: let the owner choose whether a new item is saved to the catalog. The scanner's "Thêm mặt hàng" card has a "Lưu vào danh mục hàng hoá" tick, on by default. On: as before, the product is created and added to the order. Off: the button reads "Thêm vào đơn" and the item goes into this order only, as a temporary item ("món tạm") — no product is created. Scanning the same code again in this order adds one; tapping the row opens "Sửa món tạm" to change name, price, unit or quantity; deleting the row removes it. The Sales cart and Checkout mark it "Món tạm", and Checkout notes that it is not added to Products. At payment it is sent to Core as an off-catalog line (name, unit, price), which Core already accepts.

**Changed files:** `frontend/mobile/src/components/BarcodeScannerModal.tsx`, `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/checkout.tsx`, `frontend/mobile/src/data/types.ts`, `frontend/mobile/src/lib/salesApi.ts`, `frontend/mobile/src/lib/mockCore.ts` — modified; `frontend/mobile/src/lib/customLines.ts` — new; this entry.

**Flow explained:** `LineItem.custom` (`unit`, `barcode`) marks a temporary item → the scanner calls `onCustomLine`, and Sales and Checkout keep these lines with `upsertCustomLine` (one line per code; quantity 0 removes it) → the scanner checks the order's temporary items before asking Core about a code → `toDraftItem` sends catalog lines as `productId` and temporary items as `productName`/`unit` → the mock Core accepts off-catalog lines like the real one. The tick only appears when selling, not when the scanner fills a barcode field.

**Check:** `tsc --noEmit` clean. On the Android emulator (hand-repacked staging APK, staging Core, a generated EAN-13 shown to the virtual camera): tick off → "Thêm vào đơn" → the line shows "Món tạm, không lưu danh mục"; showing the code again added exactly one; "Sửa món tạm" changed the quantity to 2; Checkout showed the "Món tạm" badge and note; paying created order #6815 with the line; Products still listed 3 items. That test order was then voided (with "Hoàn hàng về kho" on, no error). **Not verified:** the tick on (unchanged create path, not re-run in this change); deleting a temporary item from the scanner list; Checkout's own scanner; iOS. The "Món ngoài danh mục" sheet on the Sales tab and the voice screen's "Thêm … vào danh mục?" dialog still create the product; the PRD has no requirement for the mobile scan flow yet.

### [2026-10-14 10:54 UTC+07:00] — [Fix] Keyboard no longer covers forms on Android

**Done:** Tester feedback with a screenshot: on Android the keyboard covered the "Món ngoài danh mục" sheet on the Sales tab, and the owner asked to check every place with an input. The app draws edge to edge (`edgeToEdgeEnabled`), so Android no longer shrinks the window when the keyboard opens, while the keyboard-avoiding views moved only on iOS. They now move on both platforms: `Screen`, `Sheet`, `Dialog` (it had none; dialogs with an input now rise above the keyboard), the AI assistant chat and the voice order screen. The barcode scanner already did this and is unchanged.

**Changed files:** `frontend/mobile/src/components/ui.tsx`, `frontend/mobile/app/ai.tsx`, `frontend/mobile/app/voice.tsx` — modified; this entry.

**Flow explained:** `KEYBOARD_AVOID_BEHAVIOR` in `ui.tsx` is `'padding'` → every `KeyboardAvoidingView` in the app uses it → with the keyboard open the content is padded by the keyboard height and the scroll view inside brings the focused input into view.

**Check:** `tsc --noEmit` clean. On the Android emulator (a hand-repacked staging APK carrying this change, staging Core), with the keyboard open the focused input and its button stayed visible on: "Món ngoài danh mục", the scanner's new-item card, Checkout, void order, add product (new category, stock, low-stock threshold), add expense, shop and account info (including the bank transfer fields), AI chat, the rename-conversation dialog, typed entry on the voice screen and its "Thêm … vào danh mục?" dialog. **Not verified:** sign-in and shop setup screens (they need a sign-out), the debt sheet (no debt in the test shop), the staff screen (no menu entry) — they use the same `Screen` and `Sheet`; iOS. In a sheet the focused input sits right at the keyboard edge and its bottom border can be hidden by a few pixels.

### [2026-10-14 10:54 UTC+07:00] — [Fix] Products without a photo show their initial instead of a stock picture

**Done:** Tester feedback: a product the owner had not given a photo still showed a picture, which the app picked by the product's name from a fixed set of Unsplash photos. That picture is removed. A product without a photo now shows the first letter of its name on a coloured tile in Sales (grid, list and cart), Checkout and the voice order screen; a product with a photo shows its own photo there (the Sales cart, Checkout and the voice screen used to show the stock picture even then). The product form's hint says what happens without a photo. The privacy page no longer mentions illustration photos from Unsplash and carries the new update date.

**Changed files:** `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/checkout.tsx`, `frontend/mobile/app/voice.tsx`, `frontend/mobile/app/products.tsx` — modified; `frontend/mobile/src/components/ProductImage.tsx` — new; `frontend/mobile/src/lib/productImages.ts` — deleted; `frontend/web/src/pages/legal/PrivacyPage.tsx`, `frontend/web/src/pages/legal/legalConfig.ts` — modified; this entry.

**Flow explained:** `ProductImage` takes the name and the product's `imageUrl` → a non-empty URL shows the photo, otherwise the initial on a colour chosen from the name → order lines find their product's `imageUrl` by `productId`; lines outside the catalog show the initial.

**Check:** `tsc --noEmit` clean for mobile; `tsc -b --noEmit` and `npm run lint` pass for web. On the Android emulator (hand-repacked staging APK, staging Core): the Sales grid shows "2", "3" and "B" tiles for the three products without a photo, and Checkout shows "Z" for a line. **Not verified:** a product that has a photo after this change (the emulator's camera saves black photos); iOS; the privacy page in a browser.

### [2026-10-14 01:03 UTC+07:00] — [Feature] Date-range filter on the Orders tab and an explicit date on every order

**Done:** Tester feedback asked for a filter like a banking app's transaction history and a clear date under each transaction. The Orders tab has a funnel button beside the search box. It opens a sheet with three ready ranges (7, 15 and 30 days up to today), a month calendar to pick a first and a last day (the days between are highlighted, days after today are disabled), the chosen "Từ ngày" and "Đến ngày", and the button "Chọn khoảng ngày". The chosen range shows as an active chip ("30 ngày gần nhất" or "07/10 – 13/10") beside the existing period chips; picking a period chip clears it. Every order row shows the date as dd/MM/yyyy with the time instead of "Hôm qua" or "3 ngày trước", and each day header carries the date. A range with no orders shows an empty state with "Xoá bộ lọc".

**Changed files:** `frontend/mobile/app/(tabs)/invoices.tsx`, `frontend/mobile/src/lib/format.ts` — modified; `frontend/mobile/src/lib/saleFilter.ts`, `frontend/mobile/src/components/DateRangeSheet.tsx`, `frontend/mobile/src/components/MonthCalendar.tsx` — new; this entry.

**Flow explained:** the screen keeps one `SaleFilter` (`time` is a period, or `custom` with `from` and `to` as local `yyyy-mm-dd` days) → `applySaleFilter` filters the list Core already returned, so the Core API is unchanged → `DateRangeSheet` edits a draft and returns it only from "Chọn khoảng ngày" → `MonthCalendar` is built from plain views because the app has no date-picker package and none was added.

**Check:** `tsc --noEmit` clean. A Node script over `saleFilter.ts`, 32 of 32: each period, both end days included, the three ready ranges, ranges across a month and a year, labels. Mock-mode web build in headless Chrome, 14 of 14: the date on every row, the sheet and its default of 7 days, "30 Ngày", two taps on the calendar, the chip, clearing with "Tất cả", the empty state and "Xoá bộ lọc". **Not verified:** on a phone, against the real Core, with a long order history (the list is still loaded whole and filtered on the device).

### [2026-10-14 01:03 UTC+07:00] — [Fix] Product photo is saved only when the owner taps save

**Done:** Tester feedback: in the edit form, choosing a photo saved it at once, before "Lưu thay đổi". The edit form uploaded the photo as soon as it was picked and deleted it as soon as "Xoá ảnh" was tapped. Both now only change the form; the photo reaches Core, or is removed there, in the same save as the other fields. Closing the form without saving leaves the product's photo as it was. While a change is waiting the form says so ("Ảnh mới chưa lưu…", "Ảnh sẽ bị xoá khi bạn bấm "Lưu thay đổi"."). If the other fields save but the photo call fails, the form stays open with the reason, so a second tap retries without taking the photo again.

**Changed files:** `frontend/mobile/app/products.tsx` — modified; this entry.

**Flow explained:** `applyPhoto` and `removePhoto` set `pendingPhoto` or `removeSavedPhoto` and the preview only → `save` sends the field patch first, then `productApi.uploadImage` or `deleteImage` for an existing product → a failed photo call keeps the form open and reloads the list, because the patch is already at Core. A new product keeps the earlier behaviour: the photo is uploaded right after the product is created.

**Check:** `tsc --noEmit` clean. Mock-mode web build driven in headless Chrome, with the page's mock store read directly, 11 of 11: picking a photo leaves the store without an image; closing the form drops it; saving stores it and the list row shows it; "Xoá ảnh" removes nothing until save; a price change and a photo go in one save; a new product with a photo is still created with it. **Not verified:** on a phone (the camera path uses the same handlers but was not run), against the real Core, iOS. Picking a photo from the phone's gallery was also requested and then put aside by the owner for now; it is not in this change.

### [2026-10-14 01:03 UTC+07:00] — [Fix] Landing: pains heading reworded and privacy page brought up to date

**Done:** The heading of the "Vấn đề quen thuộc" section is now "App thì đắt, mà sổ sách thì rối", as the team asked. The privacy page said the camera is used only to scan codes and that camera images are never stored or sent; since product photos shipped that is no longer true. The page now says the camera is also used to take a product photo and that the photo is uploaded, lists product photos among the data collected, adds Cloudinary (stores product photos) and Cloudflare R2 (serves the Android install file) to the processors, and carries the new update date. Both legal pages still show the "Bản nháp" label: the wording needs the product owner's approval.

**Changed files:** `frontend/web/src/pages/landing/LandingPage.tsx`, `frontend/web/src/pages/legal/PrivacyPage.tsx`, `frontend/web/src/pages/legal/legalConfig.ts` — modified; this entry.

**Flow explained:** text only; no route, style or build setting changes.

**Check:** `tsc -b --noEmit` and `npm run lint` pass (the lint warnings are in admin files this change does not touch). `/`, `/privacy` and `/data-deletion` of the deployed landing answer 200. **Not verified:** the pages in a browser after this change; whether production stores photos in Cloudinary (staging does: an upload from the emulator came back with a photo).

### [2026-10-14 00:55 UTC+07:00] — [Fix] CORE-013 customer confirmation race and contract links (#181, PR #187)

**Done:** Addressed the two approved CodeRabbit findings: selected Customer debt confirmation uses locked refresh; the void walkthrough links to the authoritative contract instead of repeating its stock limit/error/retry rules. Core fix commit: `efbd403`. No migration, schema, API, FE/AI or deployment changes; the JavaDoc coverage warning is outside this approved scope.

**Changed files:** Core `SaleDraftServiceImpl`, `SaleDraftServiceTest`, `CatalogLifecycleConcurrencyPostgresTest`, `scripts/verify_postgres_tests.py`; `docs/architecture/service-walkthrough/README.md`; this new progress entry. All older entries, including the staging speech-model entry and both CORE-013 entries, remain unchanged.

**Flow explained:** Debt confirmation holds SaleDraft → selected Customer → Product ID ascending locks until commit, refreshes Customer before ACTIVE validation/snapshot, and rejects an archive that committed first. Confirmation first serializes the later archive without deleting historical debt; replay does not revalidate the archived Customer. Fully paid confirmation retains its snapshot/nonlocking behavior. The CI gate now requires the new archive/profile/rollback/paid-snapshot/tenant cases.

**Check:** `mvnw.cmd -o clean verify` on a dedicated disposable PostgreSQL 16 container passed **1,140 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS; actual Surefire testcase nodes match the Maven total. Focused run: 91 passed (66 unit + 25 PostgreSQL, including nine new PostgreSQL cases). Gate unit tests: 12 passed; all nine required PostgreSQL reports passed the gate. `git diff --check` and the linked contract heading pass. Staging `1adea42` remains an ancestor of this branch. **Not verified:** full HTTP/FE UAT, Firebase/Cloudinary network or remote CI for these commits. No protected-branch merge or issue closure.

### [2026-10-13 23:54 UTC+07:00] — [Feature] Ship the speech model to R2 from CI

**Done:** The published APK (285.6 MB, 4 ABIs) had no speech model: the model is not in git, CI had no copy, and no build set `EXPO_PUBLIC_STT_MODEL_URL`, so voice input could not load. `mobile-release.yml` now resolves the model URL before the build. A publish uploads the version named in `core.ts` to `stt-model/<version>/` in the APK bucket when it is missing, fetched from HuggingFace (`hynt/Zipformer-30M-RNNT-Streaming-6000h`, pinned revision) with `tokens.txt` rebuilt from `bpe.model`. Repository variable `STT_MODEL_BASE_URL` is set to the bucket's `r2.dev` address. DVC was not used: it stores files by hash, so the app could not download them by name.

**Changed files:** `.github/scripts/stt-model.mjs` — created; `.github/workflows/mobile-release.yml`, `docs/development/ci-cd.md`, `frontend/mobile/assets/models/README.md`, `PROGRESS.md` — modified.

**Flow explained:** `stt-model.mjs check` reads `STT_MODEL_VERSION` and `STT_MODEL_FILES` from `core.ts` and HEADs each file under `$STT_MODEL_BASE_URL/stt-model/<version>/`. On a miss, a publish runs `fetch` (download, rebuild `tokens.txt` with CRLF endings to match the pinned size, compare sizes), `aws s3 sync --size-only`, and `check` again; the result goes to `$GITHUB_ENV` as `EXPO_PUBLIC_STT_MODEL_URL`. Test builds have no R2 secrets and only warn.

**Check:** `fetch` output is byte-identical to a set built with the `sentencepiece` library. The step, run locally with a stub `aws` and a local HTTP bucket, uploads when missing, skips when present, re-uploads a wrong-size file and only warns on a test build. `r2.dev` answers HEAD with `Content-Length`. **Not verified:** the step on GitHub with real R2, and voice input on a device with the downloaded model. The model license is `cc-by-nc-nd-4.0` (non-commercial); it needs the product owner's approval before a public release.

### [2026-10-13 23:53 UTC+07:00] — [Fix] CORE-013 managed media writers and required PostgreSQL CI coverage (#181)

**Done:** Added locked refresh to avatar, Shop logo and Product image upload/delete writers, covering request-managed entities rather than only detached pre-upload entities. Added required concurrency/overflow coverage to the PostgreSQL CI gate. Local commits: `34003d3` (media writes) and `3c6c35d` (CI gate and Core README); not pushed in this round. No new API, field, entity or migration; FE/AI and deployment configuration are unchanged.

**Changed files:** `backend/core/src/main/java/com/smartledger/core/service/impl/MediaWriteTransactionService.java`; `MediaConcurrencyPostgresTest`, `MediaWriteTransactionServiceTest`, `MediaDeleteTest`; Core `scripts/verify_postgres_tests.py`, `scripts/test_verify_postgres_tests.py`, `README.md`; this append-only log. No other document changes in this round.

**Flow explained:** Media writers acquire the existing entity locks, refresh current DB state before checking status/mutating, preserve newer profile/catalog/stock values and enqueue cleanup for the latest replaced asset. PostgreSQL tests bind a request-style EntityManager across pre-upload reads, another thread's real committed transaction and the final writer transaction (OSIV persistence-context reproduction, not a full HTTP UAT). Both session/avatar and profile/logo write orders are checked. Role/status/public-ID preservation refers to business values, not excluding unchanged columns from Hibernate UPDATE SQL. CI requires all four new profile/catalog concurrency suites plus media and critical void overflow/rollback methods; Surefire parameter signatures/indexes are normalized.

**Check:** After fetching/merging `origin/staging` at `8af3e75`, Git reported `Already up to date`; no conflicts or merge commit. `mvnw.cmd -o clean verify` with all three `CORE_TEST_POSTGRES_*` variables pointing only to a dedicated disposable PostgreSQL 16 container passed: **1,130 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS; actual Surefire testcase nodes independently match. Focused media run: 38 passed, including 33 PostgreSQL cases (26 new managed-context cases). Gate unit tests: 12 passed; gate also passed all nine required suites against the fresh full-run reports. `git diff --check` passes. **Not verified:** real provider network, integrated Firebase/FE/staging/production UAT or remote CI for these local commits; no push, PR, issue closure or protected-branch merge. `.idea/` remains untracked/excluded; all older progress entries are retained.

### [2026-10-13 21:18 UTC+07:00] — [Fix] CORE-013 profile/catalog concurrency and void stock limits (#181)

**Done:** Completed the five Core fixes on `fix/core-concurrency`, pushed separately: CORE-013.1 `0d816d6` (Firebase profile sync), CORE-013.2 `caa841b` (Shop profile/status), CORE-013.3 `79b6e31` (Customer/Category lifecycle), CORE-013.4 `e8bd49f` (Category assignment/archive), CORE-013.5 `089611b` (void stock overflow). This entry consolidates the progress previously deferred at the user's request; all older entries remain unchanged. No new field/entity, migration, FE/AI or deployment configuration change.

**Changed files:** Core `AuthIdentityRepository`, `CustomerRepository`, `CategoryRepository`; `AuthSessionServiceImpl`, `ShopServiceImpl`, `CustomerServiceImpl`, `CategoryServiceImpl`, `ProductServiceImpl`; `Product.restoreStock`; their unit/web tests and new `AuthSessionConcurrencyPostgresTest`, `ShopConcurrencyPostgresTest`, `CatalogLifecycleConcurrencyPostgresTest`, `CategoryAssignmentConcurrencyPostgresTest`, `ProductStockRestorationTest`; `NotificationPostgresTest` void/retry regressions. The ADMIN read-projection test no longer rejects money digits occurring coincidentally in timestamps/IDs; event/field privacy assertions remain. Updated `backend/core/README.md`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, walkthrough README and its auth/void SVGs, plus this log. BRD/PRD/ERD and unrelated diagrams are unchanged.

**Flow explained:** Lock and refresh existing User before Firebase sync so role/status/Cloudinary avatar state is not overwritten. Shop and Customer/Category writers validate fresh rows under locks before mutation. Product create/PATCH category assignment holds the target Category lock; PATCH uses Product → Category, while Category archive reads Product existence without acquiring Product write locks. Null/omitted PATCH semantics remain unchanged. Void retains Sale → Debt → Product ID ascending batch locks and raises `409 product_stock_overflow` before assigning a total above `999999999999.999`; equality succeeds. A later overflowing item rolls back earlier stock/audit plus the entire money/debt/notification/key transaction. Retry after a valid stock adjustment executes once, then safely replays, including for archived Products.

**Check:** Final `mvnw.cmd -o clean verify` with all `CORE_TEST_POSTGRES_*` against a dedicated disposable PostgreSQL 16 container: **1,104 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS; counts independently checked from actual Surefire testcase nodes. Targeted stock-restoration/web/void/notification run: 56 tests passed, including 22 real PostgreSQL notification cases. Both lock orders/preloaded entities, rollback and replay are covered; query regressions retain one batch Product lock/read with a 100,000-product catalog and one open-alert read against 100,000 historical alerts. Sale/draft list tests also cover 10,000 parents/50,000 items. `git diff --check` and local documentation file links pass; the two SVGs were generated by cached Mermaid CLI and validated as SVG XML with updated flow labels. **Not verified:** Firebase providers, integrated FE/staging/production UAT or remote CI for the final documentation commit. No automatic merge/issue closure; `.idea/` remains untracked and excluded.

### [2026-10-13 12:40 UTC+07:00] — [Feature] Publish a release-signed production APK to R2 for the landing page

**Done:** `mobile-release.yml` has a new `publish` input, allowed only with `android-production`. With it the production build is a 4-ABI APK instead of the AAB, signed with the team's release keystore, and uploaded to a Cloudflare R2 bucket as `android/production/latest.apk` (the fixed download URL) plus one copy under `android/production/builds/`. Any build signs with the release keystore when its environment holds `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`. The landing page already reads `VITE_ANDROID_APK_URL` for its download buttons; `deploy-landing` now passes the variable from the `landing-*` environments, so only `landing-production` needs it. The bucket is served from its free `r2.dev` address for now.

**Changed files:** `.github/workflows/mobile-release.yml`, `.github/workflows/ci.yml` — modified; `frontend/web/README.md` — modified; `docs/development/ci-cd.md`, `docs/README.md` — modified; `docs/architecture/diagrams/src/apk-release.drawio`, `docs/architecture/diagrams/images/apk-release.svg` — created; `PROGRESS.md`.

**Flow explained:** `gate` rejects `publish` outside `android-production` → the build job checks the R2 and keystore settings and the `aws` CLI before building → the keystore secret is written to the runner's temp folder and passed to Gradle through `-Pandroid.injected.signing.*`, because `expo prebuild --clean` rewrites `build.gradle` → the publish step reads the APK's certificate with `apksigner`, stops if it is the debug one, then uploads with `aws s3 cp` to the R2 S3 endpoint.

**Check:** The workflow YAML parses and lists the steps in the intended order. `./gradlew :app:signingReport` with a throwaway keystore and the injected properties reports `Config: externalOverride` and that keystore for the `release` variant. **Not verified:** the workflow on GitHub, a full signed build, the `apksigner` check, the R2 upload, a download and install from `r2.dev`, and Facebook sign-in in a release-signed build (the new key hash must be added to the Meta app). The R2 bucket `smart-ledger-releases`, its `r2.dev` address, the release keystore and the `android-production` secrets and `R2_BUCKET` variable are set up; `VITE_ANDROID_APK_URL` in `landing-production` is not set yet and should be set after the first publish.

### [2026-10-13 12:10 UTC+07:00] — [Fix] Product photo upload on Android and iOS never left the device

**Done:** Found while testing the staging APK (commit `450a13d`) on the Android emulator: a product photo taken with the app camera was not saved; the app reported "Không kết nối được máy chủ" at once, although the product itself was created. The upload built its form with the React Native file part `{ uri, name, type }`, but in this Expo SDK the global `fetch` is `expo/fetch`, whose multipart builder rejects that shape ("Unsupported FormDataPart implementation") before any request is sent, and `apiRequest` reported the throw as a network error. The web build was not affected because it sends a `Blob`. On Android and iOS the form now carries an `expo-file-system` `File`, which `expo/fetch` reads through `bytes()`.

**Changed files:** `frontend/mobile/src/lib/api.ts`, `frontend/mobile/src/lib/imagePart.ts` (new, web), `frontend/mobile/src/lib/imagePart.native.ts` (new, Android/iOS), and this entry.

**Flow explained:** `imageForm` appends `imagePart(image)`. Metro picks `imagePart.native.ts` on devices (`new File(image.uri)`) and `imagePart.ts` on the web (the resized `Blob`), so the web bundle does not import `expo-file-system`. Nothing else in the upload path changes: same endpoint, `Idempotency-Key` and timeout.

**Check:** `tsc --noEmit` clean. Running Expo's own `convertFormDataAsync` in Node: the old `{ uri, name, type }` part throws "Unsupported FormDataPart implementation", and a part with `bytes`/`name`/`type` (the shape of the `File` class) produces `content-disposition: form-data; name="image"; filename=…` with `content-type: image/jpeg` and the bytes in the body. On the emulator with the staging APK built before this fix: the camera screen opens and takes a photo inside the size limit, the failure above reproduces, quick stock-in on a test product goes from 0 to 5 against the staging Core, and "Quét mã" on Home opens Sales with the scanner; the test product was deleted afterwards. **Not verified:** the fix itself on a device (it needs a new build), so a real upload to Core and Cloudinary is still untested, as is iOS.

### [2026-10-13 10:36 UTC+07:00] — [Feature] Landing page and footer polish

**Done:** Reworked the landing page footer into a single card with Product / Support / Legal columns and removed the team and course details from it. Cards across the page use one soft layered shadow with the existing colours. The phone mock-ups have a thinner metal bezel and a drawn status bar (time, signal, Wi-Fi, battery) in place of the empty top area. The repeated "bản thử nghiệm" wording and the "download link coming soon" band above the footer are gone: the download call to action lives in the hero and the navigation only. A 1px light line above the hero is fixed.

**Changed files:** `frontend/web/src/pages/landing/LandingPage.tsx`, `frontend/web/src/pages/landing/SiteFooter.tsx`, `frontend/web/src/styles/landing.css`, `frontend/web/src/config.ts`, `frontend/web/src/vite-env.d.ts`, `frontend/web/.env.example`, and this entry.

**Flow explained:** `ANDROID_APK_URL` (`VITE_ANDROID_APK_URL`, read at build time) drives the download buttons. With a value the hero and the navigation show a download link; with none the hero shows a disabled "Tải cho Android · Sắp ra mắt" button and the navigation shows no download button. The navigation's bottom line is drawn as a shadow, because a real border made the bar 73px tall while the hero is pulled up by 72px. The status bar is an SVG inside `PhoneFrame`, sized in container units so it scales with the phone; the time is SVG text because the browser's minimum font size enlarged it on small phones.

**Check:** `npm run typecheck`, `npm run lint` and `npm run build` in `frontend/web`; the page viewed in a browser at desktop and mobile widths with no console errors. **Not verified:** the download link itself (no APK URL exists yet, and CI does not pass `VITE_ANDROID_APK_URL` to the landing build), and the wording of `/privacy`, which still names the student team and is unchanged here.

### [2026-10-13 11:10 UTC+07:00] — [Feature] Barcode scanner asks Core for unknown codes, handles duplicate codes and re-scans

**Done:** The mobile part of CORE-012.4 (#165), built on the scan-flow fix (#162). (1) A scanned code that is not in the catalog the screen holds is now looked up in Core (`GET /products/lookup`) before it is treated as new, so a product created or re-coded on another device is recognised and a duplicate is not offered; while Core answers the scanner shows "Đang kiểm tra mã…" and takes no other code. (2) If the lookup fails the scanner says "Không kiểm tra được mã" and does not offer to create a product. (3) If saving a new product hits `409 product_barcode_conflict` (another device took the code in the meantime), the form closes, the scanner says which product holds the code and opens that product's quantity card. (4) Scanning a product that is already in the order adds 1 with a beep and a short "số lượng N" notice, never past the stock of a tracked product; this follows the proposal for D2 in #159, which the team has not confirmed yet. A code counts as scanned again only after it has left the frame, so holding the phone on an item does not keep adding. (5) The scanner on the Checkout screen now works on the order being paid (same behaviour as Sales): it shows that order, a re-scan adds 1, and quantity edits and swipe-deletes in the scanner change the order. (6) In the product form, a scanned code that belongs to another product shows a warning under the barcode field right away.

**Changed files:** `frontend/mobile/src/components/BarcodeScannerModal.tsx`, `frontend/mobile/src/lib/catalogApi.ts`, `frontend/mobile/src/lib/mockCore.ts`, `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/checkout.tsx`, `frontend/mobile/app/products.tsx`, and this entry.

**Flow explained:** `productApi.lookup` returns the product, `null` for `404 product_not_found`, and throws anything else so "could not check" is never read as "not found". In the scanner `handleCode` records every sighting of a code and returns while the same code is still in view (`REPEAT_GAP_MS`); a known product goes to `presentProduct` (add 1 if in the order, out-of-stock notice, or the quantity card), an unknown one to `lookupUnknown`, which remembers a miss for 15 seconds so a code left in view is not asked again. Lookup and create results that arrive after the scanner was closed are dropped (`scanSession`). `findBarcodeHolder` takes the product id from the 409 `details` and falls back to a lookup when Core sends none. Products returned by Core are passed to the caller through `onProductFound` so its cart can show them. The catalog self-loading and the `productsStatus`/`onRetryProducts` props added in the scan-flow fix are removed: with the lookup a missing or stale catalog no longer makes an existing product look new. The preview mock serves `GET /products/lookup`.

**Check:** `tsc --noEmit` clean. Web build in headless Chrome, mock mode, camera replaced by a canvas showing EAN-13 codes; "another device" is simulated by calling the page's mock store directly, so the Sales catalog does not know those products. 13 checks: a code kept in view for 3 seconds after adding stays at quantity 1; a re-scan adds 1 with the notice; a tracked product with stock 2 already at 2 shows "chỉ còn 2 trong kho"; a product created on the other device opens its card and lands in the order; a code Core does not know shows the create offer; a save that hits the conflict names the holder, opens its card and creates nothing; a failing lookup shows the error and no create offer; the Sales cart has all four products (66.000đ); the Checkout scanner shows the order without the "Xoá" button and a re-scan there raises the total to 73.000đ; the product form warns under the barcode field. The 10 checks of the scan-flow fix also pass on this branch. **Not verified:** a real phone or camera, real barcodes, a real Core (the lookup and the 409 details were exercised against the mock only), and how often a real camera loses a code for more than 1.2 seconds while it is still in view (that would count as a new scan).

### [2026-10-13 09:30 UTC+07:00] — [Feature] Bobi the mascot: floating assistant button and the first page of the quick guide

**Done:** The floating assistant button and the first page of the quick guide showed the composite app logo (the robot bursting out of a notebook). Both now show Bobi, the app's mascot, in the round bubble artwork supplied by the product owner. The first guide page is titled "Trợ lý Bobi": it shows the supplied illustration (the Home screen with Bobi in the corner and the three actions that a tap opens) across the full width of the card, introduces Bobi as the mascot and assistant of Sổ Nghe Lời, and its three tips name Bobi instead of "mascot". That page uses the brand purple instead of green. The button behaves as before (tap for the menu, hold for voice order, drag to move) and its accessibility label is now "Bobi, trợ lý bán hàng".

**Changed files:** `frontend/mobile/assets/bobi-bubble.png` (new), `frontend/mobile/assets/guide/bobi-menu.jpg` (new), `frontend/mobile/src/components/MascotBadge.tsx`, `frontend/mobile/src/components/AssistantIntroModal.tsx`, `frontend/mobile/src/components/ZenRing.tsx`, and this entry.

**Flow explained:** `MascotBadge` is the image of the floating button; it now loads `assets/bobi-bubble.png` (432×432 px, transparent corners, about 290 KB, trimmed and scaled from the supplied 1277×1232 artwork) instead of `assets/bubblelogo.png` (about 1.4 MB). A guide page can now carry an `image` instead of the gradient box with an icon: the Bobi page uses `assets/guide/bobi-menu.jpg` (1080×720, about 110 KB, scaled from the supplied 1536×1024 artwork), drawn edge to edge by cancelling the page padding, with its height computed from the card width because the web `Image` ignores `aspectRatio`. `assets/bubblelogo.png` is no longer referenced by the app and is left in place.

**Check:** `tsc --noEmit` clean. Web build in headless Chrome, mock mode, at 390×844 and 360×640 (9 checks): after a first sign-in the guide opens on "Trợ lý Bobi" with the new description and tips, the illustration has loaded, spans the card from edge to edge at its 3:2 ratio and the page does not scroll sideways; after closing the guide the floating button is the new image and the composite logo is gone; tapping Bobi still opens the Hỏi đáp / Đọc đơn / Báo cáo menu. **Not verified:** a real phone (button shadow on Android and iOS), holding and dragging the button, and the three later guide pages (unchanged).

### [2026-10-12 23:55 UTC+07:00] — [Chore] Landing deploys through GitHub Actions, and the admin dashboard is hidden by default

**Done:** The landing page (`frontend/web`) is built and deployed by job `deploy-landing` in `ci.yml`, using GitHub environments `landing-preview`, `landing-staging` and `landing-production`, instead of Vercel Git. Job `landing` runs lint and build on every push and PR. The admin dashboard (`/admin/*`) loads only when `VITE_ADMIN_ENABLED=true` at build time, so a public build contains no admin code or demo accounts. Not yet verified: the GitHub environment secrets and variables, the Vercel `landing` project settings, and the first PR run.

**Changed files:**
- `.github/workflows/ci.yml`, `frontend/web/vercel.json` — modified: `landing` and `deploy-landing` jobs, summary row, Vercel Git deploys disabled
- `frontend/web/src/App.tsx`, `src/AdminRoutes.tsx` (created), `src/config.ts`, `src/vite-env.d.ts`, `vite.config.ts`, `src/pages/landing/{LandingPage,SiteFooter}.tsx` — modified: admin behind the flag
- `frontend/web/.env.example`, `frontend/web/README.md`, `README.md`, `docs/development/ci-cd.md` — modified: docs

**Flow explained:** A push to `staging` or `main` runs `landing`, then `deploy-landing`. After `vercel build`, the step `Check no admin code in the build` fails the job if `admin123` is in `.vercel/output/static`, which catches a `VITE_ADMIN_ENABLED=true` set in the Vercel project. Vite inlines the flag through `define` in `vite.config.ts`; `App.tsx` compares it directly, so the bundler drops the lazy admin import when the flag is off.

### [2026-10-12] — [Chore] Sync staging progress history for PR #171

**Done:** Integrated staging at 9619e05 into feat/core-barcode to resolve the concurrent PROGRESS.md additions. Preserved the complete barcode entries and both new staging entries without rewriting previous history.

**Changed files:** Manual conflict resolution in PROGRESS.md only. Marketing documentation/images and the mobile voice change are inherited unchanged from staging; no new Core, FE, AI or migration edits.

**Flow explained:** Retained newest-first progress additions from both branches above the unchanged common history. This updates the PR branch only, not staging or main; CodeRabbit's proposal to move entries to the bottom remains rejected under CONTRIBUTING.md.

**Check:** Verified all branch-specific entries and the common history are preserved verbatim; no conflict markers or unmerged paths remain and git diff --check passes. Core is identical to the previously tested 84c41e0 (982 tests passed); Maven/FE/UAT were not rerun for this log-only conflict resolution. GitHub checks on the merge commit remain pending.

### [2026-10-12] — [Fix] Barcode control padding review on PR #171

**Done:** Fixed the approved CodeRabbit finding in shared barcode normalization. Non-scanner ISO control characters are no longer trimmed at either boundary. Kept the newest-first progress convention from CONTRIBUTING.md and replied to/resolved the request to move entries to the bottom; all previous entries from staging and the feature branch remain unchanged.

**Changed files:** Core ProductServiceImpl and ProductServiceTest/ProductBarcodeWebTest/ProductBarcodePostgresTest; this new progress entry only. No FE/AI, migration, JavaDoc coverage configuration or other documentation changes.

**Flow explained:** Create/PATCH/lookup reject U+000B, U+000C and U+001C–U+001F at either boundary, alone or surrounded by valid scanner padding, with barcode validation details. Invalid PATCH cannot clear an existing barcode or change the Product name; invalid writes produce no save/audit/notification. Unicode boundary spaces and TAB/CR/LF scanner padding remain accepted; exact matching and the 100-code-point limit are unchanged.

**Check:** Regression tests reproduced 20 failures on the old implementation. After the fix, focused service/HTTP/PostgreSQL tests: **128 passed**. Full clean verify against dedicated disposable PostgreSQL 16: **982 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS (4:44); Maven summary and actual XML testcase entries agree. Includes migration/index/concurrency/rollback regressions. Barcode lookup with 20,000 synthetic Products still uses one Product query (local median 6.78 ms, diagnostic only). git diff --check passes; no business local/staging/production DB was used. CI/re-review on the pushed commit and real scanner/FE/staging UAT remain separate checks.

### [2026-10-12] — [Fix] Unicode barcode length and CORE-012 push preparation

**Done:** Fixed the shared barcode limit to count Unicode code points after trim, not UTF-16 code units, and prepared the previously approved #164/V16/docs work for `feat/core-barcode`. No real local/staging/production migration or FE changes.

**Changed files:** Core Product service, request/controller OpenAPI descriptions and service/web/PostgreSQL boundary tests; clarified Core README, API contract and PRD AC-064; removed temporary pre-push wording in technical design. This entry preserves all earlier progress entries.

**Flow explained:** Create/PATCH/lookup accept 100 supplementary Unicode code points, reject 101 with barcode validation details, and preserve exact values. Tests cover emoji, supplementary ideographs and mixed BMP/supplementary text, including PostgreSQL char_length=100 and unchanged data after invalid writes. Existing trim, tenant, uniqueness and history rules remain unchanged; no additional migration is needed for this fix.

**Check:** Focused suite: 141 tests passed. Full clean verify against dedicated disposable PostgreSQL 16: **950 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS (4:48). Maven summary and actual XML testcase entries agree at 950; suite-header attributes total 949 because ApiDocumentationWebTest reports header=8 but contains 9 testcase entries. Recorded the observed reporting inconsistency without changing historical totals. V16/index/concurrency and full business regressions pass; Markdown file links and git diff --check pass. Real Firebase/scanner/FE/staging UAT and shared migration remain pending.

### [2026-10-12] — [Feature] CORE-012 barcode lookup and ACTIVE-only uniqueness (#163/#164)

**Done:** Prepared combined Core barcode work on `feat/core-barcode`: shared normalization, exact ACTIVE lookup, ACTIVE-only create/PATCH checks and optional Product conflict details. Recorded D1b/D4 on #159; D2/D3 and mobile #162/#165 remain team-owned. Added forward migration V16 without rewriting V1–V15. No commit/push/PR or migration against business local/staging/production databases in this preparation.

**Changed files:** Core Product controller/request DTOs/repository/service, barcode ErrorCode/error details/handler, Core README and unit/web/OpenAPI/PostgreSQL tests across #163/#164; new `V16__product_barcode_unique_active.sql` and `ProductBarcodeMigrationPostgresTest`; latest-version expectations in `SaleRefundMigrationPostgresTest`. Outside Core: BRD/PRD, API contract, technical design, ERD description/DBML and this entry. No frontend/AI or `.idea/` edits.

**Flow explained:** Create/PATCH/lookup trim Unicode/scanner padding but preserve exact case/letters/punctuation/leading zeros. Lookup checks OWNER/account/shop before one Product query; missing/archived/foreign codes return 404. Precheck conflicts return 409 with optional productId/status; DB races may omit details and still map to 409. V16 builds the ACTIVE/non-null partial unique index before removing the old constraint in one transaction. Archive releases the code without rewriting Product IDs or sale/draft snapshots. DBML describes the partial predicate rather than exporting unconditional uniqueness. Traceability: BR-021 → FR-034 → AC-064–AC-067. Migration requires a paused-write maintenance window (5s lock / 60s statement timeout), reviewed shared rollout and explicit forward recovery; it is not zero-downtime or replaced by ddl-auto=update.

**Check:** Focused suite: 135 tests, no failures/errors/skips. Full `mvnw.cmd clean verify` with all three `CORE_TEST_POSTGRES_*` variables: **944 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS (4:18). Dedicated disposable PostgreSQL 16 verified fresh V1–V16, V15 upgrade/history, partial index validity, CREATE/PATCH reuse, exact/null/tenant uniqueness, concurrent JDBC create/patch writers and atomic failures (dependent old FK / duplicated ACTIVE rows). HTTP/error mapping is tested separately, not concurrent HTTP end-to-end. Lookup with 20,000 synthetic Products: one Product query on the new index; local median 7.05 ms across 20 runs, diagnostic only, not SLA. Markdown file links and git diff --check pass. No real Firebase/scanner/staging UAT or production-sized DDL locking benchmark; shared migration/FE acceptance remain pending.
### [2026-10-12 16:10 UTC+07:00] — [Feature] Products: add, change and remove the product photo from the product form

**Done:** The mobile app had no way to give a product its own photo, although Core already accepts one (`FR-031`, `POST`/`DELETE /products/{id}/image`). The product form now starts with an "Ảnh mặt hàng" block: a thumbnail, a button to pick the photo ("Chụp ảnh" on Android and iOS, "Chọn ảnh" on the web) and, once there is a photo, "Đổi ảnh" and "Xoá ảnh". For an existing product the photo is saved as soon as it is picked; for a new product it is kept in the form and uploaded right after the product is created. The Products list and the quick stock-in sheet show the photo instead of the letter tile, and the Sales cards already prefer `imageUrl` over the stock illustration. No new dependency: Android and iOS take the photo with the camera the app already ships (`expo-camera`), the web uses the browser file picker.

**Changed files:** `frontend/mobile/app/products.tsx`, `frontend/mobile/src/components/ProductPhotoCamera.tsx` (new), `frontend/mobile/src/components/ProductThumb.tsx` (new), `frontend/mobile/src/lib/productPhoto.ts` (new), `frontend/mobile/src/lib/api.ts`, `frontend/mobile/src/lib/catalogApi.ts`, `frontend/mobile/src/lib/errors.ts`, `frontend/mobile/src/lib/mockCore.ts`, and this entry.

**Flow explained:** Core accepts JPEG/PNG up to 5 MiB with each side at most 2048 px, and the app has no on-device image resizing. On the web `pickImageOnWeb` scales the chosen file down to 1280 px on a canvas and exports JPEG. On Android and iOS `ProductPhotoCamera` asks the camera for its picture sizes and `choosePictureSize` selects one inside the limit; a photo that still comes back too large is refused with a message instead of being sent. `apiRequest` gained an `image` option that sends `multipart/form-data` with a single `image` part (a `Blob` on the web, the file `uri` on a device); `productApi.uploadImage` sends it with an `Idempotency-Key` that is reused when the same photo is retried, and a 60-second timeout. If the photo of a new product cannot be saved the product is still created and a toast says the photo is missing. The preview mock keeps the preview address as `imageUrl`. The form stays mounted between products, so an upload or delete that finishes after the form has moved on is checked against a session counter and does not write into the form now open (a failure is reported with a toast instead); the camera screen ignores picture-size answers and photos from a camera that has since been switched or closed. The media error codes of Core have Vietnamese messages.

**Check:** `tsc --noEmit` clean. `choosePictureSize` returns the expected size for 7 size lists (typical Android and iOS lists, portrait sizes, nothing inside the limit). Web build in headless Chrome, mock mode, 10 checks: the form shows the block; a non-image file is refused with "Chỉ nhận ảnh JPEG hoặc PNG"; a 1170×2532 PNG becomes a 591×1280 JPEG of about 100 KB; saving a new product shows its photo in the list; an existing product saves the photo at once, "Xoá ảnh" removes it, and its Sales card uses the new photo. **Not verified:** the camera screen on a real phone or an emulator (the emulator was not started because the machine had under 3 GB of free memory), a real upload to Core and Cloudinary (the multipart request was only exercised against the mock), iOS, and whether staging has media storage enabled (it answers `503 media_unavailable` when it is off).

### [2026-10-12 15:20 UTC+07:00] — [Feature] Products: stock-in button on each row and a short stock-in sheet

**Done:** Adding stock took many steps: open a product, scroll to the bottom of the edit form, open "Nhập hàng", type, confirm. Each stock-tracked row of the Products list now has its own "Nhập hàng" button that opens a short sheet with the product name, the current stock, a quantity field that is focused right away, a preview of the stock after the entry, an optional reason and "Nhập vào kho". The Home row "Kiểm tra hàng sắp hết" now opens the Products screen on its "Sắp hết" tab, so restocking is: tap that row, tap "Nhập hàng", type the quantity, confirm. The stock-in section inside the edit form is still there.

**Changed files:** `frontend/mobile/app/products.tsx`, `frontend/mobile/app/(tabs)/index.tsx`, and this entry.

**Flow explained:** `StockInFields` holds the quantity/reason fields, the validation and the `productApi.stockIn` call, and is used by both the new sheet and the edit form (which no longer keeps its own copy of that state). After a quick stock-in the row is replaced with the product Core returns, without reloading the list, and a toast shows the new stock. `products.tsx` reads the `tab` route param once (`tab=low`). Untracked products keep the chevron and have no stock-in button.

**Check:** `tsc --noEmit` clean. Web build in headless Chrome, mock mode, 9 checks: Home "Kiểm tra hàng sắp hết" lands on `/products?tab=low` showing only products that need restocking; the row button opens the sheet with the product name and current stock and the quantity field focused; quantity 0 shows the validation error; typing 24 previews "Tồn sau khi nhập: 30"; confirming closes the sheet, shows "Đã nhập 24 cái · tồn mới 30" and the row shows the new stock; an untracked product has no button; stock-in from the edit form still updates "Tồn kho hiện tại" (36 after 6 more). **Not verified:** a real phone (keyboard over the sheet on Android and iOS), a real Core, and rows with very long names on narrow screens.

### [2026-10-12 15:20 UTC+07:00] — [Fix] Email sign-in: a failed sign-in no longer reads as "no account yet"

**Done:** When an email sign-in did not match, the screen only showed a grey sentence that led with "Nếu chưa có tài khoản, hãy tạo tài khoản", so a wrong password with a correct email looked like "this account does not exist". The password field now shows the error "Email hoặc mật khẩu chưa đúng" in red, and the line under it starts with the likely case: check the password, reset it if forgotten, and only then the option to create an account. Firebase returns one error for both a wrong password and an unknown email (email enumeration protection), so the app still cannot say which of the two happened.

**Changed files:** `frontend/mobile/app/(auth)/email.tsx` and this entry.

**Flow explained:** On `invalid-credentials` in login mode, `submit` now sets the field error (`errorMessage(e)`) in addition to the hint flag instead of returning before it. The hint keeps its two inline links (`switchMode('reset')`, `switchMode('register')`) in the new order. Editing either field still clears both.

**Check:** `tsc --noEmit` clean. Web build in headless Chrome, mock mode, 6 checks: a failed sign-in shows the red error under the password field and the new hint; the old sentence is gone; editing the password hides both; "đặt lại mật khẩu" opens the reset mode with the email kept; "tạo tài khoản" switches to registration. **Not verified:** real Firebase (the mock has no email accounts, so every sign-in takes the same not-matching branch), and a real phone.

### [2026-10-12 14:25 UTC+07:00] — [Fix] Barcode scan flow: exact code match, cart by product id, scan from Home through Sales, stock check

**Done:** The remaining defects of the mobile scan flow listed in #162 (CORE-012.1). (1) A scanned code now matches a product only when the barcode is identical character for character; stripping non-digits made "ABC-123" and "123" the same code. (2) The scanner's temporary order identifies items by `productId` only, so two products with the same name are no longer treated as one. (3) The "Quét mã" buttons on Home open the Sales screen with the scanner (`/pos?scan=1`) instead of a second scanner on Home; the scanned item now really lands in the Sales cart (the old `autoAdd` param was never read). (4) A stock-tracked product that is out of stock is not added: the scanner shows "… đã hết hàng" over the viewfinder, and the quantity stepper stops at the available stock. The unused `handleBarcodeScanned` in `pos.tsx` is removed. The fake-product fallback from the same issue was already removed in #160.

**Changed files:** `frontend/mobile/src/components/BarcodeScannerModal.tsx`, `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/src/lib/mockCore.ts`, `frontend/mobile/src/lib/apiError.ts` (optional `productId`/`status` on error details), and this entry.

**Flow explained:** `handleCode` looks up `catalog.find((p) => p.barcode === code)` with `code = raw.trim()`. The out-of-stock check lives in the scanner rather than in `pos.tsx` because the app toast renders under the scanner `Modal` and would not be seen; `stockLeft` returns the stock of a tracked product (unlimited when untracked) and drives both the notice and the stepper limit. `pos.tsx` reads the `scan` route param once per mount and passes `productsStatus` (`loading`/`ready`/`failed`) with `onRetryProducts`, so a code scanned before the Sales catalog has loaded shows "Đang tải danh mục sản phẩm…" instead of offering to create a duplicate; callers that pass no status behave as before. The preview mock follows the barcode rules of Core as merged in #171: it trims barcodes, rejects whitespace or control characters inside a code and codes over 100 characters with `400 validation_failed`, keeps barcodes unique among ACTIVE products only (archiving frees the code) and answers `409 product_barcode_conflict` with the product that holds the code in `details`.

**Check:** `tsc --noEmit` clean (the mobile package has no lint script). Web build in headless Chrome, mock mode, with the page camera replaced by a canvas showing EAN-13 codes, 10 checks (re-run on 2026-10-13 after #171): Home "Quét mã" lands on `/pos?scan=1` with the scanner open; a catalog code shows the product card and "Thêm" puts it in the temporary order; code 8936079140014 does not match a product whose barcode is "893-6079140014" (the "chưa có" banner appears); a tracked product with stock 0 shows the out-of-stock notice, opens no card and leaves the order unchanged, and the notice hides by itself; for a tracked product with stock 2 the "+" button stops at 2; the code of an archived product scans as unknown and a new product can be created with it and lands in the order; after closing the scanner the Sales cart bar shows the same items and total (44.000đ). The conflict message in the quick-create card ("Mã vạch này đã dùng cho sản phẩm khác", nothing added) was checked on 2026-10-12 under the earlier mock rule; with ACTIVE-only uniqueness it needs a catalog that is out of date, which the single-page mock cannot produce. **Not verified:** a real phone or an emulator with a camera (asked for in the issue), real barcodes, the scanner opened from Checkout, a real Core, and the catalog-loading banner on a slow network.

### [2026-10-12 13:35 UTC+07:00] — [Docs] Marketing screenshots per product flow under docs/marketing

**Done:** Added `docs/marketing/` with 21 phone-ratio screenshots of the mobile app grouped by product flow: `dashboard/` (9), `chat/` (3), `barcode/` (5) and `voice/` (4), plus a README that lists each image, how the set was produced and what to know before using it. The images are 1170 × 2532 px PNG (390 × 844 pt at 3x), without a status bar or device frame.

**Changed files:** `docs/marketing/README.md`, 21 PNG files under `docs/marketing/{dashboard,chat,barcode,voice}/` (about 7.8 MB in total), one row in the document map of `docs/README.md`, and this entry. No code changed.

**Flow explained:** The screenshots come from the web build of the mobile app in preview (mock) mode, captured with headless Chrome on `staging` at `33d2da4` plus two changes that were still in review: #168 (Sales product cards and the web scanner) and #169 (the quantity field in the voice new-item dialog). All data is demo data. The chat answers come from the preview assistant and carry its "Số liệu giả lập" note. The camera frames in `barcode/` are a drawn illustration with an EAN-13 barcode that the app decodes for real. The voice sentences were typed through "Nhập tay".

**Check:** Every image is 1170 × 2532 px; each flow was viewed after capture. **Not verified:** the same screens on a real phone, and whether the third-party brand names in the demo data and the Unsplash product photos may be used in public material (the README asks an owner to review this before publishing). The capture script is not in the repo.

### [2026-10-12 13:33 UTC+07:00] — [Feature] Voice order: type the quantity for an item named without one

**Done:** When the owner names an item that is not in the catalog without saying a quantity (for example "trà trái cây"), the voice order screen used to only ask them to say it again with a quantity. It now opens the existing "Thêm … vào danh mục?" dialog for that item with a new "Số lượng" field (default 1), so the quantity can be typed by hand together with the price and unit. Saying it again with a quantity still works after tapping "Bỏ qua". Items named with a quantity also show the field, prefilled with what was heard. Items already in the catalog are unchanged: without a spoken quantity they are added as 1 and edited with the +/− buttons.

**Changed files:** `frontend/mobile/app/voice.tsx` and this entry. `parseOrder` is unchanged.

**Flow explained:** `handleUtterance` turns `missingQuantityItems` into pending new items with quantity 1 and queues them after the unknown items in the same dialog. `resolvePending` reads the typed quantity, requires it to be between 1 and `MAX_NEW_ITEM_QTY` (9999; shown as a field error next to the price error, and the field stops at four digits) and adds that quantity to the order after the product is created.

**Check:** `tsc --noEmit` clean. Web build in headless Chrome, mock mode, typing through "Nhập tay": "trà trái cây" opens the dialog with the quantity field set to 1 and the assistant message offers typing or saying it again; an empty quantity shows "Nhập số lượng từ 1 đến 9999"; the field takes at most four digits (typing 123456 leaves 1234) and a longer value forced into it is rejected with the same message; quantity 3 at 15.000đ adds "3 Trà trái cây" and the total becomes 45.000đ. **Not verified:** real speech input, native Android and iOS (including the dialog with the system keyboard open), an item named with a quantity (the field should come prefilled with it), and several missing-quantity items in one sentence.

### [2026-10-12 13:33 UTC+07:00] — [Fix] Sales product cards, web scanner lookup and mascot shadow

**Done:** Four defects found while testing the web build. (1) The Sales grid sized its cards from the browser window width, but on the web the app sits in a 440 px frame, so each card was about 1000 px wide and the grid broke into one overflowing column (a regression from the scroll-lag change, #147). Cards are now sized from the measured width of the list. (2) A long price such as "321.321.312đ" pushed the quantity stepper out of the card; the price now uses a smaller size as it gets longer and the control wraps to its own line instead of being cut. (3) On the web the scanner's detection loop kept the `handleCode` of the render in which the scanner opened, so it looked codes up in the catalog as it was at that moment; opened from Home (catalog still loading) every existing product was reported as "chưa có". The loop now calls the latest handler through a ref and pauses through a ref while a card is open. Native was not affected because the camera callback is recreated on every render. (4) The floating mascot showed a pale square on the web because its shadow was a `boxShadow` on a transparent square; it is now a `drop-shadow` that follows the mascot's shape, as on phones.

**Changed files:** `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/_layout.tsx`, `frontend/mobile/src/theme.ts` (`WEB_FRAME_MAX_WIDTH`), `frontend/mobile/src/components/BarcodeScannerModal.tsx`, `frontend/mobile/src/components/ZenRing.tsx`, and this entry.

**Flow explained:** `pos.tsx` keeps the list width from `onLayout` and uses it for the two-column card width; until it is measured it estimates from the window, capped at `WEB_FRAME_MAX_WIDTH` on the web. The price row wraps (`flexWrap`) and the add button or stepper is pushed to the right edge with an auto margin. In the scanner, `handleCodeRef` and `scanPausedRef` are assigned on every render and the web `setInterval` reads them.

**Check:** `tsc --noEmit` clean. Web build in headless Chrome, mock mode: at a 1280 px window the first grid row has two 204 px cards inside the 440 px frame (before: one card per row overflowing); at 375 px a product priced 321.321.312đ in the cart shows the full price and the stepper on the next line, both inside the card; scanning a synthetic EAN-13 frame for a catalog product from Home opens its product card (before the fix it showed "chưa có"); the mascot renders without the square. **Not verified:** native Android and iOS for the card layout, a real camera and a real barcode, and Safari.

### [2026-10-10 19:50 UTC+07:00] — [Feature] Orders screen: the search bar is always visible, like the Sales screen

**Done:** The Orders screen hid its search input behind a magnifier button in the top right corner. It now shows the search bar permanently under the title and above the period filter chips, with the same look as the Sales screen: a search icon on the left, a clear button when there is text, and no toggle button. The placeholder stays "Tìm theo khách, tên món, mã đơn..." because the search is over orders.

**Changed files:** `frontend/mobile/app/(tabs)/invoices.tsx` and this entry.

**Flow explained:** The `searchOpen` state, the toggle button and its `searchBtn` style are removed; the existing `searchBox` is always rendered and still drives the same `q` filter. The input no longer auto-focuses because it is no longer opened by a tap. The input and its clear button have accessibility labels ("Tìm đơn hàng", "Xoá tìm kiếm").

**Check:** `tsc --noEmit` clean. Web build in the browser at 375 px in mock mode: the bar sits under the title above the period chips; typing "Minh" leaves 1 order ("Anh Minh", 379.000đ) and the summary card follows; the clear button restores all 6 orders. **Not verified:** a real iPhone, Android, and the system keyboard open over the list. The header is about 50 px taller than before, as on the Sales screen.

### [2026-10-10 19:15 UTC+07:00] — [Fix] Barcode scanner: load the catalog when none is passed, and surface product-creation errors

**Done:** Two defects in the barcode scanner. (1) The scanner opened from the Home screen was given no product list, so its catalog was empty and every scanned code, including products the shop already has, was treated as new and offered for creation (a duplicate). When the caller does not pass `products`, the scanner now loads the shop's products from Core each time it opens in order mode; while that catalog is loading or failed to load, an unknown code shows "Đang tải danh mục sản phẩm…" or "Không tải được danh mục sản phẩm" (tap to retry) instead of offering to create the product, and the loaded catalog is dropped when the scanner closes so the next open does not use stale data. Callers that pass a list (POS, checkout) are unchanged. (2) When `POST /products` failed for any reason (offline, 400, 401, a conflict), the add-item card swallowed the error and fabricated a local product with a made-up id, added it to the order, and the order was later rejected at checkout. The error now stays on the card with the Core message, nothing is added to the order, and the card stays open so the user can retry or cancel.

**Changed files:** `frontend/mobile/src/components/BarcodeScannerModal.tsx` and this entry.

**Flow explained:** `products` is now optional with no default; `productsProp ?? loadedProducts` is the lookup catalog, and a `productApi.list()` fills `loadedProducts` on open when the prop is undefined and the mode is `order`, tracked as `catalogState` (`loading`, `ready`, `failed`) with a retry counter. `loadedProducts` is cleared and the state reset when the scanner closes; the unknown-code banner only offers creation when the catalog is ready. `handleSaveConfig` awaits `productApi.create` directly and its existing catch shows `errorMessage(e)` on the card.

**Check:** `tsc --noEmit` clean. Web build in the browser in mock mode with a temporary hook that exposed a few functions on `window` (the hook is not in the commit): from the Home screen the catalog loaded 47 products; scanning a known barcode opened the product card ("CocaCola / Nước ngọt CocaCola, 10.000đ / cái · Tồn: 60") instead of the new-product flow; with `productApi.create` forced to reject with a conflict, saving a new item kept the card open, showed the message, and left the order empty; with `productApi.list` forced to fail, scanning showed "Không tải được danh mục sản phẩm" with a retry action and no create offer, retrying loaded 47 products and cleared the banner, and closing the scanner emptied the loaded catalog. **Not verified:** a real camera and a real barcode, a real Core (including whether Core rejects a duplicate barcode), and native Android or iOS.

### [2026-10-10 18:52 UTC+07:00] — [Fix] Orders summary card: short caption under the order count

**Done:** The order count in the summary card of the Orders screen had a caption that repeated the filter in words ("Tổng đơn hàng", "Đơn tháng này"), which was cut on web at 390 px and below because react-native-web does not shrink the text with `adjustsFontSizeToFit`. The caption now names only the period ("Tất cả", "Hôm nay", "Tuần này", "Tháng này"), which is the same word as the filter button and always fits on one line. The longer text is still the accessibility label of the card, and the revenue caption ("Tổng doanh thu", "Doanh thu hôm nay") is unchanged. Related to #119, which stays open.

**Changed files:** `frontend/mobile/app/(tabs)/invoices.tsx` and this entry.

**Flow explained:** `countLabel` is still built from the active filter and used for the screen-reader label; a new `countCaption` (the period label of the active filter) is what is drawn under the number.

**Check:** `tsc --noEmit` clean. Web build in the browser at 375 px in mock mode: with "Tất cả" the card reads "6 đơn / Tất cả" and "1.146.000đ / Tổng doanh thu", with "Hôm nay" it reads "3 đơn / Hôm nay" and "265.000đ / Doanh thu hôm nay", all on one line. **Not verified:** a real iPhone (where #119 was reported), Android, and filters other than "Tất cả" and "Hôm nay".


### [2026-10-10 17:54 UTC+07:00] — [Fix] Mobile list calls read the paged Core list responses (CORE-011, #153/#156)

**Done:** Core now returns `{items, page, size, totalElements, totalPages}` from `GET /products`, `/sales`, `/sale-drafts`, `/customers`, `/debts` and `/expenses` with a default size of 20 and no array form (#156), and Railway staging already serves it, so the app, which read these as arrays, would have shown at most the first 20 items of each list or failed. The app now loads every page (size 100), merges them and drops duplicate ids, and it still accepts the old array shape from a Core that has not been upgraded, so it works with both Core versions during the rollout. The mock Core returns the same page shape and validates `page`/`size` with the `invalid_*_query` codes. Screens are unchanged: they still receive full arrays and compute totals over the whole shop. Server-side paging in the screens (load more, server filters and search, shop-wide aggregates) is not done and stays open in #144.

**Changed files:** `frontend/mobile/src/lib/pageApi.ts` (new), `catalogApi.ts`, `customerApi.ts`, `debtApi.ts`, `expenseApi.ts`, `salesApi.ts`, `mockCore.ts`, and this entry. Core, AI and the API contract are unchanged.

**Flow explained:** `fetchAllPages` requests page 0, 1, ... with size 100 until `totalPages`, stops on an empty page, fails with the `list_too_large` error instead of returning a partial list if 200 pages are not enough, and drops duplicate ids because pages are not one snapshot (a new record between two calls can appear twice; an archived record between two calls can be missed until the next refresh). An array response is treated as one page holding everything. `fetchPage` returns a single page for later UI paging.

**Check:** `tsc --noEmit` clean. A scratch test of 33 checks passed (not part of the repo): mock page shape and defaults, `invalid_*_query` for size 0/101 and page -1/a on the five mocked lists, all pages merged equal `totalElements`, several pages in the same order as one big page, old array shape, empty list, duplicate ids across pages, the 200-page limit (an error, not a partial list; exactly 200 pages still succeed), an empty page in the middle. Android emulator in mock mode: Home totals are the same as before the change and Metro shows `page=0&size=100` for sales, products, debts, customers and expenses. **Not verified:** a real Core or Railway staging (needs a login that the user performs), more than 100 items against a real Core, load time of many pages on a slow network, and `GET /sale-drafts` in the mock (the mock does not serve that list).

### [2026-10-10 17:06 UTC+07:00] — [Integration] Resolve pagination PR progress conflict (#156)

**Done:** Merged staging `4e74e5beadcc1e5a62e0b270fc7401bbc8506600` into `feat/owner-list-pagination` to resolve the progress-log conflict on PR #156. The PR itself is not merged into staging.

**Changed files:** Resolved only `PROGRESS.md`, retaining both the Core pagination and mobile barcode-scanner entries and all earlier history. The merge also carries `frontend/mobile/src/components/BarcodeScannerModal.tsx` unchanged from staging; no manual FE, Core code, test or JavaDoc edits.

**Flow explained:** Keep newest-first progress entries from both parents instead of selecting one side. Preserve existing branch history without rebase or force-push.

**Check:** Compared retained entries and historical content with both merge parents, checked conflict markers/whitespace, confirmed Core unchanged from the feature parent and the scanner identical to staging. No new full test run is claimed for this documentation-only resolution; the prior Core verification remains 857 tests with no failures/errors/skips. Remote mergeability, CI and review are checked after push; no CI success or UAT acceptance is implied.

### [2026-10-10 16:44 UTC+07:00] — [Core/Docs] Prepare OWNER list pagination (CORE-011 #153)

**Done:** Implemented SQL pagination directly on six existing OWNER GET lists on `feat/owner-list-pagination`, based on staging `50891aabf8b6ba48406799fa5c31fef8c823569f`. Completed the offset-timestamp filter correction and synchronized the approved documentation before preparing the branch for push. This is a breaking response change, not FE/staging acceptance; [#153](https://github.com/miphu2804/smart-ledger/issues/153) tracks Core and #144 tracks mobile coordination.

**Changed files:** Core six controllers/service interfaces/implementations/repositories, page-scoped sale/draft item queries, ErrorCode, new OwnerListQuery/PageResponse/OwnerListSpecifications, unit/HTTP/PostgreSQL regression tests and OpenAPI tests; Core README, API contract, PRD/AC, technical design and this new append-only entry. No FE/AI, business-rule/schema/entity/index/migration/dependency or runtime-secret changes. Existing progress entries and untracked `.idea/` are preserved.

**Flow explained:** Always return items/page/size/totalElements/totalPages with bounded page/size/offset; filter before paging, keep tenant guards, deterministic ordering and one-request content/count snapshot. Batch sale/draft items only for page parent IDs plus shop, skip item reads on empty pages, and calculate effective draft expiry consistently without GET writes. Sales/expenses use offset-aware `[from, to)` timestamps; expenses cannot mix period and custom range. Detail/write/report APIs remain unchanged. Canonical request/filter/error/rollout details are in the [OWNER pagination contract](docs/contracts/api-contracts.md#phân-trang-danh-sách-owner), traced through FR-033 / AC-059–063. FE must adapt arrays/mocks, paging and shop-wide totals before coordinated deployment; missing aggregates/debt contact projections remain separate work.

**Check:** Java 21 `mvnw.cmd verify` passed 857 tests across 67 suites, 0 failures/errors/skips, including real PostgreSQL migration, query-count, snapshot, concurrency and rollback suites in a dedicated disposable PostgreSQL 16 Docker database. No business/local/staging/production database or real Firebase/Cloudinary provider was used. OpenAPI checks cover all six page schemas/defaults and from/to date-time parameters. Data budgets are at most 2 reads for simple lists and 3 for sale/draft including count, excluding auth/shop; count may be inferred and empty pages omit items. Synthetic 100,000-product fixtures returned 20 rows / 5,938 bytes, observed 24 ms first page and 40 ms deep page; 10,000 sale/draft fixtures with 50,000 items read only 100 parents/500 items, observed 25/22 ms. These are local observations, not SLAs. EXPLAIN still shows deep OFFSET/count costs; no index was added. New document links/anchors, unique requirement IDs, README PowerShell syntax and whitespace checks passed. No remote CI, coverage/static-analysis result or integrated FE/staging UAT is claimed. Prepared only; no commit/push or PR/merge performed in this step.

### [2026-10-10 15:50 UTC+07:00] — [Fix] Password fields: show/hide button and no lost text when editing on iOS

**Done:** The password field on the email sign-in and sign-up screen has an eye button that shows or hides the characters. On iOS, deleting or typing one character after returning to a hidden password field no longer wipes the whole password: iOS clears a secure field on the first edit after it regains focus, and the field now rebuilds the previous value for that edit.

**Changed files:** `frontend/mobile/src/components/ui.tsx` (`Field`) and this entry.

**Flow explained:** `Field` shows the eye button whenever it is given `secureTextEntry`; today only the password field in `app/(auth)/email.tsx` does. On iOS, while the characters are hidden, the first change after the field gains focus (or after hiding the characters again) that drops two or more characters and leaves zero or one is treated as the system clearing the field: a delete keeps the previous value minus its last character, a typed character is appended to the previous value. A single key press changes the length by at most one, so normal edits are untouched. The field only rebuilds when its last reported selection is a caret; a selected range (select all then delete or type over it) is the user's own edit and is kept as typed, and an unknown selection is never guessed. Android and revealed text are not touched at all.

**Check:** `tsc --noEmit` clean. Android emulator in mock mode: the eye button shows the typed text and hides it again, and deleting one character leaves the rest. A scratch check of the length rule passed 9 cases (not part of the repo). **Not verified:** the iOS behaviour itself (no iPhone or simulator was available), so the rebuild rule is based on the known iOS secure-field behaviour; whether iOS reports the selection before that first edit (if it never does, nothing is rebuilt and the first edit after refocus may still clear the field); and the web build in a browser.


### [2026-10-10 15:30 UTC+07:00] — [Feature] Mobile barcode scanner uses the camera only and keeps the add-item card above the keyboard

**Done:** The barcode scanner no longer has the 3x4 number pad; the camera takes the free space and the screen follows the Locket camera layout (dark background, large rounded viewfinder, top bar with close, title and item count, control row with flash, a ring that turns green when a code is read, and camera switch). The "Thêm mặt hàng" card for an unknown code no longer sits under the system keyboard: the screen shrinks around the keyboard, the camera gives way, the fields scroll on short screens and the buttons take the first tap. Quantity is still changed with the +/- buttons; typing a quantity is left for a later change (issue #141).

**Changed files:** `frontend/mobile/src/components/BarcodeScannerModal.tsx`.

**Flow explained:** Scanning a known product opens the quantity card as before; an unknown code opens the add-item card. While that card is open the root `KeyboardAvoidingView` (padding on iOS and Android) lifts it above the keyboard, the camera section drops its minimum height, and the bottom safe-area spacer is hidden because the keyboard already covers it. The center ring is an indicator, not a button; checkout keeps its own button.

**Check:** `tsc --noEmit` clean. Checked by hand on the Android emulator in mock mode with a temporary hook that opened the add-item card: the keyboard covered the card before the change and no longer does after it, the numeric keyboard shows for the price field, and "Lưu & Thêm" saves on the first tap with the keyboard open (the temporary hook is not in the commit). **Not verified:** a real iPhone (where the problem was reported), a real barcode read (the virtual camera has none), short screens, the known-product card and the order card after a scan, and the web build in a browser.

### [2026-10-10 15:07 UTC+07:00] — [Docs] Clarify batch query, locking and benchmark guarantees (#133–#138)

**Done:** Added focused JavaDoc for query-optimization repositories, services and PostgreSQL regression fixtures on `perf/query-optimization`, following the docstring review on PR #152. This improves documentation without changing runtime behavior or lowering review thresholds.

**Changed files:** Eleven Core Java files: `ProductRepository`, `SaleItemRepository`, `SaleDraftItemRepository`, `NotificationEventRepository`, `NotificationEventService`, `NotificationEventServiceImpl`, `SaleServiceImpl`, `SaleDraftServiceImpl`, `SaleVoidServiceImpl`, `ProductBatchLockPostgresTest` and `SalesListQueryPostgresTest`; this new append-only entry. No API, schema, migration, dependency, FE, AI or CodeRabbit configuration change. Existing progress history and untracked `.idea/` are preserved.

**Flow explained:** Documented tenant/status filters, empty-group shortcuts, result ordering, caller-owned transactions/locks, ascending Product lock order, per-item confirm validation precedence and grouped alert reconciliation. Query budgets exclude authentication/authorization reads; newly opened alert cycles retain per-product history/dedup work. Local timing observations are not HTTP/staging SLAs; unpaginated list queries do not guarantee bounded memory or latency.

**Check:** Fresh Java 21 `mvnw.cmd clean verify` passed 739 tests across 64 suites, 0 failures/errors/skips, BUILD SUCCESS (4:10). PostgreSQL query-count, large-data, concurrency and rollback suites used a dedicated disposable Docker PostgreSQL 16 container, since removed; no business/local/staging/production database was used. JDK JavaDoc doclint passed for changed files with missing-documentation warnings excluded. Comparing each changed Java file with HEAD after stripping JavaDoc confirmed identical executable code and assertions; whitespace checks passed. No static-analysis/coverage/CVE plugin result, 80% CodeRabbit docstring coverage, fresh remote CI success or staging UAT is claimed. The separate GitHub security-agent quota failure is unchanged. Prepared for commit/push to the feature branch only; the user retains PR merge control.

### [2026-10-10 14:36 UTC+07:00] — [Integration] Merge staging into query optimization (#133–#138)

**Done:** Integrated staging `9f23fe463d704fc9775e74de01799befd1431239` into `perf/query-optimization` at `1dc176d496ecc904b7443734eb7e3a3d697df0ea`. Resolved the only conflict, in this progress log, by retaining entries from both branches, including staging entries inserted farther down the file. The merge retains batch-query optimizations and the confirm validation-precedence fix; it does not merge the PR into staging.

**Changed files:** Incoming Core, AI, mobile, CI and documentation changes are the automatic staging merge result. Only `PROGRESS.md` was edited manually for conflict resolution and this new append-only entry. All 133 source-branch entries and 139 staging entries were checked for unchanged content. No new API/schema/migration or source-code edit was introduced during resolution; untracked `.idea/` is excluded.

**Flow explained:** Query batching, ascending Product lock order, grouped stock-alert reconciliation and per-product confirm error precedence remain intact alongside staging's Agent streaming integration. Existing frontend and AI files match staging; no frontend implementation adjustment was made in this merge.

**Check:** Fresh Java 21 `mvnw.cmd clean verify` passed 739 tests across 64 suites, with 0 failures/errors/skips, BUILD SUCCESS (3:44). PostgreSQL query-count, large-data, locking/concurrency and rollback suites ran on a dedicated disposable Docker PostgreSQL 16 container, since removed; no business/local/staging/production DB or external provider was used. Mobile `npm run typecheck` passed after `npm ci --no-audit --no-fund` installed the merged lockfile's dependencies; package files were not edited. Checked conflict markers, whitespace, preservation of both progress histories and index equivalence to the automatic merge outside this file. Static-analysis/coverage/CVE plugins are not configured; no such result, AI test run, staging/FE UAT or remote CI/deployment success is claimed. Prepared for a merge commit and push to the feature branch only.

### [2026-10-10 14:20 UTC+07:00] — [Fix] Preserve confirm error precedence with batch product locks (#136)

**Done:** Restored staging's per-product validation precedence during confirmation without reverting ordered batch locks. The preceding review missed the mixed-error regression; this entry records its correction while preserving the earlier log unchanged.

**Changed files:** Core `SaleDraftServiceImpl`, `SaleDraftServiceTest`, `ProductBatchLockPostgresTest`; this new append-only entry. No API, schema, migration, FE or other documentation change; untracked `.idea/` is excluded.

**Flow explained:** Lock the ACTIVE, shop-scoped catalog group once in ascending ID order, build a map, then process draft catalog items in that same order. Report a missing/archived/foreign product only when its item is reached; earlier cost overflow or insufficient stock retains priority. Later failures roll back prior stock changes, customer creation and all checkout records. Stock-alert reconciliation remains grouped after successful stock processing.

**Check:** New unit regressions first reproduced two wrong error codes before the fix. The corrected focused unit/PostgreSQL run passed 101 tests; subsequent `mvnw.cmd clean verify` passed 735 tests, 0 failures/errors/skips, BUILD SUCCESS (2:55), using Java 21 and PostgreSQL 16.15 in a dedicated disposable Docker container, since removed. Regression cases cover reversed item order, invalid products on either side of insufficient stock, earlier cost overflow, and transaction rollback. SQL/order/concurrency tests still pass, including one lock query for 1/20/100 selected products across a 100,000-product catalog. Before commit, the Core diff was confirmed unchanged from that verified run and all 735 XML test cases were rechecked; Maven was not rerun for this progress-only addition. No business/staging/production DB or external provider was used. This commit/push does not merge staging; the previously identified `PROGRESS.md` merge conflict remains a separate step. No staging/FE UAT or CI result is claimed.

### [2026-10-10 13:53 UTC+07:00] — [Verification] Review query-optimization branch before push (#134–#138)

**Done:** Reviewed the complete branch diff for batched list items, draft Product reads, ordered confirm/void locks and grouped stock alerts. No blocking correctness regression found within #134–#138. Prepared the remaining #138 documentation for commit/push on `perf/query-optimization`; no staging merge or history rewrite.

**Changed files:** The five documentation/progress files listed in the #138 entry below, plus this new append-only entry. No additional Core/FE code, schema, API or dependency change; existing progress history and untracked `.idea/` are preserved.

**Flow explained:** Nonempty sale/draft lists keep two data queries; draft prepare, Product locks and open-alert reads use one query per nonempty group, with their documented empty-group shortcuts. Tenant filtering, ACTIVE rules, historical restock snapshots, error precedence in prepare, original response ordering, idempotency, money/debt, notification lifecycle and transaction rollback remain covered. New alert cycles still have per-product history/dedup work; list APIs remain unpaginated.

**Check:** Fresh `mvnw.cmd clean verify` on Java 21/PostgreSQL 16.15 passed 727 tests, 0 failures/errors/skips, BUILD SUCCESS (4:58). A separate fresh-DB `SalesListQueryPostgresTest` run also passed all 17 cases. Both runs used automatically removed, dedicated Docker containers, never business/staging/production DBs. Batch-lock SQL/EXPLAIN, reverse-order concurrency, rollback, 100,000-product catalogs and 110,000-event alert fixtures passed. For 100 selected products: lock median 275.2→22.1 ms, prepare-read median 220.4→24.9 ms, open-alert median 306.6→40.3 ms; each relevant read/lock count fell 100→1. These are local observations, not SLAs. Large-list latency was variable despite two queries: 10,000 sales/50,000 items took 61,068 ms in full verify versus 683 ms in the focused run; the same-size draft list took 2,225 ms versus 34,766 ms. The timing cause is undiagnosed; pagination, memory profiling and sustained HTTP load remain follow-up work, not claims of this optimization. Rechecked 45 relative links/anchors, SVG XML/labels, append-only preservation, diff scope and whitespace; no credentials or IDE files are staged. Static-analysis/coverage/CVE plugins are not configured and were not claimed as passed. Fetched remote state: branch matched origin before this documentation commit; staging at `9f23fe4` has nine newer commits. Non-mutating virtual merge detects a conflict only in `PROGRESS.md` for the committed branch; merge approval/resolution remains separate from this push. No FE/staging UAT performed.

### [2026-10-10 13:36 UTC+07:00] — [Docs] Synchronize query-optimization flows and regression evidence (#138)

**Done:** Updated documentation for #134–#137 against `perf/query-optimization` commit `b6e4169dcfb9ffb2534b20baa9aa5e368b86d9b3`. This entry and the documentation distinguish branch implementation/local test evidence from staging deployment and FE acceptance.

**Changed files:** `docs/architecture/service-walkthrough/README.md`, `03-sales/sale-draft-confirm.svg`, `04-money/sale-void.svg` within that walkthrough, `docs/architecture/technical-design.md`, and this new entry. No Core/FE code, migrations, BRD/PRD, API contract or ERD change; previous progress entries and the existing untracked `.idea/` are preserved. Other diagrams, including AI, are unchanged.

**Flow explained:** Confirm locks the nonempty ACTIVE catalog group in one shop-scoped query ordered by product ID, deducts stock, then reconciles alerts once. Void retains sale → debt → ascending product locks, validates deduction snapshots before Product locking, reads only deducted products without filtering ACTIVE, restores stock and reconciles the restored group. Empty groups skip their Product/open-alert queries. Technical design records list/prepare/lock/open-alert query budgets, original error/response ordering, transactional rollback, and the remaining per-product history/dedup reads when opening alert cycles. Lists remain unpaginated; local benchmark timings are not HTTP/staging SLAs.

**Check:** Re-exported exactly the confirm/void SVGs using Mermaid CLI 12.0.0, the existing `mermaid.json` and white background settings from `export.sh`; checked SVG XML, labels/edges and Chrome-rendered previews. Checked relative document links/anchors, source-to-SVG correspondence, append-only preservation and `git diff --check`; repaired an existing CI/CD heading link inside technical design. Test evidence references the prior full Core verify recorded in the 2026-10-10 13:20 entry (727 tests, no failures/errors/skips); Maven was not rerun for this documentation-only change. Existing PostgreSQL regression reports were rechecked, including 29 batch-lock/prepare/alert cases and 17 list-query cases. No business/staging/production DB was accessed. No commit/push or staging UAT in this step.

### [2026-10-10 13:20 UTC+07:00] — [Performance] Batch stock alerts and draft product reads (#137, #135)

**Done:** Batched open stock-alert reads during confirm/void (#137) and ACTIVE, shop-scoped Product reads during draft creation/replacement (#135) on `perf/query-optimization`. Added reproducible Core README test commands and this new entry. No API, business-rule, entity, migration, FE or deployment change.

**Changed files:** Core `NotificationEventRepository`, `ProductRepository`, `NotificationEventService`, `NotificationEventServiceImpl`, `SaleDraftServiceImpl`, `SaleVoidServiceImpl`; `NotificationEventServiceTest`, `NotificationPostgresTest`, `ProductBatchLockPostgresTest`, `SaleDraftServiceTest`, `SaleVoidServiceTest`; Core README and this entry. All earlier progress entries and the existing untracked `.idea/` are preserved.

**Flow explained:** Stock reconciliation receives all already-locked products after stock changes → reads open alerts once → groups by product ID → retains resolution/flush, event dedup and recipient creation inside the business transaction. Single-product calls delegate to the same logic; new alert cycles still have per-product history/dedup reads and writes. Draft preparation validates customer first → collects distinct catalog IDs without throwing duplicate errors → reads ACTIVE products in the shop once → validates/maps items in their original order. All-custom drafts skip Product reads; error precedence, snapshots, rounding, discount and initial payment remain unchanged. Failed replacement retains the persisted draft/items.

**Check:** Latest full `mvnw.cmd clean verify` with all three `CORE_TEST_POSTGRES_*` variables reported 727 tests, 0 failures/errors/skips, BUILD SUCCESS; reports were checked again before commit. PostgreSQL suites passed real SQL counts, notification lifecycle/replay/concurrency/rollback, tenant/status filtering and failed draft replacement. Stock-alert fixture: 100,000 resolved events plus 10,000 open alerts; 100 selected products used 100→1 open-alert reads with no notification writes (251.1→32.9 ms). Draft fixture: 100,000 products; 1/20/100 selected products each used one Product query for create/replace; 100 selected used 100→1 reads (189.6→20.3 ms). All-custom drafts used zero Product queries. Times are local medians of three samples after one warmup, include connection/transaction overhead, and are not HTTP/staging latency guarantees. Only a dedicated Docker PostgreSQL database was used; generated schemas were removed and its container stopped. No business/staging/production DB was used. `git diff --check` passed. The final preparation changes only README/PROGRESS, not the tested code. HTTP/FE UAT and sustained-load testing remain unverified; #138 is not implemented by this change.

### [2026-10-09 15:00 UTC+07:00] — [Performance] Batch product locks for confirm and void (#136)

**Done:** Replaced per-product locks in checkout confirmation and restocking void with one ordered, shop-scoped product-lock query on `perf/query-optimization`. Nonempty groups use one product-lock query; empty groups use none. No API, schema, migration, FE or business-rule change.

**Changed files:** Core `ProductRepository`, `SaleDraftServiceImpl`, `SaleVoidServiceImpl`, `SaleDraftServiceTest`, `SaleVoidServiceTest`, new `ProductBatchLockPostgresTest`, Core README; this entry. Earlier progress entries and the existing untracked `.idea/` remain untouched.

**Flow explained:** Confirm collects distinct catalog IDs → locks ACTIVE products ordered by ID in PostgreSQL → rejects incomplete results → preserves stock deduction, cost snapshots, payments/debt, notifications and audit. Void keeps sale → debt locks → validates all deduction snapshots before product locks → locks only deducted products in one ordered query without an ACTIVE filter → restores stock and preserves refund/debt/audit/idempotency behavior. Custom/non-deducted items are not restocked; archived catalog products can still be restored.

**Check:** Full `mvnw.cmd clean verify` with all three `CORE_TEST_POSTGRES_*` variables reported 678 tests, no failures/errors/skips, BUILD SUCCESS. The new PostgreSQL suite passed 21 cases and `DebtVoidPostgresTest` passed all five; actual Hibernate SQL and PostgreSQL plans show ID ordering before row locks. Tests cover reverse-order concurrent confirm/void, insufficient stock, tenant/status filtering, missing products, custom items, unknown snapshots and full rollback after late audit failures. A 100,000-product catalog benchmark measured legacy versus batch confirm locks: selected 1 — 1→1 query, 23.8→24.0 ms; 20 — 20→1 query, 64.5→26.7 ms; 100 — 100→1 query, 226.3→29.6 ms. Times are local medians of three samples after one warmup, include connection/transaction overhead, and are not API/staging latency guarantees. `git diff --check` passed. Only a dedicated Docker PostgreSQL DB was used; the generated test schema was removed and its container stopped. No business/staging/production DB was used. HTTP/FE UAT and sustained-load testing remain unverified.

### [2026-10-09 14:15 UTC+07:00] — [Performance] Batch sale and draft list item queries (#134)

**Done:** Removed N+1 item reads from the sale and sale-draft list services on `perf/query-optimization`. Nonempty lists use two data queries regardless of the tested parent count; empty lists use one. Authentication/shop-access queries are excluded from this budget. No API, entity, migration, FE or business-rule change.

**Changed files:** Core `SaleItemRepository`, `SaleDraftItemRepository`, `SaleServiceImpl`, `SaleDraftServiceImpl`, `SalePaymentServiceTest`, `SaleDraftServiceTest`, new `SalesListQueryPostgresTest`, Core README; this entry. Earlier progress entries and the existing untracked `.idea/` remain untouched.

**Flow explained:** Validate ownership and ACTIVE shop → read parents in descending ID order → return immediately if empty; otherwise join items to parents filtered by shop, ordered by parent/item ID → group by parent ID → map responses with an empty list for missing items. Historical snapshots, item ordering and computed draft expiry are preserved. Detail/confirm/void retain their existing single-parent item queries.

**Check:** Verified the targeted unit/PostgreSQL run: 59 tests, no failures/errors/skips. Full `mvnw.cmd clean verify` with all three `CORE_TEST_POSTGRES_*` variables reported 648 tests, no failures/errors/skips, BUILD SUCCESS. Real PostgreSQL 16 fixtures tested each list with 1/20/100/1,337/10,000 parents and five items per parent (up to 50,000 items): two data queries in every case; empty lists: one. A 100-parent control reproduced 101 legacy queries versus two optimized queries. Tests cover tenant/status denial, missing items, archived-product snapshots, expiry and detail-query preservation. `git diff --check` passed. Tests used a dedicated local Docker database; generated query-test schemas were removed and its container stopped. No business/staging/production DB was used. HTTP/FE latency, memory/load characteristics and staging UAT remain unverified; lists are still unpaginated. No commit or push performed in this preparation step.
### [2026-10-09 22:00 UTC+07:00] — [Feature] Agent chat answers stream into the mobile chat through Core

**Done:** Core has `POST /api/v1/agent/chat/stream`, which relays the AI's `/internal/v1/agent/chat/stream` (#149) to the app, and the mobile Trợ lý AI screen now shows the answer as it is written instead of waiting for the whole reply. Closes the gap tracked in #150.

**Changed files:** `backend/core/.../controller/AgentController.java`, `service/AgentService.java`, `service/impl/AgentServiceImpl.java`, `config/SecurityConfiguration.java`, `src/main/resources/application.yml`, `AgentControllerWebTest`, `AgentServiceTest`; `frontend/mobile/src/lib/api.ts`, `src/lib/agentApi.ts`, `app/ai.tsx`; `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, `backend/ai/README.md`, and this entry.

**Flow explained:** Core checks the token and shop exactly like `/agent/chat`, opens the AI stream and maps failures before the first event the same way (`404` to `conversation_not_found`, anything else to `503 ai_unavailable`), so those still arrive as JSON. It then copies the AI's events one at a time, flushing after each, and narrows `done` to `conversation_id`, `message_id`, `answer` so model metadata stays server-side as on the JSON route. If the app disconnects, the write fails and Core closes the AI stream, so the AI cancels the turn. Async dispatch is permitted in Spring Security because it only finishes a response the request dispatch already authorized, and the async request timeout is 60 s, above the AI's 35 s turn limit. Mobile reads the body with `expo/fetch` (React Native's `fetch` only returns a complete body), keeps the growing text in a draft bubble rendered with the same `ChatText` as stored replies, clears it on `reset`, and replaces it with the stored answer on `done`; `error` codes go through the existing chat error messages. Mock mode answers in one piece through `/agent/chat`.

**Check:** Core `mvn test`: 615 tests, 0 failures, 91 skipped, including new relay, error-mapping and SSE controller tests. Mobile `tsc --noEmit` clean. Live on the iOS simulator against local Supabase, Core and AI from this branch with `gpt-5.6-luna`: asking for the 12 most expensive items, screenshots taken every 0.4 s show the bubble at 3 items, then 6, then the full list; Metro logged `POST /agent/chat/stream 200`. **Not verified:** a disconnect through Core with the live model (covered for the AI route alone in #149), Android, release builds, and staging behind Railway's proxy (buffering there is untested).

### [2026-10-09 14:00 UTC+07:00] — [Feature] Render bold and bullets in assistant chat replies

**Done:** Assistant replies on the mobile `/ai` screen no longer show raw `**bold**` and `- ` markup. New `ChatText` renders `**bold**` and lines starting with `- ` or `* ` as bullets with a hanging indent; any other markdown symbol stays as plain text. `send` in `ai.tsx` now has a ref guard (`sending`) because one tap could fire several `POST /agent/chat` and duplicate message keys. In `mockCore`, the "how many items" branch now runs before product-name matching. The Maestro flows under `frontend/mobile/.maestro` were removed.

**Changed files:**
- `frontend/mobile/src/components/ChatText.tsx` — created
- `frontend/mobile/app/ai.tsx`, `frontend/mobile/src/lib/mockCore.ts`, `frontend/mobile/README.md` — modified
- `frontend/mobile/.maestro/` — deleted

**Flow explained:** AI message text goes through `ChatText`; user messages stay plain. `answer` in the API contract is unchanged (a string); the supported markdown subset is not yet written in `docs/contracts/api-contracts.md`.

**Check:** `tsc --noEmit` clean. A live run on the iPhone 17 Pro simulator against Core staging showed bold amounts, bullets, no `**` and one POST per tap. **Not verified:** accessibility reading of split bullet rows; typecheck after merging the latest `staging`.

### [2026-10-09 16:30 UTC+07:00] — [Fix] Mobile scrolling: virtualized Orders and POS lists, native-driven collapsing headers

**Done:** Scrolling lagged on the Home, Orders, POS and Products screens. The measured cause on the large lists is that Orders and POS built every row at once. With 706 orders on "Tất cả", half of the frames were janky and the median frame took 53 ms; with about 310 products the POS was at 45% janky frames. The Products list, which was already virtualized, stayed near 11% at the same size. Orders now uses a `SectionList` and POS a two-column `FlatList`, so only the rows near the screen are built, and `OrderCard` and the POS product card are memoized so a changed cart or filter does not rebuild every card. The collapsing headers on Home, POS and Products no longer animate `height` from the JS thread: they use `transform` and `opacity` with the native driver, the Home header no longer sets React state on every scroll event, and the Orders screen no longer sends scroll events to JS for a value nothing used. Behaviour and look are unchanged.

**Changed files:** `frontend/mobile/app/(tabs)/invoices.tsx`, `frontend/mobile/app/pos.tsx`, `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/app/products.tsx`, `frontend/mobile/src/components/CollapsibleHeader.tsx`, and this entry. Core, AI and the API are unchanged.

**Flow explained:** Orders keeps the summary card as the list header and each date group as a section; a collapsed group has no rows but keeps its title, and the empty state is the list's empty component. POS keeps the filter bar as the list header and the "Thêm món ngoài danh mục" button as the footer; the grid is two equal columns (the earlier masonry layout, two independent columns, is replaced by rows) and the list view is one column. The collapsing header keeps a fixed height and slides up with the scroll while the pinned part is counter-translated so it stays put; this gives the same on-screen result as shrinking the height but needs no layout pass and no JS per frame. Home settles its "collapsed" flag only when scrolling stops.

**Check:** `tsc --noEmit` clean and `npm run export:web` succeeds. Measured on the Android emulator (dev client, software rendering), scrolling up and down 10 times with a temporary large mock set of 706 orders and about 310 products (not committed): Orders janky frames 50% to 11%, median frame 53 ms to 27 ms, 95th percentile 85 ms to 46 ms; POS janky frames 45% to 21–23%, 95th percentile 97 ms to 57–65 ms. With the small mock data (47 products) the collapsing-header change alone showed no measurable difference in janky frames or JS-thread delay. Checked by hand on the emulator: Home header expanded, middle and collapsed look the same as before; POS grid, add to cart with the stepper and the cart bar, the collapsed search header; Orders collapse and expand of a date group. **Not verified:** iOS (the reported lag was on an iPhone), release builds, the web build in a browser, search on Orders after the change, POS list view, and fast flings (on a slow device the rows can show blank for a moment before they are built, the usual trade-off of virtualization).

### [2026-10-09 14:10 UTC+07:00] — [Feature] Mobile notifications from the Core inbox with real pagination

**Done:** The Thông báo screen and the Home bell now read the owner's inbox from Core (`GET /me/notifications`, `/unread-count`, `PATCH .../read`) instead of computing every notification on the device. The list is paged for real: the screen loads page 0 (20 items), "Tải thêm" requests the next page and appends it, and "Đã hiện hết thông báo" appears after the last page. Out-of-stock and low-stock alerts, voided orders and shop status changes come from Core; the new-order, debt and cash-flow notifications are still built on the device because Core does not send them. Opening a Core notification marks it read on Core; "Đọc hết" marks everything unread, including pages that are not loaded yet. The bell dot and the unread count use Core's count for the whole inbox. Resolved stock alerts show an "Đã xử lý" badge. The unread total and "Đọc hết" count and mark every device notification, including older ones that are hidden while more Core pages remain, so they do not turn unread again after "Tải thêm". The device no longer produces its own stock and cancelled-order notifications, so the stock alert follows each product's own threshold instead of the fixed 6.

**Changed files:** `frontend/mobile/app/notifications.tsx` (rewritten), `frontend/mobile/app/(tabs)/index.tsx`, `frontend/mobile/src/lib/{notificationApi,useCoreNotifications}.ts` (new), `frontend/mobile/src/lib/{notifications,mockCore}.ts`, `frontend/mobile/src/data/types.ts`, `docs/product/product-requirements.md` (one note), and this entry. Core, AI and `docs/contracts` are unchanged.

**Flow explained:** `useCoreNotifications` keeps the pages loaded so far, reloads page 0 and the unread count whenever the screen gains focus, drops duplicates by ID when new events shift the pages, and keeps a separate error for a failed "load more" so the pages already shown stay. Core notifications are mapped to the screen's existing notification shape (category, icon, link: product to Hàng hoá, sale to the invoice, shop to the profile). Because the device-built notifications are all in memory and Core's are paged, the merge hides device notifications older than the oldest Core notification loaded while more pages remain, so "Tải thêm" appends at the end instead of inserting older items in the middle. If the inbox request fails (for example against a Core without the endpoint), the screen still shows the device notifications with a retry notice. The mock Core now serves the same endpoints, with validation like Core (page ≥ 0, size 1 to 100, 1 to 100 IDs, a missing ID rolls the whole batch back) and enough history for three pages. Home and Báo cáo still use the fixed 6 for their own stock figures; that is outside this change.

**Check:** `tsc --noEmit` clean and `npm run export:web` succeeds. A scratch test of 34 cases passes (paging through all pages without repeats, newest first, out-of-range page, invalid query values, unread count, read one, read again keeps the first time, 404 and 400 cases, batch rollback, duplicate IDs, type filter, mapping, merge order across `+07:00` and `Z`, the `shopId` filter and the unread total with hidden device notifications). On the mock web build a scripted pass of 15 checks passes (three pages, each "Tải thêm" grows the list, the end message, the stock filter and the resolved badge, opening a notification reads it, "Đọc hết"). On the Android emulator against Railway staging, with the page size temporarily set to 1 (restored to 20), the app requested pages 0 to 3 of the real inbox and showed the end message, opening one notification sent `PATCH /me/notifications/4/read` (204, count 4 to 3), and "Đọc hết" fetched `unreadOnly=true` and sent `PATCH /me/notifications/read` (204, "Không có thông báo mới"). **Not verified:** a voided-order or shop-status notification from the real Core (the test inbox only had stock alerts), the "Tải thêm" error path, iOS, and more than a few events with the real page size of 20.

### [2026-10-09 12:10 UTC+07:00] — [Config] Keep the Qdrant, LiteLLM and Langfuse settings in the AI config

**Done:** Restored `QDRANT_URL`, `LITELLM_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_HOST` as optional `AppConfig` settings and `.env.example` entries, so deployments keep their credentials for the planned integrations. No code reads them yet; staging never had clients for them, only these settings.

**Changed files:** AI `src/app_config.py`, `.env.example`, README; this entry.

**Flow explained:** Settings only; nothing reads them, and unset values change nothing.

**Check:** `uv run pytest -q`: 278 passed, 40 skipped; `ruff check` and `ruff format --check` pass on `src/app_config.py`.

### [2026-10-09 11:30 UTC+07:00] — [Feature] Script to build a Release onto a real iPhone

**Done:** Added `scripts/ios-device-release.sh` at the repo root. It prints the checked-out branch and commit, lists the real iPhones/iPads paired with the Mac (`xcrun devicectl`), lets the user pick one from an arrow-key terminal menu, then runs `npx expo run:ios --device <UDID> --configuration Release --no-bundler` in `frontend/mobile`. Mocks are always off (`EXPO_PUBLIC_USE_MOCK`/`MOCK_CORE`/`MOCK_SHOPS=false`), and Core comes from `EXPO_PUBLIC_API_ENDPOINT` or defaults to staging. `npm install` runs when `package-lock.json` is newer than the last install; `--clean` regenerates `ios/`; `--device` skips the menu. The script builds the current checkout and never switches branches.

**Changed files:** `scripts/ios-device-release.sh` (new), `frontend/mobile/README.md`, `PROGRESS.md`.

**Flow explained:** The Release build embeds the JS bundle, so the app opens without Metro. Shell variables win over `.env` in Expo's env loading, so the exported mock flags cannot be re-enabled by `.env`. The UDID comes from `hardwareProperties.udid` (not the CoreDevice identifier) because `xcodebuild` needs it. Expo CLI 57.0.25 bundles the JS twice in Release (the eager key omits `skipServer`); a patch that fixed the key measured 29 s against 28 s without it, because the second pass hits the Metro cache, so it was not kept.

**Check:** On an iPhone 15 Pro Max (iOS 18.7.8): Release build signed with the existing Apple Development certificate, 0 errors, app `vn.teamhexa.songheloi` installed and launched; first build ~192 s, later builds 28–62 s. The launch fails while the phone is locked, so the script asks to keep it unlocked. Without `.env`, with `.env`, and with an endpoint override, the build command receives the mock flags off and the expected Core. The menu was exercised in a pseudo-terminal with a fake `npx`. **Not verified:** the menu in a real interactive terminal.

### [2026-10-09 11:14 UTC+07:00] — [Fix] Reject non-numeric stock input and avoid a dead end after email verification

**Done:** A pre-merge review of the sign-in and product changes found two defects, both fixed. The quantity fields read only the digits they were given, so typing `-5` in "Số lượng nhập" added 5 to the stock and `1,5` added 15. The quantity, opening stock and low-stock threshold fields now refuse anything that is not whole digits, with a message, and the quantity must be between 1 and 999999999999. On the "Xác minh email" screen, if Core failed after the email was verified, the app signed the user out of Firebase but stayed on the screen, so "Tôi đã xác minh" then claimed the email was not verified; it now shows the real error and returns to the sign-in screen. Code review on the PR found three more points, also fixed: the threshold field rounded a fractional threshold (Core allows 3 decimals) when the form opened, so saving only a name or price change could silently change the alert level, and the form now keeps the stored value unless the field is edited; the mock stock-in now refuses a quantity beyond 12 integer and 3 decimal digits and a total above Core's limit (409 `product_stock_overflow`); and the mobile README line that still described phone numbers in the mock flow is replaced.

**Changed files:** `frontend/mobile/app/products.tsx`, `frontend/mobile/src/lib/productForm.ts` (new `isWholeNumber`, `resolveThreshold`), `frontend/mobile/src/lib/mockCore.ts`, `frontend/mobile/app/(auth)/verify-email.tsx`, `frontend/mobile/README.md`, and this entry.

**Flow explained:** Validation runs when the user presses the button and keeps the form open with the message; stock, price and the request body are not changed by a rejected input. The verification screen checks whether a Firebase user is still signed in after a failed session call and leaves the screen when there is none.

**Check:** `tsc --noEmit` clean and `npm run export:web` (the CI web step) succeeds. A scratch test of the validator (11 cases) and the earlier 32 helper cases pass. On the mock web build a scripted pass of 9 new checks passes (`-5`, `1.5`, `1,5` and `0` are refused and leave the stock unchanged, `4` adds exactly 4, threshold `1.5` is refused, threshold `3` saves, opening stock `-3` is refused) and the earlier 13 checks still pass. **Not verified:** the verification-screen fix (it needs Core to fail after a real verification), real Core calls, Firebase email flows, an emulator or phone.

### [2026-10-09 10:35 UTC+07:00] — [Feature] AI guardrails return error codes, retry leaking answers and bound each turn

**Done:** Guardrails no longer answer with fixed Vietnamese text: a turn a guardrail stops raises `GuardrailError(code)`, the composition root answers `422 {"detail": "<code>"}`, and nothing is stored. Codes: `input_too_long` (message over `AGENT_MAX_INPUT_CHARS`), `answer_unavailable` (request or token limit reached, or the answer still rejected after retries) and `answer_timeout` (turn over the time limit). `replies.py` and `replies.vi.json` are deleted, so the AI source holds no owner-facing guardrail copy; the mobile chat screen maps the three codes to its own Vietnamese text. The answer screen is now the agent's Pydantic AI output validator: an empty or leaking answer goes back to the model with `ModelRetry` instead of being replaced, and the request limit bounds the retries. Two limits are new: `AGENT_TURN_TOKEN_LIMIT` (200000 input plus output tokens per turn, `UsageLimits.total_tokens_limit`) and `AGENT_TURN_TIMEOUT_SECONDS` (35, below Core's 40 s read timeout, so a turn Core gave up on is not stored). Each answered turn logs its token usage. Both defaults are provisional until the PO approves them. Not added, by design: tool approval, Ask User and deferred tool calls (they need a resume flow through Core and the app, and the tools are read-only), model-based judges and the prompt injection classifier (a second model call per step, while the SQL guard, read-only role and scoped views already bound the tools), output PII redaction (it would hide the shop's own contact details), `cost_limit` (not enforced for models without price data) and the `pydantic-ai-harness` 0.x package.

**Changed files:** AI `src/agent/guardrails/` (`agent_guardrails.py`, `answer_screen.py`, `__init__.py`; `replies.py` and `replies.vi.json` deleted), `src/agent/service.py`, `src/main.py`, `src/app_config.py`, `.env.example`, `tests/support.py`, `tests/unit_tests/test_agent_guardrails.py`, `tests/integration_tests/test_agent_chat.py`, AI README guardrail section; mobile `app/ai.tsx`; API contract §6 and the Core proxy note; this entry.

**Flow explained:** `AgentService.chat` → `check_input` (length → `input_too_long`, then redaction) → `Agent.run` under `asyncio.timeout` with `UsageLimits(request_limit, total_tokens_limit)`, `ToolCallLimit` and the `check_answer` output validator (`ModelRetry` on empty or leaking answers) → `save_exchange`. `GuardrailError` → `422 {"detail": code}`. Core still maps every non-404 AI error to `503 ai_unavailable` (its log shows the AI body), so the app shows the generic AI error until the Core owner forwards the codes.

**Check:** `uv run pytest -q`: 278 passed, 40 skipped; `ruff check` and `ruff format --check` pass; mobile `tsc --noEmit` passes. Live against the local Supabase stack: a normal question answered 200 in 4.2 s (about 4.2k input tokens logged), a 2500-character message got 422 `input_too_long` with no model request, `AGENT_TURN_TIMEOUT_SECONDS=1` gave 422 `answer_timeout` and `AGENT_TURN_TOKEN_LIMIT=1000` gave 422 `answer_unavailable`. On the iOS simulator through Core: chat, quick prompt, follow-up, card masking and key redaction in stored history all passed; the over-long message showed "Trợ lý AI đang tạm lỗi hoặc quá tải." with the draft restored and nothing stored; a leak-bait question got a clean answer without needing a retry, so the `ModelRetry` path is covered by unit tests only. Found outside this change: renaming a conversation fails in Core because its `SimpleClientHttpRequestFactory` cannot send PATCH.

### [2026-10-09 10:05 UTC+07:00] — [Refactor] Group the AI agent guardrails behind AgentGuardrails

**Done:** `src/agent/guardrails.py` became the package `src/agent/guardrails/`, one module per guardrail: `input_redaction.py` (card masking with the Luhn check, secret redaction), `answer_screen.py` (empty and leaking answers), `tool_call_limit.py` (`ToolCallLimit` capability) and `replies.py` with `replies.vi.json`. `agent_guardrails.py` holds `GuardrailLimits` and the `AgentGuardrails` facade, which owns the limits (`usage_limits`, `retries`, `capabilities`) and exposes `check_input` and `check_answer`; `AgentService` calls only that object. Behavior is unchanged.

**Changed files:** AI `src/agent/guardrails/` (new package; `guardrails.py` and `replies.vi.json` moved into it), `src/agent/service.py`, `src/app_config.py` comment, `tests/unit_tests/test_agent_guardrails.py` imports, AI README guardrail section, service walkthrough diagram label and its AI components SVG; this entry.

**Flow explained:** `AgentService.chat` → `AgentGuardrails.check_input` (redact, then the length reply that skips the model) → `Agent.run` with the guardrails' usage limits, retries and `ToolCallLimit` → `AgentGuardrails.check_answer` → `save_exchange`.

**Check:** `uv run pytest -q`: 275 passed, 40 skipped; `ruff check` and `ruff format --check` pass. Live on uvicorn against the local Supabase stack: a normal question answered 200 after a tool call, a 5000-character message got the length reply without a model request, and a card number reached the model masked to its last four digits.

### [2026-10-09 03:25 UTC+07:00] — [Feature] Mobile products: stock-in, low-stock threshold, PATCH without stockQuantity

**Done:** Editing a product no longer sends `stockQuantity` or `imageUrl`, which Core now rejects with 400. The Hàng hoá screen sends `PATCH /products/{id}` with only the fields that changed and sends nothing when nothing changed. Stock now changes through a new "Nhập hàng" box in the edit form (quantity and an optional reason) that calls `POST /products/{id}/stock-in`. The product form also has "Báo sắp hết khi tồn còn từ", saved as `lowStockThreshold` on create and edit (empty means no threshold). The "Sắp hết" tab, its count and the row badge follow each product's own threshold instead of the fixed 6: a product with stock 0 shows "Hết hàng", one at or below its threshold shows "Sắp hết", and one with no threshold is never "Sắp hết". The mock Core follows the same contract.

**Changed files:** `frontend/mobile/app/products.tsx`, `frontend/mobile/src/lib/{catalogApi,productForm,mockCore}.ts` (`productForm.ts` is new), `frontend/mobile/src/data/types.ts`, `frontend/mobile/src/components/BarcodeScannerModal.tsx` (offline fallback product gets `lowStockThreshold: null`), `PROGRESS.md`. Core, AI, docs/contracts and the notification screen are unchanged.

**Flow explained:** `catalogApi` splits the create body (`ProductWriteRequest`, keeps `stockQuantity`, adds `lowStockThreshold`, drops `imageUrl`) from the PATCH body (`ProductUpdateRequest`, no stock and no image) and adds `productApi.stockIn`, which reuses the idempotent sender so pressing the button again after a network error reuses the same `Idempotency-Key` and cannot add the stock twice. `buildProductPatch` compares the form with the saved product and returns only the differences, using explicit `null` to clear barcode, cost, category or threshold; the threshold is only sent while the product tracks stock. Turning tracking on for an existing product starts stock at 0 (Core rule), and the form says so; turning it off clears stock, and the form warns about it. Creating a product still takes the opening stock. In the mock, PATCH with `stockQuantity` (even null) or `imageUrl` returns 400 like Core, stock-in is idempotent, and the sample products keep the old threshold of 6 so the demo looks the same. The notification screen still computes "sắp hết" with a fixed 6 on the device; moving it to `GET /me/notifications` is a separate change.

**Check:** `tsc --noEmit` clean. A scratch test of 32 cases on the new helpers and the mock Core passes (stock level rules, patch contents, PATCH rejections, stock-in validation, replay with the same key, key reuse with a different body, tracking on/off, create rules). On the mock web build at 390 px a scripted pass of 13 checks passes: the edit form shows current stock, "Nhập hàng" and the threshold field but no stock field; entering 5 raises stock by exactly 5; saving a new price keeps the stock; the create form shows opening stock and the threshold; a new product with stock 10 and threshold 12 shows "Sắp hết · 10". Two of those checks are weak (they only look for the absence of error text), so the screenshots were read to confirm the new price and the kept stock. **Not verified:** calls against the real Core (staging), Firebase sign-in, an emulator or phone, decimal quantities (the screen accepts whole numbers only), and the per-product threshold on the Home and notification screens.

### [2026-10-09 02:01 UTC+07:00] — [Refactor] Move the AI service to SQLAlchemy 2 and Pydantic AI

**Done:** The application database goes through a SQLAlchemy 2.1 engine (psycopg 3 driver, `pool_size=POSTGRES_POOL_MAX_SIZE`, no overflow, `pool_pre_ping`) instead of hand-written SQL on a `psycopg_pool` pool. It accepts `postgres://` URLs, and an unreadable `POSTGRES_URL` is logged and leaves the service up with database routes answering 503. `AgentConversationRepository` and `ProductCatalogRepository` use declarative mappings (`ChatConversation`, `ChatMessage`, read-only `Product`) of only the columns they touch; the schema stays owned by Core's Flyway and the Supabase migrations. LangChain is removed: the chat agent is a Pydantic AI `Agent` on `OpenAIResponsesModel` with `RunContext[AgentContext]` tools, `UsageLimits` for model requests and a small `ToolCallLimit` capability that refuses calls over the limit and hides the tools so the model still answers. Tool retries follow the model call limit, so a repeated invalid tool call is sent back for a retry instead of ending the turn. Input redaction (card mask with Luhn check, key/token redaction), the input-length reply and the answer screen are plain functions. Draft parsing uses `NativeOutput(DraftOutput)`. The chat route and both services are async; blocking database calls run in worker threads. A blank `OPENAI_BASE_URL` now resolves to the OpenAI default, because the SDK otherwise keeps the blank environment value. The read-only shop-data reader stays on plain psycopg because it runs guard-checked, model-written SQL.

**Changed files:** AI `pyproject.toml`, `uv.lock`, `src/main.py`, `infra/postgre_db_client.py`, `agent/` (repository, service, guardrails, tools, router), `drafts/` (catalog, service), `providers/factory.py`; tests `support.py`, `conftest.py`, unit tests for guardrails, agent service, shop-data and restock tools, draft service, provider factory, catalog repository and the database client (new `test_postgre_db_client.py`), integration tests for chat, auth, conversations, SQL reader, product catalog and live drafts; AI README, API contract wording, service walkthrough and its two AI SVGs; this entry. No Core, migration or earlier progress entry is changed.

**Flow explained:** Core → `/internal/v1` → `agent_chat` awaits `AgentService.chat`: `recent_messages` (owner scope check, latest window oldest first) → `redact_input` and the length check → `Agent.run` with the history, the request's `AgentContext` as deps and the call limits → `screen_answer` → `save_exchange` stores the redacted message and the answer in one transaction (conversation row locked with `FOR UPDATE` when it exists). A run that uses up its model requests or never answers returns the safe Vietnamese reply; provider errors still give `503 ai_unavailable`.

**Check:** `uv run pytest -q`: 275 passed, 40 skipped (PostgreSQL integration and live-model tests need `POSTGRES_TEST_URL` or a model key; CI sets `POSTGRES_TEST_URL`); `ruff check` and `ruff format --check` pass. ORM write statements compiled with the PostgreSQL dialect are equivalent to the previous SQL; `role` now binds as psycopg's default unknown-typed text, which PostgreSQL casts to `ChatRole` where the old SQL cast explicitly. Against staging, read-only: list (10), detail, history window oldest first, wrong shop raises `ConversationNotFoundError`, catalog read returns typed products; a uvicorn run answered `/health` 200, 401 without a token, list/detail 200 and wrong shop 404 with no errors in the log. End to end on the iOS simulator (app → Core → AI → OpenAI) against the local Supabase stack: two chat turns answered 200 in Vietnamese after one tool call each, four messages were stored in order with `last_message_at` updated, and the AI restarted with a `postgres://` URL served the conversation list. Unverified: the production `POSTGRES_URL` in the secret store (the local bootstrap files use `postgresql://`). No migration ran and nothing was written to staging.

### [2026-10-09 01:20 UTC+07:00] — [Refactor] Split AI routes per flow, pool the database and drop the chat summary

**Done:** AI mounts each flow's router under one `/internal/v1` router that carries the `X-Internal-Token` dependency, so a new flow cannot skip it. `/health` and the exception handlers are async, so health answers while chat turns hold every worker thread. The rolling chat summary, summary model, background fold and `search_chat_history` tool are removed; each turn sends the latest `AGENT_HISTORY_TURNS` exchanges (default 100, that is 200 messages) verbatim. The single shared Postgres connection is replaced by a `psycopg_pool` pool (`POSTGRES_POOL_MAX_SIZE`, default 2) that checks connections before lending them. The Redis client stays: it connects from `REDIS_URL` at startup and sits on `app.state.redis`, though no feature reads it yet. The unused `QDRANT_URL`, `LITELLM_URL`, `LANGFUSE_*` and `SUMMARY_MODEL_NAME` settings are removed. Files follow the package-by-feature names: `agent/router.py`, `agent/schema.py`, `drafts/catalog.py`.

**Changed files:** AI `src/main.py`, `app_config.py`, `agent/` (router, schema, service, repository, tools), `drafts/` (catalog moved in, service, matching), `infra/postgre_db_client.py`, `providers/factory.py`, `prompt_templates/`; deleted `agent/summary.py`, `agent/history_search.py`, `prompt_templates/chat_summary.py` and their tests; AI tests, `.env.example`, `pyproject.toml`, `uv.lock`, README; root README; API contract, technical design, ERD description/DBML, service walkthrough and its two AI SVGs; this entry. No Core, migration or earlier progress entry is changed.

**Flow explained:** Core → `/internal/v1` router (token check) → agent router → `AgentService.chat`: `recent_messages` checks the owner scope and returns the window oldest first, the agent runs with guardrails and the shop-data/restock tools, then `save_exchange` stores the redacted message and the answer. `chat_conversations.summary` and `summary_through_message_id` stay unused so the previous release can roll back; a later migration drops them. The pool stays small because the Supabase session pooler allows 15 clients and Core's Hikari pool may take 10 by default.

**Check:** `uv run pytest -q`: 269 passed, 40 skipped (PostgreSQL integration and live-model tests need `POSTGRES_TEST_URL` or a model key); `ruff check` and `ruff format --check` pass; all five `/internal/v1` routes return 401 without a token. Against staging, read-only: the history window is the correct tail, oldest first; a wrong shop returns 404; 8 parallel 0.5 s transactions take 2.3 s (the old client serialized them); queries recover after the server kills the pooled sessions. The local `.env.staging` has an empty `REDIS_URL`, so the Redis client logged `redis unconfigured` and a live Redis connection is unverified. A uvicorn run on staging answered `/health` 200, 401 without a token, list/detail 200 and wrong shop 404, then shut down cleanly. No chat was sent on staging and no migration ran. The architecture diagram (`architecture.mmd/drawio/svg/png`) still draws Redis, LiteLLM and Langfuse as MVP targets.

### [2026-10-09 01:15 UTC+07:00] — [Feature] Login methods: email with verification and password reset, Facebook, no phone login

**Done:** The first screen now offers email and password, Facebook, and two buttons marked "Sắp có" (Google, Zalo); phone-number sign-in and the OTP screen are gone, and so is the Apple button. The email screen gained "Quên mật khẩu?", which sends a reset email and always answers that a link was sent if the address is registered, so it does not reveal which emails exist. Signing up now sends a verification email and shows a new "Xác minh email" screen; the app asks Core for a session only after Firebase reports the email as verified, and reopening the app before verifying returns to that screen. A wrong email or password no longer shows a red error: it explains that the email or password is not right and offers "tạo tài khoản" or "đặt lại mật khẩu". Configuration errors (provider off, app not configured) now show one friendly sentence; the technical reason stays in the debug log. `FR-010` and the core flow in the PRD, and the mobile README, describe the new methods.

**Changed files:** `frontend/mobile/app/(auth)/{welcome,email,verify-email}.tsx` (the last one is new), `frontend/mobile/app/(auth)/otp.tsx` (removed), `frontend/mobile/app/index.tsx`, `frontend/mobile/src/lib/auth/{types,index,mock,firebase,firebase.web,firebaseErrors,phone}.ts`, `frontend/mobile/src/lib/{errors,useCooldown}.ts`, `frontend/mobile/src/{config.ts,store/AppStore.tsx,data/mock.ts}`, `frontend/mobile/{.env.example,README.md}`, `docs/product/product-requirements.md`, `PROGRESS.md`.

**Flow explained:** `AuthClient` lost `sendOtp` and gained `sendPasswordReset`, `sendEmailVerification`, `needsEmailVerification` (true only for password accounts whose email is not verified, so Facebook is not affected) and `refreshEmailVerified` (reloads the Firebase user and refreshes the ID token). `AuthError` keeps its code but separates `message` (always user-friendly) from `detail` (technical, logged by `describeError`). The verification gate lives in the app: Core does not check `email_verified`, so someone calling the API directly with an unverified token is not stopped. Google and Zalo stay disabled until their sign-in is built; accounts created earlier by phone keep working in Core but cannot sign in from the app any more. Support email (`EXPO_PUBLIC_SUPPORT_EMAIL`) shows on the verification screen when set.

**Check:** `tsc --noEmit` clean. On the mock web build at 390 px a scripted pass of 16 checks passes: welcome has email, Facebook and two "Sắp có" buttons and no phone, Apple or "chưa được kết nối"; email screen has "Quên mật khẩu?"; a wrong login shows the hint and no Firebase wording; reset shows the sent notice and a countdown; sign-up leads to the verification screen with the typed address and the support line; resend starts a countdown; "Tôi đã xác minh" continues into the app. A separate scratch test of 14 cases covers the new `AuthError` and Firebase error mapping. **Not verified:** the real Firebase flows (verification and reset emails, the sender and reply-to settings in the Firebase Console, Email/Password enabled), the native build, Facebook on a device, iOS, and the Core calls after verification.

### [2026-10-09 01:05 UTC+07:00] — [Feature] Landing polish, device-ratio screenshots and a Vercel Git project for the landing

**Done:** The phone frame follows a 6.9″ Pro Max (440:956 screen, no notch) and no longer covers the screenshots. All seven app screenshots were retaken on the iOS Simulator in mock mode at that ratio, with the status bar painted out. Opening a FAQ item no longer hides it. Removed the student-project notice, the footer credit line, and everything still marked "Đang hoàn thiện" (the AI assistant feature card, the testing note under features and the AI row in the comparison table). Reading text is larger, centered section titles fit on one line on desktop, and the comparison table stacks its column labels above the values on phones. The landing gets its own Vercel project linked to the repo (preview for branches and PRs, staging for `staging`, production for `main`) with no GitHub Actions job.

**Changed files:** `frontend/web/src/pages/landing/{LandingPage.tsx,SiteFooter.tsx}`, `frontend/web/src/styles/landing.css`, `frontend/web/public/screens/*.webp`, `frontend/web/{vercel.json,README.md}`, `PROGRESS.md`.

**Flow explained:** The FAQ open state moved from a toggled class to `data-open`, because React rewriting `className` dropped the `is-in` class added by the scroll-reveal observer and left the item at `opacity: 0`. Screenshots fill the frame with `object-fit: cover` since they share its ratio. `vercel.json` adds `ignoreCommand: git diff --quiet HEAD^ HEAD -- .`, so the Vercel project only builds when a commit touches `frontend/web`.

**Check:** `npm run typecheck` and `npm run build` pass; `npm run lint` reports only the existing admin warnings. In the browser at 1093 px and 375 px: all 8 phone images are 660×1434 and fill the frame, FAQ items stay visible through open/close, no horizontal overflow, and the removed texts are absent. **Not verified:** the Vercel project itself, which must be created and linked in the Vercel dashboard (steps in `frontend/web/README.md`), and tablet widths.

### [2026-10-09 00:21 UTC+07:00] — [Fix] Address notification migration review

**Done:** V15 explicitly installs the product threshold CHECK as NOT VALID, then validates it before the atomic migration completes. Corrected NotificationPostgresTest Javadoc to describe actual V1–V15 Flyway migrations.

**Changed files:** Core V15, SaleRefundMigrationPostgresTest, NotificationPostgresTest and this new entry. V1–V14, business APIs, FE/AI, workflow and previous progress entries are unchanged.

**Flow explained:** Existing invalid thresholds still fail validation and roll back the migration; fresh/upgrade/local-adoption/retry tests now assert the CHECK is validated, and the failed-upgrade test asserts no CHECK remains after rollback. V15 remains atomic. A PostgreSQL 16 probe confirms ACCESS EXCLUSIVE is retained after VALIDATE until transaction end; the SQL comment states this is not an online/zero-downtime optimization. Migration still needs a controlled maintenance window; genuine lighter-lock validation would require a separately reviewed transaction boundary.

**Check:** Full mvnw.cmd clean verify on disposable PostgreSQL 16: 617 tests, 0 failures/errors/skips, BUILD SUCCESS. Migration suite 18/18 and notification PostgreSQL suite 15/15 pass. Python CI gate self-tests 7/7 and report verification against fresh Maven reports pass. No migration ran on the user's local/staging/production DB; production-sized lock-duration benchmarking remains unverified. PR #131 will be updated and the review thread answered/resolved after push; CI must rerun, and merge remains with the user.

### [2026-10-09 00:05 UTC+07:00] — [Fix] Align PostgreSQL CI gate regression tests

**Done:** Corrected the outdated checkout-specific error expectation that failed PR #131 after the PostgreSQL gate was extended for notifications. Added negative coverage for a removed required notification or V15 migration test.

**Changed files:** `backend/core/scripts/test_verify_postgres_tests.py` and this new progress entry. Existing progress entries remain unchanged; no business code, migration, workflow, FE/AI, secret or IDE files are modified.

**Flow explained:** The gate still rejects missing required test methods; its self-test now expects the current `required tests missing` message. This fixes the gate's regression test rather than weakening PostgreSQL verification.

**Check:** Reproduced the previous failure with real Python in a disposable, network-disabled container using a read-only Core mount. After the fix, `scripts/test_verify_postgres_tests.py` passes 7/7 tests (including both new subcases), and `scripts/verify_postgres_tests.py target/surefire-reports` passes against the existing Maven reports. The previous GitHub CI run independently passed all 617 Maven tests with zero failures/errors/skips; Maven was not rerun for this Python-test-only change. The new CI run must still complete, including the fresh-database migration steps skipped in the failed run. No user's local/staging/production DB was used.

### [2026-10-08 23:45 UTC+07:00] — [Feature] Add OWNER in-app notifications and per-product stock thresholds

**Done:** Core adds an OWNER inbox, unread count and atomic single/batch read APIs. Product create/PATCH supports nullable lowStockThreshold. Stock alerts have LOW/OUT episodes; sale void and ADMIN shop-status changes notify the OWNER. Read retries preserve the first readAt, and pages reject offsets exceeding Integer.MAX_VALUE.

**Changed files:** Core notification entities/repositories/services/controller/DTOs, Product and business-flow hooks, tests, PostgreSQL verification script and README; new V15__add_owner_notifications.sql; BRD BR-020, PRD FR-032/AC-055–058, API contract, technical design, ERD description/DBML and this entry. No FE/AI, secret, .idea or earlier migration changes. Existing progress entries are retained unchanged.

**Flow explained:** Under the existing source lock, reconcile/append the event and OWNER recipient in the same business transaction; rollback or replay creates no new event. V15 enforces source/recipient uniqueness and one open stock alert per product. Resolving preserves history, not read state. Inbox/count/read require both the recipient and current ownership; INACTIVE shops expose only status notifications, ARCHIVED shops are hidden. No default threshold or historical-event backfill occurs.

**Check:** Full mvnw.cmd clean verify against disposable PostgreSQL 16: 617 tests, 0 failures/errors/skips; focused migration/notification suite 60/60. V1–V15 fresh schema passes Hibernate validate; upgrade preserves business data, valid local-table adoption preserves read history, invalid threshold rolls migration back and permits corrected retry. Notification PostgreSQL checks cover concurrency, replay, business-write rollback and recipient/tenant/status isolation. PostgreSQL report gate checked with an equivalent PowerShell verifier (the local Python launcher is unavailable), git diff --check, local Markdown file links and changed-file credential-pattern scan pass. No migration ran on the user's local/staging/production DB. DBML was reconciled manually; no DBML parser or production-sized migration benchmark was run. FE inbox/threshold UI, push/FCM, real Firebase/staging UAT and shared migration remain separate work; this is not production acceptance.

### [2026-10-08 23:11 UTC+07:00] — [Fix] Mobile run mode comes only from env; env examples grouped

**Done:** The mobile app no longer has code defaults for `EXPO_PUBLIC_API_ENDPOINT`, `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE` and `EXPO_PUBLIC_MOCK_SHOPS`. A missing endpoint or a flag that is not `true`/`false` stops the app at launch with the variable name, so a build cannot silently run in mock mode. The mobile example now defaults to real Firebase and Core staging. The CI `mobile-web` job sets the mock flags explicitly. All `.env.example` files are grouped into `### Group ###` sections without inline guidance; the Core example gains `AI_BASE_URL`, `INTERNAL_API_TOKEN`, `SPRING_JPA_HIBERNATE_DDL_AUTO=validate`, `FIREBASE_AUTH_EMULATOR_HOST` and `CLOUDINARY_CLEANUP_FIXED_DELAY_MS`, which Core already reads.

**Changed files:** `frontend/mobile/src/config.ts`, `frontend/mobile/.env.example`, `frontend/mobile/README.md`, `.github/workflows/ci.yml`, `docs/development/ci-cd.md`, `backend/core/.env.example`, `backend/ai/.env.example`, `frontend/web/.env.example`, `PROGRESS.md`.

**Flow explained:** Validation runs in `config.ts` at runtime, not in `app.config.js`, because `expo export` evaluates the app config before it loads `.env`. Each variable is read as `process.env.EXPO_PUBLIC_X` so Expo still inlines it at build time.

**Check:** Flag cases (missing, `true`, `false`, invalid) behave as described; `expo export --platform web` succeeds with the endpoint inlined; `tsc` shows only the existing `sherpaEngine.ts` errors. GitHub Android/Vercel environments already set the three flags to `false`. **Not verified:** EAS (expo.dev) profile env.

### [2026-10-08 16:10 UTC+07:00] — [Fix] Harden Cloudinary media retries and cleanup after review

**Done:** All three uploads now use durable SHOP/USER reservations with atomic lease reclaim and UUID fencing; stale uploaders cannot commit or release a newer attempt. Avatar preserves the Firebase fallback and returns a snapshot from the locked profile. Media-disabled DELETE rejects changes with `503`, while an absent custom image stays a `204` no-op. Inactive shop errors include their reason. Cleanup uses locked jobs and asset-reference checks, pending-only retry, and an explicitly mapped scheduler delay.

**Changed files:** Core media orchestration/repositories/entities/controllers/config/tests and README; new forward-only `V14__harden_media_upload_reservations.sql`; BRD, PRD/AC, API contract, technical design, ERD description/DBML and this log. Issue #115 is reconciled with the implementation. V13 and all earlier progress entries remain unchanged; no FE/AI or secret files are modified.

**Flow explained:** Reserve/commit a short upload lease → upload outside DB transaction → lock target and current lease, write reference/audit/replay together. Cleanup locks a PENDING job with SKIP LOCKED, shares the writer's per-asset advisory lock, skips currently attached assets and defers active upload leases; remote deletion occurs inside its per-job transaction. Avatar DELETE removes only the custom reference, restoring the synced Firebase fallback.

**Check:** Full `mvnw.cmd clean verify` with disposable PostgreSQL 16: 570 tests, 0 failures/errors/skips; 7 media PostgreSQL checks cover same-key parallel reservation, stale lease, rollback, multiple workers, attached/pending assets and status changes before final write. Fresh/upgrade Flyway and Hibernate validation pass through V14; `git diff --check` and changed Markdown local-file links pass. DBML source was matched to migration; a DBML parser is not installed. Shared databases and live Cloudinary were not used. Remaining limits: new assets uploaded before DB rollback may need operational orphan cleanup; avatar signed authenticated URLs do not yet have delivery TTL; staging/provider/FE UAT remains separate. Schedule V13 CHECK validation during reduced/stopped writes.

### [2026-10-08 15:00 UTC+07:00] — [Feature] First production release, Android environments follow the branch

**Done:** Released `staging` to `main` (PR #127, `v0.2.0`). Production deploy needed a new `RAILWAY_TOKEN`, a smoke test fix (#125) and Firebase Email/Password. Job `gate` in `mobile-release.yml` now pairs `main` with `android-production`, `staging` with `android-staging` and any other branch with `android-dev`. Created `android-staging` and `android-production` (branch policy, `android-production` also needs approval) with `EXPO_PUBLIC_*` copied from the matching `vercel-*` environment. First hosted build (`android-dev`) took about 11.7 minutes.

**Changed files:** `.github/workflows/mobile-release.yml`, `docs/development/ci-cd.md`, `CONTRIBUTING.md`, `PROGRESS.md`.

**Flow explained:** The branch chooses the code and the environment chooses the config, and `gate` allows one pair per branch so a `main` build cannot take staging config. `ci-cd.md` now lists the release steps and the production checklist.

**Check:** gate mapping run for six branch/environment pairs; environments read back through the API. Not verified: the new gate on Actions, `android-staging` and `android-production` builds, the AI baseline on the production database (still missing).

### [2026-10-08 11:00 UTC+07:00] — [Feature] Landing page rebuilt for the new app, plus privacy policy and data deletion pages

**Done:** The landing page now matches the current mobile app: purple brand, new screenshots of the app (mock data), the notebook-and-robot logo, the robot poses and the 3D icons from the app's own assets. The copy only describes what the app does today, so the printer, the Pro plan with its prices, Apple and Google sign-in, store buttons and the "suggest what to restock" claim are gone (the PRD puts printers and paid plans outside the MVP). Two public pages were added, `/privacy` and `/data-deletion`, which Meta asks for before a Facebook Login app can go live. Both are drafts: they carry a "Bản nháp" banner until the product owner approves them. The 1024×1024 app icon Meta also asks for is in `public/brand/app-icon-1024.png`. The old green-mascot images, the four old screenshots, `favicon.svg` and the unused `.logo*` CSS are removed.

**Changed files:** `frontend/web/src/pages/landing/{LandingPage.tsx,SiteFooter.tsx}`, `frontend/web/src/pages/legal/{LegalLayout.tsx,PrivacyPage.tsx,DataDeletionPage.tsx,legalConfig.ts}`, `frontend/web/src/{App.tsx,hooks/useReveal.ts,components/Logo.tsx}`, `frontend/web/src/styles/{landing.css,base.css}`, `frontend/web/{index.html,vercel.json,.env.example,README.md}`, new images under `frontend/web/public/{screens,brand}`, `favicon.png` and `apple-touch-icon.png`, and the removed `public/brand/mascot*.png`, `public/screens/{overview,voice,invoices,products}.png`, `public/favicon.svg`.

**Flow explained:** The landing tokens live under `.lp`, so the admin dashboard keeps its own theme. Screenshots come from the app running in mock mode at 390×844, 2x, with the floating mascot hidden so it does not cover content, and are stored as WebP (50–115 KB each). Images use `height: auto` so a CSS width never stretches them. The legal pages read two build variables: `VITE_CONTACT_EMAIL` (empty means a visible placeholder instead of a made-up address) and `VITE_LEGAL_DRAFT` (set to `false` after approval). The pages state what the code and schema show: Firebase UID, name, optional email and phone, shop data, debts with customer names, chat history, append-only audit logs, on-device speech recognition, the `public_profile` Facebook scope, Facebook SDK event and advertising-ID collection turned off, and the third-party services in use (Firebase, Meta, Supabase, Railway, Redis Cloud, Vercel, Unsplash for product photos, OpenAI for the assistant). `vercel.json` rewrites every path to `index.html` so `/privacy` opens directly once this site has its own Vercel project; CI only deploys the mobile web today.

**Check:** `npm run typecheck` clean, `oxlint` reports no new warnings (the existing ones are in admin files), `npm run build` succeeds, also from a fresh worktree on top of `staging`. On the built site at 1280 and 390 px wide: no horizontal overflow, mobile menu opens and closes, FAQ opens one item at a time, footer and table-of-contents anchors land on the right section, `/privacy`, `/data-deletion`, `/admin/login` and an unknown path render the right page. The hero robot, bubble and draft label stay inside the viewport at 18 widths from 360 to 1920 px, and all 26 images keep their natural aspect ratio. **Not verified:** the legal text against current Vietnamese law (needs the owner's review and a named responsible person), the 30-day deletion commitment, Core's ability to delete or anonymise a user (Core has no deletion API and its foreign keys use `ON DELETE RESTRICT`, so deletion is a manual database task today), server regions, the claims about camera and microphone on iOS and web, Safari, and a real deployment URL.

### [2026-10-07 22:25 UTC+07:00] — [Feature] Add a manual Android release workflow

**Done:** Added `mobile-release.yml`, a `workflow_dispatch` build of the Android app that replaces the Expo cloud queue. The environment input picks `android-dev` (arm64 APK, any branch), `android-staging` (4-ABI APK, `staging` after green CI) or `android-production` (4-ABI AAB, `main` after green CI and approval). The runner input picks GitHub-hosted, a self-hosted machine labelled `android-build`, or `auto` (a free self-hosted machine, otherwise GitHub-hosted). Every run uploads a build summary artifact (runner and why, toolchain, per-phase seconds, step outcomes, artifact size and SHA-256). Documented in `docs/development/ci-cd.md`.

**Changed files:** `.github/workflows/mobile-release.yml` — created; `.github/scripts/android-preflight.mjs` — created; `.github/scripts/android-summary.mjs` — created; `docs/development/ci-cd.md` — modified; `PROGRESS.md`.

**Flow explained:** `gate` checks the branch and the CI run → `select-runner` resolves the runner → `build` installs the toolchain (hosted) or runs the preflight (self-hosted), writes `google-services.json` from the environment secret, runs `expo prebuild` and Gradle, then uploads the artifact and summary.

**Check:** Script syntax and YAML parsed; preflight and summary scripts exercised locally with sample input. A local release build on an M4 Pro took 4 min 3 s with a warm cache. **Not verified:** the workflow has not run on GitHub, `gh run list --commit` and the `setup-android` `packages` input, Windows runners, and hosted run time. All builds are debug-signed, so the AAB cannot go to Google Play yet.

### [2026-10-07 22:10 UTC+07:00] — [Feature] Sign in with Facebook through Firebase

**Done:** The Facebook button on the first screen now signs in for real. On Android it opens the Facebook login, takes the access token and exchanges it for a Firebase account (`FacebookAuthProvider.credential` and `signInWithCredential`); then it follows the email flow: the Firebase ID token goes to Core (`POST /auth/session`), a new account (Core asks for `displayName`) goes through the name screen and the shop setup, and an existing account goes straight to the overview. On web it uses the Firebase popup, and the mock build signs in as one sample user. Closing the Facebook dialog is silent, and an email already tied to another sign-in method shows a clear message instead of a raw error. Signing out also signs out of the Facebook SDK. Google and Apple stay as placeholders and phone sign-in is unchanged. Core is unchanged: it only stores the Firebase UID. The login asks Facebook for `public_profile` only, because `email` has to be added to the Meta app's use case first (otherwise Facebook answers "Invalid Scopes: email").

**Changed files:** `frontend/mobile/src/lib/auth/{types,firebase,firebase.web,firebaseErrors,mock}.ts`, `frontend/mobile/app/(auth)/welcome.tsx`, `frontend/mobile/app.config.js`, `frontend/mobile/.env.example`, `frontend/mobile/package.json`, `frontend/mobile/package-lock.json` (`react-native-fbsdk-next` 13.4.3), `frontend/mobile/README.md`, `PROGRESS.md`.

**Flow explained:** `app.config.js` adds the `react-native-fbsdk-next` config plugin only when `FACEBOOK_APP_ID` and `FACEBOOK_CLIENT_TOKEN` are set at prebuild time (from `.env` locally or EAS variables), so the public repo holds neither value, and sets `extra.facebookConfigured`. `firebase.ts` loads the Facebook SDK lazily and throws a readable `not-configured` error when the flag is off or the native module is missing, so an old dev client does not crash. `welcome.tsx` runs `authClient.signInWithFacebook()` then the existing `signIn()` and routes like the email screen. The App Secret is only entered in the Firebase Console.

**Check:** `tsc --noEmit` clean. 17 scratch cases (not in the repo) cover the new error mapping (`account-exists-with-different-credential`, popup and user cancellations) and that existing mappings and `AuthError` pass-through are unchanged. `app.config.js` was evaluated with the variables set, missing and half set: the plugin and the flag appear only when both are set. `expo export --platform web` succeeds and the web bundle contains no `react-native-fbsdk-next`, `LoginManager` or `logInWithPermissions`. `expo prebuild --platform android` on this machine changed only `AndroidManifest.xml` and `strings.xml` (app id, client token, `FacebookActivity`, `fb<app id>` scheme). **Not verified:** a real Facebook sign-in on a device (needs a new dev client or APK build and a Facebook account with a role in the app, since the Facebook app is in Development mode), iOS, whether the Client Token entered is the right one, and account linking across providers (each sign-in method is a separate Firebase UID, so one person can become two Core users). `docs/product` `FR-010` lists Google, phone OTP and Zalo but not Facebook; not changed here.

### [2026-10-07 20:05 UTC+07:00] — [Fix] Keep the Đơn hàng summary figures on one line on narrow screens

**Done:** Follow-up to the entry above. A report with the sample data ("3 đơn", "265.000đ") showed the revenue figure wrapping ("265.000" / "đ") and the label "Tổng doanh thu" breaking onto two lines on a phone. That screenshot came from a build without the previous change, but the card is narrow (about 84 dp for the figure beside a 40 dp icon and a chevron on a 390 dp phone), so shrink-to-fit alone was too fragile. The card now gives the revenue half more width than the order-count half, uses 34 dp icons, drops the decorative chevron on the revenue half (the whole half is still pressable), lets the text shrink with `minWidth: 0`, and starts long figures at a smaller font size by their length so they stay on one line even where `adjustsFontSizeToFit` is ignored.

**Changed files:** `frontend/mobile/app/(tabs)/invoices.tsx`, `PROGRESS.md`.

**Flow explained:** `figureSize()` picks 17.5, 15.5 or 14 by the length of the text ("3 đơn", "265.000đ", "1.146.000đ") → the figure and its label are single-line texts inside a `flex: 1, minWidth: 0` container → the revenue half has `flex: 1.2` and the count half `flex: 0.8`.

**Check:** `tsc --noEmit` clean. On an Android emulator with the sample data, at 375 dp and system font scale 1.0 both figures and both labels sit on one line under Hôm nay ("3 đơn", "265.000đ", "Đơn hôm nay", "Doanh thu hôm nay") and under Tất cả ("6 đơn", "1.146.000đ", "Tổng đơn hàng", "Tổng doanh thu"); at 343 dp with font scale 1.3 the Tất cả card still fits on one line (the small label shrinks). **Not verified:** a real iPhone or Expo Go on iOS.

### [2026-10-07 19:30 UTC+07:00] — [Fix] Keep the Bán hàng category chips visible and label the Đơn hàng summary by period

**Done:** On the Bán hàng tab the category chips ("Tất cả", "Chưa phân loại"…) were cut in half by the header. The header had a fixed height of 152 while its content (title row, search box, chips) needs more, and the header clips what overflows; it is worse with a larger system font (reported from an iPhone running Expo Go). The header now measures its content with `onLayout` and sizes itself to it, with 152 as the minimum. On the Đơn hàng tab the two summary figures wrapped ("17.555.00" / "0đ"); they now stay on one line and shrink to fit. The card also said "Tổng đơn hàng" and "Tổng doanh thu" for every filter although the numbers follow the selected period; it now says "Đơn hôm nay" and "Doanh thu hôm nay" and so on, and only "Tất cả" keeps "Tổng". Orders are sorted newest first: Core returns them by id, and a sale with an older sale time but a larger id reversed the day groups.

**Changed files:**
- `frontend/mobile/app/pos.tsx` — `PosCollapsibleHeader` reports its body height, the screen derives `headerHeight` from it; the body no longer has a fixed bottom edge.
- `frontend/mobile/app/(tabs)/invoices.tsx` — period-aware card labels, single-line figures, newest-first sort.
- `PROGRESS.md`.

**Flow explained:** the header body is laid out at its natural height → `onLayout` reports it → `headerHeight = max(152, body + 10)` feeds the header shell, the list padding and the scroll animation → the chips are never clipped. On Đơn hàng the selected period decides the two labels (`Tất cả` → "Tổng …", otherwise "… hôm nay", "… hôm qua", "… 7 ngày", "… tháng này").

**Check:** On an Android emulator (Pixel 9) with real data from a local Core: before the change the chips were clipped, after it they are fully visible at system font scale 1.0 and 1.4. Under the Hôm nay filter the card reads "Đơn hôm nay" and "Doanh thu hôm nay"; under Tất cả it reads "Tổng…"; the amounts stay on one line at font scale 1.4. Dashboard revenue for today and the Hôm nay order list gave the same figure (62.000đ, 1 order). `tsc --noEmit` clean. **Not verified:** iOS (the report came from an iPhone and the cause is the same fixed height, but iOS was not run). Unchanged: the order count on the card still includes cancelled sales while the revenue excludes them.

### [2026-10-07 19:15 UTC+07:00] — [Feature] Split spoken orders at each price and embed the speech model in the APK

**Done:** The Đọc đơn parser now turns "bánh mì 20k cà phê 20k" into two items priced 20.000đ each. Amounts are read in every form a typist or the recognizer produces: `20k`, `20.000đ`, `1,5tr`, and spoken numbers (`hai mươi nghìn`, `hai lăm ca`, `một triệu hai trăm nghìn`), because the speech model returns numbers as words. A spoken price ends an item; an item that is not in the catalog goes to the existing add-to-catalog dialog with the price prefilled, and a catalog item keeps the catalog price. Several catalog items said without any connector ("hai cà phê sữa một bánh mì thịt ba trà đá") are now cut before each product name. While probing I found and fixed four faults that already existed: commas never split items (the text was normalized before it was split), so "2 cà phê sữa, 1 bánh mì thịt" produced one wrong item; any phrase with `tra`, `chi` or `mua` and a price became an expense ("trà sữa 30k", "chị lấy bánh mì 20k"); the unit words `to` and `bo` were dropped from inside names ("sinh tố bơ" became "Sinh"); and spoken numbers were not understood at all. The speech model can also be embedded in the APK so the app works offline: a config plugin copies it into the Android assets and `sherpaEngine` uses the embedded copy when it exists, otherwise it downloads the model as before.

**Changed files:**
- `frontend/mobile/src/lib/parseOrder.ts` — rewritten segmentation (tokenizer with money tokens, clause split, price split, catalog chunking, stricter expense detection); public API unchanged.
- `frontend/mobile/src/lib/speech/sherpaEngine.ts` — detects the embedded model with `listAssetModels` and loads it with `assetModelPath`.
- `frontend/mobile/plugins/withBundledSttModel.js` — created; registered in `frontend/mobile/app.json`.
- `frontend/mobile/app/voice.tsx` — one dev-only log line with the recognized text and how many items were found.
- `frontend/mobile/README.md`, `frontend/mobile/assets/models/README.md`, `PROGRESS.md`.

**Flow explained:** `tokenize()` folds accents and turns every amount into an `m<đồng>` token → the text is split into clauses at punctuation and connector words → `findExpense()` takes an expense phrase only at the start of a clause, after a price or after a catalog item → the rest is split after each price, then before each catalog product name → each chunk becomes a catalog line, a priced new item, a new item that needs a price, or a "missing quantity" prompt. The embedded model: `expo prebuild` runs the plugin, which copies `encoder`, `decoder`, `joiner` and `tokens.txt` to `android/app/src/main/assets/models/stt-model-<version>/`; at runtime the library extracts that folder once and `sherpaEngine` loads it.

**Check:** `tsc --noEmit` clean. 42 scratch cases for the parser (not in the repo) pass, covering the examples above, catalog and non-catalog items, quantities with units, expense versus item wording and amount edge cases such as `20kg`; the 37 earlier speech cases still pass; 20.000 random sentences ran without an error or a non-finite quantity or price. Plugin: `expo prebuild` on a copy of the project embedded the four files with the exact byte sizes, and the existing `android/` folder is identical to a fresh prebuild apart from a build cache folder. **Not verified:** the recognizer reading the embedded model on a device or emulator (the first APK that contains it will show), how well real voice recordings of price phrases are recognized (the parser was tested on text only), and iOS. `docs/product` still says the frontend only simulates speech (OQ-001, FR-008); not changed here.

### [2026-10-07 11:04 UTC+07:00] — [AI] Parse text or transcript into a DraftView (AI-008)

**Done:** AI-008 (#60) on branch `feat/ai-draft-parse-60`, targeting `staging`. New package `src/drafts/`: `DraftService.parse(shop_id, mode, text)` reads the shop's ACTIVE catalog (SALE only), asks the model for lines through structured output, and `matching.py` keeps a `product_id` only when it is in that catalog, not ambiguous and at or above `MIN_MATCH_CONFIDENCE` (0.7, provisional); name, unit and price then come from the catalog. Every other line stays open with `product_id: null` and a Vietnamese warning. EXPENSE lines are `qty: 1` with the amount in `unit_price`. Model, output or catalog failures raise `DraftUnavailableError` for #3 to map to `503 ai_unavailable`. Contract `DraftView` items gain `unit` and the EXPENSE mapping.

**Changed files:**
- `backend/ai/src/drafts/__init__.py`, `matching.py`, `service.py`, `src/prompt_templates/draft_parse.py` — created
- `backend/ai/src/prompt_templates/__init__.py`, `backend/ai/README.md`, `docs/contracts/api-contracts.md`, `PROGRESS.md` — modified
- `backend/ai/tests/unit_tests/test_draft_matching.py`, `test_draft_service.py`, `tests/integration_tests/test_draft_parse_live.py` — created

**Flow explained:** #3 endpoint (not yet built) → `DraftService.parse` → `ProductCatalogRepository.list_active_products(shop_id)` → model proposes lines from the catalog in the prompt → `matching` rejects foreign, ambiguous, unknown and low-confidence ids and prices from the catalog → `DraftResult` (DraftView without `request_id`). Nothing is written.

**Check:** 24 new unit tests; full AI suite 292 passed, 43 skipped (Postgres integration needs `POSTGRES_TEST_URL`; the live set is opt-in). Opt-in live set against the configured OpenAI model: 13 passed (typos, no diacritics, abbreviations, ignored spoken price, ambiguous "ca phe", unknown product, four expense amounts, expense without amount). `ruff check` and `ruff format --check` pass. Not verified: the `/internal/v1/drafts/parse` endpoint and Core fallback (#3).

### [2026-10-07 01:55 UTC+07:00] — [Feature] Real on-device speech recognition for the Đọc đơn screen on Android

**Done:** On Android the mic on the Đọc đơn screen now records real audio and recognizes it with the Vietnamese streaming Zipformer model (sherpa-onnx, via `react-native-sherpa-onnx`), instead of replaying a made-up sample sentence. The `voiceSamples` mock is removed. If neither the browser's Web Speech nor the on-device engine is available, the screen says so and points to Nhập tay. While you hold the button it shows the real microphone level and the live text; if nothing is recognized it tells a silent microphone apart from speech that was heard but not understood. The 49 MB model is not committed (`assets/models` is git-ignored); the app downloads the four required files into its own storage the first time the screen opens, from `EXPO_PUBLIC_STT_MODEL_URL`, and `scripts/serve-stt-model.js` serves them during development. This needs a new dev client build because the library adds a native module. The first dev client build crashed the app while loading the model: `react-native-sherpa-onnx` 0.4.4 hard-codes `modelType = "zipformer"` for every transducer, so sherpa-onnx read the `zipformer2` encoder with the version 1 loader and exited on `'attention_dims' does not exist in the metadata`. A `patch-package` patch (`patches/react-native-sherpa-onnx+0.4.4.patch`, applied by `postinstall`) leaves `modelType` empty so sherpa-onnx picks the variant from the model's own metadata.

**Changed files:** `frontend/mobile/src/lib/speech/{core,types,index,index.native,sherpaEngine}.ts`, `frontend/mobile/scripts/serve-stt-model.js`, `frontend/mobile/assets/models/README.md`, `frontend/mobile/patches/react-native-sherpa-onnx+0.4.4.patch` — created; `frontend/mobile/app/voice.tsx`, `frontend/mobile/src/data/mock.ts`, `frontend/mobile/src/config.ts`, `frontend/mobile/.env.example`, `frontend/mobile/.gitignore`, `frontend/mobile/README.md`, `frontend/mobile/package.json`, `frontend/mobile/package-lock.json`, `PROGRESS.md` — modified. Core, AI and web code are unchanged.

**Flow explained:** `speechEngine.prepare()` checks the four model files by size, downloads any that are missing, then loads the recognizer; `start()` asks for the microphone permission, opens a 16 kHz native PCM stream and feeds each chunk to a streaming stream, collecting finished sentences at every endpoint. Chunks that arrive while a decode is running are joined and sent together, so none are dropped. `stop()` stops the microphone, pads 0.5 s of silence so the last tokens come out, and returns the text. The library is loaded lazily, so a dev client without the native module shows "not supported" instead of crashing. The `.native.ts` files are never bundled for web. The model writes plain words in capitals ("HAI CÀ PHÊ SỮA"), which are lowercased before `parseOrder`.

**Check:** `tsc --noEmit` clean. 37 scratch cases (not in the repo) cover the model file list against the real file sizes on disk, missing-file detection, download URLs and percentages, the mic level maths, transcript cleaning and joining, and capital-letter spoken numbers through the real `parseOrder` when items are joined by "và". `expo export --platform web` succeeds and the web bundle contains none of the sherpa-onnx, file-system or removed sample-sentence strings. Known limit, not changed: `parseOrder` only splits items at commas and joining words, so the model's unpunctuated sentence "hai cà phê sữa một bánh mì thịt" becomes one item. On the emulator the first build downloaded the four model files from the development server and the library then crashed with `SIGABRT` right after the metadata warning; the same crash reproduced on the PC with the Node build of sherpa-onnx using `modelType` "zipformer", while an empty value and "zipformer2" both loaded the model (the fp16 files run on the x86-64 CPU) and decoded 4 s of audio without error. The patch applies cleanly onto the pristine 0.4.4 source. Not verified: the rebuilt dev client, microphone capture and recognition on an emulator or phone (no Vietnamese speech sample was available to test recognition on the PC), and Android 16 KB page-size alignment of the sherpa-onnx libraries. `docs/product` (`OQ-001`, `FR-008`) still says the front end only simulates speech; update it after a runtime acceptance.

### [2026-10-07 01:34 UTC+07:00] — [Docs] Correct V12 cost snapshot ERD mapping

**Done:** Corrected the V12 `estimated_cost_vnd` DBML mapping after review: it belongs only to `sale_items`, not `sale_draft_items`.

**Changed files:** `docs/architecture/diagrams/src/erd.dbml` and this append-only entry only.

**Flow explained:** A draft has no immutable confirmed-sale cost snapshot. The nullable snapshot is written only when a draft becomes a confirmed sale item; historical/custom/unknown-cost sale items remain NULL.

**Check:** Cross-checked the corrected table/column against `V12__snapshot_sale_item_estimated_cost.sql`, `SaleItem` JPA mapping and ERD description; `git diff --check` passes. No Core code, migration, database or generated diagram asset changed.

### [2026-10-07 01:21 UTC+07:00] — [Core] Add immutable cost snapshots and advanced sales reports

**Done:** Added nullable `sale_items.estimated_cost_vnd` through Flyway V12 and snapshot it once when a draft is confirmed, without backfilling or deriving historical cost from the current Product. Added `GET /api/v1/reports/top-products`, `GET /api/v1/reports/sales-series` and `GET /api/v1/reports/profit-estimate`; kept `/api/v1/reports/summary` backward-compatible. Reports use Vietnam report windows, separate sale/void event dates, stable catalog/custom grouping, zero-filled daily buckets and explicit completeness metadata for unknown historical costs. No frontend or AI changes, no commit/push, and no local/staging/production database was modified.

**Changed files:** Core SaleItem mapping and draft-confirm snapshot logic; V12 migration; report controller/service/repository, enums and response DTOs; migration, service, contract and PostgreSQL aggregation tests; Core README. Updated BRD/PRD traceability (`BR-005` → `FR-006` → `AC-049..052`), API contract, technical design, ERD description/DBML and this append-only entry. Existing stock-in work on this branch remains unchanged and is tested together.

**Flow explained:** Confirm draft → copy each known catalog item's current total estimated cost into the immutable sale line; custom/unknown cost remains `NULL` → report queries aggregate by shop and `[fromInclusive, toExclusive)` in `Asia/Ho_Chi_Minh` → sale revenue/COGS belong to `soldAt`, reversals belong to `voidedAt` → responses expose gross, voided and net values plus unknown-cost counts/revenue so the UI cannot present an incomplete estimate as accounting profit. Multi-line discounts are allocated proportionally with the final line absorbing the rounding remainder, preserving the exact sale total. Expenses reduce only `estimatedOperatingProfitVnd`.

**Check:** Full `mvnw.cmd clean org.jacoco:jacoco-maven-plugin:0.8.14:prepare-agent verify org.jacoco:jacoco-maven-plugin:0.8.14:report` against a disposable PostgreSQL 16 container: **521 tests, 0 failures, 0 errors, 0 skipped; build success**. JaCoCo Core coverage: 93.86% instructions, 92.84% lines and 79.60% branches. PostgreSQL coverage includes fresh V1–V12 and V8→V12 upgrades, nullable legacy cost, exact multi-line discount allocation, immutable cost after Product price changes, custom/catalog grouping, void timing and zero-filled series. Existing Core regression, rollback and concurrency suites pass. Mobile integration/UAT is not included; the current mobile-local estimate must not be treated as these official Core reports until FE adopts the new contract.

### [2026-10-06 21:36 UTC+07:00] — [Core] Add idempotent cumulative stock-in

**Done:** Implemented `POST /api/v1/products/{productId}/stock-in` on `feat/core-stock-in`, based on staging `99ed97a9d03656fe782ae43c81526e68a8c0cc08`. Positive fractional quantities add to the locked current stock; OWNER/shop/product state and NUMERIC(15,3) bounds are enforced. Removed stockQuantity from Product PATCH, including explicit null; enabling tracking starts at zero, keeping tracking preserves stock, disabling clears it. Create/response stock fields remain. No new table or migration; no frontend, AI or Compose changes and no commit/push in this step.

**Changed files:** Core Product controller/request/service/entity, error handling, idempotency response-status overload and audit metadata source; new ProductStockInRequest and ProductStockInServiceTest; existing product/contract/OpenAPI/idempotency/PostgreSQL tests and Core README. Updated BRD/PRD (BR-018 → FR-030 → AC-044..048), API contract, technical design, ERD description and this entry. Earlier progress entries retained.

**Flow explained:** Authenticate OWNER and active owned shop → reserve PRODUCT_STOCK_IN key (product ID + canonical quantity + trimmed/blank-normalized reason) → lock active tracked product → add quantity → append STOCK_ADJUSTED/source STOCK_IN with quantity/beforeStock/afterStock → flush → store original ProductResponse with status 200 → commit. Replay returns the original snapshot without adding stock/audit again; different committed payload or expired key is rejected. Any late audit/idempotency-write failure rolls everything back. Stock-in creates no expense/payment/debt/sale and does not change cost price.

**Check:** Tests-first regression cases failed on the old behavior, then passed after implementation. Full `mvnw.cmd clean org.jacoco:jacoco-maven-plugin:0.8.14:prepare-agent verify org.jacoco:jacoco-maven-plugin:0.8.14:report` against a disposable PostgreSQL 16 container: **514 tests, 0 failures, 0 errors, 0 skipped; build success**. JaCoCo Core line coverage 92.63%, branch coverage 79.77%; ProductServiceImpl line coverage 99.21%. Includes actual V1–V11 migrations/validation, parallel receipts/retries, observed PostgreSQL lock waits with checkout/void/PATCH/archive, real DB-rejected audit/idempotency writes and rollback, key conflicts/expiry, ownership/state guards, overflow and generated OpenAPI schema coverage. `git diff --check` clean. No staging/production database used. Firebase/Swagger manual and mobile UAT remain unverified; mobile must stop sending stockQuantity in PATCH, add stock-in UI/API/retry handling and align mocks before integration. CI already runs the PostgreSQL-enabled suite; no workflow changed. Existing untracked `.idea/` preserved.

### [2026-10-06 11:48 UTC+07:00] — [AI] Cap the shop catalog read and map database errors

**Done:** Review fixes on `feat/ai-shop-catalog-37` for AI-007 (#37). `ProductCatalogRepository` now caps every read with a transaction-local `statement_timeout` (default 3000 ms, mirroring `ReadOnlySqlExecutor`), so a blocked query cannot hold `PostgreDBClient`'s single connection lock and stall chat. Every database failure and timeout becomes `CatalogUnavailableError` for #3/#60 to map to manual entry. `shop_id` and `product_id` are typed `int | None` and return early (empty list / `False`) instead of relying on SQL NULL semantics.

**Changed files:** `backend/ai/src/catalog.py`, `backend/ai/tests/unit_tests/test_catalog_repository.py`, `backend/ai/tests/integration_tests/test_product_catalog.py`, `PROGRESS.md`.

**Flow explained:** Core passes the authenticated `shop_id` → `_fetch` sets `statement_timeout` for the transaction, runs the shop-scoped SELECT, and raises one domain error on any database failure → the caller falls back to manual text/POS without leaking another shop's data.

**Check:** Full AI suite green against a disposable pgvector PostgreSQL 16 with the real Core V1–V4 migrations: 298 passed (was 294). New coverage: a table lock makes `list_active_products` block and the 200 ms `statement_timeout` cancels it (asserts `CatalogUnavailableError`, then the shared connection still serves the catalog), missing or null ids return nothing without a query, database failures map to `CatalogUnavailableError`, and `timeout_ms` must be positive. `ruff check` and `ruff format --check` pass. Not verified: the end-to-end Core fallback path (#3) and a real model.

### [2026-10-06 11:33 UTC+07:00] — [AI] Shop-scoped product catalog for drafts (AI-007)

**Done:** AI-007 (#37) on branch `feat/ai-shop-catalog-37`, targeting `staging`. New `src/catalog.py` adds `ProductCatalogRepository`: `list_active_products(shop_id)` reads only `status = 'ACTIVE'` products of the Core-verified shop, and `is_active_product(shop_id, product_id)` rejects a product of another shop, an archived product, an unknown id and a missing shop id. Every query filters `shop_id` in SQL with a bound parameter and only reads; database errors and timeouts propagate so #3 can fall back to manual entry. Finalized the Core–AI ID type: `DraftView.items[].product_id` is the `BIGINT` of `products.id` (was `uuid-or-null`) in `docs/contracts/api-contracts.md`.

**Changed files:**
- `backend/ai/src/catalog.py` — created
- `backend/ai/tests/unit_tests/test_catalog_repository.py`, `tests/integration_tests/test_product_catalog.py` — created
- `docs/contracts/api-contracts.md`, `PROGRESS.md` — modified

**Flow explained:** Core authenticates the owner and passes its `shop_id` → `ProductCatalogRepository` loads that shop's ACTIVE catalog for #60 or checks one model-supplied `product_id` under the same shop filter → a request scoped to shop A can never list or validate a shop B product.

**Check:** Full AI suite green against a disposable pgvector PostgreSQL 16 with the real Core V1–V4 migrations: 294 passed. New tests: 3 unit (SQL keeps the shop/ACTIVE filter and binds params; product id type is `int` and matches the contract BIGINT) and 4 integration (shop A/B isolation with a duplicate product name, archived/cross-shop/unknown rejection, missing or unknown shop returns nothing, unavailable database raises without writing). `ruff check` and `ruff format --check` pass. Not verified: end-to-end Core → AI draft parse (#60/#3) and a real model.

### [2026-10-06 02:23 UTC+07:00] — [Docs] Align Core/mobile and ADMIN support documentation

**Done:** Completed the Core/mobile documentation alignment for DOCS-001 (#101), plus a separately reviewed ADMIN documentation extension. Compared against staging commit `b1de421c461d59473b3bb73aae103027afd67a89`. Clarified Firebase JSON-over-ADC precedence, CORS/Flyway configuration, direct DEBT-to-PAID repayment, mobile-local report estimates and quick product creation. Documented the seven ADMIN support GETs and shared audit schema V10/V11; preserved existing requirement IDs and added AC-040 through AC-043.

**Changed files:**
- `docs/architecture/technical-design.md`, `docs/architecture/service-walkthrough/README.md`, `docs/architecture/service-walkthrough/03-sales/state-sale-debt.svg`, `frontend/mobile/README.md` — Core/mobile alignment.
- `docs/contracts/api-contracts.md`, `docs/product/business-requirements.md`, `docs/product/product-requirements.md`, `docs/architecture/erd-description.md`, `docs/architecture/diagrams/src/erd.dbml` — ADMIN contract, traceability and migration alignment; technical design also distinguishes implemented Core APIs from pending web integration.
- `PROGRESS.md` — new entry only; earlier entries retained.

**Flow explained:** ADMIN reads only support projections, not OWNER ledgers/business audit; successful reads commit with audit or refuse protected output with `503 admin_audit_unavailable`. OWNER and ADMIN histories have separate action/actor scopes over the existing append-only `audit_logs`, with no `admin_access_logs` table. The ADMIN extension is outside DOCS-001's original Core/mobile-only checklist and must be identified separately in review. Details added to BR-014/FR-023/FR-024 require Product Owner approval before dashboard acceptance; pushing documentation does not establish web/staging UAT or production readiness.

**Check:** `git diff --check`; 73 relative file links/anchors; seven routes, nine DTO projections and eight ADMIN action filters compared with Core; 16 audit columns/types, V10/V11 nullability, FKs and indexes compared with migrations; DBML CLI parsing/export to PostgreSQL SQL; sale/debt SVG rendered and visually inspected. AI contracts/tables, legal sections and Part 1-only files remained unchanged during Part 2. No code, migrations, secrets or IDE files changed; no Maven, DB migration or UAT run in this documentation pass. Remote staging was rechecked before commit and still matched `b1de421c461d`.

### [2026-10-05 23:40 UTC+07:00] — [AI] Move AI schema to a Supabase CLI baseline

**Done:** Folded AI migrations `001`–`005` into one baseline, `supabase/migrations/20261005000000_ai_baseline.sql`, under a `supabase/` project from `supabase init`. Staging now gets the AI schema with `npx supabase@2.119.0 db push --db-url "$POSTGRES_URL"` instead of running each file with `psql`. Every statement stays safe to re-run, so the first push also succeeds on a database that already has the old files applied. Core keeps Flyway; CI tests keep a disposable PostgreSQL.

**Changed files:**
- `supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/20261005000000_ai_baseline.sql` — created
- `backend/ai/migrations/001`–`005` — deleted
- `backend/ai/tests/support.py`, `tests/integration_tests/test_agent_conversations.py`, `test_sql_reader.py` — modified
- `README.md`, `backend/ai/README.md`, `backend/ai/src/app_config.py`, `docs/architecture/technical-design.md`, `docs/architecture/erd-description.md`, `docs/architecture/diagrams/src/erd.dbml`, `docs/development/ci-cd.md` — modified

**Flow explained:** Core Flyway creates the business tables → `supabase db push` applies the AI files that `supabase_migrations.schema_migrations` does not list yet. Verified on disposable pgvector databases: 287 AI tests pass; `db push` succeeds on a fresh database and on one that already had `001`–`005`, a second push is a no-op, and `pg_dump` matches the old schema except for the column order of `chat_conversations`. Not run on Supabase staging.

### [2026-10-05 21:28 UTC+07:00] — [AI] Restock suggestions and sales questions through agent chat

**Done:** AI-011 (#102) on branch `feat/ai-restock-insight`. Migration `005` adds the shop-scoped, read-only views `ai_read.v_sales` and `v_sale_items` (no customer snapshot, no `void_reason`); `SqlGuard` allows them and the SQL prompt answers sales questions with a stated period. New package `src/restock/`: `policy.py` turns confirmed sales into `suggested_qty = ceil(sold/days*COVER_DAYS - stock)` with a fixed Vietnamese reason, `service.py` loads them through the read-only executor. The agent tool `suggest_restock(period)` takes the shop from `AgentContext`; the mobile assistant gets "Gợi ý nhập hàng 7 ngày qua" and "Doanh thu 7 ngày qua?" chips. `COVER_DAYS = 7` and the periods `last_7_days`/`last_30_days` are provisional defaults awaiting product-owner sign-off.

**Changed files:**
- `backend/ai/migrations/005_add_sales_read_views.sql` — created
- `backend/ai/src/sql/guard.py`, `src/prompt_templates/sql_agent.py`, `shop_agent.py`, `__init__.py` — modified
- `backend/ai/src/prompt_templates/restock.py`, `src/restock/policy.py`, `src/restock/service.py` — created
- `backend/ai/src/agent/tools.py`, `src/agent/service.py`, `src/main.py` — modified
- `backend/ai/tests/unit_tests/test_restock_policy.py`, `test_restock_service.py`, `test_restock_tool.py` — created; `test_sql_guard.py`, `tests/integration_tests/test_sql_reader.py` — modified
- `frontend/mobile/app/ai.tsx` — modified
- `backend/ai/README.md`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, `docs/architecture/erd-description.md` — modified

**Flow explained:** Mobile chip → Core `/api/v1/agent/chat` → AI agent → `suggest_restock` → `RestockService` runs one fixed `SELECT` through `SqlGuard` and `ReadOnlySqlExecutor` (shop scope, read-only, timeout, row cap) → `policy.suggest` computes the quantities → the agent copies them verbatim. Free-form sales questions go through `query_shop_data` over the new views. Not verified: integration tests against Postgres (need `POSTGRES_TEST_URL`), migration `005` on a dev database, and end-to-end FE → Core → AI with a real model.

### [2026-10-05 14:10 UTC+07:00] — [Core] Allow browser calls from listed origins (CORS)

**Done:** Core enables Spring Security CORS with a `CorsConfigurationSource` built from `smartledger.cors.allowed-origins` (env `CORS_ALLOWED_ORIGINS`, comma-separated, wildcard patterns such as `https://smart-ledger-*.vercel.app`). Empty means no browser origin is allowed. Preflight passes without a token; credentials stay off because auth uses a bearer header. Edited `backend/core` with the owner's explicit approval.

**Changed files:**
- `backend/core/src/main/java/com/smartledger/core/config/SecurityConfiguration.java` — modified
- `backend/core/src/main/resources/application.yml` — modified
- `backend/core/src/test/java/com/smartledger/core/config/CorsWebTest.java` — created
- `docs/development/ci-cd.md`, `frontend/mobile/README.md` — modified

**Flow explained:** Browser → OPTIONS preflight → `CorsFilter` inside the security chain answers before the bearer filter. **Check:** `mvnw test` 359 tests pass, `CorsWebTest` 2/2 (allowed origin 200, unknown origin 403). Not verified: a call from a Vercel preview to Core staging.

### [2026-10-05 13:38 UTC+07:00] — [Core] Audited ADMIN dashboard API and shared audit migration

**Done:** Added seven ADMIN support endpoints for overview, OWNER search/detail, shop search/detail, shop status history and the current ADMIN's access history. Authorization requires a verified Firebase UID linked to an ACTIVE ADMIN profile in the database. Added forward migration V11 to extend the existing `audit_logs`; no separate ADMIN audit table and no changes to V1–V10. Core changes and this progress entry were explicitly approved by the owner.

**Changed files:** `backend/core` ADMIN controller/configuration, response DTOs, guard, repository, services and tests; shared audit entity/actions/query/request context; shop status service/tests; `V11__extend_audit_logs_for_admin_dashboard.sql`; Core README; `PROGRESS.md`.

**Flow explained:** Lists mask contacts; successful support reads are audited in the same transaction. Audit failure returns `503 admin_audit_unavailable` and rolls back the operation. ADMIN history uses explicit action/target and actor whitelists; OWNER queries exclude ADMIN read events. Shop inactivation/reactivation writes one shared event. V11 permits absent shop/target IDs only for corresponding ADMIN reads while retaining scoped business events, existing history, foreign keys and append-only guards.

**Check:** Fast-forwarded from staging `d076729` to `e9151cb` without conflicts, preserving pending Core changes. Post-sync `mvnw.cmd -q clean verify` passed 402 tests across 35 suites, zero failures/errors/skips, with disposable PostgreSQL 16. Coverage includes real V1–V11 migrations, fresh schema/entity validation, V10 upgrade, manually adjusted constraints, rejected invalid scopes/roles/targets, rollback and retained audit history. Earlier local Firebase Emulator calls returned 200 for all seven ADMIN APIs and recorded each administrative action. `git diff --check` passed. Migration was not run on staging/production; real Firebase/FE UAT and separately approved documentation alignment remain pending.

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

### [2026-10-05 04:22 UTC+07:00] — [Core] Prepare staging integration and verify deployment boundaries

**Done:** Added exact-origin CORS for Core business APIs, public status-only health probes, hosted `PORT` support, and environment-controlled OpenAPI/Swagger settings. Compose forwards the CORS/documentation variables. Fixed servlet ERROR redispatch so disabled documentation preserves HTTP 404 instead of becoming 401; normal requests, including direct `/error` access, still require authentication. Added a read-only staging auth smoke script and offline guard tests. Work is on `chore/staging-intgration`. This is integration groundwork, not CORE-004 acceptance or production readiness.

**Changed files:** `backend/core/.env.example`, `backend/core/README.md`, `backend/core/pom.xml`, `backend/core/src/main/java/com/smartledger/core/config/SecurityConfiguration.java`, `backend/core/src/main/resources/application.yml`, `backend/core/scripts/{verify_staging_auth,test_verify_staging_auth}.ps1`, `backend/core/src/test/java/com/smartledger/core/config/{ApiDocumentationHttpTest,ApiDocumentationWebTest,CorsConfigurationTest,HealthEndpointWebTest,RuntimeConfigurationTest}.java`, `backend/core/src/test/java/com/smartledger/core/controller/CorsSecurityWebTest.java`, `compose.yaml`, `PROGRESS.md`. No entity, migration, frontend or CI changes; local IDE files and secrets are excluded.

**Flow explained:** Only configured exact browser origins can access `/api/v1/**` across origins; CORS never grants authentication or shop access. Readiness includes PostgreSQL connectivity, while liveness checks process availability. Both documentation flags remain enabled by default and must explicitly be disabled in production. The auth script makes 54 GET-only checks with real fixtures supplied at runtime; it does not create sessions or exercise money writes. Shared staging Flyway remains off and Hibernate schema validation is unchanged.

**Check:** Full offline Maven clean verify with JaCoCo and a disposable PostgreSQL 16 container passed 417 tests with zero failures, errors or skips; line coverage 91.04%, branch coverage 78.36%. This includes 13 real-HTTP ERROR-dispatch regression cases plus PostgreSQL migration, checkout/audit rollback and repayment/void concurrency coverage. Offline script guards passed. Direct checks of the running Core Docker container confirmed health 200, missing-token/direct-error 401, allowed-origin preflight 200 with all required headers, unknown-origin preflight 403, and enabled documentation 200/302 as appropriate. Container flags were checked without printing database secrets. `git diff --check` and a basic candidate-file secret-marker scan passed. Disposable test data/container were removed; the user's Core container was left running. Not verified: real Firebase token/role/cross-shop matrix, FE money-write/retry UAT, remote CI, dedicated static/CVE scans, or automatic Swagger-off defaults for production. These remain separate acceptance/release checks; no shared staging or production schema/data writes were performed by this verification.

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
### [2026-10-07 22:15 UTC+07:00] — [Core] Cloudinary media references, cleanup outbox and V13

**Done:** Added Cloudinary-backed media writes in Core for one main Product image, one Shop logo and one User avatar. Core alone holds provider credentials; Product/Shop delivery is public while avatar delivery is authenticated. Product/Shop writes require the existing shop-scoped `Idempotency-Key`; replacing or deleting a reference creates a durable `media_cleanup_jobs` outbox row in the same database transaction, and the worker deletes the old provider asset only after commit and retries it when Cloudinary is enabled. `V13__add_cloudinary_media.sql` adds the nullable provider-reference columns, cleanup outbox, checks/index and the narrow `USER_AVATAR_UPDATED` audit rule. Existing media URL-only data is preserved; no historical provider ID is inferred.

**Changed files:** Core media port/Cloudinary adapter, configuration, controllers, services, entities, repository, audit/error handling and tests; `V13__add_cloudinary_media.sql`; Core env/README. Updated BRD/PRD traceability (`BR-019` → `FR-031`/`NFR-010` → `AC-053`–`AC-054`), API contract, technical design, ERD description/DBML, CI/CD deployment variables, root `compose.yaml`, editable architecture diagram sources and this append-only entry. No mobile or AI source changed. Existing untracked `.idea/` remains untouched.

**Flow explained:** Client sends one validated JPEG/PNG (maximum 5 MiB, 1–2048 px) to the entity-owned multipart endpoint → Core derives an environment-prefixed provider ID and uploads through `MediaStorage` → the transaction updates only the owner URL/internal public ID, appends audit and enqueues deletion of the previous asset → after commit the enabled worker deletes and marks the old asset completed; failures remain retryable. If media is disabled/unavailable, writes return `503 media_unavailable`; session/me still return successfully with `avatarUrl = null`. A raw `imageUrl` cannot be supplied on Product create or PATCH; the media endpoint owns it. A provider upload followed by a failed database transaction can still orphan the newly uploaded asset, which is documented as an operational limitation rather than hidden as a false cleanup guarantee.

**Check:** With a temporary `postgres:16-alpine` container on `127.0.0.1:55432`, `mvnw.cmd clean verify` completed **549 tests, 0 failures, 0 errors, 0 skipped** and produced the Core JAR. `SaleRefundMigrationPostgresTest` ran **14/14**, including fresh V1–V13, V8→V13 upgrade, entity validation and invalid-row rollback assertions; all generated test schemas were removed before the container was stopped. `docker compose config --quiet` passes with all Cloudinary mappings present. The editable Draw.io XML parses correctly; no local Draw.io renderer is installed, so the committed SVG/PNG export has not yet been regenerated from the changed source. A manual local Product upload previously returned a working Cloudinary URL; no shared staging/production database, Firebase credential, Cloudinary secret or IDE file was changed. Mobile/web upload integration remains outside this change.
### [2026-10-08 11:30 UTC+07:00] — [Fix] Harden Cloudinary media retries and state checks

**Done:** Completed the Cloudinary media follow-up before review. A product/logo upload now reserves its `Idempotency-Key` durably before calling Cloudinary; a concurrent matching request receives `409 media_upload_in_progress`, while a completed matching request replays the saved response. An interrupted reservation can be reclaimed after the configurable lease (`MEDIA_UPLOAD_LEASE_SECONDS`, default 300), so retries do not remain blocked forever. The final write locks and rechecks the active Shop/Product/User state, preventing an upload that races with shop deactivation, product archival, or user disablement from attaching a new media reference. The cleanup worker remains disabled when Cloudinary is disabled, and authentication degrades an unavailable avatar to `null` rather than failing the session.

**Changed files:** Media idempotency, write-transaction, repository and test code; Cloudinary/Compose configuration; architecture exports and this append-only entry. No mobile, AI, shared database, provider credential or IDE file changed.

**Check:** A disposable PostgreSQL 16 run completed `mvnw.cmd clean verify` with **560 tests, 0 failures, 0 errors, 0 skipped** before the final lease refinement; the targeted Cloudinary configuration, idempotency, service and write-transaction suite then passed **13/13**. `docker compose config --quiet` and `git diff --check` pass. The editable architecture sources and committed SVG/PNG export were regenerated together and visually checked. Manual local upload returned a Cloudinary URL; real staging/production credentials and UAT remain unverified.

### [2026-10-09 21:06 UTC+07:00] — [AI] Stream Agent chat answers over SSE

**Done:** AI has `POST /internal/v1/agent/chat/stream`, which runs the same chat turn as `/internal/v1/agent/chat` and answers with `text/event-stream` events `delta`, `reset`, `done` and `error`. Only the prefix the answer screen proves safe is sent, so a streamed answer cannot show what the screen would reject. Core does not proxy the route yet, so FE cannot reach it; PRD and AC are unchanged.

**Changed files:** `backend/ai/src/agent/guardrails/` (`screened_prefix`), `backend/ai/src/agent/service.py` (`stream_chat`), `backend/ai/src/agent/router.py` (SSE route), AI unit and integration tests, `backend/ai/README.md`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md` and this entry.

**Flow explained:** Core would call the stream route → AI reads the history and checks the input before the response starts, so those failures keep the JSON status codes → the run streams in its own task, each model response passing through `screened_prefix` → `reset` discards text before a tool call or an answer the screen rejected → `done` carries the stored answer, or `error` a guardrail code. A turn that ends in `error` or whose caller disconnects is not stored, unless the disconnect lands while the exchange is already being written.

**Check:** In `backend/ai`, `uv run ruff check`, `uv run ruff format --check` and `uv run pytest` pass with **306 passed, 40 skipped** (baseline 278 passed, 40 skipped; skips are PostgreSQL and live-model tests). Scratch property checks found no leak over 777k chunk-boundary prefixes and 10,000 random end-to-end chunkings, and a real uvicorn disconnect saved nothing. PostgreSQL persistence for the stream and live-model streaming remain unverified.

### [2026-10-14 UTC+07:00] — [Mobile] Numbered pages for the Sales catalog

**Done:** After #199 made both Sales and Orders infinite scroll, the Sales tab now shows its product list in numbered pages of 20 (`usePagedPage`, `PageControls`) while Orders stays infinite scroll at 20 per load. Sales keeps the Core-side search, category, stock and sort filters from #199, jumps to page 1 when any of them changes, scrolls to the top on a page change, and the cart, scanner and known-products lookup are unchanged so selected items survive a page change. PRD `FR-033` and new `AC-068` record both behaviors.

**Changed files:** `frontend/mobile/app/pos.tsx`, `src/lib/usePagedPage.ts`, `src/lib/pageNumbers.ts`, `src/components/PageControls.tsx`, `tests/pageNumbers.test.ts`, `frontend/mobile/README.md`, `docs/product/product-requirements.md` and this entry.

**Check:** In `frontend/mobile`, `npm run typecheck` passes and `npm test` passes **30/30** including the new page-number tests. Not run: the app on a device or against staging Core, so the page controls and the scroll-to-top on page change are unverified visually.

### [2026-10-14 18:45 UTC+07:00] — [Fix] Show the AI guardrail codes in the mobile chat

**Done:** A message over the AI input limit showed the generic "Chưa gửi được tin nhắn cho trợ lý." instead of the app's `input_too_long` text (#207). Two causes: Core turned every non-404 AI error, including the guardrail `422`, into `503 ai_unavailable`; and the mobile stream request sent `Accept: text/event-stream` only, so Core could not write its JSON error before the first event (`HttpMediaTypeNotAcceptableException` in `ApiExceptionHandler`) and the app read no code. Core now forwards `input_too_long`, `answer_unavailable` and `answer_timeout` as `422` with that `code` on `/agent/chat` and `/agent/chat/stream`; any other `422` or an unreadable body stays `ai_unavailable`. The app sends `Accept: text/event-stream, application/json`. PRD and AC are unchanged: `FR-021`/`AC-011` already require the error message with the input kept.

**Changed files:** `backend/core/.../enums/ErrorCode.java`, `backend/core/.../service/impl/AgentServiceImpl.java`, `AgentServiceTest`, `AgentControllerWebTest`, `frontend/mobile/src/lib/api.ts`, `docs/contracts/api-contracts.md`, `backend/ai/README.md` and this entry.

**Check:** A scratch web test with the app's old `Accept: text/event-stream` reproduced the failure (`No acceptable representation`, exception left unhandled) before the fix. In `backend/core`, `mvn test` passes **1033 tests, 0 failures, 195 skipped** (PostgreSQL tests). In `frontend/mobile`, `npm run typecheck` passes and `npm test` passes **37/37**. Not run: the app against staging with a message over 2000 characters.

### [2026-10-14 19:00 UTC+07:00] — [AI] Pool the shop-data reader connections

**Done:** The read-only shop-data reader follows the codebase's infra client → repository pattern. `ReadOnlySqlExecutor` (`src/sql/executor.py`), which opened a new psycopg connection for every query, is replaced by `ShopDataRepository` (`src/sql/repository.py`). It borrows connections from a second `PostgreDBClient` built for `AI_SQL_READER_URL`, with at most `SQL_POOL_MAX_SIZE` connections (new, default 2). The query runs in `session()` with `postgresql_readonly` and `no_parameters`, so the guard's SQL is sent as text without placeholder parsing. The shop scope, statement timeout and search path stay transaction-local. Model-facing errors (`QUERY_TIMEOUT`, `SQL_ERROR`) and the propagation of an unreachable reader are unchanged. `AgentService(shop_data=...)` and `RestockService(shop_data)` take the repository. `AI_SQL_READER_URL` must now be a `postgresql://` URL, like `POSTGRES_URL`. PRD and AC are unchanged.

**Changed files:** `backend/ai/src/sql/repository.py` (replaces `executor.py`), `src/main.py`, `src/app_config.py`, `src/agent/service.py`, `src/agent/tools.py`, `src/restock/service.py`, comments in `src/sql/guard.py` and `src/drafts/catalog.py`, AI unit and integration tests, `backend/ai/README.md`, `backend/ai/.env.example`, `docs/development/ci-cd.md`, the AI components diagram in `docs/architecture/service-walkthrough/` (source and SVG) and this entry.

**Check:** In `backend/ai`, `uv run ruff check`, `uv run ruff format --check` and `uv run pytest` with `POSTGRES_TEST_URL` on a local PostgreSQL 16 with pgvector pass **350 passed, 13 skipped**. New integration tests: a run is read only with the shop scope and timeout set, and with a one-connection pool, a timed-out query followed by shop B and shop A runs leaves no scope, timeout or read-only flag on the reused connection. Both tests failed when the read-only option or the transaction-local settings were removed. On the local database a query took 6.26 ms with a new connection and 2.45 ms pooled. Not measured: latency against Supabase, where connection setup costs more.

### [2026-10-15 19:10 UTC+07:00] — [Mobile] Shrink the Android APK

**Done:** The published four-ABI APK was 287 MB, mostly native libraries stored uncompressed. Release builds now compress native libraries (`useLegacyPackaging`), run R8 with resource shrinking, keep only `vi` and `en` library strings, and drop the FFmpeg and libarchive builds that `react-native-sherpa-onnx` ships but the app never calls (it only streams mic PCM and downloads the model file by file). R8 keep rules cover the sherpa-onnx classes that its native code reads by name. `mobile-release.yml` gains a `Report the APK contents` step that writes the size per ABI, dex, resources and assets and the largest entries to the run page. PRD and AC are unchanged.

**Changed files:** `frontend/mobile/app.json`, `frontend/mobile/plugins/withAndroidApkSize.js` (new), `frontend/mobile/README.md`, `.github/workflows/mobile-release.yml`, `docs/development/ci-cd.md` and this entry.

**Check:** `expo prebuild` writes the expected `gradle.properties`, `build.gradle` locale filter and ProGuard rules. Two `android-dev` builds on `ubuntu-24.04` from the same base commit (runs 38729102565 and 38729105555, `arm64-v8a`): 95.2 MB before, 40.3 MB after (native libraries 62.0 → 20.3 MB stored, dex 20.1 → 8.4 MB). Not run: the four-ABI staging or production build (expected near 100 MB), and the R8 build on a device, so sign-in, barcode scanning and voice ordering in the minified build are unverified.

### [2026-10-15 20:00 UTC+07:00] — [Mobile] Release ABIs and a local Android build

**Done:** Staging and production builds carry only `armeabi-v7a` and `arm64-v8a`; x86 and x86_64 served only Intel emulators. New `scripts/android-local-release.sh` builds the release APK on a developer machine without CI (prebuild, `assembleRelease`, optional `adb install`) and prints the APK contents through `scripts/apk-contents.sh`, which the workflow's report step now shares.

**Changed files:** `.github/workflows/mobile-release.yml`, `scripts/android-local-release.sh` (new), `scripts/apk-contents.sh` (new), `frontend/mobile/README.md`, `docs/development/ci-cd.md` and this entry.

**Check:** On the Apple M4 Pro the script built the two-ABI release APK in 3 min 21 s at 58.2 MB, against 287 MB for the last published four-ABI APK. Run 38730893725 passed with the shared report step. Not run: the minified APK on a phone (sign-in, barcode scanning, voice ordering), and a staging or production run of the workflow.

### [2026-10-15 20:30 UTC+07:00] — [Mobile] One Android build script for local and CI

**Done:** `scripts/android-local-release.sh` becomes `scripts/android-release.sh` and job `build` of `mobile-release.yml` calls it instead of repeating the steps: `npm ci`, `expo prebuild --clean`, Gradle with the environment's ABIs and keystore (`--aab` for Play, `--out` for the artifact path), and the APK contents report. The workflow keeps the gate, runner choice, toolchain, secrets, R2 publish, summary and artifacts. Locally the script still turns the mocks off and points at staging Core; in GitHub Actions it uses the environment's `EXPO_PUBLIC_*` values as given. It also writes the phase marks the build summary reads.

**Changed files:** `scripts/android-release.sh` (renamed), `scripts/apk-contents.sh`, `.github/workflows/mobile-release.yml`, `frontend/mobile/README.md`, `docs/development/ci-cd.md` and this entry.

**Check:** See the run listed with this change in `docs/development/ci-cd.md` once it passes. Temporary branches `perf/mobile-apk-size-baseline` and `perf/mobile-apk-size-release-test` still exist on GitHub: this environment cannot delete remote branches.

### [2026-10-15 21:00 UTC+07:00] — [Mobile] Preflight checks in the device build scripts

**Done:** `scripts/android-release.sh` runs `.github/scripts/android-preflight.mjs` before every build, locally and in CI. The preflight now reads the Node, JDK, SDK platform, build-tools and NDK versions from the `env:` block of `mobile-release.yml`, so the workflow's separate self-hosted preflight step is gone. Locally the script prefers the pinned JDK (`/usr/libexec/java_home -v 17`) over Android Studio's newer bundled JDK. `scripts/ios-device-release.sh` checks signing before it builds: an Apple Development certificate in the keychain, and an unexpired provisioning profile for the app's bundle ID from the project's `DEVELOPMENT_TEAM` that lists the chosen iPhone (or all devices). Without one it stops with the cause and the Xcode steps, instead of `xcodebuild` failing after bundling with "No profiles for 'vn.teamhexa.songheloi' were found", as it did on a Personal Team. Both scripts accept `--skip-preflight`.

**Changed files:** `.github/scripts/android-preflight.mjs`, `.github/workflows/mobile-release.yml`, `scripts/android-release.sh`, `scripts/ios-device-release.sh`, `frontend/mobile/README.md`, `docs/development/ci-cd.md` and this entry.

**Check:** The Android preflight passes with the pinned SDK folders and fails with one line per mismatch (JDK 21 against the pinned 17, missing platform, build-tools and NDK), as `::error::` lines in GitHub Actions. The iOS signing check ran on Linux with stand-ins for `security` and `plutil` over six cases: Personal Team with no profile, a profile from another team, the iPhone missing from the profile, and an expired profile all stop with the reason; a valid profile and a wildcard all-devices profile pass. Not run on a Mac: the real `security cms` and `plutil` output, so a format difference there would show as no profile found (`--skip-preflight` bypasses it).

### [2026-10-15 21:45 UTC+07:00] — [Mobile] Full preflight with guided fixes in the device build scripts

**Done:** `scripts/ios-device-release.sh` and `scripts/android-release.sh` check the whole machine before building and report every problem at once through the shared `scripts/lib/preflight.sh` (✓, ! or ✗ per check, how to fix each failure). In a terminal they then list the fixes they can start: open the App Store page for Xcode, Xcode, Android Studio, the Firebase Console or a download page, or run `sudo xcodebuild -license accept && sudo xcodebuild -runFirstLaunch`, `sudo xcode-select -s`, `brew install` or `sdkmanager`. iOS checks: Xcode installed, selected, 15 or newer and past its first launch; CocoaPods; Node at the pinned major; `GoogleService-Info.plist`; an Apple ID and an Apple Development certificate in Xcode; a paired iPhone with Developer Mode on and an iOS version the Xcode SDK covers; the project team signed in; and a provisioning profile for the bundle ID, team and iPhone. Android checks: Node, JDK 17, the Android SDK with the pinned platform, build-tools and NDK, `google-services.json`, the release keystore when set, and a phone that allows USB debugging for `--install`. Both scripts gain `--check` (only the preflight) and keep `--skip-preflight`; all their messages are now in English. `.github/scripts/android-preflight.mjs` is removed, as the Android script now holds the check. The work moved to branch `feat/mobile-release-builds`.

**Changed files:** `scripts/lib/preflight.sh` (new), `scripts/ios-device-release.sh`, `scripts/android-release.sh`, `.github/scripts/android-preflight.mjs` (removed), `.github/workflows/mobile-release.yml`, `frontend/mobile/README.md`, `docs/development/ci-cd.md` and this entry.

**Check:** On Linux with stand-ins for the macOS tools (`xcode-select`, `xcodebuild`, `xcrun devicectl`, `security`, `plutil`, `defaults`, `open`): a fresh Mac with only the Command Line Tools reports Xcode, CocoaPods, the Firebase file, the Apple ID and the certificate missing; Xcode before its first launch; the Personal Team with no profile for `vn.teamhexa.songheloi`; no paired iPhone; Developer Mode off with iOS 26 against the 18.5 SDK, the iPhone picked by name; and a signed-in team with a valid profile, which passes. The fix menu in a pseudo-terminal starts the chosen action and rejects a wrong number. Android on Linux: no SDK and JDK 21 against 17, and an SDK missing the pinned packages with an unauthorized phone, whose menu offers the Temurin page and the `sdkmanager` install. Not run on a Mac: the real output of those tools, so a format difference would show as a false failure (`--skip-preflight` bypasses it).

### [2026-10-15 22:15 UTC+07:00] — [Mobile] Phone checks for both device build scripts

**Done:** `scripts/android-release.sh --install` checks the phone, not only adb: every connected phone's state (unauthorized, offline, no permissions), a menu or `--device <serial>` when several are ready, the phone's Android API against minSdk (read from app.json, else React Native's), its ABIs against the build's `--abis` (an x86 emulator against an ARM-only build, a 32-bit phone against an arm64-only build), and an earlier install of the app that may carry another signing key. A failed `adb install` is explained (another signing key, missing ABI, Android too old, a newer versionCode, storage, an install blocked on the phone or by Xiaomi's "Install via USB"). `scripts/ios-device-release.sh` now tells an iPhone that has not tapped Trust apart from no iPhone, and on a fresh clone generates `ios/` before the signing check so it sees the project's team (with `--check` it warns instead). The arrow-key menu moved into `scripts/lib/preflight.sh` for both scripts.

**Changed files:** `scripts/android-release.sh`, `scripts/ios-device-release.sh`, `scripts/lib/preflight.sh`, `frontend/mobile/README.md`, `docs/development/ci-cd.md` and this entry.

**Check:** On Linux with a stand-in `adb`: one ready arm64 phone with the app installed (passes, warns about the install), two phones without a terminal (asks for `--device`), two phones in a pseudo-terminal (the arrow-key menu picks the second), an Android 6 32-bit phone against an arm64 build (API and ABI failures), an x86 emulator next to an offline phone, and the install errors for another signing key, a blocked install and a missing ABI. With the macOS stand-ins: an untrusted iPhone, a fresh clone under `--check`, and the earlier Personal Team and valid-profile cases. Not run on a real Mac or phone.

### [2026-10-15 21:37 UTC+07:00] — [AI] Let the agent read debts, payments and expenses

**Done:** The chat agent could answer only about the shop profile, catalog and sales; its prompt told it "you cannot see expense or debt records". A new AI migration adds three read-only views for `query_shop_data`: `v_debts` and `v_payments` (scoped to the shop through their sale, since `debts` and `payments` have no `shop_id`) and `v_expenses` (ACTIVE only). They follow the baseline's rules (transaction-local shop setting, no `shop_id`, `security_barrier`) and leave out customer names and phone numbers (only the opaque `customer_id`, for counting customers), transfer references, the users who received or recorded money and the free-text expense description. `SqlGuard.ALLOWED_VIEWS` lists the three views, so the answer screen also blocks their names. The shop prompt's scope now includes debts, payments received and expenses; the SQL prompt describes the views, says how to count money still owed and money kept after a cancelled sale, forbids calling revenue minus expenses "profit", and adds four example queries. Charts need no change: the existing `chart` block already covers these figures. PRD `FR-020` now names these data and the PII left out; new `AC-076`–`AC-077`; BRD traceability, API contract, technical design and ERD description updated. BRD scope is unchanged: debts and expenses were already in business scope.

**Changed files:** `supabase/migrations/20261016000000_ai_read_ledger_views.sql` (new), `backend/ai/src/sql/guard.py`, `backend/ai/src/prompt_templates/shop_agent.py`, `backend/ai/src/prompt_templates/sql_agent.py`, `backend/ai/tests/support.py` (applies Core V1–V9 and the new migration), `backend/ai/tests/integration_tests/test_sql_reader.py`, `backend/ai/tests/unit_tests/test_sql_guard.py`, `backend/ai/README.md`, `docs/product/product-requirements.md`, `docs/product/business-requirements.md`, `docs/contracts/api-contracts.md`, `docs/architecture/technical-design.md`, `docs/architecture/erd-description.md` and this entry.

**Check:** In `backend/ai`, `uv run ruff check`, `uv run ruff format --check` and `uv run pytest` with `POSTGRES_TEST_URL` on a local PostgreSQL 16 with pgvector pass **416 passed, 13 skipped** (baseline 398 passed, 13 skipped). New tests: each shop sees only its own debt, payments and active expense; `SELECT *` on the three views returns exactly the listed columns and no customer name, phone, transfer reference or expense description; the views return nothing without a shop scope; the reader cannot read `debts`, `payments`, `expenses` or `customers`; the guard accepts the views and rejects those base tables. Removing the shop filter from `v_payments` made 3 tests fail. Applying Core V5 required the existing voided test sale to be PAID instead of DEBT (`ck_sales_debt_requires_customer`). Not run: a live model answering these questions, or the migration on staging, which needs Core Flyway through V9 first. Open for the PO: whether the agent may read customer names.

### [2026-10-19 13:09 UTC+07:00] — [AI] Give the agent arithmetic and a calculation sandbox

**Done:** The agent answered numeric questions by writing the arithmetic itself, so a sum of several tool results cost one model turn per step and the numbers in the answer had no audit. Two independent agent options, injected by the composition root, fix this. `calculate` (`src/calculation/`, enabled by `CALC_ENABLED`) runs an ordered step list over a closed op set (`add`, `subtract`, `multiply`, `divide`, `percentage`, `round` half-up with digits 0–6, `min`, `max`) in-process, with `$` for the previous step's result, bounded by `CALC_MAX_OPERATIONS` (20) and `CALC_MAX_OPERAND_VALUE` (1e15); a rejected plan returns `Error[CODE]` text the model can fix. `run_code` (`src/sandbox/wrapper.py`, enabled by `SANDBOX_ENABLED`, needs the harness `codemode` extra — a thin `Sandbox` wrapper is the only module importing it) lets the model write one Python program over the folded `query_shop_data`/`suggest_restock` in the Monty sandbox, bounded per snippet by `SANDBOX_MAX_MEMORY_BYTES` (64 MiB heap, over-limit becomes a model retry), `SANDBOX_MAX_DURATION_SECS` (5), `SANDBOX_MAX_TOOL_CALLS` (25) and `SANDBOX_MAX_SUSPENSIONS` (1000). Monty runs only when a turn actually writes `run_code`; the two options know nothing of each other, so a plain calculation never starts a sandbox. New `CALC_PROMPT`/`CALC_RESULT_HEADER` and the env mapping in `backend/ai/.env.example`. API contract's agent section and the AI README document both tools.

**Changed files:** `backend/ai/pyproject.toml` (the `codemode` extra), `backend/ai/src/app_config.py`, `backend/ai/src/calculation/` (new: `ops.py`, `service.py`), `backend/ai/src/sandbox/` (new: `wrapper.py`), `backend/ai/src/prompt_templates/calculation.py` (new) and `__init__.py`, `backend/ai/src/agent/tools.py`, `backend/ai/src/agent/service.py`, `backend/ai/src/main.py`, `backend/ai/.env.example`, `backend/ai/README.md`, `backend/ai/tests/unit_tests/test_calculation_ops.py` (new), `test_calculation_tool.py` (new), `test_sandbox_option.py` (new), `docs/contracts/api-contracts.md` and this entry.

**Check:** In `backend/ai`, `uv run ruff check` and `uv run pytest tests/unit_tests` pass **385 passed** (baseline 355). Verified against the harness 0.55 in a scratch run before the tests: the 64 MiB heap raises `MemoryError` at the allocation and Code Mode returns it as a model retry; a snippet may call folded tools in loops; nested calls emit no `tool_start`, one snippet is one event pair and does not count against the `ToolCallLimit` guardrail. Python's banker's rounding made `round(12500.5)` = 12500, so the `round` op uses Decimal half-up (12501, the money convention); the tests pin it. Not run: integration tests need `POSTGRES_TEST_URL`; no live-model or staging check of the new tools yet. Open for the PO: the provisional defaults above.

### [2026-10-19 14:05 UTC+07:00] — [AI][Mobile] Fix the review findings on the calculation sandbox

**Done:** The Claude Code review of commit `38cdcb6` found nine problems, all fixed. The prompts now match the tools the model actually has: `CALC_PROMPT` keeps only the calculate-tool guidance and a new `RUN_CODE_PROMPT` is appended only when the sandbox is on, so the model never reads run_code guidance for an unregistered tool; the SQL and restock prompts get a sandbox-on access line (`SQL_SANDBOX_PROMPT`, `RESTOCK_SANDBOX_PROMPT`) that names the run_code program path, since the folded tools leave the model-facing tool list. The sandbox's nested-call budget `SANDBOX_MAX_TOOL_CALLS` drops from 25 to 3 — nested data calls do not count against `AGENT_TOOL_CALL_LIMIT`, so a larger budget multiplied the DB load the guardrail bounds; the setting's comment says to raise it with the guardrail. The pure `calculate` tool is exempt from the per-turn tool-call limit through a new `tool_call_exempt` set on `GuardrailLimits` (main.py names it, only when `CALC_ENABLED`), so a query plus the sums the calculation prompt requires fit one turn. The tool docstrings now describe the real returns (a header line, then JSON, or an `Error[CODE]` sentence). `CalculationStep` forbids extra keys, so a misspelled key fails validation naming the key instead of running as a wrong figure; the round op settles a computed float on a 1e-9 scale before the half-up quantize, so 35% of 170 rounds to 60, not 59; the `_OPERATIONS` annotation now declares the 3-tuple every entry has, and the `_operand` docstring no longer claims digits never reaches it. The pyproject comment points at `src/sandbox/wrapper.py`, not the nonexistent `src/calc/sandbox.py`. The mobile step labels add `calculate` and `run_code`, so sandbox steps no longer fall back to "Xử lý yêu cầu".

**Changed files:** `backend/ai/src/prompt_templates/calculation.py`, `sql_agent.py`, `restock.py`, `__init__.py`, `backend/ai/src/agent/service.py`, `agent/tools.py`, `agent/guardrails/service.py`, `tool_call_limit.py`, `backend/ai/src/main.py`, `app_config.py`, `backend/ai/src/calculation/ops.py`, `backend/ai/pyproject.toml`, `.env.example`, `README.md`, `backend/ai/tests/unit_tests/test_calculation_ops.py`, `test_agent_guardrails.py`, `test_sandbox_option.py`, `frontend/mobile/src/lib/toolSteps.ts`, `tests/toolSteps.test.ts`, `docs/contracts/api-contracts.md` and this entry.

**Check:** In `backend/ai`, `uv run ruff check`, `uv run ruff format --check` and `uv run pytest tests/unit_tests` pass **390 passed** (baseline 385): the new tests pin the sandbox prompt gating, the unexpected-key rejection, the round of a computed half (60), and the calculate exemption past the limit. In `frontend/mobile`, `node --test tests/toolSteps.test.ts` passes 7 and `tsc --noEmit` is clean (run with the main checkout's node_modules; the worktree has none). Pre-existing failures `tests/parseOrder.test.ts` (2) and `tests/smoothText.test.ts` reproduce on the branch without these changes and stay out of scope. Not run: integration tests need `POSTGRES_TEST_URL`; no live-model or staging check yet.

### [2026-10-22 12:00 UTC+07:00] — [AI] Rank recalled memories by cosine plus unaccented BM25

**Done:** Long-term memory recall ranked the 20 nearest memories by relevance × importance × decay × (1 + ln use_count). Every recall raised `use_count`, so a few often used memories won every turn: on the recall benchmark with real embeddinggemma vectors, Recall@5 was 0.283 against 0.807 for plain cosine. `AgentMemoryRepository.search` now takes the message text; candidates are the 20 nearest by cosine plus the 20 best BM25 matches over unaccented syllables and syllable pairs of the owner's own memories, ranked by cosine + 0.1 × BM25 share of the best (Recall@5 0.860). No migration: BM25 runs in the AI service. `use_count` and `last_used_at` are still written for the owner to see. The benchmark, its grid search (830 configs), pre-registration, results and an end-to-end run of the real `search` on PostgreSQL are in `backend/ai/evaluation/memory_recall/`, with a README on rerunning and maintaining them. ADR-0002 has a new addendum; still behind `AGENT_MEMORY_ENABLED` and PO approval.

**Changed files:** `backend/ai/src/memory/repository.py`, `backend/ai/src/memory/service.py`, `backend/ai/tests/integration_tests/test_memory_repository.py`, `backend/ai/tests/unit_tests/test_agent_memory.py`, `backend/ai/evaluation/memory_recall/` (new), `backend/ai/README.md`, `docs/architecture/adr/0002-agent-long-term-memory.md` and this entry.

**Check:** In `backend/ai`, `uv run ruff check`, `uv run ruff format --check` and `uv run pytest` with `POSTGRES_TEST_URL` on PostgreSQL 16 + pgvector 0.8: 484 passed, 13 skipped. Two tests that pinned the old decay and use-count order were replaced by tests that a closer memory keeps its rank however old or unused, and one test that an unaccented word lifts a memory. `evaluation/memory_recall/e2e.py --hybrid`: Recall@5 0.721 against 0.401 for the old `search` on the same database, same top 5 as the benchmark on 97.7% of queries (the rest are ties in another order), p95 at most 18 ms per search on shops with 120+ memories. **Not verified:** the end-to-end run with real embeddings (the container cannot reach Cloudflare; the real-embedding numbers come from the benchmark), staging.

### [2026-10-22 13:20 UTC+07:00] — [AI] Move memory ranking into a pure module

**Done:** The hybrid recall rule (BM25 over unaccented syllables, candidate union, cosine + 0.1 × BM25 share) moves out of `AgentMemoryRepository` into `src/memory/ranking.py`, a module with no I/O like `restock/policy.py` and `drafts/matching.py`; the repository only loads candidates and their cosine relevance. The rule is now unit-tested without a database. ADR-0002 records where the rule lives and its scaling limit: BM25 reads every live memory of the owner per search, roughly 6 ms at 15 memories and 10 ms at 130, so past about 1,000 memories per owner (extrapolated, not measured) it should move into PostgreSQL as a `tsvector` column with a GIN index.

**Changed files:** `backend/ai/src/memory/ranking.py` (new), `src/memory/repository.py`, `tests/unit_tests/test_memory_ranking.py` (new), `backend/ai/README.md`, `evaluation/memory_recall/README.md`, `evaluation/memory_recall/results/e2e_hybrid.json`, `docs/architecture/adr/0002-agent-long-term-memory.md` and this entry.

**Check:** In `backend/ai`, `uv run ruff check`, `uv run ruff format --check` and `uv run pytest` with `POSTGRES_TEST_URL` on PostgreSQL 16 + pgvector: 492 passed, 13 skipped (8 new ranking tests). `evaluation/memory_recall/e2e.py --hybrid` reruns at Recall@5 0.721 (0.7207 before; ties now break in another order) and the same top 5 as the benchmark on 98.7% of queries.

### [2026-10-22 12:55 UTC+07:00] — [AI] Score cosine over every live memory instead of the HNSW index

**Done:** Pre-merge review of the hybrid recall found that the cosine channel could return fewer than 20 candidates: on PostgreSQL 16 + pgvector, with 52,000 rows of which one owner held 4,000, the planner chose the HNSW index, which yields the 40 nearest rows of all owners before the owner filter, so `LIMIT 20` returned 4. `AgentMemoryRepository._searched` now loads every live memory of the owner with its cosine relevance in one query (BM25 already read every one), and `ranking.rank` picks the 20 nearest by cosine and the 20 best by BM25 itself, so the whole rule lives in the pure module. ADR-0002's scaling note records the check and that `hnsw.iterative_scan` (pgvector 0.8) is needed if cosine goes back to the index.

**Changed files:** `backend/ai/src/memory/ranking.py`, `backend/ai/src/memory/repository.py`, `backend/ai/tests/unit_tests/test_memory_ranking.py`, `backend/ai/evaluation/memory_recall/results/e2e_hybrid.json`, `docs/architecture/adr/0002-agent-long-term-memory.md` and this entry.

**Check:** In `backend/ai`, `uv run ruff check`, `uv run ruff format --check` and `uv run pytest` with `POSTGRES_TEST_URL` on PostgreSQL 16 + pgvector: 492 passed, 13 skipped. `evaluation/memory_recall/e2e.py --hybrid`: Recall@5 0.721 as before, same top 5 as the benchmark on 98.1% of queries (the rest are ties), p95 at most 16 ms on shops with 120+ memories. **Not verified:** staging, real embeddings end to end. `similar` (reconcile candidates) still orders by the index with the same filter and is left as a follow-up.
