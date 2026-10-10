### [2026-10-10 15:50 UTC+07:00] — [Fix] Password fields: show/hide button and no lost text when editing on iOS

**Done:** The password field on the email sign-in and sign-up screen has an eye button that shows or hides the characters. On iOS, deleting or typing one character after returning to a hidden password field no longer wipes the whole password: iOS clears a secure field on the first edit after it regains focus, and the field now rebuilds the previous value for that edit.

**Changed files:** `frontend/mobile/src/components/ui.tsx` (`Field`) and this entry.

**Flow explained:** `Field` shows the eye button whenever it is given `secureTextEntry`; today only the password field in `app/(auth)/email.tsx` does. On iOS, while the characters are hidden, the first change after the field gains focus (or after hiding the characters again) that drops two or more characters and leaves zero or one is treated as the system clearing the field: a delete keeps the previous value minus its last character, a typed character is appended to the previous value. A single key press changes the length by at most one, so normal edits are untouched, and Android and revealed text are not touched at all.

**Check:** `tsc --noEmit` clean. Android emulator in mock mode: the eye button shows the typed text and hides it again, and deleting one character leaves the rest. A scratch check of the length rule passed 9 cases (not part of the repo). **Not verified:** the iOS behaviour itself (no iPhone or simulator was available), so the rebuild rule is based on the known iOS secure-field behaviour; selecting all and deleting as the first edit after refocus removes only the last character; and the web build in a browser.

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
