# Hợp đồng API — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đích MVP; các endpoint đã triển khai được đánh dấu riêng bên dưới |
| Chủ sở hữu | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-10-16 |

## Tài liệu liên quan

- [PRD](../product/product-requirements.md): `FR-*` mà hợp đồng phải phủ.
- [Thiết kế kỹ thuật](../architecture/technical-design.md): module và luồng.

## Phạm vi

- API công khai cho mobile OWNER và dashboard web ADMIN nằm dưới `/api/v1`; base URL do môi trường cấu hình.
- API Core ↔ AI nằm dưới `/internal/v1` và không công khai cho FE.
- Không dùng cổng trong sơ đồ kiến trúc làm hợp đồng API.
- Redis, Langfuse và LiteLLM không có API công khai. FE không gọi trực tiếp các thành phần này.

**Hiện trạng Core (đối chiếu `staging` tại `b1de421c461d59473b3bb73aae103027afd67a89`, ngày 2026-10-06):** mục 1–4 và 7 là API Core đã có. Mục 5–6 và đoạn AI ở trên được đối chiếu lại với `backend/ai/src` và `backend/core` tại `staging` `f1a4818` ngày 2026-10-16; trạng thái endpoint dựa trên code, không phải triển khai staging. Có trong code không đồng nghĩa đã deploy staging hay nghiệm thu FE; hiện trạng triển khai/kiểm thử nằm trong [thiết kế kỹ thuật](../architecture/technical-design.md#1-phạm-vi).

**Bổ sung Core ngày 2026-10-06 trên `feat/core-stock-in` (base staging `99ed97a9d03656fe782ae43c81526e68a8c0cc08`):** endpoint stock-in, contract PATCH product và ba report nâng cao dưới đây có trong nhánh này, chưa xác nhận đã merge/deploy staging. Mobile chưa được sửa để dùng các contract mới.

**Bổ sung media ngày 2026-10-08 trên nhánh hiện tại:** Core có upload/delete Product image, Shop logo và avatar qua Cloudinary; V13/V14 phải được migrate trước khi runtime dùng các entity mới trên DB shared. Đây chưa phải xác nhận FE/staging đã tích hợp.

**CORE-011 (#153), ngày 2026-10-10:** sáu GET danh sách OWNER có phân trang trên `feat/owner-list-pagination`, base staging `50891aabf8b6ba48406799fa5c31fef8c823569f`. Contract dưới đây là breaking change cần phối hợp FE qua #144; chưa xác nhận merge/deploy hoặc nghiệm thu tích hợp. Các API detail, ghi và báo cáo không đổi.

**CORE-014 (#213), ngày 2026-10-15:** `GET /api/v1/sales/summary` đã có trên `feat/sales-filter-summary`, tiếp nối staging `df69819642fc420b7686d6f66073b946df2f13c2`. Đây là API bổ sung để tính tổng theo cùng filter của sales list; không đổi response list hoặc định nghĩa báo cáo kỳ. Xem [tổng danh sách sale](#tổng-danh-sách-sale-theo-bộ-lọc-core-014); chưa nghiệm thu FE/staging.

**AI và proxy Agent:** AI có `GET /health` và tám endpoint `/internal/v1/agent/*` (chat, chat/stream, list, detail, rename, delete, `GET`/`PUT` memory/settings); Core proxy cả tám endpoint. Mọi đường `/internal/v1/*` bắt buộc `X-Internal-Token`; thiếu/sai token hoặc AI chưa cấu hình `INTERNAL_API_TOKEN` trả `401`, riêng `/health` vẫn công khai. Core proxy `/api/v1/agent/*` sang tám đường này, gửi `X-Internal-Token` và lấy `user_id`/`shop_id` từ tiệm của OWNER đã xác thực; AI `404` thành `conversation_not_found`; AI `422` mang mã guardrail (mục 6) giữ nguyên `422` và mã đó trong `code`; lỗi hoặc quá thời gian khác thành `503 ai_unavailable`. Lỗi trước sự kiện đầu tiên của `/api/v1/agent/chat/stream` là JSON, nên client gửi `Accept: text/event-stream, application/json`; chỉ nhận `text/event-stream` thì Core không ghi được JSON lỗi. Chưa có nghiệm thu đầu-cuối luồng FE → Core → AI với model thật.

## Quy ước request

- API nghiệp vụ Core dùng `Authorization: Bearer <Firebase ID token>`, không cấp access/refresh token riêng. Riêng authorize/callback/exchange của [Zalo](#zalo-core-015) là bước tiền đăng nhập công khai; custom token trả bởi exchange chỉ dùng đăng nhập Firebase, không là Bearer của Core.
- Auth/me và các API shop dùng ID trong path, không cần `X-Shop-Id`. Category/Product/Customer/Draft/Sale/Payment/Debt/Expense/Report bắt buộc `X-Shop-Id` của shop `ACTIVE` thuộc OWNER đang hoạt động. ADMIN không dùng API ghi sổ.
- Quản trị: `PATCH /api/v1/shops/{shopId}/status` và các GET `/api/v1/admin/*` chỉ ADMIN đang hoạt động; dashboard dùng ID/filter riêng, không yêu cầu `X-Shop-Id` và không mở quyền API OWNER.
- JSON Core dùng camelCase; ID là số `BIGINT`, tiền là số nguyên VND; quantity dùng `numeric(15,3)`. API AI và các route `/api/v1/agent/*` Core chuyển tiếp giữ snake_case.
- Core/DB xử lý thời điểm UTC/`TIMESTAMPTZ`; timestamp JSON Core dùng ISO 8601 với offset Việt Nam `+07:00`. Timestamp đầu vào cần offset (`Z` hoặc `+07:00`); kỳ báo cáo theo `Asia/Ho_Chi_Minh`.
- Body JSON dùng `Content-Type: application/json`; dấu `?` bên dưới chỉ field tùy chọn, không mặc nhiên cho phép explicit null.
- Upload media dùng `Content-Type: multipart/form-data` với đúng một part `image`. Core chỉ nhận bytes JPEG/PNG, tối đa 5 MiB và 1–2048 px; không tin MIME/đuôi file. URL response là read-only; không trả Cloudinary credential, public ID hoặc hash file.

### Phân trang danh sách OWNER

Áp dụng cho đúng sáu GET `/products`, `/sales`, `/sale-drafts`, `/customers`, `/debts`, `/expenses` dưới `/api/v1`. Các endpoint này **luôn trả object**, kể cả khi không gửi query; không có `/page` hoặc chế độ legacy trả toàn bộ mảng. Category, payment, shop/session, audit, notification và ADMIN giữ contract riêng.

`PageResponse<T> = { items: T[], page, size, totalElements, totalPages }`. Ví dụ không có kết quả:

```json
{ "items": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

- Mặc định `page=0`, `size=20`; page ≥ 0, size 1–100, `(long) page * size <= 2147483647`. Trang vượt cuối có items rỗng nhưng vẫn giữ tổng thực tế; tổng là số bản ghi **sau cùng tenant/filter**, không phải số tiền hay số khách DISTINCT.
- Lọc/tìm kiếm/sắp xếp tại DB **trước** phân trang. Content/count cùng snapshot trong một request; không bảo đảm snapshot xuyên các request. Insert/archive/đổi trạng thái có thể làm dịch trang offset dù thứ tự có tie-break ID.
- Bỏ filter nghĩa là không lọc theo field đó, trừ điều kiện ACTIVE nêu dưới. `q` được trim, rỗng thành không lọc, tối đa 200 ký tự sau trim; tìm chuỗi con không phân biệt hoa/thường và dấu tiếng Việt. `%`, `_`, `!` là ký tự literal, không là wildcard do client điều khiển. Sort chỉ products nhận allowlist; các list khác dùng thứ tự cố định.

| List | Filter ngoài page/size | Thứ tự |
|---|---|---|
| Products | `q`: tên/barcode; `categoryId`: ID dương; `stockStatus`: LOW/OUT/NEEDS_RESTOCK. Chỉ product ACTIVE. | `sort=ID_ASC` mặc định; NAME_ASC: name/id tăng; PRICE_ASC: sellingPriceVnd/id tăng; STOCK_DESC: stockQuantity giảm, null cuối, id tăng. |
| Sales | `from`, `to` theo soldAt; `saleStatus=CONFIRMED\|VOIDED`; `q`: tên khách/tên hàng snapshot hoặc khớp **chính xác ID sale dạng số**, không phải tìm chuỗi mã tùy ý. Bỏ saleStatus lấy cả hai trạng thái. | soldAt giảm, id giảm |
| Sale drafts | `status=DRAFT\|CONFIRMED\|CANCELLED\|EXPIRED`; bỏ lọc lấy mọi trạng thái. DRAFT đã qua expiresAt thuộc EXPIRED khi lọc/count/map; GET không ghi thay đổi trạng thái. | id giảm |
| Customers | `q`: tên hoặc SĐT đã chuẩn hóa lưu trong Core; chỉ ACTIVE. Không tự gộp khách trùng tên/SĐT. | id tăng |
| Debts | `status=OPEN\|SETTLED\|VOIDED`, `customerId`: ID dương; bỏ status lấy mọi trạng thái. Phạm vi shop kế thừa qua sale. DTO không bổ sung tên/SĐT khách. | id giảm |
| Expenses | `period`: kỳ ở mục 4; hoặc `from`, `to` theo expenseAt; `category`: khớp chính xác sau trim, tối đa 150 ký tự, rỗng bỏ lọc. Chỉ ACTIVE. Bỏ cả period và range lấy một trang của mọi thời điểm. | expenseAt giảm, id giảm |

Stock filter chỉ xét tracked=true: OUT khi tồn 0, kể cả chưa có ngưỡng; LOW khi tồn dương ≤ lowStockThreshold khác null; NEEDS_RESTOCK là LOW hoặc OUT. Không dùng ngưỡng 6 cố định.

`from/to` là timestamp ISO 8601 **có offset**, ví dụ `2026-10-09T12:30:00+07:00` hoặc `2026-10-09T05:30:00Z`; không nhận ngày thuần hoặc timestamp thiếu offset. Năm hỗ trợ 1–9998. Khoảng `[from, to)`: field ≥ from và field < to; được bỏ một trong hai mốc, nếu có cả hai thì from < to **theo thời điểm thực**, không so giờ địa phương. Đây không phải `fromDate/toDate` inclusive. Khi nhập ngày lịch trên UI, FE chuyển đầu ngày Việt Nam và đầu ngày kế tiếp thành hai timestamp; encode dấu `+` thành `%2B` trong URL. Expenses không được kết hợp period với bất kỳ mốc from/to nào; kỳ period vẫn theo lịch Việt Nam hiện có.

Lỗi giới hạn page/size/offset, q quá dài, ID filter không dương hoặc range không hợp lệ trả `400` với mã riêng:

| List | Code |
|---|---|
| Products | `invalid_product_query` |
| Sales | `invalid_sale_query` |
| Sale drafts | `invalid_draft_query` |
| Customers | `invalid_customer_query` |
| Debts | `invalid_debt_query` |
| Expenses | `invalid_expense_query` |

Param sai kiểu/enum hoặc timestamp sai định dạng/thiếu offset trả `400 validation_failed`, details chỉ rõ field. Expenses period không được hỗ trợ trả `400 invalid_report_period`; period kết hợp range trả `400 invalid_expense_query`. Quyền/token/shop giữ nguyên mục 0; không mở quyền ADMIN hoặc shop INACTIVE/ARCHIVED.

**Phối hợp rollout FE (#144):** đổi client từ `T[]` sang `PageResponse<T>` và đọc items; mock cũng phải đổi, tải tiếp/reset khi đổi shop/filter, xử lý loading/error/end và trùng ID. Không lọc/sort chỉ trên trang đã tải; không tính revenue/profit, tổng nợ/chi/tồn hoặc gộp nợ theo khách từ một trang. Dùng API report phù hợp; aggregate/DTO còn thiếu cần contract và task riêng, không coi phân trang đã giải quyết. Giữ API detail để tra bản ghi được chọn khi không có trong trang hiện tại. FE cũ chưa tương thích, phải phối hợp deploy trước nghiệm thu; xem `FR-033`, `AC-059`–`AC-063` và [thiết kế kỹ thuật](../architecture/technical-design.md#42-phân-trang-danh-sách-owner).

## 0. Hợp đồng lỗi và chống ghi trùng

Core trả `{ code, message, details?: [{ field, issue }], traceId }`; bỏ details khi rỗng. Thiếu/sai token trả `401 unauthorized`; chưa có profile Core trả `404 auth_profile_not_found` (mở session trước); shop khác chủ trả `403 shop_access_denied`; shop INACTIVE trả `403 shop_inactive` kèm lý do. Thiếu header bắt buộc trả `400 missing_required_header`; Bean Validation body và query/path param sai kiểu (ví dụ enum lạ, thời điểm không đúng ISO 8601) trả `400 validation_failed` với `details[].field` là tên param. JSON không đọc được hoặc field thừa bị từ chối khi deserialize trả `400 invalid_request`; không gộp với Bean Validation. Unique barcode tranh chấp trả `409 product_barcode_conflict`; hai request mở phiên lần đầu cùng lúc cho một tài khoản Firebase trả `409 auth_session_conflict` cho request thua, FE gọi lại `POST /auth/session`; lỗi DB chưa nhận diện trả `500 internal_error`, không lộ chi tiết nội bộ. Deadlock hoặc không lấy được khóa DB trả `503 resource_busy`: FE gửi lại đúng request, giữ nguyên `Idempotency-Key` nếu có.

Riêng lỗi trùng barcode, ApiErrorDetail có thêm hai field **tùy chọn** `productId` và `status`; service trả Product ACTIVE cùng tiệm đang giữ mã. Lỗi thông thường không có hai field này; 409 từ race DB có thể bỏ details. Format và ví dụ tại [Barcode CORE-012](#barcode-core-012).

**Bắt buộc `Idempotency-Key` (1–255 ký tự, không rỗng; được trim khi lưu)** trên bảy POST: `/debts/{debtId}/payments`, `/expenses`, `/sales/{saleId}/void`, `/products/{productId}/stock-in`, `/products/{productId}/image`, `/shops/{shopId}/logo`, `/me/avatar`. FE tạo key mới cho một hành động, giữ nguyên khi retry cùng body/path/file. Expense/repay/void/stock-in dùng key shop + operation trong V7; media dùng scope SHOP hoặc USER trong V14 (xem quy tắc media bên dưới). Replay trả response ban đầu (`200` cho stock-in/media, `201` cho ba luồng còn lại), không lặp tác động. Khác người dùng/nội dung trả `409 idempotency_key_conflict`; key hoàn tất hết hạn trả `409 idempotency_key_expired`; rỗng/quá dài trả `400 invalid_idempotency_key`. TTL mặc định 30 ngày, chưa có job dọn key; không tự xóa key quá hạn. Lỗi nghiệp vụ rollback reservation của thao tác tiền/tồn. Media reserve riêng trước provider, chỉ release lượt PENDING do request hiện tại sở hữu khi thất bại; xem lease/reclaim bên dưới.

V7 tạo bảng key. Confirm draft chống trùng bằng draftId, không yêu cầu key. Các POST tạo customer/category/product/draft/shop chưa có bảo vệ key; không coi idempotency đã phủ toàn bộ API. GET không cần key.

## 1. Auth và tiệm

| Method | Đường | Body / request | Response |
|---|---|---|---|
| `POST` | `/api/v1/auth/session` | Token + `{ displayName? }`; tên bắt buộc khi tạo profile lần đầu | `200 AuthSessionResponse` |
| `GET` | `/api/v1/me` | Token | `200 AuthSessionResponse` |
| `POST` | `/api/v1/me/avatar` | multipart `image`, header `Idempotency-Key` bắt buộc | `200 UserResponse` |
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

Core ánh xạ `auth_identities.provider_subject` bằng Firebase UID. Linking các provider Firebase diễn ra ở Firebase; riêng Zalo dùng mapping ngoài và proof sở hữu hai tài khoản như mục dưới. Không suy ra kiểm thử UI/provider thật chỉ từ việc Core xác thực token.

Phủ `FR-010`, `FR-011`, `NFR-003`; dashboard `FR-022` vẫn cần tích hợp.

### Zalo CORE-015

**Trạng thái:** Core trên `feat/zalo-login`, tiếp nối staging `120779d`; V17 được chuẩn bị, mặc định `ZALO_ENABLED=false`. Người dùng xác nhận LOGIN qua bộ thử local ngày 2026-10-16; chưa nghiệm thu FE, LINK với provider thật, Railway hoặc native. Chủ boundary: Core cung cấp, FE/mobile tiêu thụ; chủ sản phẩm duyệt hành vi. Contract tham số/DTO được phản ánh ở OpenAPI `/v3/api-docs` của runtime đã cấu hình; test OpenAPI/HTTP phải kiểm chứng response thực, không suy ra nghiệm thu consumer.

| Method | Đường | Request | Response / quyền |
|---|---|---|---|
| `GET` | `/api/v1/auth/zalo/authorize` | Query bắt buộc `purpose=LOGIN\|LINK`, `clientOrigin`, `requestId`, `clientChallenge` | Công khai; `302 Location` tới Zalo, cookie ràng buộc lượt thử; không trả token |
| `GET` | `/api/v1/auth/zalo/callback` | Query `state`, một trong `code` hoặc `error`, `code_challenge?`; cookie đúng lượt | Công khai cho provider; `200 text/html` gửi message xuống opener, không redirect secret |
| `POST` | `/api/v1/auth/zalo/exchange` | Header `Origin` đúng một giá trị; `{ proof, clientVerifier }` | Công khai; chỉ LOGIN, `200 { firebaseCustomToken, displayName }` |
| `POST` | `/api/v1/auth/zalo/link` | Cùng body/Origin; Bearer Firebase ID token gần đây | Chỉ OWNER ACTIVE; chỉ LINK, `204`, không có token response |

Không dùng `X-Shop-Id`, `Idempotency-Key` hoặc target UID client truyền vào bốn đường này. Query chỉ nhận các tên trên và một giá trị/tên; body không nhận field thừa. ID/subject provider là chuỗi nội bộ, không phải ID số của Core.

- `clientOrigin`: HTTPS origin chính xác trong allowlist, không slash cuối/path/query/wildcard; không là callback URL. FE sinh `requestId` gồm 16–100 ký tự `[A-Za-z0-9_-]`, giữ `clientVerifier` ngẫu nhiên 32 byte base64url (43 ký tự), chỉ gửi SHA-256 base64url của nó làm `clientChallenge` (43 ký tự). Đây là ràng buộc client riêng; provider PKCE được Core giữ kín.
- Cookie per-attempt `__Host-sl_zalo_<opaque>`: Secure/HttpOnly/SameSite=Lax/Path=/, không Domain, hết hạn theo session (mặc định 300 giây). Callback phải quay lại đúng Core hostname mở authorize; không chuyển callback local sang Railway. Hủy consent qua callback có `error`; callback claim đã hoàn tất mới trả HTML lỗi cố định. Sai tham số/state/cookie trước claim trả JSON 4xx theo quy ước chung.
- Popup message luôn có `{ type: "smartledger:zalo", requestId, purpose, proof, error }`; `proof` là chuỗi 43 ký tự khi thành công, ngược lại null; `error` là mã cố định hoặc null. FE kiểm đồng thời `event.origin` bằng Core origin, `event.source` bằng popup đã mở, requestId và purpose. Không dùng `*`; không giữ token/proof trong URL, log hoặc storage. Không có opener thì đóng trang và bắt đầu lượt mới; `noopener`/COOP không tương thích có thể làm gãy luồng.
- Proof mặc định tối đa 90 giây và không vượt expiry của session; dùng một lần, đúng purpose/origin/challenge. Body JSON tối đa 8 KiB; `proof` và `clientVerifier` đều bắt buộc/không null, đúng 43 ký tự base64url. Replay/lost response bắt đầu lượt mới; không tự gửi lại callback code. Response auth có `Cache-Control: no-store`; callback có nonce CSP và no-referrer.
- LOGIN: client dùng `firebaseCustomToken` với Firebase custom sign-in, sau đó dùng **Firebase ID token** để gọi `/api/v1/auth/session` (truyền tên hint khi tạo lần đầu). `displayName` là chuỗi tên đã xác minh, không phải lệnh đổi tên hồ sơ. Hint từ Zalo tối đa 255 ký tự; request session hiện giới hạn 150 ký tự, nên client cần kiểm tra và cho người dùng chỉnh tên trước khi gửi, không tự ghi đè tên hồ sơ đã có. LOGIN không tự tạo Shop; `needsOnboarding` tiếp tục quyết định bước tạo tiệm.
- LINK: user phải reauthenticate tài khoản hiện có; Core xác minh lại ID token có kiểm tra thu hồi và `auth_time` trong 300 giây, so UID với principal và khóa/check local OWNER ACTIVE. Cùng Zalo/app chỉ có một UID chuẩn; khác UID trả conflict, không move/merge/delete. Muốn giữ tài khoản cũ thì LINK trước lần LOGIN Zalo riêng; không tự khớp theo tên/email/ảnh. Không có unlink/merge/migration account API trong đợt này.
- Role/status/custom avatar và dữ liệu tiệm được giữ nguyên; mapped DISABLED/ADMIN không lấy custom token qua luồng OWNER này. Không nhận Zalo access token hoặc Firebase custom token làm Bearer nghiệp vụ. Core không đồng bộ ảnh Zalo hoặc lưu access/refresh token Zalo.
- Public abuse guard hash path/socket IP có salt riêng mỗi instance vào 4096 bucket cố định, tối đa 30 request/cửa sổ 60 giây mỗi bucket; key trùng hash chia sẻ quota và có thể bị 429 sớm hơn. Không có ngưỡng chặn toàn bộ key mới do đầy map hoặc xóa bucket để reset quota. `Retry-After: 60` khi 429. Đây là guard hữu hạn theo instance, không bảo đảm chống DDoS; không tin trực tiếp X-Forwarded-For. Proxy/log redaction và giới hạn dùng chung giữa instance là điều kiện rollout, không phải SLA từ test local.

| HTTP | Code / xử lý client |
|---|---|
| `400` | `invalid_zalo_request`, `zalo_session_invalid`, `zalo_session_expired`; sửa request hoặc bắt đầu lượt mới. Bean Validation và JSON/deserialization dùng các mã riêng theo [mục 0](#0-hợp-đồng-lỗi-và-chống-ghi-trùng). |
| Popup | `zalo_consent_denied` hoặc lỗi cố định sau claim; không coi `200 HTML` là đăng nhập thành công. |
| `401` | `zalo_reauthentication_required`; xác thực lại trước LINK. Thiếu/sai Bearer vẫn dùng handler `unauthorized` hiện có. |
| `403` | `account_disabled`, `zalo_account_not_allowed`; không tự mở lại/nâng quyền tài khoản. CORS origin không được phép bị Spring từ chối trước controller. |
| `404` | `auth_profile_not_found` khi LINK chưa có profile Core. |
| `409` | `zalo_identity_conflict`; hướng dẫn giữ tài khoản đang sở hữu, không tự gộp. |
| `413` / `429` | `invalid_zalo_request` / `zalo_rate_limited`; giảm body hoặc đợi rồi bắt đầu lại. |
| `503` | `zalo_unavailable` (tắt tính năng/config/schema/storage), `zalo_provider_unavailable` (provider/Firebase); không hiện raw body provider. |

V17 và thứ tự rollout/recovery trong [ERD description](../architecture/erd-description.md#zalo-core-015-v17); cấu hình ở [Core README](../../backend/core/README.md#zalo-authentication-core-015-local-backend-implementation). Không đưa `ZALO_MANUAL_*`, tunnel, trang thử hoặc đường dẫn JSON trên máy dev vào Railway. Phủ `BR-022` → `FR-010`/`NFR-003` → `AC-079`–`AC-084`; nghiệm thu consumer/staging là phần riêng.

## 2. Category, Product và Customer

**Bổ sung CORE-012 #163/#164 trên `feat/core-barcode`, ngày 2026-10-12:** lookup, chuẩn hóa và chi tiết 409 đã có trong Core; V16 đổi unique barcode sang ACTIVE-only. Đây là phạm vi nhánh đang review, không khẳng định đã merge/migrate staging hoặc tích hợp scanner FE #162/#165. Truy vết `BR-021` → `FR-034` → `AC-064`–`AC-067`.

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
| `GET` | `/api/v1/products` | page/size, q, categoryId, stockStatus, sort; xem quy ước phân trang | `200 PageResponse<ProductResponse>` |
| `GET` | `/api/v1/products/lookup` | query `barcode` bắt buộc; [khớp chính xác](#barcode-core-012) | `200 ProductResponse` (CORE-012 trên nhánh) |
| `GET` | `/api/v1/products/{productId}` | — | `200 ProductResponse` |
| `PATCH` | `/api/v1/products/{productId}` | Các field tùy chọn như dưới | `200 ProductResponse` |
| `POST` | `/api/v1/products/{productId}/image` | multipart `image` + `Idempotency-Key` | `200 ProductResponse` |
| `DELETE` | `/api/v1/products/{productId}/image` | — | `204` |
| `POST` | `/api/v1/products/{productId}/stock-in` | `{ quantity, reason? }` + `Idempotency-Key` | `200 ProductResponse` (đã có trên nhánh stock-in) |
| `DELETE` | `/api/v1/products/{productId}` | — | `204` |

Create: `{ categoryId?, name, barcode?, unit, sellingPriceVnd, costPriceVnd?, tracked, stockQuantity?, lowStockThreshold? }`. `imageUrl` không phải input mới và giá trị URL thô khác rỗng bị từ chối; dùng POST image sau khi tạo Product. name/unit không rỗng (max 255/50), sellingPriceVnd và costPriceVnd nếu có ≥ 0; barcode max 100 sau chuẩn hóa. categoryId nếu có phải ACTIVE cùng shop. tracked=true bắt buộc stockQuantity ≥ 0; tracked=false không nhận stockQuantity khác null. Sau V16, barcode chỉ unique giữa Product ACTIVE cùng shop; archive giải phóng mã nhưng giữ lịch sử. Shop khác có thể dùng cùng barcode, null/rỗng không có barcode. DB V1–V15 vẫn giữ unique cả ARCHIVED, phải migrate V16 theo quy trình trước khi rollout khả năng tái sử dụng mã.

PATCH chỉ nhận `{ categoryId?, name?, barcode?, unit?, sellingPriceVnd?, costPriceVnd?, tracked?, lowStockThreshold? }`: bỏ field giữ nguyên; explicit null chỉ cho categoryId/barcode/costPriceVnd/lowStockThreshold. `imageUrl` (kể cả null) trả `400 product_image_url_unsupported`; dùng endpoint image. Không cho null name/unit/sellingPriceVnd/tracked. **Không nhận stockQuantity kể cả null**, trả `400 invalid_request` kèm chi tiết field và thông báo dùng stock-in. Đổi false→true khởi tạo tồn 0, true→true giữ tồn hiện tại; tracked=false xóa tồn. PATCH/archive khóa dòng product để không ghi đè tồn khi checkout/void/stock-in đồng thời. Create và response vẫn giữ stockQuantity.

Stock-in chỉ cho OWNER hoạt động, shop ACTIVE thuộc OWNER và product ACTIVE cùng shop có tracked=true. quantity bắt buộc > 0, tối đa 12 chữ số nguyên và 3 thập phân; reason tùy chọn/null, tối đa 500 ký tự, trim và trống thành null. Body không hợp lệ trả `400 validation_failed`; productId không dương/sai định dạng trả `400 invalid_product_id`; product thiếu/khác shop/ARCHIVED trả `404 product_not_found`; không theo dõi tồn trả `409 product_stock_in_unavailable`. Tổng tồn vượt `999999999999.999` trả `409 product_stock_overflow`, không đổi dữ liệu.

Core reserve key với operation `PRODUCT_STOCK_IN` rồi khóa dòng product; tồn mới = tồn hiện tại + quantity. Hash gồm product ID, quantity chuẩn hóa (5/5.000 tương đương), reason đã chuẩn hóa. Retry cùng request trả **snapshot ProductResponse lúc nhập**, không phải số tồn hiện tại sau thao tác khác. Ghi một audit `STOCK_ADJUSTED` với source `STOCK_IN`, quantity/beforeStock/afterStock, reason và key; cộng tồn/audit/kết quả replay cùng transaction. Không tạo expense/payment/debt/sale, không cập nhật giá vốn; không có phiếu nhập/ledger mới hay nhập âm/kiểm kê. Gợi ý AI không tự gọi thao tác ghi.

**Phối hợp mobile trước tích hợp:** bỏ stockQuantity khỏi DTO/payload PATCH kể cả lúc tắt theo dõi; false→true nhận tồn 0 rồi gọi stock-in khi OWNER nhập hàng. Bổ sung API/UI nhập quantity/reason, giữ key khi retry và refresh product từ kết quả hoặc GET mới. Mock cũng phải theo contract mới; lượt này không sửa FE và chưa nghiệm thu end-to-end.

`ProductResponse = { id, shopId, categoryId, name, barcode, imageUrl, unit, sellingPriceVnd, costPriceVnd, tracked, stockQuantity, status, createdAt, updatedAt, lowStockThreshold }`.

`lowStockThreshold` nullable, không âm, tối đa 12 chữ số nguyên và 3 thập phân. Create bỏ/null không đặt ngưỡng; PATCH bỏ giữ nguyên, null tắt LOW_STOCK. tracked=false có thể lưu ngưỡng nhưng không cảnh báo; bật tracking khởi tạo tồn 0 và OUT_OF_STOCK. Ngưỡng 0 chỉ cảnh báo hết hàng. Thay đổi sản phẩm/tồn reconcile notification cùng transaction theo mục 8; không tự áp ngưỡng 6 của UI.

Media Product/logo chỉ cho OWNER của shop ACTIVE. Transaction ghi khóa lại và kiểm tra Shop/Product còn ACTIVE; avatar kiểm tra user ACTIVE; lỗi shop INACTIVE kèm `inactiveReason` khi có lý do. DELETE no-op `204` khi chưa có ảnh tùy chỉnh, kể cả media disabled; có reference thì media disabled trả `503 media_unavailable` và không đổi DB/audit/job. Khi enabled, DELETE enqueue xóa asset cũ sau commit; archive không xóa media. Avatar chỉ cho chính user ACTIVE; URL authenticated được tạo khi response. `avatar_url` giữ fallback Firebase và tiếp tục sync; DELETE avatar chỉ bỏ `avatar_public_id`, lần đọc tiếp theo trở về fallback. Có avatar Cloudinary nhưng media disabled thì session vẫn thành công với avatarUrl null. Lỗi input: `400 image_required`, `413 image_too_large`, `415 image_type_invalid`, `400 image_dimensions_invalid`.

Cả ba upload yêu cầu `Idempotency-Key`. V14 `media_upload_keys` dùng SHOP scope cho Product/logo và USER scope cho avatar. PENDING reservation commit trước provider; cùng key/file đang chạy trả `409 media_upload_in_progress`, payload khác trả `409 idempotency_key_conflict`. PENDING hết lease được claim lại nguyên tử với token mới; token cũ không được hoàn tất hoặc giải phóng lượt mới. Final write khóa reservation/kiểm tra lease rồi lưu entity/audit/replay cùng transaction. Cloudinary dùng public ID quyết định theo target/key/file và `overwrite=true`; completed replay không upload hoặc thêm audit. Avatar replay lưu snapshot nội bộ và tạo lại URL delivery. URL authenticated có chữ ký nhưng chưa có TTL delivery; không coi là URL tự hết hạn. Cleanup dùng khóa job `SKIP LOCKED` và khóa public ID cùng với writer; bỏ qua asset đang gắn entity, hoãn asset có upload PENDING còn lease. COMPLETED không đổi về PENDING. V13/V14 phải migrate trước runtime shared DB; chưa xác nhận FE/staging UAT.

### Barcode CORE-012

Create/PATCH/lookup trim khoảng trắng Unicode đầu/cuối, kể cả CR/LF/TAB từ scanner. Mã sau trim tối đa 100 Unicode code point (không đếm UTF-16 code unit, byte hay grapheme cluster); ký tự ngoài BMP được tính là một code point, khớp giới hạn PostgreSQL `varchar(100)`. Không chứa khoảng trắng hoặc ký tự điều khiển bên trong. Giữ nguyên chữ, hoa/thường, dấu, số 0 đầu: `ABC-123`, `123`, `abc-123`, `00123` là các mã khác nhau. Không bulk-normalize barcode lịch sử; lookup khớp với mã đã lưu. `%`/`_` là ký tự literal, không wildcard. Input không hợp lệ trả `400 validation_failed`, details có field barcode.

- Create bỏ/null/chuỗi chỉ có whitespace lưu null. PATCH bỏ field giữ nguyên, null/blank gỡ mã; PATCH cùng mã của chính Product thành công. Không thêm field entity/barcode table.
- `GET /api/v1/products/lookup?barcode=ABC-123` trả một ProductResponse, không page/mảng và không đọc toàn danh mục. Barcode thiếu/rỗng không hợp lệ. Phải có Bearer và X-Shop-Id, account OWNER ACTIVE, tiệm ACTIVE thuộc OWNER; kiểm tra quyền trước truy vấn Product theo mục 0. Lookup chỉ đọc Product ACTIVE: thiếu/chỉ ARCHIVED/mã tiệm khác trả `404 product_not_found`. Không trả Product ARCHIVED để UI tự restore; không có API restore.
- Create/PATCH chỉ kiểm trùng Product ACTIVE cùng shop, PATCH loại chính ID đang sửa. Nếu service phát hiện trùng, `409 product_barcode_conflict` trả ví dụ dưới. Hai field bổ sung chỉ là optional của ApiErrorDetail; các lỗi khác giữ `{field, issue}`. Không trả ID từ tiệm khác.

```json
{
  "code": "product_barcode_conflict",
  "message": "The product barcode is already in use in this shop.",
  "details": [{ "field": "barcode", "issue": "already_in_use", "productId": 123, "status": "ACTIVE" }],
  "traceId": "server-generated-trace-id"
}
```

`message` là mô tả, FE phân nhánh theo code/field. Nếu hai writer vượt precheck đồng thời, partial unique index V16 chặn lần ghi thua; handler map `uq_products_shop_barcode_active` (và constraint cũ trong giai đoạn nâng cấp) sang cùng 409, **có thể không có details**. Không truy vấn thêm trên transaction DB đã lỗi để điền details. Lookup thấy 404 không đảm bảo create kế tiếp thành công; FE phải xử lý 409 và có thể lookup lại. Create/PATCH không có bảo đảm replay bằng Idempotency-Key.

**Rollout:** V16 được review/merge vào staging trước khi migration owner chạy trên shared DB; không chạy migration feature branch vào DB nghiệp vụ. Index build transactional trong cửa sổ bảo trì dừng ghi catalog; không zero-downtime. Archive/tái sử dụng không sửa productId/snapshot sale/draft cũ. FE #162/#165 cần dùng lookup, giữ nguyên ký tự mã, không tạo Product giả khi API lỗi và xử lý 409 có/không details; UI/giỏ hàng vẫn do team chốt và nghiệm thu riêng. Xem `FR-034`, `AC-064`–`AC-067` và [hướng dẫn Core](../../backend/core/README.md#exact-product-barcode-lookup-and-active-only-uniqueness-core-012--163164).

### 2.3. Customer


| Method | Đường | Body | Response |
|---|---|---|---|
| `POST` | `/api/v1/customers` | `{ name, phone? }` | `201 CustomerResponse` |
| `GET` | `/api/v1/customers` | page/size, q; xem quy ước phân trang | `200 PageResponse<CustomerResponse>` |
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
| `GET` | `/api/v1/sale-drafts` | page/size, status hiệu lực; xem quy ước phân trang | `200 PageResponse<SaleDraftResponse>` |
| `GET` | `/api/v1/sale-drafts/{draftId}` | — | `200 SaleDraftResponse` |
| `PUT` | `/api/v1/sale-drafts/{draftId}` | Thay toàn bộ draft/items | `200 SaleDraftResponse` |
| `DELETE` | `/api/v1/sale-drafts/{draftId}` | Hủy draft còn sửa được, giữ lịch sử | `204` |
| `POST` | `/api/v1/sale-drafts/{draftId}/confirm` | Không có body/key | `201 SaleResponse` |
| `GET` | `/api/v1/sales` | page/size, from/to, saleStatus, q; xem quy ước phân trang | `200 PageResponse<SaleResponse>` |
| `GET` | `/api/v1/sales/summary` | q, saleStatus, from/to; không phân trang; có trong nhánh CORE-014 | `200 SaleSummaryResponse` |
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

### Tổng danh sách sale theo bộ lọc (CORE-014)

`GET /api/v1/sales/summary` yêu cầu Bearer Firebase ID token của OWNER ACTIVE và `X-Shop-Id` của shop ACTIVE thuộc OWNER đó. Không cần `Idempotency-Key`. Filter và quyền giống `GET /sales`; phần này chỉ thêm tổng tiền/count trên **toàn bộ tập khớp**, không giới hạn theo trang đã tải.

| Query tùy chọn | Quy tắc |
|---|---|
| `q` | Trim, rỗng bỏ lọc, tối đa 200 ký tự; tìm không dấu/không phân biệt hoa thường, wildcard literal theo [quy ước OWNER](#phân-trang-danh-sách-owner). Tên khách và tên item dùng snapshot lịch sử; sale ID khớp chính xác khi q là số. Không tìm tên Product hiện tại; nhiều item khớp chỉ cộng sale một lần. |
| `saleStatus` | `CONFIRMED` hoặc `VOIDED`; bỏ qua lấy cả hai trạng thái hiện tại. |
| `from`, `to` | ISO 8601 có offset, năm 1–9998, lọc `soldAt >= from` và `soldAt < to`. Được bỏ một phía; nếu có cả hai thì from < to theo instant. Bỏ cả hai lấy toàn bộ lịch sử. |

Endpoint không định nghĩa `page`, `size`, `period` hoặc `sort`. FE dựng các nút ngày/kỳ bằng ranh giới lịch `Asia/Ho_Chi_Minh`, rồi gửi cùng `q/saleStatus/from/to` cho list và summary; encode dấu `+` trong URL thành `%2B`. List và summary là hai HTTP request riêng, không cam kết chung snapshot khi có writer đồng thời.

HTTP 200 trả năm field số nguyên signed 64-bit VND/count, bắt buộc, không null và không âm:

```json
{
  "matchedOrderCount": 12,
  "confirmedOrderCount": 10,
  "voidedOrderCount": 2,
  "confirmedSalesVnd": 1000000,
  "voidedSalesVnd": 200000
}
```

| Field | Ý nghĩa sau khi áp filter |
|---|---|
| `matchedOrderCount` | Mọi sale khớp; bằng confirmedOrderCount + voidedOrderCount. Draft chưa confirm không góp số liệu. |
| `confirmedOrderCount`, `confirmedSalesVnd` | Count và tổng `totalVnd` sau discount của sale có trạng thái hiện tại CONFIRMED. Bao gồm thu đủ, thu một phần và bán nợ; không phải tiền thực thu hay lợi nhuận. |
| `voidedOrderCount`, `voidedSalesVnd` | Count và toàn bộ giá trị `totalVnd` sau discount của sale có trạng thái hiện tại VOIDED; không phải số tiền đã hoàn. |

Không có kết quả trả cả năm field bằng 0. Filter VOIDED thì hai field confirmed bằng 0; filter CONFIRMED thì hai field voided bằng 0. Sale bán tháng A nhưng void tháng B vẫn thuộc filter soldAt tháng A: giá trị chuyển từ confirmed sang voided theo trạng thái hiện tại. `/reports/summary` giữ gross theo soldAt và điều chỉnh net theo voidedAt ở tháng B, vì vậy `confirmedSalesVnd` không đồng nghĩa `netRevenueVnd`.

Lỗi giữ envelope mục 0: `400 invalid_sale_query` khi q/range vượt giới hạn; sai enum/kiểu hoặc timestamp thiếu offset trả `400 validation_failed`; thiếu header trả `400 missing_required_header`; shop ID sai trả `400 invalid_shop_id`. Thiếu/sai token trả `401 unauthorized`; ADMIN/khác chủ trả `403 shop_access_denied`, user DISABLED trả `403 account_disabled`, shop INACTIVE trả `403 shop_inactive`; thiếu profile trả `404 auth_profile_not_found`, shop ARCHIVED của OWNER trả `404 shop_not_found`. Nếu tổng tiền riêng một trạng thái vượt `9223372036854775807`, trả **`409 sale_summary_overflow`**; FE đề nghị thu hẹp bộ lọc, không thay lỗi bằng số 0 hoặc cộng trang đang tải.

Triển khai Core trước khi FE chuyển client. FE tải lại list/summary khi đổi shop/filter, giữ loading/error/empty rõ ràng và không thay thẻ báo cáo kỳ bằng tổng danh sách nếu chưa chốt nhãn/nghiệp vụ. Đây là thay đổi API bổ sung, không cần migration/đổi ERD; FE/staging UAT theo `FR-033`, `AC-069`–`AC-072` vẫn riêng.

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
- Hoàn tồn đúng `999999999999.999` được phép; tổng vượt giới hạn trả `409 product_stock_overflow` trước khi gán tồn. Toàn bộ void rollback, kể cả item trước đã hoàn tồn/ghi audit; không có refund, hủy nợ, notification hoặc key hoàn tất một phần. Không tự cắt lượng hay đổi restockItems. Retry cùng key/body sau khi tồn đã hợp lệ thực hiện một lần, sau thành công replay kết quả cũ.
- Sai lệch tổng payment và paidVnd trả `409 sale_payment_mismatch`, không tự sửa tiền. Sale đã void: cùng key/body replay kết quả cũ; key khác trả `409 sale_already_voided`.
- Void/repay khóa cùng thứ tự sale → debt → product (ID tăng dần khi cần). Refund, hủy nợ, hoàn tồn, audit sale và idempotency cùng một transaction.

Phủ `FR-003`–`FR-005`, `FR-013`, `FR-014`, `FR-016`, `AC-024`–`AC-032`.

## 4. Chi phí, nợ và báo cáo

| Method | Đường | Body / query | Response |
|---|---|---|---|
| `POST` | `/api/v1/expenses` | Expense create + Idempotency-Key | `201 ExpenseResponse` |
| `GET` | `/api/v1/expenses` | page/size, category, period hoặc from/to; xem quy ước phân trang | `200 PageResponse<ExpenseResponse>` |
| `GET` | `/api/v1/expenses/{expenseId}` | — | `200 ExpenseResponse` |
| `PATCH` | `/api/v1/expenses/{expenseId}` | Các field tùy chọn | `200 ExpenseResponse` |
| `DELETE` | `/api/v1/expenses/{expenseId}` | Archive | `204` |
| `GET` | `/api/v1/debts` | page/size, status, customerId; xem quy ước phân trang | `200 PageResponse<DebtResponse>` |
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
| `POST` | `/api/v1/agent/chat/stream` | `{ conversation_id?, message }` | `text/event-stream`: `delta`, `reset`, `memory` (chỉ khi bật ghi nhớ), `tool_start`, `tool_end`, `done` (`AgentChatMessageView`), `error` ([mục Stream](#stream-trả-lời-chat)) | Đã có |
| `GET` | `/api/v1/agent/conversations` | `X-Shop-Id` | `AgentConversationSummary[]` | Đã có |
| `GET` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id` | `AgentConversationView` | Đã có |
| `PATCH` | `/api/v1/agent/conversations/{conversation_id}` | `{ title }` (1–255 ký tự, không rỗng) | `AgentConversationSummary` | Đã có |
| `DELETE` | `/api/v1/agent/conversations/{conversation_id}` | `X-Shop-Id` | `204 No Content` | Đã có |
| `GET` | `/api/v1/agent/memory/settings` | `X-Shop-Id` | `{ memory_enabled, available }` | Chỉ hoạt động khi `AGENT_MEMORY_ENABLED` bật; chờ PO duyệt ([ADR-0002](../architecture/adr/0002-agent-long-term-memory.md)) |
| `PUT` | `/api/v1/agent/memory/settings` | `{ memory_enabled }` | `{ memory_enabled, available }` | Như trên |

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
| `POST` | `/internal/v1/agent/chat/stream` | Body giống `/internal/v1/agent/chat`; trả `text/event-stream` với các sự kiện `delta`, `reset`, `memory` (chỉ khi bật ghi nhớ), `tool_start`, `tool_end`, `done`, `error` ([mục Stream](#stream-trả-lời-chat)) | Đã có; Core proxy qua `/api/v1/agent/chat/stream` |
| `GET` | `/internal/v1/agent/conversations` | Query `user_id`, `shop_id`; trả danh sách hội thoại | Đã có |
| `GET` | `/internal/v1/agent/conversations/{conversation_id}` | Query `user_id`, `shop_id`; trả hội thoại và tin nhắn | Đã có |
| `PATCH` | `/internal/v1/agent/conversations/{conversation_id}` | Body `{ user_id, shop_id, title }`; trả summary đã đổi tên | Đã có |
| `DELETE` | `/internal/v1/agent/conversations/{conversation_id}` | Query `user_id`, `shop_id`; xóa hội thoại, trả `204` | Đã có |
| `GET` | `/internal/v1/agent/memory/settings` | Query `user_id`, `shop_id`; trả `{ memory_enabled, available }`. `available` là `false` (và `memory_enabled` `false`) khi ghi nhớ dài hạn chưa bật cho cả hệ thống hoặc service ghi nhớ không dựng được (thiếu model chat, Postgres hoặc embedder) | Chỉ hoạt động khi `AGENT_MEMORY_ENABLED` bật; chờ PO duyệt (ADR-0002); Core proxy qua `/api/v1/agent/memory/settings` |
| `PUT` | `/internal/v1/agent/memory/settings` | Body `{ user_id, shop_id, memory_enabled }`; trả như `GET`. Khi ghi nhớ chưa bật hoặc không dựng được trả `409` `{ "detail": "memory_unavailable" }`, Core đổi thành `503 ai_unavailable` | Như trên |
| `POST` | `/internal/v1/drafts/parse` | Text/voice/image → `DraftView` | Đích |
| `GET` | `/internal/v1/recommendations/restock` | Query `user_id`, `shop_id`, `period`; trả danh sách gợi ý nhập hàng có cấu trúc cho màn tổng quan (#103) | Đích |

Yêu cầu chung:

- lỗi model (sau khi SDK tự thử lại và các model trong `MODEL_FALLBACKS`, nếu có, cũng lỗi) trả `503` với `{ "detail": "ai_unavailable" }`. Mỗi request model có hạn `MODEL_TIMEOUT_SECONDS` (mặc định 20 giây) và SDK OpenAI/Anthropic tự thử lại tối đa 2 lần, nên một model bị treo thường làm lượt chat chạm `AGENT_TURN_TIMEOUT_SECONDS` trước và trả `422 answer_timeout`; Core không tự retry lời gọi AI;
- guardrail dừng lượt chat trả `422` với `{ "detail": "<mã>" }` và không lưu gì: `input_too_long` (tin nhắn mới dài quá `AGENT_MAX_INPUT_CHARS`, mặc định 2000 ký tự) `answer_unavailable` (hết lượt gọi model, vượt ngân sách token của lượt hoặc câu trả lời vẫn bị chặn sau các lần yêu cầu viết lại) hoặc `answer_timeout` (lượt chat quá `AGENT_TURN_TIMEOUT_SECONDS`, mặc định 35 giây, thấp hơn read timeout 40 giây của Core). AI chỉ trả mã, câu hiển thị do FE map; Core chuyển tiếp `422` và mã này trong `code` của lỗi Core;
- response thành công có `request_id`, `model`, `model_version`;
- AI không có endpoint tạo/sửa/xóa dữ liệu nghiệp vụ;
- Core và AI cùng kiểm tra `shop_id`; test chéo shop là bắt buộc;
- Core chuyển `user_id` đã xác thực; AI truy vấn theo cả `user_id` và `shop_id`. Hội thoại không tồn tại hoặc không thuộc phạm vi trả `404 conversation_not_found`;
- chat được giữ qua các phiên đến khi OWNER xóa; xóa chat loại tin nhắn khỏi lịch sử và ngữ cảnh assistant. MVP không áp TTL tự động;
- Core gọi `/internal/v1/*` với header `X-Internal-Token` mang giá trị `INTERNAL_API_TOKEN` của môi trường. Thiếu header hoặc sai giá trị trả `401` với `{ "detail": "unauthorized" }`. Khi AI chưa cấu hình token thì mọi đường `/internal/v1/*` trả `401` (fail closed), riêng `/health` vẫn trả lời bình thường;

### Công cụ đọc dữ liệu tiệm của agent

Agent có tool nội bộ `query_shop_data` để trả lời câu hỏi về hồ sơ tiệm, nhóm hàng, sản phẩm, đơn hàng, công nợ, khoản đã thu và chi phí. Đây không phải endpoint: **không có** `POST /internal/v1/agent/sql`, Core và FE chỉ nối `/internal/v1/agent/chat`, request và response của chat không đổi.

- Model chỉ truyền `sql`; `shop_id` lấy từ request đã xác thực và tới tool qua run context (`deps`) của Pydantic AI, không nằm trong schema tool hay system prompt, nên model không đổi được phạm vi tiệm.
- Truy vấn chạy bằng role chỉ đọc `ai_sql_reader` trên tám view của schema `ai_read`: `v_shop_profile`, `v_categories`, `v_products`, `v_sales`, `v_sale_items`, `v_debts`, `v_payments`, `v_expenses`. View tự lọc theo tiệm của transaction và không có cột `shop_id`; role không có quyền trên bảng gốc. `v_sales`/`v_sale_items` không phơi snapshot khách hàng hay `void_reason`. `v_debts`/`v_payments` lọc tiệm qua sale và chỉ có `customer_id` (không tên, không số điện thoại), không có mã chuyển khoản hay người thu; `v_expenses` chỉ có chi phí ACTIVE và không có `description`.
- SQL phải qua bộ kiểm tra AST: đúng một câu `SELECT` (cho phép `WITH`, `UNION`), chỉ dùng hàm và kiểu cast trong allowlist. Transaction `READ ONLY` (`postgresql_readonly`), `statement_timeout` mặc định 3000 ms, tối đa 100 dòng; thành công thì commit (không ghi được gì), lỗi thì rollback; mỗi lượt chat gọi model tối đa 4 lần, tool tối đa 3 lần, tổng token vào và ra tối đa 200000 và chạy tối đa 35 giây. Các mặc định này là tạm thời, chờ PO duyệt.
- Truy vấn bị bộ kiểm tra hoặc database từ chối, hoặc quá thời gian, trả về model dạng `Error[CODE]: lý do` (ví dụ `UNSAFE_FUNCTION`, `QUERY_TIMEOUT`, `SQL_ERROR`) để model viết lại câu truy vấn; lượt chat vẫn trả lời. Database đọc không kết nối được thì lượt chat trả `503 ai_unavailable`. Khi AI chưa cấu hình `AI_SQL_READER_URL`, agent vẫn chat nhưng không có tool này và cũng không có `suggest_restock`.
- Guardrail tất định quanh agent: tin nhắn mới dài quá 2000 ký tự bị từ chối với `422 input_too_long`, không gọi model; khóa API, bearer token, JWT, private key, IBAN, số thẻ hợp lệ theo Luhn và email trong tin nhắn được thay bằng `[redacted:<loại>]` trước khi gửi model và trước khi lưu; câu trả lời rỗng hoặc lộ chi tiết nội bộ (tên view, SQL, mã lỗi) bị gửi lại model để viết lại, hết lượt gọi model thì trả `422 answer_unavailable`. System prompt giới hạn agent trong việc của tiệm (doanh thu, đơn hàng, sản phẩm, nhóm hàng, giá, tồn kho, nhập hàng, công nợ, khoản đã thu, chi phí, bản nháp ghi chép, cách dùng SmartLedger); câu hỏi ngoài phạm vi nhận một câu từ chối ngắn với `200`, không phải mã lỗi, và đây là ràng buộc bằng prompt, không phải bộ lọc tất định. Request và response thành công của `/internal/v1/agent/chat` không đổi; mã lỗi nằm ở yêu cầu chung phía trên.
- Agent đọc được hồ sơ tiệm, nhóm hàng, sản phẩm, đơn hàng (`v_sales`, `v_sale_items`), **công nợ, khoản đã thu và chi phí** (`v_debts`, `v_payments`, `v_expenses`; `AC-076`–`AC-077`); tên/liên hệ khách hàng, mô tả chi phí, hoàn tiền và lịch sử nhập kho vẫn chưa phơi. Ngoài `query_shop_data`, agent có tool `suggest_restock` trả gợi ý nhập hàng từ đơn `CONFIRMED`; `COVER_DAYS` và hai kỳ `last_7_days`/`last_30_days` hiện là mặc định chờ PO duyệt, chưa phải quyết định đã chốt. Chi tiết vận hành nằm trong [README của AI](../../backend/ai/README.md#shop-data-tool-read-only-sql) và [mục Restock suggestions](../../backend/ai/README.md#restock-suggestions).

### Ngữ cảnh chat

Mỗi lượt chat, AI gửi cho model system prompt tĩnh, sau đó là `AGENT_HISTORY_TURNS` lượt trao đổi gần nhất của hội thoại (mặc định 30 lượt, tức 60 tin nhắn OWNER và ASSISTANT), nguyên văn và xếp từ cũ đến mới, trừ khối ```actions của câu trả lời cũ (xem [Stream trả lời chat](#stream-trả-lời-chat)), rồi tới tin nhắn mới của OWNER, theo sau là một dòng giờ hiện tại của tiệm (`Asia/Ho_Chi_Minh`, không được lưu) để model hiểu "hôm nay" hay "tuần trước"; khi bật ghi nhớ dài hạn, tin nhắn này được dẫn đầu bằng các ghi nhớ gọi lại (khối "Earlier facts from this owner"); khối này chỉ gửi cho model và không được lưu (app chỉ nhận danh sách ghi nhớ qua sự kiện `memory` của route stream), còn tin lưu vẫn là tin của OWNER đã qua bước che. Tin cũ hơn không tới được model và không được tóm tắt. Lịch sử hội thoại không được tóm tắt hay gộp nền và không có tool tìm lịch sử (khi bật ghi nhớ dài hạn, bước trích và nén ghi nhớ chạy nền sau mỗi lượt, trên ghi nhớ chứ không trên lịch sử chat): OWNER ít chat; 30 lượt với giới hạn 2000 ký tự mỗi tin giữ một request trong cửa sổ 100k token. Hợp đồng này không đổi request hay response của `/internal/v1/agent/chat`.

### Stream trả lời chat

`POST /internal/v1/agent/chat/stream` chạy cùng lượt chat với `POST /internal/v1/agent/chat`: cùng body, cùng `X-Internal-Token`, cùng guardrail. Lỗi xảy ra trước khi stream bắt đầu giữ nguyên mã của route JSON: `401` (`unauthorized`), `404` (`conversation_not_found`), `422` (`input_too_long`) và `503` (`ai_unavailable`, kể cả khi model chưa cấu hình). Sau khi stream bắt đầu, lỗi đi trong sự kiện `error` thay vì HTTP status.

Response thành công có `Content-Type: text/event-stream`. Mỗi sự kiện có tên và `data` là JSON:

- `delta` `{ "text": "..." }`: nối `text` vào phần đã hiển thị.
- `reset` `{}`: bỏ phần đã hiển thị; một lượt trả lời mới của model theo sau. Xảy ra khi model viết text trước một tool call đọc dữ liệu, hoặc khi answer screen từ chối câu trả lời và model viết lại. Text model viết trước khi chỉ gọi `suggest_screen` là một phần câu trả lời: stream giữ nguyên, phần viết sau nối tiếp sau một dòng trống, không gửi `reset`.
- `memory` `{ "used": [{ "id", "memory_type", "content", "source_conversation_id", "created_at" }] }`: các ghi nhớ dài hạn lượt này dùng, gồm tối đa 10 ghi nhớ `preference` luôn được đưa vào và tối đa 5 ghi nhớ tìm theo câu hỏi; `source_conversation_id` là hội thoại sinh ra ghi nhớ, `created_at` là ISO 8601; gửi một lần, trước `delta` đầu tiên, và chỉ khi `AGENT_MEMORY_ENABLED` bật, chủ tiệm chưa tắt ghi nhớ và có ghi nhớ được dùng (chờ PO duyệt, ADR-0002). App hiện biểu tượng ghi nhớ (kèm số lượng khi có nhiều) trên câu trả lời, chạm để xem từng ghi nhớ kèm ngày nhớ và mở được hội thoại gốc qua `GET /api/v1/agent/conversations/{conversation_id}`; sự kiện không vào lịch sử hội thoại.
- `tool_start` `{ "call_id": "...", "name": "query_shop_data" }`: model bắt đầu gọi một tool; `name` là tên tool (`query_shop_data`, `suggest_restock`). AI không gửi tham số (câu SQL) hay kết quả của tool, nên app tự đặt câu hiển thị cho từng bước. Một lượt có thể gọi nhiều tool, mỗi lần một `call_id`; sự kiện không vào lịch sử hội thoại.
- `tool_end` `{ "call_id": "..." }`: tool có `call_id` đó đã xong, kể cả khi nó trả lỗi để model viết lại câu truy vấn. Luôn có `tool_start` cùng `call_id` đi trước.
- `done`: cùng body với response của `/internal/v1/agent/chat` (`conversation_id`, `message_id`, `request_id`, `answer`, `model`, `model_version`). `answer` là câu trả lời đã lưu, thay thế toàn bộ text đã stream.
- `error` `{ "detail": "<mã>" }`: `answer_unavailable` hoặc `answer_timeout` (guardrail dừng lượt), `conversation_not_found` (hội thoại bị xóa trong lúc lượt đang chạy) hoặc `ai_unavailable`.

Stream kết thúc sau `done` hoặc `error`.

Chỉ text do model viết đã qua answer screen mới được gửi; khối ```actions mà AI nối sau answer screen đi trong `delta` cuối cùng (xem bên dưới). Đoạn cuối ngắn và phần text sau một `select` còn đang chờ được giữ lại cho đến khi answer screen kiểm tra xong. Lượt kết thúc bằng `error`, hoặc caller ngắt kết nối giữa chừng, không được lưu, trừ khi caller ngắt đúng lúc AI đang ghi lượt vào database.

Core proxy route này qua `POST /api/v1/agent/chat/stream` với cùng auth, `X-Shop-Id` và body như `/api/v1/agent/chat`. Lỗi trước sự kiện đầu tiên là JSON lỗi của Core và ánh xạ như route JSON: AI `404` thành `conversation_not_found`, AI `422` mang mã guardrail (`input_too_long`) giữ nguyên `422` như route JSON, lỗi khác thành `503 ai_unavailable`. Sau đó Core chuyển từng sự kiện của AI nguyên văn, trừ `done` chỉ giữ `conversation_id`, `message_id`, `answer` như `AgentChatMessageView`. App ngắt kết nối thì Core đóng stream tới AI, nên AI hủy lượt như trên. Request async của Core hết hạn sau 60 giây, trên thời hạn lượt mặc định 35 giây của AI.

Màn Trợ lý AI trên mobile gọi route stream và hiện chữ dần trong bong bóng trả lời; `reset` xóa phần đã hiện, `done` thay bằng câu đã lưu. Trong lúc chờ, dòng "Đang suy nghĩ" liệt kê từng bước theo `tool_start` và `tool_end`, rồi gập thành một dòng "Đã suy nghĩ" khi có `done`. Câu trả lời, dữ liệu lưu và guardrail không đổi so với `/api/v1/agent/chat`.

`answer` (và chữ ghép từ `delta`) là văn bản thuần với một tập Markdown nhỏ do prompt của AI quy định: `**đậm**`, danh sách `- `/`1. `, bảng Markdown, và tối đa một khối biểu đồ:

````text
```chart
{"type": "bar" | "line", "title": "…", "unit": "vnd" | "count", "data": [{"label": "…", "value": 0}]}
```
````

Khối `chart` nằm trong `answer` nên được lưu cùng câu trả lời và hiện lại khi mở lịch sử; Core và AI không đổi route hay sự kiện. Mobile dùng chung một parser (`frontend/mobile/src/lib/chatMarkdown.ts`) cho chữ đang stream và câu đã lưu: ký hiệu `**`/`` ` `` còn mở ở dòng cuối được đóng tạm, dòng chưa rõ sẽ thành khối gì (`#`, `-`, `` ``` ``, tiêu đề bảng chưa có dòng gạch) được giữ lại, khối `chart` chưa đóng hiện "Đang vẽ biểu đồ…". Biểu đồ chỉ vẽ khi JSON hợp lệ, 1–31 điểm, nhãn là chữ và giá trị là số không âm; sai thì hiện "Không hiện được biểu đồ này.". Số trong biểu đồ do model chép từ kết quả công cụ, như mọi số trong câu trả lời. [PRD](../product/product-requirements.md) và AC chưa ghi cách trình bày bảng/biểu đồ trong chat.

Cuối `answer` có thể có một khối nút mở màn hình trong app, tối đa 2 nút:

````text
```actions
["debts", "sales"]
```
````

Model không tự viết khối này: agent gọi tool `suggest_screen(screen)` với `screen` thuộc tập đóng `sales`, `voice_order`, `orders`, `products`, `debts`, `expenses`, `reports` (giá trị khác bị Pydantic AI trả về model để thử lại). Sau lượt, AI nối khối vào cuối `answer` theo thứ tự gọi, bỏ trùng; khối được lưu cùng câu trả lời và đi tới app qua `delta` cuối cùng và `done`, nên Core không đổi route hay sự kiện. Khi đọc lịch sử cho lượt sau, AI bỏ khối này khỏi câu trả lời cũ. Mobile ánh xạ mỗi tên sang route và nhãn trong `SCREEN_LINKS` (`frontend/mobile/src/lib/chatMarkdown.ts`), bỏ qua tên lạ hoặc JSON hỏng, và chỉ hiện nút khi khối đã đóng. Hướng dẫn dùng app trong prompt của agent (`backend/ai/src/prompt_templates/app_guide.py`) chép tên màn hình và nút từ app hiện tại; PRD và AC chưa ghi hành vi hướng dẫn này.

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


## 8. Notification OWNER — đã có trên `feat/app-notifications`

Phủ `BR-020`, `FR-032`, `AC-055`–`AC-058`. Cần V15 trước runtime dùng `ddl-auto=validate`; chưa chứng minh FE hoặc staging UAT. Đây là inbox trong app, không phải FCM/push.

| Method | Đường | Query/body | Response |
|---|---|---|---|
| `GET` | `/api/v1/me/notifications` | `shopId?`, `type?`, `unreadOnly=false`, `page=0`, `size=20` | `200 NotificationPageResponse` |
| `GET` | `/api/v1/me/notifications/unread-count` | `shopId?`, `type?` | `200 { unreadCount }` |
| `PATCH` | `/api/v1/me/notifications/{notificationId}/read` | Không body | `204` |
| `PATCH` | `/api/v1/me/notifications/read` | `{ "ids": [1, 2] }` | `204` |

- Bearer token bắt buộc; không yêu cầu `X-Shop-Id` hoặc `Idempotency-Key`. Actor lấy từ profile OWNER ACTIVE trong DB, không từ header/client. UID chưa có profile trả 404 auth_profile_not_found; ADMIN 403 shop_access_denied; user DISABLED 403 account_disabled.
- Bỏ shopId đọc các tiệm hợp lệ của OWNER. Filter shopId phải dương: sai giá trị 400 invalid_shop_id, không sở hữu/không tồn tại 403 shop_access_denied; ARCHIVED 404 shop_not_found. Cả list/count/read đều cần recipient đúng user và tiệm còn do user sở hữu. INACTIVE chỉ cho SHOP_INACTIVATED/SHOP_REACTIVATED; ARCHIVED bị loại hoàn toàn.
- type gồm LOW_STOCK, OUT_OF_STOCK, SALE_VOIDED, SHOP_INACTIVATED, SHOP_REACTIVATED; enum lạ/param sai kiểu trả 400 validation_failed. page ≥0, size 1–100, `(long)page * size ≤2147483647`; vượt giới hạn trả 400 invalid_notification_query. Thứ tự event createdAt rồi id giảm dần; chưa đọc là readAt=null. Trang và tổng phần tử dùng cùng snapshot/filter.
- `NotificationPageResponse = { items, page, size, totalElements, totalPages }`; `NotificationResponse = { id, shopId, type, title, body, targetType, targetId, createdAt, readAt, resolvedAt }`. id là notification_event ID, không phải recipient ID. targetType PRODUCT/SALE/SHOP tương ứng type; timestamp +07:00. Không trả dataJson hoặc dedupKey.
- Batch nhận 1–100 ID dương, không null; validation body sai trả 400 validation_failed. ID trùng được gộp; ID không nhìn thấy/không tồn tại trả 404 notification_not_found, toàn batch rollback. ID đơn không dương trả 400 invalid_notification_query. Retry/multiple devices không thay readAt đầu tiên; không cập nhật thông báo mới ngoài danh sách đã gửi.
- LOW_STOCK/OUT_OF_STOCK tạo theo chu kỳ: giữ một cảnh báo mở cùng mức; đổi mức resolve cũ rồi tạo mới; hồi tồn/tắt tracking/archive resolve mà không xóa lịch sử. resolvedAt không tự đặt readAt, nên cảnh báo đã kết thúc vẫn có thể chưa đọc. Body chứa snapshot tồn lúc phát sinh, không phải tồn hiện tại.
- Confirm/void/stock-in/Product create/PATCH/archive reconcile trong transaction nghiệp vụ, dưới khóa nguồn. Void tạo một SALE_VOIDED; ADMIN đổi ACTIVE↔INACTIVE tạo một thông báo trạng thái cho mỗi lần chuyển, gửi lại cùng trạng thái không tạo mới. Notification lỗi rollback cả nghiệp vụ/audit/idempotency; replay không tạo thêm event hoặc recipient. Không phát thông báo SALE_CONFIRMED/PAYMENT_RECEIVED/DEBT_REMINDER/AI_REVIEW_REQUIRED trong phạm vi này.
- FE cần gọi inbox/count/read thật và bổ sung nhập ngưỡng Product; không coi mock badge hiện tại là tích hợp. Không có API tạo/sửa nội dung/xóa notification hoặc đánh dấu toàn bộ vô điều kiện. Nội dung void/status không chứa tiền, khách hoặc lý do nhạy cảm; mở hồ sơ tiệm đúng quyền để xem lý do INACTIVE.
