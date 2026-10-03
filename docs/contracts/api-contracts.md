# Hợp đồng API — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đích MVP; các endpoint đã triển khai được đánh dấu riêng bên dưới |
| Chủ sở hữu | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-10-03 |

## Tài liệu liên quan

- [PRD](../product/product-requirements.md): `FR-*` mà hợp đồng phải phủ.
- [Thiết kế kỹ thuật](../architecture/technical-design.md): module và luồng.

## Phạm vi

- API công khai cho mobile OWNER và dashboard web ADMIN nằm dưới `/api/v1`; base URL do môi trường cấu hình.
- API Core ↔ AI nằm dưới `/internal/v1` và không công khai cho FE.
- Không dùng cổng trong sơ đồ kiến trúc làm hợp đồng API.
- PostgreSQL/pgvector, Redis, Langfuse và LiteLLM không có API công khai cho FE. FE không gọi trực tiếp các thành phần này.

**Đã đối chiếu:** controller/DTO/service và migration Core trong working tree `feat/core-business`, ngày 2026-10-03. Các mục 1–4 là API nghiệp vụ/audit Core hiện có; mục 5 có proxy Agent đã triển khai và các API AI khác vẫn là đích. Không coi code hiện có là bằng chứng đã deploy staging hoặc nghiệm thu FE. Hiện trạng nằm trong [thiết kế kỹ thuật](../architecture/technical-design.md); mục 6 phân biệt Agent nội bộ hiện có với parse/recommendation/insight chưa tích hợp, mục 7 dashboard vẫn là đích.

**AI nhập từ staging:** AI có `GET /health` và năm endpoint `/internal/v1/agent/*` (chat, list, detail, rename, delete), cùng tóm tắt chat cuốn chiếu và tìm lịch sử. Mọi đường `/internal/v1/*` bắt buộc `X-Internal-Token`; thiếu/sai token hoặc AI chưa cấu hình `INTERNAL_API_TOKEN` trả `401`, riêng `/health` vẫn công khai. Core proxy `/api/v1/agent/*` sang các đường này, gửi `X-Internal-Token` và lấy `user_id`/`shop_id` từ tiệm của OWNER đã xác thực; AI `404` thành `conversation_not_found`, lỗi hoặc quá thời gian khác thành `503 ai_unavailable`. Không coi việc nhập code AI là nghiệm thu luồng FE → Core → AI; web admin vẫn dùng mock theo mặc định.

## Quy ước request

- Core dùng `Authorization: Bearer <Firebase ID token>`, không cấp access/refresh token riêng.
- Auth/me và các API shop dùng ID trong path, không cần `X-Shop-Id`. Category/Product/Customer/Draft/Sale/Payment/Debt/Expense/Report/Audit/Agent bắt buộc `X-Shop-Id` của shop `ACTIVE` thuộc OWNER đang hoạt động. ADMIN không dùng API ghi sổ.
- Ngoại lệ quản trị hiện có: `PATCH /api/v1/shops/{shopId}/status` chỉ ADMIN. Các API dashboard `/api/v1/admin/*` vẫn là đích.
- JSON nghiệp vụ Core dùng camelCase; ID là số `BIGINT`, tiền là số nguyên VND; quantity dùng `numeric(15,3)`. API AI và proxy Agent giữ snake_case cho conversation_id/message_id.
- Core/DB xử lý thời điểm UTC/`TIMESTAMPTZ`; timestamp JSON Core dùng ISO 8601 với offset Việt Nam `+07:00`. Timestamp đầu vào cần offset (`Z` hoặc `+07:00`); kỳ báo cáo theo `Asia/Ho_Chi_Minh`.
- Body JSON dùng `Content-Type: application/json`; dấu `?` bên dưới chỉ field tùy chọn, không mặc nhiên cho phép explicit null.

## 0. Hợp đồng lỗi và chống ghi trùng

Core trả `{ code, message, details?: [{ field, issue }], traceId }`; bỏ details khi rỗng. Thiếu/sai token trả `401 unauthorized`; chưa có profile Core trả `404 auth_profile_not_found` (mở session trước); shop khác chủ trả `403 shop_access_denied`; shop INACTIVE trả `403 shop_inactive` kèm lý do. Thiếu header bắt buộc trả `400 missing_required_header`; validation body và query/path param sai kiểu (ví dụ enum lạ, thời điểm không đúng ISO 8601) trả `400 validation_failed` với `details[].field` là tên param. Unique barcode tranh chấp trả `409 product_barcode_conflict`; hai request mở phiên lần đầu cùng lúc cho một tài khoản Firebase trả `409 auth_session_conflict` cho request thua, FE gọi lại `POST /auth/session`; lỗi DB chưa nhận diện trả `500 internal_error`, không lộ chi tiết nội bộ. Deadlock hoặc không lấy được khóa DB trả `503 resource_busy`: FE gửi lại đúng request, giữ nguyên `Idempotency-Key` nếu có.

