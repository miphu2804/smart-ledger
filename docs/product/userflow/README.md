---
type: Reference
title: "User flows"
description: "Screen-to-screen map of the mobile app with staging screenshots, linked to source files and `FR-*` codes."
owner: Chủ sản phẩm
status: stable
generated: { by: human:orei1i, at: 2026-11-04T18:40:27+07:00 }
stale_after: 2027-01-03T18:40:27+07:00
---
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

On 2026-11-04 some screens were retaken after #491, #499, #505, #513 and #514. The retaken screens are `welcome`, `email-login`, `invoices`, `chat-tro-ly-ai`, `chat-dat-cau-hoi` and `chat-tra-loi`; `ai-ask-sheet` is new. They were taken on staging in the Claude desktop browser pane in a 390 × 844 frame. The pane saves them at 2× (`chat-tra-loi` at about 1×, because the pane was narrow), and Pillow converts them to the same 720 px WebP at quality 78.
The signed-in screens come from another test account, whose shop is "AAAAAA". Its data was created for these screenshots on 2026-11-04: six products (Trà sữa trân châu, Bánh mì thịt, Nước suối Aquafina 500ml, Mì Hảo Hảo tôm chua cay, Sữa tươi Vinamilk 180ml, Trứng gà), five orders #27285–#27289 (four cash, one transfer) and two Bobi conversations. The email in `email-login` is the placeholder `ten@example.com`.
