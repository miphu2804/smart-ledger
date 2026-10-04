# Thiết kế kỹ thuật — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đích MVP; Core hiện có được phân biệt với phần chưa tích hợp |
| Chủ sở hữu | Chủ kỹ thuật |
| Người rà soát | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-10-04 |

## Tài liệu liên quan

- [BRD](../product/business-requirements.md) và [PRD](../product/product-requirements.md): nguồn `BO/BR → FR/NFR → AC`.
- [Sơ đồ kiến trúc MVP](diagrams/src/architecture.mmd); bản vẽ [drawio](diagrams/src/architecture.drawio), [SVG](diagrams/images/architecture.svg), [PNG](diagrams/images/architecture.png).
- [Hợp đồng API](../contracts/api-contracts.md): FE ↔ Core và Core ↔ AI.
- Nguồn đối chiếu hiện tại: [`frontend/mobile`](../../frontend/mobile/README.md), [`frontend/web`](../../frontend/web/README.md), [`backend/core`](../../backend/core/src/main/java/com/smartledger/core/controller/AuthController.java) và [`backend/ai`](../../backend/ai/src/agent/routers.py). FE EXE201 là nguồn lịch sử khi soạn phạm vi ban đầu.

## 1. Phạm vi

Kiến trúc trong sơ đồ là **đích MVP**: Mobile dành cho OWNER và dashboard web dành cho ADMIN cùng gọi Core; Core sở hữu API công khai và điều phối AI; PostgreSQL lưu sổ nghiệp vụ, lịch sử Agent chat và vector (pgvector); Redis, Langfuse và LiteLLM hỗ trợ AI.

Mục này là nơi duy nhất ghi hiện trạng triển khai; tài liệu khác liên kết tới đây thay vì chép lại. Trạng thái từng endpoint nằm trong [hợp đồng API](../contracts/api-contracts.md).

**Đối chiếu với code nhánh `staging` ngày 2026-10-04:**

- **Core:** Firebase auth/session/me, Shop/Category/Product/Customer CRUD, draft → confirm → sale/payment, debt repayment, expense, report summary, sale void và full refund, audit thao tác ghi và lịch sử audit cho OWNER; schema Flyway V1–V10. Core proxy `/api/v1/agent/*` sang AI `/internal/v1/agent/*` kèm `X-Internal-Token`, lấy `user_id`/`shop_id` từ tiệm của OWNER đã xác thực.
- **AI:** `/health` và Agent chat (chat, list, detail, rename, delete) lưu PostgreSQL, tóm tắt cuốn chiếu, tìm lịch sử và tool đọc dữ liệu tiệm chỉ đọc; migration AI `001`–`004`.
- **Mobile:** mặc định dùng mock; khi tắt mock gọi Firebase và các API Core ở trên. Các màn nghiệp vụ (trang chủ, báo cáo, đơn hàng, hàng hoá, công nợ, chi phí, thanh toán, hồ sơ tiệm) đọc và ghi qua Core; thanh toán, chi phí và trả nợ thử lại bằng cùng `Idempotency-Key`. Nhận diện đơn vẫn dùng parser rule-based trên máy; mic chỉ nhận giọng nói trên web.
- **Web admin:** chỉ chạy mock; Core chưa có API dashboard tương ứng.

Đây là phạm vi code, không phải xác nhận đã deploy staging, nghiệm thu FE hay production-ready; chưa có kiểm thử đầu-cuối mobile → Core → AI với model thật.

**Còn là đích MVP/chưa triển khai:** luồng AI proposal (text/voice/image → bản nháp), recommendation và insight chat; API dashboard đọc tổng quan, audit khi ADMIN xem dữ liệu, notification và báo cáo bán chạy/series/lợi nhuận. Hoàn tiền/trả hàng từng phần và ledger điều chỉnh kho độc lập chưa triển khai. Năng lực end-to-end chỉ được nghiệm thu qua AC tương ứng trong [PRD](../product/product-requirements.md).

## 2. Thành phần và quyền sở hữu