**Bắt buộc `Idempotency-Key` (1–255 ký tự, không rỗng; được trim khi lưu)** trên đúng ba POST: `/debts/{debtId}/payments`, `/expenses`, `/sales/{saleId}/void`. FE tạo key mới cho một hành động, giữ nguyên khi retry cùng body/path. Phạm vi key là shop + operation; cùng người dùng/nội dung trả response `201` ban đầu, không lặp tác động. Khác người dùng/nội dung trả `409 idempotency_key_conflict`; key hết hạn trả `409 idempotency_key_expired`; rỗng/quá dài trả `400 invalid_idempotency_key`. TTL mặc định 30 ngày, chưa có job dọn key; không tự xóa key quá hạn. Lỗi nghiệp vụ rollback cả reservation, có thể sửa request rồi retry với key chưa được commit.

V7 tạo bảng key. Confirm draft chống trùng bằng draftId, không yêu cầu key. Các POST tạo customer/category/product/draft/shop chưa có bảo vệ key; không coi idempotency đã phủ toàn bộ API. GET không cần key.

## 1. Auth và tiệm

| Method | Đường | Body / request | Response |
|---|---|---|---|
| `POST` | `/api/v1/auth/session` | Token + `{ displayName? }`; tên bắt buộc khi tạo profile lần đầu | `200 AuthSessionResponse` |
| `GET` | `/api/v1/me` | Token | `200 AuthSessionResponse` |
| `POST` | `/api/v1/shops` | `{ name, industry, phone?, address? }` | `201 ShopResponse` |
| `GET` | `/api/v1/shops/{shopId}` | ID trong path | `200 ShopResponse` |
| `PATCH` | `/api/v1/shops/{shopId}` | `{ name?, industry?, phone?, address? }` | `200 ShopResponse` |
| `DELETE` | `/api/v1/shops/{shopId}` | Body bắt buộc `{ archivedReason }` | `204` (archive) |
| `PATCH` | `/api/v1/shops/{shopId}/status` | ADMIN: `{ status: ACTIVE\|INACTIVE, inactiveReason? }` | `200 ShopResponse` |

`AuthSessionResponse = { user, role: OWNER|ADMIN, shops, needsOnboarding }`; user có dạng `UserResponse = { id, displayName, email, phone, avatarUrl }`, shops là danh sách ShopResponse. ADMIN có shops rỗng và needsOnboarding false. Core quyết định role từ server; không nhận role tự nâng từ client. Danh sách shop có thể truy cập lấy từ `/me`, không có `GET /shops` hay `/shops/current`.

`ShopResponse = { id, name, industry, phone, address, status, inactiveReason, archivedReason }`. name/industry bắt buộc khi tạo. PATCH phải có ít nhất một giá trị cập nhật; null như bỏ qua, phone/address rỗng có thể xóa nội dung. OWNER chỉ sửa/archive shop ACTIVE; archivedReason không rỗng, tối đa 500 ký tự. INACTIVE vẫn GET được hồ sơ/lý do nhưng các API nghiệp vụ bị chặn; ARCHIVED GET trả `404 shop_not_found` và bị loại khỏi danh sách phiên.

