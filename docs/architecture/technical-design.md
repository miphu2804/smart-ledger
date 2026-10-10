# Thiết kế kỹ thuật — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đích MVP; Core hiện có được phân biệt với phần chưa tích hợp |
| Chủ sở hữu | Chủ kỹ thuật |
| Người rà soát | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-10-10 |

## Tài liệu liên quan

- [BRD](../product/business-requirements.md) và [PRD](../product/product-requirements.md): nguồn `BO/BR → FR/NFR → AC`.
- [Sơ đồ kiến trúc MVP](diagrams/src/architecture.mmd); bản vẽ [drawio](diagrams/src/architecture.drawio), [SVG](diagrams/images/architecture.svg), [PNG](diagrams/images/architecture.png).
- [Hợp đồng API](../contracts/api-contracts.md): FE ↔ Core và Core ↔ AI.
- Nguồn đối chiếu hiện tại: [`frontend/mobile`](../../frontend/mobile/README.md), [`frontend/web`](../../frontend/web/README.md), [`backend/core`](../../backend/core/src/main/java/com/smartledger/core/controller/AuthController.java) và [`backend/ai`](../../backend/ai/src/agent/router.py). FE EXE201 là nguồn lịch sử khi soạn phạm vi ban đầu.

## 1. Phạm vi

Kiến trúc trong sơ đồ là **đích MVP**: Mobile dành cho OWNER và dashboard web dành cho ADMIN cùng gọi Core; Core sở hữu API công khai và điều phối AI; PostgreSQL lưu sổ nghiệp vụ, lịch sử Agent chat và vector (pgvector); Redis, Langfuse và LiteLLM hỗ trợ AI (hoãn sau bản phát hành đầu tiên theo quyết định ngày 2026-10-07).

Mục này là nơi duy nhất ghi hiện trạng triển khai; tài liệu khác liên kết tới đây thay vì chép lại. Trạng thái từng endpoint nằm trong [hợp đồng API](../contracts/api-contracts.md).

**Core/mobile đối chiếu `staging` tại `b1de421c461d59473b3bb73aae103027afd67a89` ngày 2026-10-06; các mục AI giữ snapshot trước, không rà soát lại trong lượt này:**