| Thành phần | Trách nhiệm |
|---|---|
| Mobile/FE | Giao diện OWNER: thu input, hiển thị bản nháp, bắt buộc người dùng xác nhận, chỉ gọi Core |
| Dashboard web | Giao diện ADMIN: tra cứu OWNER/cơ sở khách hàng và xem tổng quan hỗ trợ; không sửa sổ nghiệp vụ |
| Core | Hiện có auth, shop/catalog/customer, draft/sale/payment/debt/refund, expense, summary, audit và proxy Agent sang AI; ADMIN chỉ có đổi trạng thái shop. Dashboard, audit truy cập của ADMIN, replenishment và điều phối luồng AI proposal là trách nhiệm đích chưa hoàn thành |
| AI | Voice/text parse, image analysis, recommendation, insight chat và Agent chat; chỉ trả đề xuất/câu trả lời |
| PostgreSQL | Dữ liệu nghiệp vụ và idempotency Core; vector qua `pgvector` ([ADR-0001](adr/0001-vector-store-pgvector.md)); trace AI/audit/notification theo ERD đích, không mặc nhiên là migration Core |
| Redis | Cache/giới hạn tốc độ/tác vụ ngắn hạn; không là nguồn dữ liệu chuẩn |
| LiteLLM | Chọn model và quản lý khóa model ở phía server |
| Langfuse | Trace AI; không ghi audio/ảnh hoặc dữ liệu nhạy cảm thô mặc định |

Chỉ Core có API công khai. FE không gọi AI, PostgreSQL, Redis, LiteLLM hoặc Langfuse trực tiếp.

## 3. Luồng chính

1. FE lấy Firebase ID token; Core xác minh token và ánh xạ UID đến user/identity. Session trả role và shop có thể truy cập; không cấp token Core riêng.
2. Auth/me và Shop dùng ID path, không cần X-Shop-Id; các API nghiệp vụ cần X-Shop-Id, OWNER đang hoạt động, shop thuộc OWNER và ACTIVE.
3. Luồng hiện có là chọn/nhập tay tạo draft; item catalog cần product ACTIVE cùng shop, món tùy ý có productId null cần tên/đơn vị/giá/số lượng. Draft chưa tác động tiền, nợ, tồn hay báo cáo và hết hiệu lực sau một tháng.
4. Confirm khóa draft rồi product theo ID tăng dần; snapshot tên/đơn vị/giá và stock_deducted, trừ tồn thực sự, tạo sale/item/payment ban đầu và debt nếu còn thiếu trong một transaction. Retry draft đã confirm trả cùng sale, không ghi/trừ thêm.
5. Repay khóa sale trước debt, thêm payment và cập nhật số dư nguyên tử. Customer dùng ID ổn định; không tự gộp trùng tên/phone. Confirm bán thiếu không có ID cần tên để tạo khách; phone không bắt buộc.
6. Void khóa sale → debt → product theo ID tăng dần khi hoàn tồn. Kiểm tra tổng payment, ghi refund toàn bộ tiền đã thu nếu > 0, hủy chỉ số dư OPEN, giữ SETTLED, lưu void reason/user/time và chọn rõ hoàn tồn hay không. Không chỉnh/xóa payment, không nhận thêm trả nợ cho sale VOIDED.
7. Summary dùng sự kiện soldAt/voidedAt/receivedAt/refundedAt theo kỳ Việt Nam; không loại khoản thu kỳ cũ vì sale bị void. Nợ hiển thị là số dư hiện tại toàn shop. Định nghĩa field trong [API contract](../contracts/api-contracts.md).

Lỗi confirm/repay/void rollback toàn bộ thay đổi, kể cả reservation idempotency. Sale đã confirm không có đường PATCH/DELETE; chỉ hủy toàn bộ có dấu vết. restockItems bắt buộc; hoàn tồn dựa snapshot, không suy từ tracked hiện tại. Snapshot NULL lịch sử không đủ để hoàn tự động; món tùy ý không tạo tồn.

Luồng text/voice/image → AI proposal → draft, replenishment và insight vẫn là đích: AI không được tự tạo sale/payment/debt/expense. Core mới gọi AI cho chat trợ lý (proxy Agent), chưa gọi cho luồng proposal; timeout/fallback cần nghiệm thu khi tích hợp.

Luồng ADMIN hiện có: `PATCH /api/v1/shops/{shopId}/status` (ngoài prefix admin), tạm ngưng/kích hoạt kèm lý do. Đổi trạng thái ghi audit `SHOP_INACTIVATED`/`SHOP_REACTIVATED` với actor ADMIN. Dashboard `/api/v1/admin/*` và audit khi ADMIN xem dữ liệu còn là yêu cầu đích; không tuyên bố đã đạt BR-014/NFR-009. ADMIN không giả danh OWNER hay sửa sổ nghiệp vụ.

## 4. Dữ liệu và ràng buộc

[ERD](diagrams/src/erd.dbml) là schema logic, có cả bảng đích chưa nằm trong Core. [ERD description](erd-description.md) mô tả quan hệ và ánh xạ migration. Core hiện bảo đảm:

