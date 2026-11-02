# User flows

The user flow map shows how the mobile app moves from screen to screen: screenshots, decisions, system steps and failure edges in red, each node linked to its source file under `frontend/mobile` and its `FR-*` codes in the [PRD](../product-requirements.md).
Open [`index.html`](index.html) in a browser; it needs no server or install. Pick a flow from the title menu, drag to pan, use Ctrl/Cmd + scroll or `+`/`-` to zoom and `0` to fit, and click a node to see its screenshot, source file, FR codes and next hops. `?flow=&node=` in the address keeps the selected flow and node. The page is built for desktop screens.

The six flows are sign-in and shop setup, selling and checkout, orders with reports and notifications, the Bobi assistant, the Quản lý tab, and the quick menu with shop switching.

## Rebuild

The page source is `frontend/web/src/userflow`: `flows.ts` holds the nodes, edges, coordinates, captions and notes, traced from the router calls in `frontend/mobile/app`. After changing it, run from `frontend/web`:

```bash
npm run userflow
```

The command writes `index.html` here as one self-contained file, with the script, styles and font inlined, because browsers refuse module scripts and fonts loaded from `file://`. Commit the page with the source change. Add `-- --watch` to rebuild on every save while moving nodes.

## Screenshots

`screens/` holds one WebP per screen node, named after its `image` field. They were taken on 2026-11-02 on `https://app-staging.songheloi.id.vn` with the test account on the shop "Tiệm Test Team", in a 390 × 844 frame, then converted to 720 px wide WebP with `cwebp -q 78 -resize 720 0`.
The data in them is staging test data: orders #27282 (on debt), #27283 and #27284 (typed through "Nhập tay" in Đọc đơn) and one Bobi conversation, created for these screenshots.
Barcode scanning, email verification, shop setup and stock-in have no screenshot and stay as step nodes with a note: scanning needs a real camera, the test account has already verified its email and has a shop, and the test shop tracks no stock, so the Nhập hàng button does not appear.
When the app changes a screen, retake that screen on staging the same way, replace its file and rebuild the page.