- **Core:** Firebase auth/session/me, Shop/Category/Product/Customer CRUD, draft → confirm → sale/payment, debt repayment, expense, report summary, sale void và full refund, audit thao tác ghi và lịch sử audit cho OWNER; 7 GET hỗ trợ ADMIN, audit đọc ADMIN và đổi trạng thái tiệm; schema Flyway V1–V14 trên nhánh Core hiện tại. Core proxy `/api/v1/agent/*` sang AI `/internal/v1/agent/*` kèm `X-Internal-Token`, lấy `user_id`/`shop_id` từ tiệm của OWNER đã xác thực.
- **AI:** `/health` và Agent chat (chat, list, detail, rename, delete) lưu PostgreSQL, gửi cho model các lượt trao đổi gần nhất nguyên văn (mặc định 100 lượt, không tóm tắt) và có tool đọc dữ liệu tiệm chỉ đọc; schema AI là một baseline Supabase CLI trong `supabase/migrations/`.
- **AI — gợi ý nhập hàng và câu hỏi doanh số:** hai view chỉ đọc `v_sales` và `v_sale_items` cho câu hỏi doanh số; agent có tool `suggest_restock` trả gợi ý nhập hàng từ đơn `CONFIRMED`. `COVER_DAYS` (hiện là 7 ngày) và hai kỳ `last_7_days`/`last_30_days` là mặc định chờ PO duyệt, chưa phải yêu cầu đã chốt; xem [README AI](../../backend/ai/README.md#restock-suggestions).
- **Mobile** (đối chiếu `staging` tại `b1de421c461d`, ngày 2026-10-06): mặc định dùng mock; khi tắt mock gọi Firebase và Core cho đơn hàng, hàng hoá, công nợ, chi phí, thanh toán và hồ sơ tiệm. Home/Analytics tải danh sách dữ liệu từ Core rồi tính chỉ số cục bộ, chưa gọi `/api/v1/reports/summary`; lãi là ước tính, không tương đương báo cáo gross/voided/net của Core (xem [Chỉ số trên Home/Analytics](../../frontend/mobile/README.md#chỉ-số-trên-homeanalytics)). Confirm chống trùng theo draft ID; tạo chi phí, trả nợ và void dùng `Idempotency-Key`. Nhận diện đơn vẫn dùng parser rule-based trên máy; mic chỉ nhận giọng nói trên web.
- **Web admin:** mặc định mock; nhánh gọi thật chưa khớp auth/DTO/query của Core (còn `/auth/login`, `overview?days=`, `/admin/audit-logs` và các field giả định). Core đã có API hỗ trợ tối thiểu theo [contract ADMIN](../contracts/api-contracts.md#7-dashboard-quản-trị--đã-có-trong-core); chưa có bằng chứng web → Firebase → Core đã tích hợp/nghiệm thu.

**Bổ sung media trên nhánh hiện tại ngày 2026-10-08:** Core có port `MediaStorage` và adapter Cloudinary; Product image/Shop logo là public delivery, avatar là authenticated delivery. Cả ba upload reserve PENDING trong V14 `media_upload_keys` trước provider, dùng scope SHOP hoặc USER. Lease hết hạn được claim lại nguyên tử; token cũ không thể ghi/giải phóng lượt mới. Transaction ghi khóa lại và kiểm tra Shop/Product/User cùng lease trước khi đổi tham chiếu/audit/replay. Thay/xóa enqueue outbox V13 `media_cleanup_jobs`; worker khóa job `SKIP LOCKED` và public ID, bỏ qua asset đang gắn entity, hoãn upload đang có lease; retry chỉ cập nhật PENDING. Transaction cleanup giữ khóa trong lúc gọi delete provider. Mobile/web chưa gọi endpoint và nhánh này chưa xác nhận staging deploy/UAT.

Đây là phạm vi code, không phải xác nhận đã deploy staging, nghiệm thu FE hay production-ready; chưa có kiểm thử đầu-cuối mobile → Core → AI với model thật.

**Bổ sung trên `feat/core-stock-in` ngày 2026-10-06 (base staging `99ed97a9d03656fe782ae43c81526e68a8c0cc08`):** Core có API nhập kho cộng dồn và tách PATCH product khỏi số tồn tuyệt đối theo `BR-018`/`FR-030`; đồng thời V12 snapshot giá vốn sale item và Core có top-products, sales-series, profit-estimate theo `FR-006`. [API contract](../contracts/api-contracts.md) là nguồn request/response. Chưa merge/deploy hoặc nghiệm thu mobile; không sửa FE trong thay đổi này.

**Còn là đích MVP/chưa triển khai:** luồng AI proposal (text/voice/image → bản nháp); danh sách gợi ý nhập hàng trên màn tổng quan và UI gọi API nhập kho (#103); UI notification/push và FE dùng ba report nâng cao. API nhập kho/report đã có trên nhánh nêu trên, không đồng nghĩa #103 hoặc Home/Analytics hoàn tất. Trên nhánh `feat/ai-restock-insight`, gợi ý nhập hàng và câu hỏi số liệu đã trả lời được qua `/api/v1/agent/chat`, nhưng chưa nghiệm thu đầu-cuối và chưa deploy staging. Hoàn tiền/trả hàng từng phần và ledger điều chỉnh kho độc lập chưa triển khai. Dashboard web vẫn cần tích hợp contract ADMIN đã có; API/audit không phải nghiệm thu giao diện. Năng lực end-to-end chỉ được nghiệm thu qua AC tương ứng trong [PRD](../product/product-requirements.md).

**Notification trên `feat/app-notifications` ngày 2026-10-08 (base staging `a1b97f8`):** V15 thêm ngưỡng tồn riêng Product nullable và hai bảng inbox/read-state. Core có 4 API OWNER, phát 5 loại event trong transaction Product/confirm/stock-in/void/đổi trạng thái tiệm; khóa nguồn, unique episode/recipient và partial unique stock ngăn trùng. LOW/OUT chỉ giữ một cảnh báo mở; giải quyết giữ lịch sử và không tự đánh dấu đọc. List/count/read kiểm recipient và quyền tiệm: INACTIVE chỉ thấy event trạng thái, ARCHIVED bị loại; batch read nguyên tử, giữ readAt đầu tiên. Không có push/FCM/reminder/AI event; chưa sửa UI hoặc nghiệm thu staging.

**Đối chiếu tối ưu truy vấn ngày 2026-10-10:** #134–#137 đã có trên `perf/query-optimization` tại [`b6e4169dcfb9ffb2534b20baa9aa5e368b86d9b3`](https://github.com/miphu2804/smart-ledger/tree/b6e4169dcfb9ffb2534b20baa9aa5e368b86d9b3); #138 đồng bộ tài liệu cho phần này. Cách đọc/khóa theo lô nằm ở [§4.1](#41-truy-vấn-theo-lô), kiểm thử ở [§7](#7-kiểm-chứng-trước-merge). Không đổi nghiệp vụ, response, schema hoặc phạm vi AI/mobile; không xác nhận đã merge/deploy staging hay đạt UAT.

## 2. Thành phần và quyền sở hữu

| Thành phần | Trách nhiệm |
|---|---|
| Mobile/FE | Giao diện OWNER: thu input, hiển thị bản nháp, bắt buộc người dùng xác nhận, chỉ gọi Core |
| Dashboard web | Giao diện ADMIN: tra cứu OWNER/cơ sở khách hàng và xem tổng quan hỗ trợ; không sửa sổ nghiệp vụ |
| Core | Hiện có auth, shop/catalog/customer, draft/sale/payment/debt/refund, expense, summary, audit và proxy Agent sang AI; ADMIN có đọc tổng quan/hồ sơ/lịch sử hỗ trợ và đổi trạng thái shop, đều có audit. Nhánh hiện tại thêm nhập kho cộng dồn, snapshot giá vốn V12, ba report nâng cao và media Cloudinary V13/V14 cho Product/Shop/User; UI nhập/gợi ý/báo cáo/media và điều phối AI proposal chưa hoàn thành |
| AI | Voice/text parse, image analysis, recommendation, insight chat và Agent chat; chỉ trả đề xuất/câu trả lời |
| PostgreSQL | Dữ liệu nghiệp vụ, idempotency và audit_logs Core; vector qua `pgvector` ([ADR-0001](adr/0001-vector-store-pgvector.md)); V15 lưu inbox/read-state/threshold Core; trace AI theo ERD đích, không mặc nhiên là migration Core |
| Redis | Cache/giới hạn tốc độ/tác vụ ngắn hạn; không là nguồn dữ liệu chuẩn. Tính năng dựa trên Redis hoãn sau bản phát hành đầu tiên; AI đã kết nối Redis lúc khởi động nhưng chưa tính năng nào dùng, Core không dùng |
| LiteLLM | Chọn model và quản lý khóa model ở phía server. Hoãn sau bản phát hành đầu tiên; AI hiện không dùng |
| Langfuse | Trace AI; không ghi audio/ảnh hoặc dữ liệu nhạy cảm thô mặc định. Hoãn sau bản phát hành đầu tiên; AI hiện không dùng |

Chỉ Core có API công khai. FE không gọi AI, PostgreSQL, Redis, LiteLLM hoặc Langfuse trực tiếp.

## 3. Luồng chính

1. FE lấy Firebase ID token; Core xác minh token và ánh xạ UID đến user/identity. Session trả role và shop có thể truy cập; không cấp token Core riêng.
2. Auth/me và Shop dùng ID path, không cần X-Shop-Id; các API nghiệp vụ cần X-Shop-Id, OWNER đang hoạt động, shop thuộc OWNER và ACTIVE.
3. Luồng hiện có là chọn/nhập tay tạo draft; item catalog cần product ACTIVE cùng shop, món tùy ý có productId null cần tên/đơn vị/giá/số lượng. Draft chưa tác động tiền, nợ, tồn hay báo cáo và hết hiệu lực sau một tháng.
4. Confirm khóa draft rồi khóa nhóm product ACTIVE cùng shop bằng một query `PESSIMISTIC_WRITE`, `ORDER BY p.id ASC` tại DB; nhóm rỗng bỏ qua query. Snapshot tên/đơn vị/giá, stock_deducted và tổng giá vốn biết được (`costPriceVnd × quantity`, HALF_UP tới VND), trừ tồn thực sự rồi reconcile cảnh báo kho một lần cho nhóm đã khóa; tạo sale/item/payment ban đầu và debt nếu còn thiếu trong cùng transaction. Custom/product thiếu giá vốn giữ snapshot cost NULL. Retry draft đã confirm trả cùng sale, không ghi/trừ thêm.
5. Repay khóa sale trước debt, thêm payment và cập nhật số dư nguyên tử. Customer dùng ID ổn định; không tự gộp trùng tên/phone. Confirm bán thiếu không có ID cần tên để tạo khách; phone không bắt buộc.
6. Void khóa sale → debt; nếu hoàn tồn, kiểm tra snapshot trước rồi khóa một lần nhóm product có `stockDeducted=true`, cùng shop và `ORDER BY p.id ASC`, không lọc ACTIVE (product archive vẫn có thể hoàn tồn theo quy tắc hiện có). Hoàn tồn rồi reconcile cảnh báo cho cả nhóm; nhóm rỗng không query khóa Product/cảnh báo đang mở. Kiểm tra tổng payment, ghi refund toàn bộ tiền đã thu nếu > 0, hủy chỉ số dư OPEN, giữ SETTLED, lưu void reason/user/time và chọn rõ hoàn tồn hay không. Không chỉnh/xóa payment, không nhận thêm trả nợ cho sale VOIDED.
7. Summary dùng sự kiện soldAt/voidedAt/receivedAt/refundedAt theo kỳ Việt Nam; không loại khoản thu kỳ cũ vì sale bị void. Nợ hiển thị là số dư hiện tại toàn shop. Định nghĩa field trong [API contract](../contracts/api-contracts.md).
8. Stock-in: xác minh OWNER/shop ACTIVE → reserve idempotency PRODUCT_STOCK_IN → khóa product ACTIVE cùng shop → kiểm tra tracked/tổng tồn → cộng lượng nhập → ghi STOCK_ADJUSTED/source STOCK_IN → flush product để snapshot updatedAt đúng → lưu response 200 để replay → commit. Lỗi bất kỳ bước ghi nào rollback tồn/audit/key. Chỉ giữ khóa product, không khóa thêm sale/debt và không tạo nghĩa vụ tiền.

Lỗi confirm/repay/void rollback toàn bộ thay đổi tiền/nợ/tồn, notification và audit, kể cả reservation idempotency nếu có. Sale đã confirm không có đường PATCH/DELETE; chỉ hủy toàn bộ có dấu vết. restockItems bắt buộc; hoàn tồn dựa snapshot, không suy từ tracked hiện tại. Snapshot NULL lịch sử không đủ để hoàn tự động; món tùy ý không tạo tồn.

Luồng text/voice/image → AI proposal → draft vẫn là đích: AI không được tự tạo sale/payment/debt/expense. Core mới gọi AI cho chat trợ lý (proxy Agent), chưa gọi cho luồng proposal; timeout/fallback cần nghiệm thu khi tích hợp.

Luồng ADMIN hiện có: xác minh token → profile ADMIN/ACTIVE trong DB → đọc projection hỗ trợ → ghi audit → commit → trả response. 7 GET `/api/v1/admin/*` gồm overview, danh sách/chi tiết OWNER, danh sách/chi tiết tiệm, lịch sử trạng thái tiệm và lịch sử truy cập của chính ADMIN. Các GET này dùng transaction có khả năng ghi, isolation REPEATABLE_READ, không dùng readOnly vì phải lưu audit. Không lưu được audit trả 503 admin_audit_unavailable, không trả profile được bảo vệ. Chi tiết query/DTO/phạm vi nằm trong [contract ADMIN](../contracts/api-contracts.md#7-dashboard-quản-trị--đã-có-trong-core).

`PATCH /api/v1/shops/{shopId}/status` vẫn nằm ngoài prefix admin; tạm ngưng/kích hoạt kèm lý do, ghi một event SHOP_INACTIVATED/SHOP_REACTIVATED dùng chung cho lịch sử OWNER và projection ADMIN. Thay đổi trạng thái và audit cùng transaction, lỗi audit rollback. ADMIN không giả danh OWNER hay sửa sổ; triển khai Core không tự chứng minh web/staging đạt BR-014/NFR-009.

## 4. Dữ liệu và ràng buộc

[ERD](diagrams/src/erd.dbml) là schema logic, có cả bảng đích chưa nằm trong Core. [ERD description](erd-description.md) mô tả quan hệ và ánh xạ migration. Core hiện bảo đảm:

- Tenant được xác minh trong service theo shop sở hữu; payment/debt/refund kế thừa phạm vi qua sale. Không phải mọi bảng đều có cột shop_id riêng.
- users.system_role OWNER|ADMIN; một shop có một owner, một OWNER có nhiều shop.
- Money là BIGINT VND, quantity numeric(15,3), ID BIGINT; thời điểm TIMESTAMPTZ/UTC trong Core. JSON timestamp hiển thị +07:00 và kỳ báo cáo theo Asia/Ho_Chi_Minh.
- Product/category/customer/expense archive, không xóa lịch sử. Shop INACTIVE vẫn cho OWNER xem lý do nhưng chặn nghiệp vụ; ARCHIVED không hiển thị cho OWNER.
- Payments append-only; paid_vnd đối soát bằng tổng payment. Debt original_vnd = tổng payment trả nợ + outstanding_vnd + COALESCE(cancelled_vnd, 0). Refund là dòng tiền ra riêng, không trừ/xóa payment.
- V8 cho sale_items.product_id null nhưng giữ FK khi có ID; V9 thêm sale_refunds (unique sale_id, sale/user FK, amount/method check, index refunded_at), stock_deducted nullable và audit/lifecycle nợ VOIDED. V12 thêm sale_items.estimated_cost_vnd nullable/check không âm; không backfill lịch sử. V13 thêm provider public ID cho Product/Shop/User, bảng `media_cleanup_jobs` có trạng thái/retry và whitelist audit avatar. V14 thêm `media_upload_keys` riêng để reserve/replay theo scope và fence bằng UUID token. Không sửa migration đã phát hành, không đoán snapshot tồn, giá vốn hay audit cũ.
- Nợ SETTLED giữ nguyên sau sale void; chỉ nợ OPEN còn dư chuyển VOIDED kèm cancelled_vnd/voided_at. Chưa thu thì không tạo refund row.
- Idempotency phủ POST expense, debt repayment, sale void và stock-in: reserve/action/replay result chung transaction; key theo shop + operation, hash có body và path ID khi có. Stock-in chuẩn hóa số lượng/reason trước hash và lưu snapshot 200; các luồng cũ giữ 201. TTL mặc định 30 ngày, chưa có cleanup job. POST tạo danh mục/khách/draft/shop chưa được bảo vệ key; confirm chống trùng bằng draft ID.
- PATCH/archive/stock-in product khóa dòng cùng cách checkout/void, tránh ghi đè tồn khi chạy đồng thời. PATCH chỉ sửa thông tin/theo dõi tồn; false→true khởi tạo 0, true→true giữ tồn đọc dưới khóa. Repay/void thống nhất thứ tự khóa sale → debt → product để tránh lock inversion.
- Media upload kiểm bytes JPEG/PNG, dung lượng ≤5 MiB và kích thước ≤2048 px trước khi gọi provider. `imagePublicId`/`logoPublicId`/`avatarPublicId` không là contract client. V14 giữ reservation/replay cho cả ba upload, public ID được xác định từ target/key/hash file; Cloudinary dùng `overwrite=true` để retry cùng bytes. Avatar replay lưu snapshot nội bộ, tạo lại URL authenticated khi response; Firebase `avatar_url` vẫn sync làm fallback sau DELETE avatar. `CLOUDINARY_ENABLED=false` trả 503 cho write có tham chiếu cần đổi, DELETE không có ảnh tùy chỉnh vẫn no-op 204; session bỏ avatar Cloudinary thay vì fail, worker không được tạo. Enabled nhưng thiếu credential/prefix hợp lệ thì startup fail-fast.
- Bảng vector (`pgvector`) có `shop_id` và mọi truy vấn tương đồng lọc theo `shop_id` trong cùng câu SQL.

V10 tạo `audit_logs` append-only (trigger chặn UPDATE/DELETE/TRUNCATE); Core ghi audit cho thao tác ghi thành công của OWNER/ADMIN cùng transaction nghiệp vụ và OWNER đọc qua `GET /api/v1/audit-logs` (xem [API contract](../contracts/api-contracts.md#lịch-sử-audit-của-tiệm)). V11 mở rộng chính bảng này cho 7 action đọc ADMIN, cho phép shop_id/entity_id null ở đúng event toàn hệ thống/danh sách/hồ sơ OWNER; event nghiệp vụ vẫn cần shop và đối tượng thật. V11 thay check ID/action-target, giữ FK, các check còn lại và trigger V10; không tạo admin_access_logs hay viết lại lịch sử (xem [migration alignment](erd-description.md#7-migration-alignment)). Trace AI/media và cô lập vector theo shop vẫn là phạm vi AI đích, không được nghiệm thu trong lượt này.

Phân tách audit ở projection và whitelist: OWNER không đọc ADMIN_*; ADMIN access logs chỉ đọc action hỗ trợ của actor hiện tại, không raw metadata tiền/nợ/tồn. Status history của tiệm chỉ đọc event ADMIN đổi trạng thái, có thể gồm ADMIN khác. Audit đọc lưu queryPresent/resultCount thay vì query/response hoặc liên hệ thô; đọc lịch sử ADMIN cũng tạo event, còn đọc lịch sử OWNER thì không.

Schema PostgreSQL được quản lý bằng migration SQL có phiên bản trong Git. Không sửa schema trực tiếp trên Supabase Dashboard. Dev và staging dùng chung DB nên chỉ chạy migration từ code đã merge vào `staging`; Core dùng Flyway, AI dùng Supabase CLI (`supabase db push`); máy dev chạy Core với `FLYWAY_ENABLED=false` (xem [Database migrations](../../README.md#database-migrations)). Migration phải chạy được trên PostgreSQL chuẩn; extension, trigger hoặc API riêng của Supabase chỉ được dùng khi có quyết định kỹ thuật riêng.

### 4.1. Truy vấn theo lô

Các tối ưu #134–#137 giữ nguyên tenant guard, thứ tự response, mã lỗi và ranh giới transaction; không thêm quan hệ JPA, index, migration hay cache Redis. Số query dưới đây chỉ tính phần dữ liệu nêu trong từng dòng, **không tính xác thực/quyền tiệm, customer, các truy vấn khác hoặc thao tác ghi**.

| Luồng | Cách truy vấn và giới hạn kiểm thử |
|---|---|
| List sale/draft (#134) | Đọc danh sách cha một lần theo ID giảm dần; đọc item một lần bằng join cha để lọc shop, sắp ID cha rồi ID item tăng dần và nhóm vào map. Danh sách có dữ liệu: 2 query; rỗng: 1 query, không đọc item. Cha không có item trả `items: []`. Detail/confirm/void vẫn dùng query item của một cha. |
| Tạo/sửa draft — `prepare` (#135) | Kiểm customer trước; chỉ gom ID catalog, chưa ném lỗi trùng; đọc product ACTIVE cùng shop một lần, không khóa, rồi tra map theo thứ tự item request. Có catalog: 1 query Product; toàn custom: 0. Giữ thứ tự lỗi custom name/unit → text catalog → ID trùng → product không hợp lệ → tính tiền/overflow. |
| Confirm (#136) | Gom ID catalog khác null, distinct; một query khóa product ACTIVE cùng shop, `ORDER BY p.id ASC` trong SQL. Thiếu kết quả vẫn bị từ chối; duyệt/trừ tồn và snapshot như cũ. Nhóm rỗng: 0 query khóa Product. |
| Void hoàn tồn (#136) | Sau khóa sale → debt và kiểm snapshot, chỉ gom ID có `stockDeducted=true`; một query khóa theo shop, ID tăng dần, không lọc status. Nhóm rỗng: 0 query khóa Product; custom/không trừ tồn không hoàn kho. |
| Reconcile cảnh báo kho (#137) | Confirm gom nhóm sau trừ tồn; void gom nhóm sau hoàn tồn. `reconcileStock(Shop, Collection<Product>)` đọc toàn bộ cảnh báo LOW/OUT đang mở của nhóm trong một query, rồi nhóm theo entity ID. Nhóm rỗng: 0; lời gọi một sản phẩm dùng lại logic collection. Giữ resolve → flush → tạo event/recipient và trạng thái đọc cũ. |

Giới hạn: khi mở một chu kỳ cảnh báo mới, tra lịch sử/dedup và ghi event/recipient vẫn có thể phát sinh theo từng sản phẩm; không cam kết cả confirm/void chỉ có hai SQL. List sale/draft vẫn chưa phân trang, nên số query cố định không loại bỏ chi phí nạp toàn bộ lịch sử vào bộ nhớ. Trình tự khóa được kiểm trên SQL Hibernate và plan PostgreSQL, không chỉ bằng cách sort ID trong Java. Walkthrough [§5.3 confirm](service-walkthrough/README.md#53-saledraftserviceconfirm--checkout) và [§6.3 void](service-walkthrough/README.md#63-salevoidservicevoidsale) minh họa luồng; hướng dẫn chạy regression nằm ở [Core README](../../backend/core/README.md#sale-and-draft-list-query-regression-tests).

## 5. Auth và phân quyền

- Provider Phone/Google là đích đăng nhập đã mô tả trong PRD; Core nhận Firebase ID token, không chứng minh UI/provider đã tích hợp chỉ từ kiểm thử backend. Firebase Account Linking gộp các cách đăng nhập của cùng người dùng vào một Firebase UID; Core lưu UID đó trong `auth_identities`.
- Core không lưu password hoặc token thô. ERD hiện không có Core refresh-token/session table; mọi request dùng Firebase ID token đã được Core xác thực.
- Core mặc định tài khoản tự đăng ký là OWNER; role ADMIN chỉ được cấp bằng thao tác vận hành có kiểm soát, không nhận role từ request hoặc claim do client tự tạo.
- Auth/me và mọi API Shop dùng ID path, không cần X-Shop-Id; endpoint nghiệp vụ OWNER còn lại cần token/X-Shop-Id của shop ACTIVE thuộc OWNER. Shop status chỉ ADMIN; đây là ngoại lệ ngoài prefix admin, không trao quyền sửa sổ.
- /api/v1/admin/* kiểm tra ADMIN/ACTIVE trước xử lý query và kiểm tra lại trong service; không dùng X-Shop-Id để mở rộng quyền. Các response thành công đặt Cache-Control: no-store; danh sách che liên hệ, chi tiết phục vụ hỗ trợ có liên hệ đầy đủ nhưng không Firebase identity hoặc dữ liệu sổ. ADMIN đọc được hồ sơ INACTIVE/ARCHIVED, không có quyền mở API nghiệp vụ của OWNER.
- Chưa được dùng dữ liệu thật trước khi test 401/403 và cô lập chéo shop.

## 6. Cấu hình môi trường

| Thành phần | Cấu hình tối thiểu |
|---|---|
| FE | `API_BASE_URL` |
| Core hiện tại | `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `FIREBASE_PROJECT_ID`; credential qua `FIREBASE_SERVICE_ACCOUNT_JSON` hoặc Application Default Credentials (ADC, local thường dùng `GOOGLE_APPLICATION_CREDENTIALS`); `CORS_ALLOWED_ORIGINS`, `FLYWAY_ENABLED`, `AI_BASE_URL`, `INTERNAL_API_TOKEN`; media dùng `CLOUDINARY_ENABLED`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_PUBLIC_ID_PREFIX` (bắt buộc khi enabled), optional `MEDIA_UPLOAD_LEASE_SECONDS` (mặc định 300) và `CLOUDINARY_CLEANUP_FIXED_DELAY_MS`; `SERVER_PORT`, `IDEMPOTENCY_TTL_DAYS` tùy chọn; Core không dùng Redis |
| AI hiện tại | `POSTGRES_URL`, `REDIS_URL`, `INTERNAL_API_TOKEN`, `MODEL_*`, `OPENAI_API_KEY`; `AI_SQL_READER_URL` tùy chọn cho tool đọc dữ liệu tiệm. AI kết nối Redis lúc khởi động nhưng chưa tính năng nào dùng; `LITELLM_URL` và `LANGFUSE_*` đã bỏ khỏi cấu hình AI, hoãn sau bản phát hành đầu tiên. Danh sách đầy đủ: [`backend/ai/.env.example`](../../backend/ai/.env.example) |

Host và port thuộc cấu hình môi trường, không phải API contract. [Core README](../../backend/core/README.md) là nơi hướng dẫn chạy IntelliJ/Maven/Docker và Firebase Emulator; không nhân bản hướng dẫn vận hành tại đây.

Khi `FIREBASE_SERVICE_ACCOUNT_JSON` có giá trị không rỗng, Core dùng JSON đó trước ADC; khi trống, Core dùng ADC. Cloudinary secret chỉ thuộc runtime Core; prefix phải khác theo local/staging/production hoặc dùng account/provider credential tách riêng. Cấu hình Railway theo từng environment, CORS allowlist và cách cấp secret nằm trong [CI/CD — Biến của service trên Railway](../development/ci-cd.md#railway-service-variables). `FLYWAY_ENABLED` kiểm soát migration lúc startup; việc chạy migration trên DB dùng chung phải theo [quy trình migration](../../README.md#database-migrations).

- Dev và staging dùng chung một Supabase project và một Redis Cloud database, không chứa dữ liệu production; không có PostgreSQL hay Redis container local. Test tự động dùng PostgreSQL tạm: AI đọc `POSTGRES_TEST_URL`, Core đọc `CORE_TEST_POSTGRES_*`.
- Sơ đồ môi trường và CI/CD: [ci-cd.drawio](diagrams/src/ci-cd.drawio) ([SVG](diagrams/images/ci-cd.svg)).
- Production: một Supabase project và một Redis Cloud database khác; credential staging và production không dùng chung file hay biến. Cách chạy Compose xem [README](../../README.md#local-compose).
- Runtime dùng connection pooler; migration, `pg_dump` và `pg_restore` dùng kết nối PostgreSQL phù hợp cho tác vụ dài.
- Môi trường dùng chung: secret ở GitHub Environment/secret manager. Local: file env/service-account không commit; mount credential vào container và đặt GOOGLE_APPLICATION_CREDENTIALS. Emulator chỉ dùng để test local, không dùng token emulator cho production.
- Khi chuyển sang Amazon RDS/Aurora PostgreSQL: tạo DB mới, chạy toàn bộ migration, chuyển dữ liệu bằng công cụ PostgreSQL/AWS phù hợp, kiểm tra rồi mới đổi `DATABASE_URL`.

## 7. Kiểm chứng trước merge

Đối chiếu code/schema không thay thế chạy lại hệ thống. Suite Core có test controller, service, validation, timestamp, concurrency và migration (SaleRefundMigrationPostgresTest, DebtVoidPostgresTest, AdminDashboardControllerWebTest, AdminDashboardPostgresTest, ReportAggregationPostgresTest). Test PostgreSQL là opt-in: Maven skip khi thiếu `CORE_TEST_POSTGRES_URL` (job `core` của CI có đặt biến này); phải bật môi trường test DB để kiểm chứng V1–V15, rollback và khóa đồng thời. Media test kiểm input, public-ID prefix, idempotency replay, adapter, worker và schema V13/V14; vẫn cần upload thật bằng credential staging an toàn. NotificationPostgresTest dùng migration V1–V15 thật để kiểm stock episodes, cùng-key/khác-key confirm/void, rollback khi notification lỗi, batch read/concurrency và tenant/status filtering; migration tests kiểm fresh validation/upgrade/adoption/rollback. Lệnh trong [Core README](../../backend/core/README.md), kết quả từng lượt trong PROGRESS.md không thay UAT.

Kiểm thử chống N+1 trên PostgreSQL thật (không chỉ mock repository):

- `SalesListQueryPostgresTest`: 1/20/100/1.337/10.000 sale hoặc draft, tối đa 50.000 item; kiểm 2 query cho danh sách có dữ liệu, 1 khi rỗng, thứ tự item và tenant isolation. Xem [list regression](../../backend/core/README.md#sale-and-draft-list-query-regression-tests).
- `ProductBatchLockPostgresTest`: kiểm một query khóa nhóm confirm/void, SQL có `ORDER BY`, plan PostgreSQL khóa theo ID; catalog 100.000 sản phẩm, nhóm 1/20/100. Kiểm cạnh tranh thứ tự item đảo ngược, archive/missing/custom và rollback tiền/nợ/tồn/notification/audit. Xem [batch locks](../../backend/core/README.md#checkout-and-void-batch-product-lock-tests).
- `NotificationEventServiceTest`, `NotificationPostgresTest` và phần reconciliation trong `ProductBatchLockPostgresTest`: một query đọc cảnh báo mở cho nhóm không đổi trạng thái; fixture 100.000 event đã resolve và 10.000 cảnh báo mở; lifecycle LOW → OUT → hết cảnh báo → LOW, retry/concurrency không trùng event/recipient, lỗi notification rollback nghiệp vụ. Truy vấn lịch sử/dedup khi tạo mới không nằm trong ngân sách một query. Xem [stock alerts](../../backend/core/README.md#batch-stock-alert-reconciliation-tests).
- `SaleDraftServiceTest` và phần prepare trong `ProductBatchLockPostgresTest`: create/replace có catalog dùng một query Product, toàn custom không đọc Product; nhiều lỗi vẫn ưu tiên theo thứ tự request, giữ snapshot/rounding/discount/payment và dữ liệu cũ khi replace lỗi. Xem [draft reads](../../backend/core/README.md#draft-batch-product-read-tests).

Query count, SQL/plan và tính đúng đắn là kiểm chứng hồi quy; thời gian benchmark local chỉ là bằng chứng tham khảo, không phải SLA HTTP/staging hoặc kết quả tải kéo dài. Kết quả chạy đã ghi theo thời điểm trong [PROGRESS.md](../../PROGRESS.md); sửa tài liệu không đồng nghĩa chạy lại toàn bộ Maven hoặc nghiệm thu FE.

| Nhóm | Bằng chứng bắt buộc |
|---|---|
| Core | V1–V15 từ DB rỗng/upgrade; controller contract theo mục 1–4 và 7; chống N+1 cho list sale/draft, prepare, khóa confirm/void và đọc cảnh báo mở theo §4.1; confirm/repay/void rollback, replay và cạnh tranh khóa; report aggregate/giá vốn thiếu/ngày trống; media validation/idempotency/cleanup worker; test chéo shop, ADMIN projection/actor scope và audit fail-closed/rollback. DB local kiểm thử không thay nghiệm thu Supabase staging hoặc FE |
| AI | contract test Core ↔ AI; timeout/fallback; output schema; truy xuất đúng phạm vi `shop_id` |
| FE | OWNER: login → chọn shop → tạo/chốt → báo cáo; ADMIN: login → tra cứu cơ sở → xem tổng quan; test role guard và trạng thái loading/error/empty |
| Ops | CI kiểm migration; staging dùng Supabase project riêng; deploy production cần phê duyệt |

## 8. Rủi ro

- Khối lượng năm AI service trong 2–3 tuần là rủi ro chính; backlog phải chia theo vertical slice và ưu tiên luồng voice/text → bản nháp → chốt.
- Không tự hoàn tồn lịch sử có stock_deducted NULL; không đoán audit nợ VOIDED. V9 dừng khi dữ liệu local không hợp lệ thay vì sửa ngầm. Cần backup/recovery trước migration môi trường dùng chung.
- Đổi API từ xóa cứng sang void, bắt buộc Idempotency-Key/restockItems và tách field doanh thu cần FE cập nhật; backend test không chứng minh FE tương thích.
- Firebase Phone/Google và nhà cung cấp model phụ thuộc dịch vụ ngoài; cần kiểm thử adapter, timeout và fallback trước nghiệm thu.
- Dashboard ADMIN làm tăng phạm vi dữ liệu có thể đọc; endpoint phải tối thiểu, có audit và không triển khai giả danh người dùng trong MVP.