- Tenant được xác minh trong service theo shop sở hữu; payment/debt/refund kế thừa phạm vi qua sale. Không phải mọi bảng đều có cột shop_id riêng.
- users.system_role OWNER|ADMIN; một shop có một owner, một OWNER có nhiều shop.
- Money là BIGINT VND, quantity numeric(15,3), ID BIGINT; thời điểm TIMESTAMPTZ/UTC trong Core. JSON timestamp hiển thị +07:00 và kỳ báo cáo theo Asia/Ho_Chi_Minh.
- Product/category/customer/expense archive, không xóa lịch sử. Shop INACTIVE vẫn cho OWNER xem lý do nhưng chặn nghiệp vụ; ARCHIVED không hiển thị cho OWNER.
- Payments append-only; paid_vnd đối soát bằng tổng payment. Debt original_vnd = tổng payment trả nợ + outstanding_vnd + COALESCE(cancelled_vnd, 0). Refund là dòng tiền ra riêng, không trừ/xóa payment.
- V8 cho sale_items.product_id null nhưng giữ FK khi có ID; V9 thêm sale_refunds (unique sale_id, sale/user FK, amount/method check, index refunded_at), stock_deducted nullable và audit/lifecycle nợ VOIDED. Không sửa migration đã phát hành, không đoán snapshot tồn hay audit cũ.
- Nợ SETTLED giữ nguyên sau sale void; chỉ nợ OPEN còn dư chuyển VOIDED kèm cancelled_vnd/voided_at. Chưa thu thì không tạo refund row.
- Idempotency chỉ phủ POST expense, debt repayment và sale void: reserve/action/replay result chung transaction; key theo shop + operation, hash có body và path ID khi có. TTL mặc định 30 ngày, chưa có cleanup job. POST tạo danh mục/khách/draft/shop chưa được bảo vệ key; confirm chống trùng bằng draft ID.
- PATCH/archive product khóa dòng cùng cách checkout, tránh ghi đè tồn khi chạy đồng thời. Repay/void thống nhất thứ tự khóa sale → debt → product để tránh lock inversion.
- Bảng vector (`pgvector`) có `shop_id` và mọi truy vấn tương đồng lọc theo `shop_id` trong cùng câu SQL.