ADMIN đặt INACTIVE phải có inactiveReason không rỗng; đặt ACTIVE xóa lý do đó. Endpoint status không nhận ARCHIVED và không mở lại shop đã archive. OWNER gọi status trả `403 admin_access_required`. Đổi trạng thái ghi audit `SHOP_INACTIVATED`/`SHOP_REACTIVATED` với actor là ADMIN (xem [Lịch sử audit của tiệm](#lịch-sử-audit-của-tiệm)).

Core ánh xạ `auth_identities.provider_subject` bằng Firebase UID. Provider linking diễn ra ở Firebase; kiểm thử UI/provider thật không được suy ra từ việc Core xác thực token.

Phủ `FR-010`, `FR-011`, `NFR-003`; dashboard `FR-022` vẫn cần tích hợp.

## 2. Category, Product và Customer

Các API dưới đây bắt buộc Bearer token và `X-Shop-Id`. GET list/detail chỉ trả bản ghi ACTIVE; DELETE là archive, không xóa lịch sử liên quan.

### 2.1. Category

| Method | Đường | Body | Response |
|---|---|---|---|
| `POST` | `/api/v1/categories` | `{ name }` | `201 CategoryResponse` |
| `GET` | `/api/v1/categories` | — | `200 CategoryResponse[]` |
| `GET` | `/api/v1/categories/{categoryId}` | — | `200 CategoryResponse` |
| `PUT` | `/api/v1/categories/{categoryId}` | `{ name }` | `200 CategoryResponse` |
| `DELETE` | `/api/v1/categories/{categoryId}` | — | `204` |

name không rỗng, tối đa 150 ký tự; không unique. Category nhóm product trong shop, không phân loại shop. Còn product ACTIVE thì archive trả `409 category_has_products`.

`CategoryResponse = { id, shopId, name, status, createdAt, updatedAt }`.

### 2.2. Product

| Method | Đường | Body | Response |
|---|---|---|---|
| `POST` | `/api/v1/products` | Product create như dưới | `201 ProductResponse` |
| `GET` | `/api/v1/products` | — | `200 ProductResponse[]` |
| `GET` | `/api/v1/products/{productId}` | — | `200 ProductResponse` |
| `PATCH` | `/api/v1/products/{productId}` | Các field tùy chọn như dưới | `200 ProductResponse` |
| `DELETE` | `/api/v1/products/{productId}` | — | `204` |

Create: `{ categoryId?, name, barcode?, imageUrl?, unit, sellingPriceVnd, costPriceVnd?, tracked, stockQuantity? }`. name/unit không rỗng (max 255/50), sellingPriceVnd và costPriceVnd nếu có ≥ 0; barcode/imageUrl max 100/1000. categoryId nếu có phải ACTIVE cùng shop. tracked=true bắt buộc stockQuantity ≥ 0; tracked=false không nhận stockQuantity khác null. Barcode unique trong shop kể cả product đã archive; shop khác có thể dùng cùng barcode, null/rỗng không có barcode.

PATCH: bỏ field giữ nguyên; explicit null chỉ cho categoryId/barcode/imageUrl/costPriceVnd/stockQuantity theo ràng buộc tồn. Không cho null name/unit/sellingPriceVnd/tracked. Đổi sang tracked=false xóa tồn; đổi false→true phải cung cấp tồn. PATCH/archive khóa dòng product để không ghi đè tồn khi checkout đồng thời.

`ProductResponse = { id, shopId, categoryId, name, barcode, imageUrl, unit, sellingPriceVnd, costPriceVnd, tracked, stockQuantity, status, createdAt, updatedAt }`.

### 2.3. Customer

| Method | Đường | Body | Response |
|---|---|---|---|
| `POST` | `/api/v1/customers` | `{ name, phone? }` | `201 CustomerResponse` |
| `GET` | `/api/v1/customers` | — | `200 CustomerResponse[]` |
| `GET` | `/api/v1/customers/{customerId}` | — | `200 CustomerResponse` |
| `PUT` | `/api/v1/customers/{customerId}` | `{ name, phone? }` | `200 CustomerResponse` |
| `DELETE` | `/api/v1/customers/{customerId}` | — | `204` |

name không rỗng (max 150), phone tùy chọn (max 30), được chuẩn hóa. Tên/phone không unique, không tự tìm/gộp khách. FE chọn bằng customerId từ danh sách, chưa có API search riêng. Archive khách không xóa sale/debt và không ngăn thu nợ lịch sử.

`CustomerResponse = { id, shopId, name, phone, status, createdAt, updatedAt }`.

Phủ `FR-009`, `FR-013`, `FR-016`.

## 3. Bản nháp → Sale → Payment → Void/Refund

Sale là bản ghi bán hàng nội bộ, **không phải hóa đơn điện tử**. Không có `POST /api/v1/invoices` hoặc POST sale trực tiếp. Confirm mới tạo sale/item/payment/debt và trừ tồn theo dõi trong một transaction.

| Method | Đường | Request | Response |
|---|---|---|---|
| `POST` | `/api/v1/sale-drafts` | Body draft như dưới | `201 SaleDraftResponse` |
| `GET` | `/api/v1/sale-drafts` | — | `200 SaleDraftResponse[]` |
| `GET` | `/api/v1/sale-drafts/{draftId}` | — | `200 SaleDraftResponse` |
| `PUT` | `/api/v1/sale-drafts/{draftId}` | Thay toàn bộ draft/items | `200 SaleDraftResponse` |
| `DELETE` | `/api/v1/sale-drafts/{draftId}` | Hủy draft còn sửa được, giữ lịch sử | `204` |
| `POST` | `/api/v1/sale-drafts/{draftId}/confirm` | Không có body/key | `201 SaleResponse` |
| `GET` | `/api/v1/sales` | Gồm CONFIRMED và VOIDED | `200 SaleResponse[]` |
| `GET` | `/api/v1/sales/{saleId}` | — | `200 SaleResponse` |
| `GET` | `/api/v1/sales/{saleId}/payments` | — | `200 PaymentResponse[]` |
| `GET` | `/api/v1/sales/{saleId}/payments/{paymentId}` | ID payment phải thuộc sale | `200 PaymentResponse` |
| `POST` | `/api/v1/sales/{saleId}/void` | Body void + Idempotency-Key | `201 SaleVoidResponse` |
| `GET` | `/api/v1/sales/{saleId}/refund` | — | `200 SaleRefundResponse` |

### Draft và xác nhận

Ví dụ trộn catalog/món tùy ý:

```json
{
  "discountVnd": 0,
  "initialPaidVnd": 35000,
  "initialPaymentMethod": "CASH",
  "items": [
    { "productId": 3, "quantity": 1, "unitPriceVnd": 25000 },
    { "productName": "Món tùy ý", "unit": "phần", "quantity": 1, "unitPriceVnd": 10000 }
  ]
}
```

- items không rỗng; quantity > 0; unitPriceVnd ≥ 0 (giá bán của dòng do request chọn, không bắt buộc bằng giá catalog). lineTotalVnd làm tròn HALF_UP về VND; tổng sau discount phải > 0.
- Bỏ/null productId phải có productName/unit không rỗng (max 255/50); không tự tạo Product hoặc tồn kho. Catalog cần product ACTIVE cùng shop, snapshot tên/đơn vị lấy từ product; gửi kèm productName/unit cho item có productId trả `400 draft_item_invalid`. Lặp catalog product trả `400 draft_item_duplicate`; món tùy ý là dòng độc lập.
- discountVnd/initialPaidVnd tùy chọn mặc định 0, không âm. initialPaidVnd là số thực thu, không phải tiền khách đưa trước khi trả tiền thừa, và không vượt tổng. > 0 bắt buộc initialPaymentMethod CASH|TRANSFER; = 0 thì method phải null/bỏ qua, sai trả `400 draft_payment_invalid`.
- customerId hoặc customerName/customerPhone tùy chọn. customerId phải ACTIVE cùng shop; tên/phone snapshot lấy từ hồ sơ này. Không có ID: draft có thể chưa có khách; confirm còn nợ cần tên không rỗng (`400 customer_required_for_debt`), phone tùy chọn. Core tạo khách mới khi confirm bán thiếu, không tự tìm khách trùng tên/phone. Thu đủ có thể không có khách.
- Draft chỉ sửa/hủy khi DRAFT còn hiệu lực; hết hạn sau một tháng từ lúc tạo, không gia hạn khi sửa. Canceled/expired vẫn đọc được; thao tác không hợp lệ trả `409 draft_not_editable`.
- Confirm thiếu tồn trả `409 product_stock_insufficient` và rollback toàn bộ. Retry draft đã CONFIRMED trả cùng saleId và trạng thái sale hiện tại (có thể đã VOIDED), không tạo thêm payment hoặc trừ tồn.

`SaleDraftResponse = { id, shopId, customerName, customerPhone, discountVnd, estimatedTotalVnd, initialPaidVnd, initialPaymentMethod, status, expiresAt, confirmedSaleId, items, customerId }`.

`SaleResponse = { id, shopId, customerName, customerPhone, subtotalVnd, discountVnd, totalVnd, paidVnd, saleStatus, paymentStatus, soldAt, items, customerId, outstandingVnd, voidedAt, voidedByUserId, voidReason }`.

Item draft/sale: `{ id, productId, productName, unit, quantity, unitPriceVnd, lineTotalVnd }`. productId có thể null. `stock_deducted` chỉ lưu DB, không phải field response.

`PaymentResponse = { id, saleId, amountVnd, paymentMethod, type: INITIAL|DEBT_REPAYMENT, receivedAt }`. Payment chỉ thêm, không sửa/xóa; payment không thuộc sale trả `404 payment_not_found`.

### Hủy toàn bộ và hoàn tiền

Không có PATCH/DELETE sale đã chốt, không có API hoàn/trả từng phần. Body void:

```json
{
  "reason": "Khách hủy đơn và đã nhận lại tiền",
  "restockItems": true,
  "refundMethod": "CASH",
  "transferReference": null
}
```

reason bắt buộc không rỗng (max 500); restockItems bắt buộc boolean, thiếu/null trả 400. refundMethod CASH|TRANSFER bắt buộc khi đã thu > 0 (`400 sale_refund_method_required`); chưa thu phải bỏ/null (`400 sale_refund_method_invalid`). transferReference tùy chọn max 255. Không nhận amount, refund.confirmed hay danh sách số lượng trả: Core tính toàn bộ tổng payment đã thu, bao gồm tiền trả nợ sau chốt. Đây là ghi nhận đã hoàn, không tự chuyển tiền qua ngân hàng.

`SaleVoidResponse = { sale: SaleResponse, refund: SaleRefundResponse|null, cancelledDebtVnd, stockRestocked }`.

`SaleRefundResponse = { id, saleId, amountVnd, refundMethod, transferReference, refundedByUserId, refundedAt }`.

- Một sale có tối đa một refund. Đơn 100.000đ đã thu 40.000đ: refund.amountVnd = 40.000, cancelledDebtVnd = 60.000. Chưa thu: refund=null, không tạo row; GET refund trả `404 sale_refund_not_found`.
- Chỉ nợ OPEN còn dư chuyển VOIDED, lưu voidedAt/cancelledVnd. Nợ SETTLED giữ nguyên settledAt và audit hủy null. Sale VOIDED có outstandingVnd=0 nhưng paidVnd/paymentStatus giữ lịch sử, payments không bị xóa/âm hóa.
- restockItems=false không đổi kho. true hoàn toàn bộ lượng thực sự đã trừ theo snapshot stock_deducted; false snapshot (kể cả món tùy ý) bỏ qua. stockRestocked=true chỉ khi có product được hoàn tồn. Snapshot lịch sử null hoặc product không còn theo dõi tồn trả `409 sale_restock_unavailable`, rollback toàn bộ. Product đã archive nhưng vẫn theo dõi tồn hợp lệ có thể nhận hoàn tồn.
- Sai lệch tổng payment và paidVnd trả `409 sale_payment_mismatch`, không tự sửa tiền. Sale đã void: cùng key/body replay kết quả cũ; key khác trả `409 sale_already_voided`.
- Void/repay khóa cùng thứ tự sale → debt → product (ID tăng dần khi cần). Refund, hủy nợ, hoàn tồn, audit sale và idempotency cùng một transaction.

Phủ `FR-003`–`FR-005`, `FR-013`, `FR-014`, `FR-016`, `AC-024`–`AC-032`.

## 4. Chi phí, nợ và báo cáo

| Method | Đường | Body / query | Response |
|---|---|---|---|
| `POST` | `/api/v1/expenses` | Expense create + Idempotency-Key | `201 ExpenseResponse` |
| `GET` | `/api/v1/expenses` | period tùy chọn; bỏ qua lấy toàn bộ ACTIVE | `200 ExpenseResponse[]` |
| `GET` | `/api/v1/expenses/{expenseId}` | — | `200 ExpenseResponse` |
| `PATCH` | `/api/v1/expenses/{expenseId}` | Các field tùy chọn | `200 ExpenseResponse` |
| `DELETE` | `/api/v1/expenses/{expenseId}` | Archive | `204` |
| `GET` | `/api/v1/debts` | Gồm OPEN/SETTLED/VOIDED | `200 DebtResponse[]` |
| `GET` | `/api/v1/debts/{debtId}` | — | `200 DebtResponse` |
| `POST` | `/api/v1/debts/{debtId}/payments` | Repayment + Idempotency-Key | `201 DebtRepaymentResponse` |
| `GET` | `/api/v1/reports/summary` | period tùy chọn, mặc định today | `200 ReportSummaryResponse` |

Expense create: `{ category?, description, amountVnd, paymentMethod?, expenseAt? }`; description không rỗng max 500, category max 150, amountVnd > 0, method CASH|TRANSFER nếu có. expenseAt mặc định hiện tại. PATCH giữ field bỏ qua; category/paymentMethod cho explicit null, description/amountVnd/expenseAt không null; request không có field trả `400 expense_update_required`.

`ExpenseResponse = { id, shopId, category, description, amountVnd, paymentMethod, expenseAt, status, createdAt, updatedAt }`.

Repayment: `{ amountVnd, paymentMethod, transferReference? }`; amountVnd > 0 không vượt outstanding (`400 debt_payment_invalid`), method bắt buộc CASH|TRANSFER. Nợ SETTLED trả `409 debt_already_settled`; sale VOIDED trả `409 sale_already_voided`. Không có DELETE nợ hoặc API tạo/sửa số dư nợ độc lập.

`DebtRepaymentResponse = { debt: DebtResponse, payment: PaymentResponse }`.

`DebtResponse = { id, saleId, customerId, originalVnd, outstandingVnd, status, createdAt, settledAt, voidedAt, cancelledVnd }`. canceled debt có outstanding=0, cancelledVnd là số dư hủy, không phải refund.

### Tổng quan theo kỳ

period: `today`, `yesterday`, `this_week` (thứ Hai tới hiện tại), `week` (7 ngày lịch gồm hôm nay), `month` (đầu tháng tới hiện tại), `year` (01/01 tới hiện tại). Kỳ theo giờ Việt Nam, cửa sổ `[fromInclusive, toExclusive)`; yesterday là ngày trước trọn vẹn, các kỳ khác kết thúc tại thời điểm truy vấn.

`ReportSummaryResponse = { period, fromInclusive, toExclusive, grossRevenueVnd, voidedRevenueVnd, netRevenueVnd, collectedVnd, expenseVnd, currentOutstandingDebtVnd, orderCount, refundedVnd, voidedOrderCount }`.

| Chỉ số | Nguồn / thời điểm |
|---|---|
| grossRevenueVnd / orderCount | Giá trị sale đã trừ discount / số sale theo soldAt trong kỳ, gồm cả sale sau đó VOIDED |
| voidedRevenueVnd / voidedOrderCount | Giá trị toàn đơn / số đơn bị hủy theo voidedAt trong kỳ, gồm đơn bán kỳ trước |
| netRevenueVnd | grossRevenueVnd − voidedRevenueVnd; có thể âm, không phải tiền thực thu/lợi nhuận |
| collectedVnd | Tổng payment theo receivedAt, không loại theo trạng thái hiện tại của sale |
| refundedVnd | Tổng sale_refunds theo refundedAt |
| expenseVnd | Expense ACTIVE theo expenseAt; sửa/archive expense có thể thay đổi số kỳ cũ |
| currentOutstandingDebtVnd | Tổng số dư nợ hiện tại của toàn shop, không lọc kỳ, không phải số dư cuối kỳ |

Tiền thu ròng có thể tính collectedVnd − refundedVnd; không có field netCollected/profit riêng. Summary không trả confirmedRevenueVnd, series, best_sellers hay lợi nhuận ước tính; các chỉ số nâng cao vẫn là đích FR-006 cần triển khai sau.

Phủ `FR-006`, `FR-015`, `FR-016`, `AC-007`, `AC-024`, `AC-031`.

### Lịch sử audit của tiệm

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/api/v1/audit-logs` | Query `action?`, `entityId?`, `from?`, `to?`, `page=0`, `size=20` | `200 AuditLogPageResponse` |

Chỉ đọc, bắt buộc Bearer token và `X-Shop-Id` của shop ACTIVE do OWNER sở hữu; không có API tạo/sửa/xóa audit. Kết quả mới nhất trước (createdAt, id giảm dần). `from` inclusive, `to` exclusive, ISO 8601 có offset; `size` 1–100, `page` từ 0, `entityId` dương, `from` phải trước `to`, sai các ràng buộc này trả `400 invalid_audit_query`. `action` không thuộc danh sách dưới hoặc param sai kiểu trả `400 validation_failed`.

`AuditLogPageResponse = { content: AuditLogResponse[], page, size, totalElements, totalPages }`; `AuditLogResponse = { id, shopId, actorUserId, actorRole, action, entityType, entityId, outcome, reason, requestId, idempotencyKey, metadata, createdAt }`. outcome luôn `SUCCESS`: chỉ ghi thao tác thành công, cùng transaction nghiệp vụ; thao tác lỗi/rollback không để lại audit. metadata chỉ chứa key được khai báo cho từng action (số tiền, tồn trước/sau, trường đã đổi), không chứa tên/SĐT khách, token hay IP.

action: `SALE_CONFIRMED`, `SALE_VOIDED`, `SALE_REFUND_RECORDED`, `DEBT_REPAYMENT_RECORDED`, `DEBT_VOIDED`, `STOCK_ADJUSTED`, `STOCK_RESTORED_ON_VOID`, `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_ARCHIVED`, `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_ARCHIVED`, `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_ARCHIVED`, `SHOP_CREATED`, `SHOP_UPDATED`, `SHOP_ARCHIVED`, `SHOP_INACTIVATED`, `SHOP_REACTIVATED`.

Bảng `audit_logs` append-only (V10, trigger chặn UPDATE/DELETE/TRUNCATE). Truy vết: `BR-017` trong [BRD](../product/business-requirements.md), `FR-028`/`FR-029` và `AC-033`–`AC-039` trong [PRD](../product/product-requirements.md#8-tiêu-chí-nghiệm-thu-cốt-lõi). Nghiệm thu lịch sử OWNER qua API/DB không đồng nghĩa đã tích hợp màn hình FE; endpoint này không thay thế yêu cầu audit truy cập của ADMIN (`BR-014`, `NFR-009`, `AC-017`).

## 5. AI qua Core — Agent đã có, proposal và insight vẫn là đích

Năm endpoint `/api/v1/agent/*` đã có controller/service Core; `/api/v1/ai/drafts`, replenishment và insights vẫn là hợp đồng đích, chưa có controller Core. Proxy Agent chỉ phục vụ chat/lịch sử, không tự ghi sale, payment, debt, expense, invoice hoặc tồn kho. Không suy ra luồng AI proposal → draft → confirm đã hoàn thành từ proxy chat.

| Method | Đường | Input | Trả về |
|---|---|---|---|
| `POST` | `/api/v1/ai/drafts` | JSON `{ type: TEXT, mode, text }` hoặc multipart `type=AUDIO\|IMAGE`, `mode=SALE\|EXPENSE`, `file` | `DraftView` |
| `GET` | `/api/v1/replenishment?period=` | — | `ReplenishmentView[]` |
| `POST` | `/api/v1/insights/chat` | `{ conversation_id?, message, period? }` | `InsightMessageView` |
| `POST` | `/api/v1/agent/chat` | `{ conversation_id?, message }` | `AgentChatMessageView` |
| `GET` | `/api/v1/agent/conversations` | `X-Shop-Id` | `AgentConversationSummary[]` |
| `GET` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id` | `AgentConversationView` |
| `PATCH` | `/api/v1/agent/conversations/{conversation_id}` | `{ title }` (1–255 ký tự, không rỗng) | `AgentConversationSummary` |
| `DELETE` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id` | `204 No Content` |

`DraftView`:

```json
{
  "request_id": "uuid",
  "transcript": "bán hai cà phê sữa",
  "mode": "SALE",
  "items": [
    {
      "product_id": "uuid-or-null",
      "name": "Cà phê sữa",
      "qty": 2,
      "unit_price": 25000,
      "confidence": 0.94
    }
  ],
  "warnings": []
}
```

`ReplenishmentView` gồm `product_id`, `product_name`, `suggested_qty`, `period`, `reason`. `InsightMessageView` gồm `conversation_id`, `message_id`, `answer`, `period`, `citations`, `insufficient_data`.

`AgentChatMessageView` gồm `conversation_id`, `message_id`, `answer`. `AgentConversationSummary` gồm `conversation_id`, `title`, `last_message_at`. `AgentConversationView` gồm summary và `messages[]` với `message_id`, `role` (`USER` hoặc `ASSISTANT`), `content`, `created_at`. ID hội thoại và tin nhắn là `BIGINT` như ERD.

Các endpoint Agent yêu cầu OWNER đã xác thực và `X-Shop-Id` của shop ACTIVE thuộc OWNER. Core lấy user/shop từ tiệm đã xác thực; FE không gửi `user_id` để tự xác định quyền. Danh sách, xem, chat, đổi tên và xóa đều giới hạn theo user/shop. Core gửi `X-Internal-Token`; AI 404 được ánh xạ thành `404 conversation_not_found`, lỗi kết nối/timeout hoặc lỗi AI khác thành `503 ai_unavailable`, theo format lỗi Core tại mục 0. Chat trả ba field app-facing conversation_id/message_id/answer, không chuyển model/service metadata tới FE. Không có retry đồng bộ tự động trong AgentServiceImpl.

Phủ `FR-007`, `FR-008`, `FR-017`, `FR-018`, `FR-020`, `FR-021`, `FR-025`.

## 6. Core ↔ AI nội bộ

Các đường Agent đã có ở AI và được proxy bởi Core trong mục 5. Các đường parse/recommendation/insight cùng tích hợp Core cho chúng vẫn là hợp đồng đích. Test Core với AI stub không thay nghiệm thu runtime AI/model thật.

| Method | Đường | Trách nhiệm |
|---|---|---|
| `POST` | `/internal/v1/agent/chat` | Input `{ user_id, shop_id, conversation_id?, message }`; trả `{ conversation_id, message_id, request_id, answer, model, model_version }` |
| `GET` | `/internal/v1/agent/conversations` | Nhận `user_id`, `shop_id`; trả danh sách hội thoại |
| `GET` | `/internal/v1/agent/conversations/{conversation_id}` | Nhận `user_id`, `shop_id`; trả hội thoại và tin nhắn |
| `PATCH` | `/internal/v1/agent/conversations/{conversation_id}` | Nhận `user_id`, `shop_id`, `title`; trả summary đã đổi tên |
| `DELETE` | `/internal/v1/agent/conversations/{conversation_id}` | Nhận `user_id`, `shop_id`; xóa hội thoại |
| `POST` | `/internal/v1/drafts/parse` | Text/voice/image → `DraftView` |
| `POST` | `/internal/v1/recommendations/replenishment` | Tạo gợi ý nhập hàng có lý do |
| `POST` | `/internal/v1/insights/chat` | Trả lời có citation và phạm vi thời gian |

Yêu cầu chung:

- timeout hoặc lỗi model trả `503` với `{ "detail": "ai_unavailable" }`; Core không retry đồng bộ quá một lần;
- response thành công có `request_id`, `model`, `model_version`;
- AI không có endpoint tạo/sửa/xóa dữ liệu nghiệp vụ;
- Core và AI cùng kiểm tra `shop_id`; test chéo shop là bắt buộc;
- Core chuyển `user_id` đã xác thực; AI truy vấn theo cả `user_id` và `shop_id`. Hội thoại không tồn tại hoặc không thuộc phạm vi trả `404 conversation_not_found`;
- chat được giữ qua các phiên đến khi OWNER xóa; xóa chat loại tin nhắn khỏi lịch sử và ngữ cảnh assistant. MVP không áp TTL tự động;
- Core gọi `/internal/v1/*` với header `X-Internal-Token` mang giá trị `INTERNAL_API_TOKEN` của môi trường. Thiếu header hoặc sai giá trị trả `401` với `{ "detail": "unauthorized" }`. Khi AI chưa cấu hình token thì mọi đường `/internal/v1/*` trả `401` (fail closed), riêng `/health` vẫn trả lời bình thường;

### Công cụ đọc dữ liệu tiệm của agent

Agent có tool nội bộ `query_shop_data` để trả lời câu hỏi về hồ sơ tiệm, nhóm hàng và sản phẩm. Đây không phải endpoint: **không có** `POST /internal/v1/agent/sql`, Core và FE chỉ nối `/internal/v1/agent/chat`, request và response của chat không đổi.

- Model chỉ truyền `sql`; `shop_id` lấy từ request đã xác thực và tới tool qua runtime context của LangChain, không nằm trong schema tool hay system prompt, nên model không đổi được phạm vi tiệm.
- Truy vấn chạy bằng role chỉ đọc `ai_sql_reader` trên ba view của schema `ai_read`: `v_shop_profile`, `v_categories`, `v_products`. View tự lọc theo tiệm của transaction và không có cột `shop_id`; role không có quyền trên bảng gốc.
- SQL phải qua bộ kiểm tra AST: đúng một câu `SELECT` (cho phép `WITH`, `UNION`), chỉ dùng hàm và kiểu cast trong allowlist. Transaction `READ ONLY`, `statement_timeout` mặc định 3000 ms, tối đa 100 dòng, luôn rollback; mỗi lượt chat gọi model tối đa 4 lần và tool tối đa 3 lần.
- Truy vấn bị bộ kiểm tra hoặc database từ chối, hoặc quá thời gian, trả về model dạng `Error[CODE]: lý do` (ví dụ `UNSAFE_FUNCTION`, `QUERY_TIMEOUT`, `SQL_ERROR`) để model viết lại câu truy vấn; lượt chat vẫn trả lời. Database đọc không kết nối được thì lượt chat trả `503 ai_unavailable`. Khi AI chưa cấu hình `AI_SQL_READER_URL`, agent vẫn chat nhưng không có tool này.
- Guardrail tất định quanh agent: tin nhắn mới dài quá 2000 ký tự được trả lời ngắn bằng tiếng Việt, không gọi model; số thẻ được che và khóa API/token bị xóa khỏi tin nhắn trước khi gửi model và trước khi lưu; câu trả lời rỗng hoặc lộ chi tiết nội bộ (tên view, SQL, mã lỗi) được thay bằng câu trả lời an toàn. Hợp đồng request/response của `/internal/v1/agent/chat` không đổi.
- Giai đoạn 1 chưa đọc doanh thu, chi phí, công nợ hay khách hàng. Chi tiết vận hành nằm trong [README của AI](../../backend/ai/README.md#shop-data-tool-read-only-sql).

### Ngữ cảnh chat và bản tóm tắt cuốn chiếu

AI gửi cho model bản tóm tắt đã lưu, rồi tới mọi tin nhắn chưa được gộp vào bản tóm tắt. Một tin chỉ rời ngữ cảnh sau khi đã nằm trong bản tóm tắt, nên không mất thông tin. Việc gộp chạy nền sau khi trả lời và chỉ gọi model tóm tắt khi số tin chưa gộp vượt ngưỡng, nên phần lớn lượt không phát sinh thêm chi phí. Bản tóm tắt thuộc hội thoại nên bị xóa cùng hội thoại. Hợp đồng này không đổi request hay response của `/internal/v1/agent/chat`.

## 7. Dashboard quản trị — hợp đồng đích

Các GET dashboard này chưa có controller Core; không nhầm với API ADMIN đổi trạng thái shop tại mục 1. Core đã ghi audit_logs cho thao tác ghi thành công (xem [Lịch sử audit của tiệm](#lịch-sử-audit-của-tiệm)), nhưng chưa ghi audit khi ADMIN xem dữ liệu; `NFR-009`/`AC-017` vẫn chưa đạt.

Các endpoint dưới đây chỉ đọc, yêu cầu role `ADMIN` và ghi audit khi truy cập dữ liệu chi tiết. OWNER nhận `403 forbidden`.

| Method | Đường | Body / query | Trả về |
|---|---|---|---|
| `GET` | `/api/v1/admin/overview` | — | `AdminOverviewView` |
| `GET` | `/api/v1/admin/users?query=&page=` | tìm theo tên, email hoặc số điện thoại | `AdminUserPage` |
| `GET` | `/api/v1/admin/shops?query=&page=` | tìm theo tên hoặc thông tin liên hệ | `AdminShopPage` |
| `GET` | `/api/v1/admin/shops/{id}` | — | `AdminShopDetailView` |

`AdminOverviewView` chỉ gồm số liệu tổng hợp tối thiểu phục vụ hỗ trợ. `AdminShopDetailView` không trả token, secret hoặc dữ liệu sổ chi tiết ngoài phạm vi hỗ trợ. MVP không có giả danh OWNER và không có endpoint ADMIN sửa hóa đơn, chi phí, công nợ hoặc tồn kho.

Phủ `FR-022`–`FR-024`, `NFR-003`, `NFR-009`.
