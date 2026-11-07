# Product screenshots for marketing

Phone-ratio screenshots of the Sổ Nghe Lời app, arranged by product flow so the marketing team can use them as assets. This folder does not define product behavior; behavior lives in the [PRD](../product/product-requirements.md). This first set is an internal asset and is not yet approved for public posting.

## Image specifications

- Size: 1170 × 2532 px (a 390 × 844 pt frame at 3x density, a 9:19.5 ratio, equal to the screen resolution of the iPhone 12 through 14), PNG format.
- No status bar and no device bezel, so the screenshots can be placed inside a phone frame when laid out.
- Source: the web build of the mobile app running in preview mode (`EXPO_PUBLIC_USE_MOCK=true`), captured automatically with headless Chrome through [`frontend/mobile/scripts/marketing-screenshots/`](../../frontend/mobile/scripts/marketing-screenshots/capture.mjs) (see [How to recapture](#how-to-recapture)). The interface shares code with the phone app, but each image has not been checked against a real device.
- Version: the `staging` branch at `7d65486`, captured on 2026-10-27 (Vietnam time). The previous set was captured on 2026-10-12 at `33d2da4`; since then the app changed the tab bar (Tổng quan · Đơn hàng · Tạo đơn · Trợ lý Bobi · Quản lý), moved Đọc đơn and Quét mã into the Tạo đơn screen, and replaced item photos with the first letter of the name.

## Image list

### `dashboard/` — Overview, sales, and management

| Image | Content |
|---|---|
| [01-tong-quan.png](dashboard/01-tong-quan.png) | Tổng quan screen: today's revenue compared with yesterday, order count, shop-wide debt, average per order; the tab bar has the Tạo đơn button in the middle |
| [02-tong-quan-uu-tien-va-ban-chay.png](dashboard/02-tong-quan-uu-tien-va-ban-chay.png) | Tổng quan scrolled down (collapsed header): priority tasks, a suggestion from closed data, today's best sellers |
| [03-bao-cao-doanh-thu.png](dashboard/03-bao-cao-doanh-thu.png) | Báo cáo: today's revenue, revenue by hour, income and expenses, and estimated gross profit |
| [04-don-hang.png](dashboard/04-don-hang.png) | Đơn hàng: search, filter by period, total orders and revenue, orders grouped by day |
| [05-ban-hang.png](dashboard/05-ban-hang.png) | Tạo đơn: the Đọc đơn and Quét mã buttons, search, item groups, two-column product grid |
| [06-ban-hang-co-gio-hang.png](dashboard/06-ban-hang-co-gio-hang.png) | Tạo đơn after items are selected: increase/decrease buttons on the cards and the cart bar (3 items, 55.000đ) |
| [07-quan-ly.png](dashboard/07-quan-ly.png) | Quản lý: shop information, reports, goods, expenses, debt, settings, review the guide |
| [08-hang-hoa.png](dashboard/08-hang-hoa.png) | Hàng hoá: item count, inventory value, number of items running low, a restock button per item |
| [09-cong-no.png](dashboard/09-cong-no.png) | Công nợ: total outstanding, number of customers in debt, and each customer |

### `chat/` — AI assistant

| Image | Content |
|---|---|
| [01-tro-ly-ai.png](chat/01-tro-ly-ai.png) | The Trợ lý Bobi screen when opened: the greeting and suggested questions |
| [02-dat-cau-hoi.png](chat/02-dat-cau-hoi.png) | Typing the question "Món nào sắp hết hàng?" |
| [03-tra-loi.png](chat/03-tra-loi.png) | The assistant answers with the list of items running low |

### `barcode/` — Barcode scanning

| Image | Content |
|---|---|
| [01-quet-ma-vach.png](barcode/01-quet-ma-vach.png) | Scan screen: the viewfinder and the row of control buttons |
| [02-nhan-dien-mon.png](barcode/02-nhan-dien-mon.png) | Scanning an item that exists in the catalog (code `8935049500544`): item card, stock, quantity, and line total |
| [03-don-tam-trong-man-quet.png](barcode/03-don-tam-trong-man-quet.png) | The temporary order inside the scan screen, with the payment button ready |
| [04-ma-chua-co-trong-danh-muc.png](barcode/04-ma-chua-co-trong-danh-muc.png) | Scanning a code that is not yet in the catalog (`8936079140014`): the prompt to add an item |
| [05-them-mat-hang-moi.png](barcode/05-them-mat-hang-moi.png) | Adding a new item from the code just scanned, with the name and price already filled in, saved to the catalog |

### `voice/` — Voice order reading

| Image | Content |
|---|---|
| [01-doc-don.png](voice/01-doc-don.png) | The Đọc đơn screen when opened |
| [02-nghe-va-ghi-don.png](voice/02-nghe-va-ghi-don.png) | The order recorded after the phrase "2 cà phê sữa đá 1 bánh mì thịt 3 mì gói" |
| [03-mon-moi-nhap-so-luong.png](voice/03-mon-moi-nhap-so-luong.png) | Ordering an item that is not yet in the catalog ("1 sữa chua nếp cẩm"): enter the price, quantity, and unit to add it to the catalog |
| [04-don-da-ghi.png](voice/04-don-da-ghi.png) | A complete order of 4 items, total 98.000đ, with the payment button ready |

## What to know before use

### Check against Core — 2026-10-26

The images above keep the snapshot/mock stated in the source section and must not be relabeled as backend acceptance images. Core capabilities are described by the contract:

| Image group | Boundary when presenting Core capabilities |
|---|---|
| `dashboard/` | Core has report summary, top-products, sales-series, and profit-estimate; the figures in the images are still mock. Core's sales-series currently has only DAY granularity, so the hourly chart in the images does not prove that an hourly series API exists |
| `barcode/` | Core has barcode lookup for an ACTIVE Product; camera and frame recognition belong to the FE. The images do not prove that a real device/provider has been accepted |
| `voice/` | Core accepts an already structured draft for validation/finalization; there is no Core API yet that parses voice/images into a draft. The stated image source uses Nhập tay, so it is not evidence of backend STT |
| `chat/` | Core has an Agent chat/stream proxy, but the answers in the image set are mock; they do not replace testing FE → Core → real AI/provider |

Details have a single source in the [API contract](../contracts/api-contracts.md), and the current state of the code is in the [technical design](../architecture/technical-design.md#1-scope).

- **Everything is sample data.** Shop names, customer names, phone numbers, revenue, and debt come from the app's preview mode and are not the data of a real shop.
- **The AI assistant in the images is the preview-mode assistant**, not a real AI model. The answers contain the line "(Số liệu giả lập từ danh mục mẫu của tiệm hiện tại.)". The `chat/` images suit illustrating the interface; to present answer quality, recapture from a real account.
- **The camera frame in `barcode/` is a hand-drawn illustration** (a package and an EAN-13 barcode), not a real product photo. The code reading in the images is real: the app reads the code from that frame itself.
- **In `voice/`, the order phrase is typed through the "Nhập tay" button** in place of speech; the item splitting and order recording run as they do when speaking.
- **Brand names.** The sample data contains third-party brand names (for example CocaCola, Sting). Before public posting, the responsible person needs to review the use of these names.
- **Item images are the first letter of the name.** Since [#193](https://github.com/miphu2804/smart-ledger/pull/193) the app no longer uses network images for items without a photo; the item card shows the first letter on a colored background. The new image set therefore no longer contains Unsplash images.

## How to recapture

1. Run the web build of the mobile app in preview mode on port 8082, from `frontend/mobile`:
   `CI=1 EXPO_PUBLIC_USE_MOCK=true EXPO_PUBLIC_MOCK_CORE=true EXPO_PUBLIC_MOCK_SHOPS=true npx expo start --web --port 8082 --clear`
   (see the [mobile README](../../frontend/mobile/README.md)). Open `http://localhost:8082` once so Metro finishes the build.
2. From the repo root, with Chrome installed (Node 22 or later, no extra packages needed):
   `node frontend/mobile/scripts/marketing-screenshots/capture.mjs docs/marketing`
   Add a flow name (`dashboard`, `chat`, `barcode`, `voice`) to recapture only that flow. `APP_URL` changes the web build address, and `CHROME_PATH` changes the Chrome path.
3. The script sets a 390 × 844 @3x frame, clicks "Vào app", and then walks the screens in the table above. The page camera is replaced by a portrait 720 × 1280 canvas that draws a package with an EAN-13 code (`8935049500544` is in the sample catalog, `8936079140014` is not); the order phrase is typed through "Nhập tay".
4. Review each image before committing: sample data changes with the capture date (times on orders, "hôm nay", "hôm qua").