V10 tạo `audit_logs` append-only (trigger chặn UPDATE/DELETE/TRUNCATE); Core ghi audit cho thao tác ghi thành công của OWNER/ADMIN cùng transaction nghiệp vụ và OWNER đọc qua `GET /api/v1/audit-logs` (xem [API contract](../contracts/api-contracts.md#lịch-sử-audit-của-tiệm)). Audit khi ADMIN xem dữ liệu (`NFR-009`/`AC-017`), trace AI/media và cô lập vector theo shop vẫn là yêu cầu đích, chưa có trong Core.

Schema PostgreSQL được quản lý bằng migration SQL có phiên bản trong Git. Không sửa schema trực tiếp trên Supabase Dashboard. Dev và staging dùng chung DB nên chỉ chạy migration từ code đã merge vào `staging`; máy dev chạy Core với `FLYWAY_ENABLED=false` (xem [Database migrations](../../README.md#database-migrations)). Migration phải chạy được trên PostgreSQL chuẩn; extension, trigger hoặc API riêng của Supabase chỉ được dùng khi có quyết định kỹ thuật riêng.

## 5. Auth và phân quyền

- Provider Phone/Google là đích đăng nhập đã mô tả trong PRD; Core nhận Firebase ID token, không chứng minh UI/provider đã tích hợp chỉ từ kiểm thử backend. Firebase Account Linking gộp các cách đăng nhập của cùng người dùng vào một Firebase UID; Core lưu UID đó trong `auth_identities`.
- Core không lưu password hoặc token thô. ERD hiện không có Core refresh-token/session table; mọi request dùng Firebase ID token đã được Core xác thực.
- Core mặc định tài khoản tự đăng ký là OWNER; role ADMIN chỉ được cấp bằng thao tác vận hành có kiểm soát, không nhận role từ request hoặc claim do client tự tạo.
- Auth/me và mọi API Shop dùng ID path, không cần X-Shop-Id; endpoint nghiệp vụ còn lại cần token/X-Shop-Id của shop ACTIVE thuộc OWNER. Shop status chỉ ADMIN; đây là ngoại lệ ngoài prefix admin, không trao quyền sửa sổ.
- Hợp đồng đích /api/v1/admin/* chỉ nhận ADMIN, không dùng X-Shop-Id để mở rộng quyền; dashboard/audit chưa triển khai trong Core.
- Chưa được dùng dữ liệu thật trước khi test 401/403 và cô lập chéo shop.

## 6. Cấu hình môi trường

| Thành phần | Cấu hình tối thiểu |
|---|---|
| FE | `API_BASE_URL` |
| Core hiện tại | `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `FIREBASE_PROJECT_ID`, credential Firebase Admin, `AI_BASE_URL`, `INTERNAL_API_TOKEN`; `SERVER_PORT`, `IDEMPOTENCY_TTL_DAYS` tùy chọn; Core không dùng Redis |
| AI hiện tại | `POSTGRES_URL`, `REDIS_URL`, `INTERNAL_API_TOKEN`, `MODEL_*`, `OPENAI_API_KEY`; `AI_SQL_READER_URL` tùy chọn cho tool đọc dữ liệu tiệm. `LITELLM_URL`, `LANGFUSE_*` đã khai báo nhưng code chưa dùng. Danh sách đầy đủ: [`backend/ai/.env.example`](../../backend/ai/.env.example) |

Host và port thuộc cấu hình môi trường, không phải API contract. [Core README](../../backend/core/README.md) là nơi hướng dẫn chạy IntelliJ/Maven/Docker và Firebase Emulator; không nhân bản hướng dẫn vận hành tại đây.

- Dev và staging dùng chung một Supabase project và một Redis Cloud database, không chứa dữ liệu production; không có PostgreSQL hay Redis container local. Test tự động dùng PostgreSQL tạm: AI đọc `POSTGRES_TEST_URL`, Core đọc `CORE_TEST_POSTGRES_*`.
- Sơ đồ môi trường và CI/CD: [environments.mmd](diagrams/src/environments.mmd) ([SVG](diagrams/images/environments.svg)).
- Production: một Supabase project và một Redis Cloud database khác; credential staging và production không dùng chung file hay biến. Cách chạy Compose xem [README](../../README.md#local-compose).
- Runtime dùng connection pooler; migration, `pg_dump` và `pg_restore` dùng kết nối PostgreSQL phù hợp cho tác vụ dài.
- Môi trường dùng chung: secret ở GitHub Environment/secret manager. Local: file env/service-account không commit; mount credential vào container và đặt GOOGLE_APPLICATION_CREDENTIALS. Emulator chỉ dùng để test local, không dùng token emulator cho production.
- Khi chuyển sang Amazon RDS/Aurora PostgreSQL: tạo DB mới, chạy toàn bộ migration, chuyển dữ liệu bằng công cụ PostgreSQL/AWS phù hợp, kiểm tra rồi mới đổi `DATABASE_URL`.

## 7. Kiểm chứng trước merge

Đối chiếu code/schema không thay thế chạy lại hệ thống. Suite Core có test controller, service, validation, timestamp, concurrency và migration (SaleRefundMigrationPostgresTest, DebtVoidPostgresTest). Test PostgreSQL là opt-in: Maven skip khi thiếu `CORE_TEST_POSTGRES_URL` (job `core` của CI có đặt biến này); phải bật môi trường test DB để kiểm chứng V1–V10, upgrade/rollback và khóa đồng thời.

| Nhóm | Bằng chứng bắt buộc |
|---|---|
| Core | V1–V10 từ DB rỗng/upgrade; controller contract theo mục 1–4; confirm/repay/void rollback, replay và cạnh tranh khóa; test chéo shop. DB local kiểm thử không thay nghiệm thu Supabase staging hoặc FE |
| AI | contract test Core ↔ AI; timeout/fallback; output schema; truy xuất đúng phạm vi `shop_id` |
| FE | OWNER: login → chọn shop → tạo/chốt → báo cáo; ADMIN: login → tra cứu cơ sở → xem tổng quan; test role guard và trạng thái loading/error/empty |
| Ops | CI kiểm migration; staging dùng Supabase project riêng; deploy production cần phê duyệt |

## 8. Rủi ro

- Khối lượng năm AI service trong 2–3 tuần là rủi ro chính; backlog phải chia theo vertical slice và ưu tiên luồng voice/text → bản nháp → chốt.
- Không tự hoàn tồn lịch sử có stock_deducted NULL; không đoán audit nợ VOIDED. V9 dừng khi dữ liệu local không hợp lệ thay vì sửa ngầm. Cần backup/recovery trước migration môi trường dùng chung.
- Đổi API từ xóa cứng sang void, bắt buộc Idempotency-Key/restockItems và tách field doanh thu cần FE cập nhật; backend test không chứng minh FE tương thích.
- Firebase Phone/Google và nhà cung cấp model phụ thuộc dịch vụ ngoài; cần kiểm thử adapter, timeout và fallback trước nghiệm thu.
- Dashboard ADMIN làm tăng phạm vi dữ liệu có thể đọc; endpoint phải tối thiểu, có audit và không triển khai giả danh người dùng trong MVP.
