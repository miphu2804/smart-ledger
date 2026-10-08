# Hợp đồng API — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đích MVP; các endpoint đã triển khai được đánh dấu riêng bên dưới |
| Chủ sở hữu | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-10-07 |

## Tài liệu liên quan

- [PRD](../product/product-requirements.md): `FR-*` mà hợp đồng phải phủ.
- [Thiết kế kỹ thuật](../architecture/technical-design.md): module và luồng.

## Phạm vi

- API công khai cho mobile OWNER và dashboard web ADMIN nằm dưới `/api/v1`; base URL do môi trường cấu hình.
- API Core ↔ AI nằm dưới `/internal/v1` và không công khai cho FE.
- Không dùng cổng trong sơ đồ kiến trúc làm hợp đồng API.
- Redis, Langfuse và LiteLLM không có API công khai. FE không gọi trực tiếp các thành phần này.

**Hiện trạng Core (đối chiếu `staging` tại `b1de421c461d59473b3bb73aae103027afd67a89`, ngày 2026-10-06):** mục 1–4 và 7 là API Core đã có. Bảng mục 5–6 giữ trạng thái từng endpoint từ lần rà soát AI trước; lượt này không rà soát lại AI. Có trong code không đồng nghĩa đã deploy staging hay nghiệm thu FE; hiện trạng triển khai/kiểm thử nằm trong [thiết kế kỹ thuật](../architecture/technical-design.md#1-phạm-vi).

**Bổ sung Core ngày 2026-10-06 trên `feat/core-stock-in` (base staging `99ed97a9d03656fe782ae43c81526e68a8c0cc08`):** endpoint stock-in, contract PATCH product và ba report nâng cao dưới đây có trong nhánh này, chưa xác nhận đã merge/deploy staging. Mobile chưa được sửa để dùng các contract mới.

**Bổ sung media ngày 2026-10-07 trên nhánh hiện tại:** Core có upload/delete Product image, Shop logo và avatar qua Cloudinary; V13 phải được migrate trước khi runtime dùng các entity mới trên DB shared. Đây chưa phải xác nhận FE/staging đã tích hợp.

**AI và proxy Agent:** AI có `GET /health` và năm endpoint `/internal/v1/agent/*` (chat, list, detail, rename, delete), cùng tóm tắt chat cuốn chiếu và tìm lịch sử. Mọi đường `/internal/v1/*` bắt buộc `X-Internal-Token`; thiếu/sai token hoặc AI chưa cấu hình `INTERNAL_API_TOKEN` trả `401`, riêng `/health` vẫn công khai. Core proxy `/api/v1/agent/*` sang các đường này, gửi `X-Internal-Token` và lấy `user_id`/`shop_id` từ tiệm của OWNER đã xác thực; AI `404` thành `conversation_not_found`, lỗi hoặc quá thời gian khác thành `503 ai_unavailable`. Chưa có nghiệm thu đầu-cuối luồng FE → Core → AI với model thật.

## Quy ước request

- Core dùng `Authorization: Bearer <Firebase ID token>`, không cấp access/refresh token riêng.
- Auth/me và các API shop dùng ID trong path, không cần `X-Shop-Id`. Category/Product/Customer/Draft/Sale/Payment/Debt/Expense/Report bắt buộc `X-Shop-Id` của shop `ACTIVE` thuộc OWNER đang hoạt động. ADMIN không dùng API ghi sổ.
- Quản trị: `PATCH /api/v1/shops/{shopId}/status` và các GET `/api/v1/admin/*` chỉ ADMIN đang hoạt động; dashboard dùng ID/filter riêng, không yêu cầu `X-Shop-Id` và không mở quyền API OWNER.
- JSON Core dùng camelCase; ID là số `BIGINT`, tiền là số nguyên VND; quantity dùng `numeric(15,3)`. API AI và các route `/api/v1/agent/*` Core chuyển tiếp giữ snake_case.
- Core/DB xử lý thời điểm UTC/`TIMESTAMPTZ`; timestamp JSON Core dùng ISO 8601 với offset Việt Nam `+07:00`. Timestamp đầu vào cần offset (`Z` hoặc `+07:00`); kỳ báo cáo theo `Asia/Ho_Chi_Minh`.
- Body JSON dùng `Content-Type: application/json`; dấu `?` bên dưới chỉ field tùy chọn, không mặc nhiên cho phép explicit null.
- Upload media dùng `Content-Type: multipart/form-data` với đúng một part `image`. Core chỉ nhận bytes JPEG/PNG, tối đa 5 MiB và 1–2048 px; không tin MIME/đuôi file. URL response là read-only; không trả Cloudinary credential, public ID hoặc hash file.

## 0. Hợp đồng lỗi và chống ghi trùng

Core trả `{ code, message, details?: [{ field, issue }], traceId }`; bỏ details khi rỗng. Thiếu/sai token trả `401 unauthorized`; chưa có profile Core trả `404 auth_profile_not_found` (mở session trước); shop khác chủ trả `403 shop_access_denied`; shop INACTIVE trả `403 shop_inactive` kèm lý do. Thiếu header bắt buộc trả `400 missing_required_header`; validation body và query/path param sai kiểu (ví dụ enum lạ, thời điểm không đúng ISO 8601) trả `400 validation_failed` với `details[].field` là tên param. Unique barcode tranh chấp trả `409 product_barcode_conflict`; hai request mở phiên lần đầu cùng lúc cho một tài khoản Firebase trả `409 auth_session_conflict` cho request thua, FE gọi lại `POST /auth/session`; lỗi DB chưa nhận diện trả `500 internal_error`, không lộ chi tiết nội bộ. Deadlock hoặc không lấy được khóa DB trả `503 resource_busy`: FE gửi lại đúng request, giữ nguyên `Idempotency-Key` nếu có.

**Bắt buộc `Idempotency-Key` (1–255 ký tự, không rỗng; được trim khi lưu)** trên sáu POST: `/debts/{debtId}/payments`, `/expenses`, `/sales/{saleId}/void`, `/products/{productId}/stock-in`, `/products/{productId}/image`, `/shops/{shopId}/logo`. FE tạo key mới cho một hành động, giữ nguyên khi retry cùng body/path/file. Phạm vi key là shop + operation; cùng người dùng/nội dung trả response ban đầu (`200` cho stock-in/media, `201` cho ba luồng còn lại), không lặp tác động. Riêng upload Product/logo, Core commit reservation PENDING trước call provider: request trùng khi đang upload trả `409 media_upload_in_progress`; client chờ rồi retry cùng key/file. PENDING có lease `MEDIA_UPLOAD_LEASE_SECONDS` (mặc định 300 giây); nếu process chết trước lúc hoàn tất, cùng key/file có thể claim lại sau lease. Khi hoàn tất, response giữ TTL idempotency thông thường. Khác người dùng/nội dung trả `409 idempotency_key_conflict`; key hết hạn trả `409 idempotency_key_expired`; rỗng/quá dài trả `400 invalid_idempotency_key`. TTL mặc định 30 ngày, chưa có job dọn key; không tự xóa key quá hạn. Lỗi nghiệp vụ rollback cả reservation, có thể sửa request rồi retry với key chưa được commit. Avatar không có key vì V7 là shop-scoped; client không được retry mù sau khi process restart.

V7 tạo bảng key. Confirm draft chống trùng bằng draftId, không yêu cầu key. Các POST tạo customer/category/product/draft/shop chưa có bảo vệ key; không coi idempotency đã phủ toàn bộ API. GET không cần key.

## 1. Auth và tiệm

| Method | Đường | Body / request | Response |
|---|---|---|---|
| `POST` | `/api/v1/auth/session` | Token + `{ displayName? }`; tên bắt buộc khi tạo profile lần đầu | `200 AuthSessionResponse` |
| `GET` | `/api/v1/me` | Token | `200 AuthSessionResponse` |
| `POST` | `/api/v1/me/avatar` | multipart `image` | `200 UserResponse` |
| `DELETE` | `/api/v1/me/avatar` | — | `204` |
| `POST` | `/api/v1/shops` | `{ name, industry, phone?, address? }` | `201 ShopResponse` |
| `GET` | `/api/v1/shops/{shopId}` | ID trong path | `200 ShopResponse` |
| `PATCH` | `/api/v1/shops/{shopId}` | `{ name?, industry?, phone?, address? }` | `200 ShopResponse` |
| `POST` | `/api/v1/shops/{shopId}/logo` | multipart `image` + `Idempotency-Key` | `200 ShopResponse` |
| `DELETE` | `/api/v1/shops/{shopId}/logo` | — | `204` |
| `DELETE` | `/api/v1/shops/{shopId}` | Body bắt buộc `{ archivedReason }` | `204` (archive) |
| `PATCH` | `/api/v1/shops/{shopId}/status` | ADMIN: `{ status: ACTIVE\|INACTIVE, inactiveReason? }` | `200 ShopResponse` |

`AuthSessionResponse = { user, role: OWNER|ADMIN, shops, needsOnboarding }`; user có dạng `UserResponse = { id, displayName, email, phone, avatarUrl }`, shops là danh sách ShopResponse. ADMIN có shops rỗng và needsOnboarding false. Core quyết định role từ server; không nhận role tự nâng từ client. Danh sách shop có thể truy cập lấy từ `/me`, không có `GET /shops` hay `/shops/current`.

`ShopResponse = { id, name, industry, phone, address, logoUrl, status, inactiveReason, archivedReason }`. name/industry bắt buộc khi tạo. PATCH phải có ít nhất một giá trị cập nhật; null như bỏ qua, phone/address rỗng có thể xóa nội dung. OWNER chỉ sửa/archive shop ACTIVE; archivedReason không rỗng, tối đa 500 ký tự. INACTIVE vẫn GET được hồ sơ/lý do nhưng các API nghiệp vụ bị chặn; ARCHIVED GET trả `404 shop_not_found` và bị loại khỏi danh sách phiên. Logo là public delivery URL; upload/delete không dùng PATCH logoUrl.

ADMIN đặt INACTIVE phải có inactiveReason không rỗng; đặt ACTIVE xóa lý do đó. Endpoint status không nhận ARCHIVED và không mở lại shop đã archive. OWNER gọi status trả `403 admin_access_required`. Đổi trạng thái ghi một audit `SHOP_INACTIVATED`/`SHOP_REACTIVATED` với actor ADMIN, beforeStatus/afterStatus và lý do; event này phục vụ cả lịch sử tiệm và projection ADMIN, không ghi trùng. Không ghi được audit trả `503 admin_audit_unavailable`, rollback thay đổi trạng thái/lý do (xem [Dashboard quản trị](#7-dashboard-quản-trị--đã-có-trong-core)).

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
| `POST` | `/api/v1/products/{productId}/image` | multipart `image` + `Idempotency-Key` | `200 ProductResponse` |
| `DELETE` | `/api/v1/products/{productId}/image` | — | `204` |
| `POST` | `/api/v1/products/{productId}/stock-in` | `{ quantity, reason? }` + `Idempotency-Key` | `200 ProductResponse` (đã có trên nhánh stock-in) |
| `DELETE` | `/api/v1/products/{productId}` | — | `204` |

Create: `{ categoryId?, name, barcode?, unit, sellingPriceVnd, costPriceVnd?, tracked, stockQuantity? }`. `imageUrl` không phải input mới và giá trị URL thô khác rỗng bị từ chối; dùng POST image sau khi tạo Product. name/unit không rỗng (max 255/50), sellingPriceVnd và costPriceVnd nếu có ≥ 0; barcode max 100. categoryId nếu có phải ACTIVE cùng shop. tracked=true bắt buộc stockQuantity ≥ 0; tracked=false không nhận stockQuantity khác null. Barcode unique trong shop kể cả product đã archive; shop khác có thể dùng cùng barcode, null/rỗng không có barcode.

PATCH chỉ nhận `{ categoryId?, name?, barcode?, unit?, sellingPriceVnd?, costPriceVnd?, tracked? }`: bỏ field giữ nguyên; explicit null chỉ cho categoryId/barcode/costPriceVnd. `imageUrl` (kể cả null) trả `400 product_image_url_unsupported`; dùng endpoint image. Không cho null name/unit/sellingPriceVnd/tracked. **Không nhận stockQuantity kể cả null**, trả `400 invalid_request` kèm chi tiết field và thông báo dùng stock-in. Đổi false→true khởi tạo tồn 0, true→true giữ tồn hiện tại; tracked=false xóa tồn. PATCH/archive khóa dòng product để không ghi đè tồn khi checkout/void/stock-in đồng thời. Create và response vẫn giữ stockQuantity.

Stock-in chỉ cho OWNER hoạt động, shop ACTIVE thuộc OWNER và product ACTIVE cùng shop có tracked=true. quantity bắt buộc > 0, tối đa 12 chữ số nguyên và 3 thập phân; reason tùy chọn/null, tối đa 500 ký tự, trim và trống thành null. Body không hợp lệ trả `400 validation_failed`; productId không dương/sai định dạng trả `400 invalid_product_id`; product thiếu/khác shop/ARCHIVED trả `404 product_not_found`; không theo dõi tồn trả `409 product_stock_in_unavailable`. Tổng tồn vượt `999999999999.999` trả `409 product_stock_overflow`, không đổi dữ liệu.

Core reserve key với operation `PRODUCT_STOCK_IN` rồi khóa dòng product; tồn mới = tồn hiện tại + quantity. Hash gồm product ID, quantity chuẩn hóa (5/5.000 tương đương), reason đã chuẩn hóa. Retry cùng request trả **snapshot ProductResponse lúc nhập**, không phải số tồn hiện tại sau thao tác khác. Ghi một audit `STOCK_ADJUSTED` với source `STOCK_IN`, quantity/beforeStock/afterStock, reason và key; cộng tồn/audit/kết quả replay cùng transaction. Không tạo expense/payment/debt/sale, không cập nhật giá vốn; không có phiếu nhập/ledger mới hay nhập âm/kiểm kê. Gợi ý AI không tự gọi thao tác ghi.

**Phối hợp mobile trước tích hợp:** bỏ stockQuantity khỏi DTO/payload PATCH kể cả lúc tắt theo dõi; false→true nhận tồn 0 rồi gọi stock-in khi OWNER nhập hàng. Bổ sung API/UI nhập quantity/reason, giữ key khi retry và refresh product từ kết quả hoặc GET mới. Mock cũng phải theo contract mới; lượt này không sửa FE và chưa nghiệm thu end-to-end.

`ProductResponse = { id, shopId, categoryId, name, barcode, imageUrl, unit, sellingPriceVnd, costPriceVnd, tracked, stockQuantity, status, createdAt, updatedAt }`.

Media Product/logo chỉ cho OWNER của shop ACTIVE. Transaction ghi sau upload khóa lại và kiểm tra Shop/Product còn ACTIVE; avatar cũng khóa lại và kiểm tra user còn ACTIVE. DELETE là no-op thành công khi chưa có ảnh và enqueue xóa asset provider cũ sau commit; archive Product/Shop không xóa media. Avatar chỉ cho chính user ACTIVE, delivery bằng URL authenticated được tạo khi response; nếu media disabled, session vẫn thành công nhưng avatarUrl là null. Các write media trả `503 media_unavailable` khi `CLOUDINARY_ENABLED=false` hoặc provider không sẵn sàng; lỗi input lần lượt là `400 image_required`, `413 image_too_large`, `415 image_type_invalid`, `400 image_dimensions_invalid`.

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

Phủ `FR-009`, `FR-013`, `FR-016`, `FR-030`, `AC-044`–`AC-048`.

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
| `GET` | `/api/v1/reports/top-products` | `period?`, `limit=10`, `sortBy=NET_REVENUE` | `200 TopProductsReportResponse` |
| `GET` | `/api/v1/reports/sales-series` | `period?`, `granularity=DAY` | `200 SalesSeriesReportResponse` |
| `GET` | `/api/v1/reports/profit-estimate` | `period?` | `200 ProfitEstimateReportResponse` |

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

Tiền thu ròng có thể tính collectedVnd − refundedVnd; summary không có field netCollected/profit và giữ nguyên response để tương thích. Ba endpoint sau dùng cùng period/cửa sổ với summary, bắt buộc token OWNER và `X-Shop-Id` ACTIVE thuộc OWNER.

### Bán chạy, chuỗi ngày và lãi ước tính

`top-products`: `limit` 1–100; `sortBy=NET_REVENUE|QUANTITY`, mặc định NET_REVENUE. Response:

```text
TopProductsReportResponse = { period, fromInclusive, toExclusive, sortBy, items }
TopProduct = { itemKey, productId, productName, unit, source, grossQuantity, voidedQuantity,
               netQuantity, grossRevenueVnd, voidedRevenueVnd, netRevenueVnd }
```

Catalog group theo `productId` và vẫn có sau khi product archive; custom (`productId=null`) group không phân biệt hoa/thường theo tên + đơn vị snapshot đã trim, source=`CUSTOM`. `itemKey` là khóa opaque ổn định trong response, FE không tự phân tích. Gross lấy item của sale theo soldAt, voided lấy item của sale void theo voidedAt, net = gross − voided và có thể âm. Revenue từng dòng là phần `sale.totalVnd` sau discount được phân bổ theo tỷ lệ `lineTotalVnd`; phần dư làm tròn được gán cho item ID nhỏ nhất của sale nên tổng dòng luôn khớp tổng sale. Tie-break sau metric giảm dần là itemKey tăng dần.

`sales-series`: MVP chỉ nhận `granularity=DAY`. Response `SalesSeriesReportResponse = { period, fromInclusive, toExclusive, granularity, items }`, mỗi item `{ date, grossRevenueVnd, voidedRevenueVnd, netRevenueVnd, orderCount, voidedOrderCount }`. `date` là ngày `Asia/Ho_Chi_Minh`; Core fill đủ mọi ngày trong kỳ, kể cả bucket 0. Sale cộng tại soldAt, void trừ tại voidedAt; không gộp payment/refund/expense vào series doanh thu.

`profit-estimate` response:

```text
ProfitEstimateReportResponse = {
  period, fromInclusive, toExclusive,
  grossRevenueVnd, voidedRevenueVnd, netRevenueVnd,
  grossEstimatedCogsVnd, voidedEstimatedCogsVnd, netEstimatedCogsVnd,
  estimatedGrossProfitVnd, expenseVnd, estimatedOperatingProfitVnd,
  isComplete, unknownCostItemCount, unknownCostRevenueVnd
}
```

Khi confirm catalog item, Core snapshot `estimated_cost_vnd = round_HALF_UP(costPriceVnd × quantity)` là tổng giá vốn dòng. Product không có cost, custom item và lịch sử trước V12 giữ NULL; không backfill từ giá hiện tại hoặc đoán 60%. Net COGS = gross COGS theo soldAt − voided COGS theo voidedAt; gross profit = net revenue − net COGS; operating profit = gross profit − Expense ACTIVE theo expenseAt. `isComplete=false` khi có bất kỳ item-event liên quan thiếu cost; `unknownCostItemCount` đếm các contribution bán/void thiếu cost và `unknownCostRevenueVnd` là tổng tuyệt đối revenue đã phân bổ chịu ảnh hưởng, không phải khoản trừ ròng. Các số profit đều là ước tính vận hành, không phải số kế toán/thuế.

`period` lạ trả `400 invalid_report_period`; limit ngoài 1–100 trả `400 invalid_report_query`; enum sort/granularity sai trả `400 validation_failed`.

Phủ `FR-006`, `FR-015`, `FR-016`, `AC-007`, `AC-024`, `AC-031`, `AC-049`–`AC-052`.

### Lịch sử audit của tiệm

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/api/v1/audit-logs` | Query `action?`, `entityId?`, `from?`, `to?`, `page=0`, `size=20` | `200 AuditLogPageResponse` |

Chỉ đọc, bắt buộc Bearer token và `X-Shop-Id` của shop ACTIVE do OWNER sở hữu; không có API tạo/sửa/xóa audit. Kết quả mới nhất trước (createdAt, id giảm dần). `from` inclusive, `to` exclusive, ISO 8601 có offset; `size` 1–100, `page` từ 0 và page × size không quá 2.147.483.647, `entityId` dương, `from` phải trước `to`, sai các ràng buộc này trả `400 invalid_audit_query`. Enum action không tồn tại hoặc param sai kiểu trả `400 validation_failed`; action đọc ADMIN đã biết (`ADMIN_*`) trả `400 invalid_audit_query`. Kết quả luôn loại event đọc ADMIN, nhưng vẫn có event ADMIN đổi trạng thái tiệm theo danh sách bên dưới.

`AuditLogPageResponse = { content: AuditLogResponse[], page, size, totalElements, totalPages }`; `AuditLogResponse = { id, shopId, actorUserId, actorRole, action, entityType, entityId, outcome, reason, requestId, idempotencyKey, metadata, createdAt }`. outcome luôn `SUCCESS`: chỉ ghi thao tác thành công, cùng transaction nghiệp vụ; thao tác lỗi/rollback không để lại audit. metadata chỉ chứa key được khai báo cho từng action (số tiền, tồn trước/sau, trường đã đổi), không chứa tên/SĐT khách, token hay IP.

action: `SALE_CONFIRMED`, `SALE_VOIDED`, `SALE_REFUND_RECORDED`, `DEBT_REPAYMENT_RECORDED`, `DEBT_VOIDED`, `STOCK_ADJUSTED`, `STOCK_RESTORED_ON_VOID`, `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_ARCHIVED`, `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_ARCHIVED`, `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_ARCHIVED`, `SHOP_CREATED`, `SHOP_UPDATED`, `SHOP_ARCHIVED`, `SHOP_INACTIVATED`, `SHOP_REACTIVATED`.

`STOCK_ADJUSTED` dùng source `SALE_CONFIRM` khi bán, `CATALOG_EDIT` khi đổi theo dõi tồn, `STOCK_IN` khi nhập kho. Với stock-in: entityType PRODUCT/entityId product, metadata chỉ quantity/beforeStock/afterStock/source; reason/key ở field audit riêng. Replay không tạo thêm event.

Bảng `audit_logs` append-only (V10, trigger chặn UPDATE/DELETE/TRUNCATE; V11 bổ sung action đọc ADMIN). Truy vết: `BR-017` trong [BRD](../product/business-requirements.md), `FR-028`/`FR-029` và `AC-033`–`AC-039` trong [PRD](../product/product-requirements.md#8-tiêu-chí-nghiệm-thu-cốt-lõi). Nghiệm thu lịch sử OWNER qua API/DB không đồng nghĩa đã tích hợp màn hình FE; audit truy cập ADMIN có [contract riêng](#7-dashboard-quản-trị--đã-có-trong-core), không mở endpoint OWNER cho ADMIN.

## 5. AI qua Core

AI chỉ tạo bản nháp/gợi ý và câu trả lời chat. Các endpoint này không ghi invoice, expense hoặc tồn kho.

| Method | Đường | Input | Trả về | Trạng thái |
|---|---|---|---|---|
| `POST` | `/api/v1/ai/drafts` | JSON `{ type: TEXT, mode, text }` hoặc multipart `type=AUDIO\|IMAGE`, `mode=SALE\|EXPENSE`, `file` | `DraftView` | Đích |
| `POST` | `/api/v1/agent/chat` | `{ conversation_id?, message }` | `AgentChatMessageView` | Đã có |
| `GET` | `/api/v1/agent/conversations` | `X-Shop-Id` | `AgentConversationSummary[]` | Đã có |
| `GET` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id` | `AgentConversationView` | Đã có |
| `PATCH` | `/api/v1/agent/conversations/{conversation_id}` | `{ title }` (1–255 ký tự, không rỗng) | `AgentConversationSummary` | Đã có |
| `DELETE` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id` | `204 No Content` | Đã có |

`DraftView`:

```json
{
  "request_id": "uuid",
  "transcript": "bán hai cà phê sữa",
  "mode": "SALE",
  "items": [
    {
      "product_id": 12,
      "name": "Cà phê sữa",
      "unit": "ly",
      "qty": 2,
      "unit_price": 25000,
      "confidence": 0.94
    }
  ],
  "warnings": []
}
```

`product_id` là `BIGINT` của `products.id` theo ERD, hoặc `null` khi không khớp, khớp mơ hồ, độ tin cậy thấp hoặc id do model trả không thuộc danh mục ACTIVE của shop; khi đó `unit`, `unit_price` cũng `null` và `warnings` nêu lý do bằng tiếng Việt. Với `SALE`, `name`, `unit`, `unit_price` lấy từ danh mục của shop, không lấy giá từ model hay từ câu người dùng nói. Với `EXPENSE`, mỗi khoản chi là một dòng `product_id: null`, `unit: null`, `qty: 1`, `name` là mô tả và `unit_price` là số tiền VND, hoặc `null` kèm warning khi chưa rõ số tiền. Bước parse text đã có trong AI (`DraftService`, xem [README của AI](../../backend/ai/README.md#text-drafts)); endpoint và audio vẫn là đích của #3.

`AgentChatMessageView` gồm `conversation_id`, `message_id`, `answer`. `AgentConversationSummary` gồm `conversation_id`, `title`, `last_message_at`. `AgentConversationView` gồm summary và `messages[]` với `message_id`, `role` (`USER` hoặc `ASSISTANT`), `content`, `created_at`. ID hội thoại và tin nhắn là `BIGINT` như ERD.

Các endpoint Agent yêu cầu OWNER đã xác thực và `X-Shop-Id` hợp lệ. Core lấy user từ danh tính đã xác thực; FE không gửi `user_id` để tự xác định quyền. Danh sách, xem, chat và xóa đều giới hạn theo user/shop đang xác thực.

`FR-007` (gợi ý nhập hàng) và `FR-020` (hỏi số liệu vận hành) hiện được giao qua `/api/v1/agent/chat`: agent gọi tool chỉ đọc của AI rồi trả lời trong cùng hội thoại, không qua endpoint riêng. Gợi ý nhập hàng chưa nghiệm thu đầu-cuối; `COVER_DAYS` và hai kỳ dữ liệu hiện dùng là mặc định chờ PO duyệt, xem [mục Restock suggestions](../../backend/ai/README.md#restock-suggestions).

Phủ `FR-007`, `FR-008`, `FR-017`, `FR-018`, `FR-020`, `FR-021`, `FR-027`.

## 6. Core ↔ AI nội bộ

| Method | Đường | Trách nhiệm | Trạng thái |
|---|---|---|---|
| `POST` | `/internal/v1/agent/chat` | Body `{ user_id, shop_id, conversation_id?, message }`; trả `{ conversation_id, message_id, request_id, answer, model, model_version }` | Đã có |
| `GET` | `/internal/v1/agent/conversations` | Query `user_id`, `shop_id`; trả danh sách hội thoại | Đã có |
| `GET` | `/internal/v1/agent/conversations/{conversation_id}` | Query `user_id`, `shop_id`; trả hội thoại và tin nhắn | Đã có |
| `PATCH` | `/internal/v1/agent/conversations/{conversation_id}` | Body `{ user_id, shop_id, title }`; trả summary đã đổi tên | Đã có |
| `DELETE` | `/internal/v1/agent/conversations/{conversation_id}` | Query `user_id`, `shop_id`; xóa hội thoại, trả `204` | Đã có |
| `POST` | `/internal/v1/drafts/parse` | Text/voice/image → `DraftView` | Đích |
| `GET` | `/internal/v1/recommendations/restock` | Query `user_id`, `shop_id`, `period`; trả danh sách gợi ý nhập hàng có cấu trúc cho màn tổng quan (#103) | Đích |

Yêu cầu chung:

- timeout hoặc lỗi model trả `503` với `{ "detail": "ai_unavailable" }`; Core không retry đồng bộ quá một lần;
- response thành công có `request_id`, `model`, `model_version`;
- AI không có endpoint tạo/sửa/xóa dữ liệu nghiệp vụ;
- Core và AI cùng kiểm tra `shop_id`; test chéo shop là bắt buộc;
- Core chuyển `user_id` đã xác thực; AI truy vấn theo cả `user_id` và `shop_id`. Hội thoại không tồn tại hoặc không thuộc phạm vi trả `404 conversation_not_found`;
- chat được giữ qua các phiên đến khi OWNER xóa; xóa chat loại tin nhắn khỏi lịch sử và ngữ cảnh assistant. MVP không áp TTL tự động;
- Core gọi `/internal/v1/*` với header `X-Internal-Token` mang giá trị `INTERNAL_API_TOKEN` của môi trường. Thiếu header hoặc sai giá trị trả `401` với `{ "detail": "unauthorized" }`. Khi AI chưa cấu hình token thì mọi đường `/internal/v1/*` trả `401` (fail closed), riêng `/health` vẫn trả lời bình thường;

### Công cụ đọc dữ liệu tiệm của agent

Agent có tool nội bộ `query_shop_data` để trả lời câu hỏi về hồ sơ tiệm, nhóm hàng, sản phẩm và đơn đã chốt. Đây không phải endpoint: **không có** `POST /internal/v1/agent/sql`, Core và FE chỉ nối `/internal/v1/agent/chat`, request và response của chat không đổi.

- Model chỉ truyền `sql`; `shop_id` lấy từ request đã xác thực và tới tool qua runtime context của LangChain, không nằm trong schema tool hay system prompt, nên model không đổi được phạm vi tiệm.
- Truy vấn chạy bằng role chỉ đọc `ai_sql_reader` trên năm view của schema `ai_read`: `v_shop_profile`, `v_categories`, `v_products`, `v_sales`, `v_sale_items`. View tự lọc theo tiệm của transaction và không có cột `shop_id`; role không có quyền trên bảng gốc. `v_sales`/`v_sale_items` không phơi snapshot khách hàng hay `void_reason`.
- SQL phải qua bộ kiểm tra AST: đúng một câu `SELECT` (cho phép `WITH`, `UNION`), chỉ dùng hàm và kiểu cast trong allowlist. Transaction `READ ONLY`, `statement_timeout` mặc định 3000 ms, tối đa 100 dòng, luôn rollback; mỗi lượt chat gọi model tối đa 4 lần và tool tối đa 3 lần.
- Truy vấn bị bộ kiểm tra hoặc database từ chối, hoặc quá thời gian, trả về model dạng `Error[CODE]: lý do` (ví dụ `UNSAFE_FUNCTION`, `QUERY_TIMEOUT`, `SQL_ERROR`) để model viết lại câu truy vấn; lượt chat vẫn trả lời. Database đọc không kết nối được thì lượt chat trả `503 ai_unavailable`. Khi AI chưa cấu hình `AI_SQL_READER_URL`, agent vẫn chat nhưng không có tool này.
- Guardrail tất định quanh agent: tin nhắn mới dài quá 2000 ký tự được trả lời ngắn bằng tiếng Việt, không gọi model; số thẻ được che và khóa API/token bị xóa khỏi tin nhắn trước khi gửi model và trước khi lưu; câu trả lời rỗng hoặc lộ chi tiết nội bộ (tên view, SQL, mã lỗi) được thay bằng câu trả lời an toàn. Hợp đồng request/response của `/internal/v1/agent/chat` không đổi.
- Agent đọc được hồ sơ tiệm, nhóm hàng, sản phẩm và **đơn đã chốt** (`v_sales`, `v_sale_items`); chi phí, công nợ và khách hàng vẫn chưa phơi. Ngoài `query_shop_data`, agent có tool `suggest_restock` trả gợi ý nhập hàng từ đơn `CONFIRMED`; `COVER_DAYS` và hai kỳ `last_7_days`/`last_30_days` hiện là mặc định chờ PO duyệt, chưa phải quyết định đã chốt. Chi tiết vận hành nằm trong [README của AI](../../backend/ai/README.md#shop-data-tool-read-only-sql) và [mục Restock suggestions](../../backend/ai/README.md#restock-suggestions).

### Ngữ cảnh chat và bản tóm tắt cuốn chiếu

AI gửi cho model bản tóm tắt đã lưu, rồi tới mọi tin nhắn chưa được gộp vào bản tóm tắt. Một tin chỉ rời ngữ cảnh sau khi đã nằm trong bản tóm tắt, nên không mất thông tin. Việc gộp chạy nền sau khi trả lời và chỉ gọi model tóm tắt khi số tin chưa gộp vượt ngưỡng, nên phần lớn lượt không phát sinh thêm chi phí. Bản tóm tắt thuộc hội thoại nên bị xóa cùng hội thoại. Hợp đồng này không đổi request hay response của `/internal/v1/agent/chat`.

## 7. Dashboard quản trị — đã có trong Core

Cả 7 GET dưới đây đã có controller/service Core. Yêu cầu Firebase ID token hợp lệ và profile DB `ADMIN`/`ACTIVE`; role không lấy từ client hoặc claim tự tạo. Không cần `X-Shop-Id`; header này và param `actorUserId` không đổi phạm vi truy cập. Response thành công có `Cache-Control: no-store`. Dashboard web còn cần tích hợp theo contract này, không suy ra đã nghiệm thu từ việc API tồn tại.

| Method | Đường | Query | Response |
|---|---|---|---|
| `GET` | `/api/v1/admin/overview` | `fromDate?`, `toDate?` | `200 Overview` |
| `GET` | `/api/v1/admin/users` | `query?`, `status?`, `page=0`, `size=20` | `200 AdminPageResponse<OwnerSummary>` |
| `GET` | `/api/v1/admin/users/{userId}` | — | `200 OwnerDetail` |
| `GET` | `/api/v1/admin/shops` | `query?`, `status?`, `ownerId?`, `page=0`, `size=20` | `200 AdminPageResponse<ShopSummary>` |
| `GET` | `/api/v1/admin/shops/{shopId}` | — | `200 ShopDetail` |
| `GET` | `/api/v1/admin/shops/{shopId}/status-history` | `page=0`, `size=20` | `200 AdminPageResponse<ShopStatusEvent>` |
| `GET` | `/api/v1/admin/access-logs` | `action?`, `shopId?`, `from?`, `to?`, `page=0`, `size=20` | `200 AdminPageResponse<AccessLog>` |

### Bộ lọc và phân trang

- `page` từ 0, `size` 1–100; page × size không quá 2.147.483.647. Path ID, `ownerId`, `shopId` phải dương. Query được trim, tối đa 150 ký tự; trống/bỏ qua không giới hạn tìm kiếm. Tìm substring literal, không phân biệt hoa/thường; `%`, `_`, `!` là ký tự tìm kiếm, không phải toán tử wildcard.
- Users chỉ trả OWNER; `status` là `ACTIVE|DISABLED`. Tìm theo displayName/email/phone. `shopCount` gồm mọi trạng thái tiệm. User không tồn tại hoặc là ADMIN trả `404 owner_not_found` ở API chi tiết.
- Shops trả cả `ACTIVE|INACTIVE|ARCHIVED`, lọc thêm `ownerId`. Tìm theo tên/phone tiệm và displayName/email/phone của chủ; không tìm industry/address. Shop không tồn tại trả `404 shop_not_found` ở chi tiết/status-history; ownerId không khớp ở danh sách trả trang rỗng.
- `AdminPageResponse<T> = { items: T[], page, size, totalElements, totalPages }`, không dùng `content`. Tổng bằng 0 thì items rỗng, totalPages = 0; page vượt trang cuối vẫn trả items rỗng và giữ tổng. Users/shops sắp createdAt rồi id giảm dần; các lịch sử sắp createdAt rồi id giảm dần.
- Overview nhận **cả hai ngày hoặc không ngày nào**, định dạng `YYYY-MM-DD`. Mặc định 30 ngày gồm hôm nay; fromDate ≤ toDate, tối đa 366 ngày tính cả hai đầu, năm 1–9998. Kỳ theo `Asia/Ho_Chi_Minh`: đầu fromDate inclusive đến đầu ngày sau toDate exclusive. Chỉ `createdInPeriod` lọc theo kỳ; total và số từng trạng thái là hiện tại, không phải lịch sử cuối kỳ. Không nhận contract `days=` của mock web.
- Access logs: `from` inclusive, `to` exclusive, ISO 8601 có offset; có thể bỏ một/cả hai đầu, năm trong 1–9999, from phải trước to khi cùng có. Không áp giới hạn 366 ngày của overview cho access logs. Không có filter actor để đọc lịch sử ADMIN khác.

### Projection trả về

Tên dưới đây khớp DTO Core; thông tin liên hệ có thể null. ID là số, timestamp theo quy ước Core ở đầu tài liệu.

```text
Overview = { asOf, timezone, fromDate, toDate, owners, shops }
owners = { total, active, disabled, createdInPeriod }
shops = { total, active, inactive, archived, createdInPeriod }
OwnerSummary = { id, displayName, maskedEmail, maskedPhone, status, createdAt, shopCount }
OwnerDetail = { id, displayName, email, phone, status, createdAt, updatedAt, shopCount }
OwnerContact = { id, displayName, email, phone, status }
ShopSummary = { id, ownerId, ownerDisplayName, name, industry, maskedPhone, status, createdAt }
ShopDetail = { id, name, industry, phone, address, status, inactiveReason, archivedReason,
               archivedAt, createdAt, updatedAt, owner: OwnerContact }
ShopStatusEvent = { id, actorUserId, beforeStatus, afterStatus, reason, requestId, createdAt }
AccessLog = { id, actorUserId, actorRole, action, targetType, targetId, shopId, outcome,
              requestId, occurredAt, beforeStatus, afterStatus, reason }
```

Danh sách che email thành `***@***`, phone thành `***` + ba ký tự cuối (phone dài không quá 4 ký tự chỉ `***`; thiếu liên hệ trả null). Chi tiết OWNER/tiệm có liên hệ đầy đủ phục vụ hỗ trợ; tiệm của OWNER DISABLED vẫn được tra cứu. Không trả Firebase UID/identity, token, secret, sale/payment/refund/debt/expense/product hoặc audit nghiệp vụ OWNER. Overview chỉ có số lượng, không doanh thu/lợi nhuận/trend/quota/task. Không có giả danh OWNER, API ADMIN sửa sổ, `/admin/audit-logs`, `/auth/login` hoặc token Core riêng.

### Audit ADMIN và ranh giới lịch sử

Dùng chung `audit_logs` V10/V11, **không có bảng `admin_access_logs`**. Mỗi GET thành công ghi một event trong cùng transaction, kể cả tìm kiếm/trang rỗng. Metadata đọc chỉ có `{ queryPresent: boolean, resultCount: integer }`: resultCount là số items trả trong trang, hoặc 1 cho overview/chi tiết; không lưu query/filter/response thô. reason và idempotencyKey của event đọc luôn null. GET không chống trùng bằng key: retry là một lần truy cập mới và có event mới, không phải replay thao tác tiền.

| `action` trong access-logs | `action` lưu trong DB | `targetType` | `targetId` / `shopId` |
|---|---|---|---|
| `OVERVIEW_VIEWED` | `ADMIN_OVERVIEW_VIEWED` | `SYSTEM` | null / null |
| `OWNERS_SEARCHED` | `ADMIN_OWNERS_SEARCHED` | `OWNER_LIST` | null / null |
| `OWNER_VIEWED` | `ADMIN_OWNER_VIEWED` | `OWNER` | userId / null |
| `SHOPS_SEARCHED` | `ADMIN_SHOPS_SEARCHED` | `SHOP_LIST` | null / null, kể cả tìm có ownerId |
| `SHOP_VIEWED` | `ADMIN_SHOP_VIEWED` | `SHOP` | shopId / shopId |
| `SHOP_STATUS_HISTORY_VIEWED` | `ADMIN_SHOP_STATUS_HISTORY_VIEWED` | `SHOP` | shopId / shopId |
| `ACCESS_LOGS_VIEWED` | `ADMIN_ACCESS_LOGS_VIEWED` | `ADMIN_ACCESS_LOG_LIST` | null / null |
| `SHOP_STATUS_UPDATED` | `SHOP_INACTIVATED` hoặc `SHOP_REACTIVATED` | `SHOP` | shopId / shopId |

Access logs chỉ đọc actor ADMIN hiện tại và whitelist action/target trên, outcome `SUCCESS`; không trả raw metadata, idempotencyKey hoặc lý do hủy sale/nợ. beforeStatus/afterStatus/reason chỉ có giá trị với event đổi trạng thái tiệm, null cho event đọc. Query `shopId` chỉ khớp event gắn đúng shop, không kéo vào event tìm kiếm toàn hệ thống. Đọc access logs chọn trang trước rồi mới ghi `ADMIN_ACCESS_LOGS_VIEWED`; event của lần đọc hiện tại không nằm trong response đó.

Status history chỉ trả `SHOP_INACTIVATED`/`SHOP_REACTIVATED` có actor_role ADMIN và shop/target đúng path; ADMIN có thể thấy lịch sử đổi trạng thái do ADMIN khác, nhưng không xem access logs của họ. Event đổi trạng thái tiệm dùng chung với lịch sử OWNER, không tạo bản ghi kép. OWNER audit loại tất cả event đọc `ADMIN_*` ngay cả khi event có shopId.

### Lỗi và nghiệm thu

Thiếu/sai token: `401 unauthorized`; OWNER: `403 admin_access_required`; ADMIN DISABLED: `403 account_disabled`; UID chưa có profile: `404 auth_profile_not_found`, không tự provision/nâng role. Filter/ID/range/page không hợp lệ: `400 invalid_admin_query`; sai kiểu/ngày/enum action hoặc status lạ: `400 validation_failed`. Action filter dùng enum cột đầu bảng trên, không dùng `ADMIN_*` hoặc action tiền/nợ.

Không lưu được audit ADMIN (hoặc không đọc được access history): `503 admin_audit_unavailable`, không trả dữ liệu được bảo vệ. Đổi trạng thái tiệm ở mục 1 rollback cả trạng thái/lý do và audit khi ghi audit thất bại. Request bị từ chối/validation/không tìm thấy không tạo audit SUCCESS; chưa có contract audit FAILURE/bảo mật. V10 giữ trigger chặn UPDATE/DELETE/TRUNCATE; V11 không sửa lịch sử hay bỏ bảo vệ đó. Không suy ra DB đã chạy V11 từ việc service khởi động.

Phủ `BR-013`/`BR-014` → `FR-022`–`FR-024`, `NFR-003`/`NFR-009` → `AC-015`–`AC-017`, `AC-040`–`AC-043`. Kiểm chứng API/DB tách riêng Firebase thật, dashboard web và UAT staging; không coi mock web là bằng chứng nghiệm thu.
