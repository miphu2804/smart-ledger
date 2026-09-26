# Thiết kế kỹ thuật — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đề xuất |
| Chủ sở hữu | Chủ kỹ thuật |
| Người rà soát | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-09-24 |

## Tài liệu liên quan

- [BRD](../product/business-requirements.md) và [PRD](../product/product-requirements.md): nguồn `BO/BR → FR/NFR → AC`.
- [Sơ đồ kiến trúc MVP](diagrams/src/architecture.mmd); bản vẽ [drawio](diagrams/src/architecture.drawio), [SVG](diagrams/images/architecture.svg), [PNG](diagrams/images/architecture.png).
- [Hợp đồng API](../contracts/api-contracts.md): FE ↔ Core và Core ↔ AI.
- Nguồn đối chiếu hiện tại: [`frontend/mobile`](../../frontend/mobile/README.md), [`frontend/web`](../../frontend/web/README.md), [`backend/core`](../../backend/core/src/main/java/com/smartledger/core/controller/AuthController.java) và [`backend/ai`](../../backend/ai/src/agent/routers.py). FE EXE201 là nguồn lịch sử khi soạn phạm vi ban đầu.

## 1. Phạm vi

Kiến trúc trong sơ đồ là **đích MVP**: Mobile dành cho OWNER và dashboard web dành cho ADMIN cùng gọi Core; Core sở hữu API công khai và điều phối AI; PostgreSQL lưu sổ nghiệp vụ và lịch sử Agent chat; Redis, Qdrant, Langfuse và LiteLLM hỗ trợ AI.

**Đã xác minh trong code tại `staging`:** Mobile và web dashboard đều nằm trong repo. Mobile mặc định dùng dữ liệu mẫu trong bộ nhớ; parser text chạy cục bộ, voice chưa thu âm. Khi tắt mock, luồng đăng nhập mobile có thể gửi Firebase ID token tới Core; phần lớn action nghiệp vụ vẫn dùng dữ liệu mẫu và tạo shop vẫn cần mock vì Core chưa có endpoint shop. Web dashboard mặc định dùng mock/localStorage; luồng API thật còn giả định `/auth/login` và các endpoint admin chưa có. Core Java mới triển khai `POST /api/v1/auth/session`, `GET /api/v1/me` và migration auth/shops. AI FastAPI có `GET /health`, chat và CRUD hội thoại tại `/internal/v1/agent/*`, lưu lịch sử trong PostgreSQL; agent chưa có công cụ đọc dữ liệu shop. Core chưa gọi AI.

**Chưa xác minh:** Chưa có luồng FE → Core → AI chạy thật cho image analysis, recommendation, insight chat hoặc lịch sử Agent. Các phần này thuộc đích MVP nhưng chỉ được nghiệm thu khi có luồng UI/API và `AC-010`–`AC-014`, `AC-018`–`AC-023`.

## 2. Thành phần và quyền sở hữu

| Thành phần | Trách nhiệm |
|---|---|
| Mobile/FE | Giao diện OWNER: thu input, hiển thị bản nháp, bắt buộc người dùng xác nhận, chỉ gọi Core |
| Dashboard web | Giao diện ADMIN: tra cứu OWNER/cơ sở khách hàng và xem tổng quan hỗ trợ; không sửa sổ nghiệp vụ |
| Core | Xác minh Firebase ID token, kiểm soát OWNER/ADMIN, API quản trị và audit, sản phẩm, draft, sale/payment/debt, chi phí, báo cáo, replenishment và điều phối AI |
| AI | Voice/text parse, image analysis, recommendation, insight chat và Agent chat; chỉ trả đề xuất/câu trả lời |
| PostgreSQL | Dữ liệu nghiệp vụ, trace AI tối thiểu, idempotency và audit |
| Redis | Cache/giới hạn tốc độ/tác vụ ngắn hạn; không là nguồn dữ liệu chuẩn |
| Qdrant | Vector store cho các capability AI cần truy xuất tương đồng; use case cụ thể chưa chốt trong MVP |
| LiteLLM | Chọn model và quản lý khóa model ở phía server |
| Langfuse | Trace AI; không ghi audio/ảnh hoặc dữ liệu nhạy cảm thô mặc định |

Chỉ Core có API công khai. FE không gọi AI, PostgreSQL, Redis, Qdrant, LiteLLM hoặc Langfuse trực tiếp.

## 3. Luồng chính

1. OWNER đăng nhập mobile qua Firebase Phone hoặc Google; Core xác thực Firebase ID token, tìm hoặc tạo user/identity và trả các shop do OWNER sở hữu.
2. Mọi request nghiệp vụ gửi `X-Shop-Id`; Core kiểm tra shop thuộc OWNER và từ chối ADMIN trên các endpoint ghi sổ.
3. Người bán lên giỏ bằng POS, text, voice hoặc ảnh. Core gửi input AI khi cần.
4. AI trả **bản nháp**; Core lưu `sale_drafts` và `sale_draft_items`; FE cho sửa trước khi chốt.
5. Khi confirm draft, Core chạy một transaction tạo `sales`, `sale_items`, `payments` và `debts` khi chưa thu đủ; chỉ sale đã chốt mới vào báo cáo.
6. Replenishment và insight chat đọc dữ liệu có cấu trúc theo shop; kết quả có giải thích/căn cứ và không tự sửa sổ.

Nếu AI lỗi hoặc timeout, người dùng vẫn có thể nhập tay/POS. AI không được tạo sale, payment, debt hoặc expense trực tiếp.

Luồng ADMIN: dashboard web gọi `/api/v1/admin/*`; Core kiểm tra role ADMIN, chỉ trả dữ liệu hỗ trợ đã cho phép và ghi `audit_logs` cho truy cập nhạy cảm. Dashboard không có luồng giả danh OWNER hoặc gọi endpoint ghi sổ.

## 4. Dữ liệu và ràng buộc

[ERD](diagrams/src/erd.dbml) là schema logic tối thiểu. Migration thực tế phải bảo đảm:

- mọi dữ liệu nghiệp vụ và AI gắn `shop_id`;
- `users.system_role` chỉ nhận `OWNER|ADMIN`; mỗi shop có một `owner_id`, và một OWNER có thể sở hữu nhiều shop;
- truy cập nhạy cảm của ADMIN, archive và void ghi `audit_logs`;
- confirm draft và thu nợ là transaction; `payments` là lịch sử append-only;
- tiền lưu bằng số nguyên VND, quantity dùng `numeric(15,3)`, ID dùng `BIGINT` và time dùng `TIMESTAMPTZ` theo UTC;
- `paid_vnd` và `outstanding_vnd` là cache có thể đối soát từ `payments`;
- product/category/customer/expense archive thay vì xóa vật lý; sale đã chốt chỉ có thể `VOIDED` theo quy tắc nghiệp vụ;
- `api_idempotency_keys` ngăn retry hoặc double-click tạo trùng sale/payment;
- AI proposal, model/version và object key của media được lưu đủ để điều tra; không lưu media thô mặc định;
- nếu dùng Qdrant, mọi vector và truy vấn phải được giới hạn theo `shop_id`;

Schema PostgreSQL được quản lý bằng migration SQL có phiên bản trong Git. Không sửa schema trực tiếp trên Supabase Dashboard. Migration phải chạy được trên PostgreSQL chuẩn; extension, trigger hoặc API riêng của Supabase chỉ được dùng khi có quyết định kỹ thuật riêng.

## 5. Auth và phân quyền

- MVP hỗ trợ Firebase Phone và Google. Firebase Account Linking gộp các cách đăng nhập của cùng người dùng vào một Firebase UID; Core lưu UID đó trong `auth_identities`.
- Core không lưu password hoặc token thô. ERD hiện không có Core refresh-token/session table; mọi request dùng Firebase ID token đã được Core xác thực.
- Core mặc định tài khoản tự đăng ký là OWNER; role ADMIN chỉ được cấp bằng thao tác vận hành có kiểm soát, không nhận role từ request hoặc claim do client tự tạo.
- `POST /api/v1/auth/session`, `GET /api/v1/me`, `POST /api/v1/shops` không cần `X-Shop-Id`; endpoint nghiệp vụ còn lại cần token và shop thuộc OWNER.
- `/api/v1/admin/*` chỉ nhận ADMIN, không dùng `X-Shop-Id` từ client để mở rộng quyền và không có endpoint ghi sổ nghiệp vụ.
- Chưa được dùng dữ liệu thật trước khi test 401/403 và cô lập chéo shop.

## 6. Cấu hình môi trường

| Thành phần | Cấu hình tối thiểu |
|---|---|
| FE | `API_BASE_URL` |
| Core | `DATABASE_URL`, `REDIS_URL`, `AI_BASE_URL`, cấu hình Firebase Admin |
| AI | `POSTGRES__URL`, `REDIS__URL`, `QDRANT__URL` (khi bật capability vector), `LITELLM__URL`, `LANGFUSE__*` |

Host và port thuộc cấu hình môi trường, không phải API contract.

- Local: PostgreSQL/Supabase local; reset từ migration và seed.
- Dev/staging dùng chung: một Supabase project riêng, không chứa dữ liệu production.
- Runtime dùng connection pooler; migration, `pg_dump` và `pg_restore` dùng kết nối PostgreSQL phù hợp cho tác vụ dài.
- Secret chỉ nằm trong GitHub Environment hoặc secret manager; không commit `DATABASE_URL`.
- Khi chuyển sang Amazon RDS/Aurora PostgreSQL: tạo DB mới, chạy toàn bộ migration, chuyển dữ liệu bằng công cụ PostgreSQL/AWS phù hợp, kiểm tra rồi mới đổi `DATABASE_URL`.

## 7. Kiểm chứng trước merge

| Nhóm | Bằng chứng bắt buộc |
|---|---|
| Core | migration từ DB rỗng trên local và Supabase staging; contract test FE ↔ Core; confirm draft/payment rollback và idempotency; test chéo shop |
| AI | contract test Core ↔ AI; timeout/fallback; output schema; truy xuất đúng phạm vi `shop_id` |
| FE | OWNER: login → chọn shop → tạo/chốt → báo cáo; ADMIN: login → tra cứu cơ sở → xem tổng quan; test role guard và trạng thái loading/error/empty |
| Ops | CI kiểm migration; staging dùng Supabase project riêng; deploy production cần phê duyệt |

## 8. Rủi ro

- Khối lượng năm AI service trong 2–3 tuần là rủi ro chính; backlog phải chia theo vertical slice và ưu tiên luồng voice/text → bản nháp → chốt.
- Xóa vật lý dữ liệu nghiệp vụ hoặc chỉnh số dư mà không có payment/audit làm mất khả năng truy vết; archive/void và transaction phải được kiểm thử trước pilot dữ liệu thật.
- Firebase Phone/Google và nhà cung cấp model phụ thuộc dịch vụ ngoài; cần kiểm thử adapter, timeout và fallback trước nghiệm thu.
- Dashboard ADMIN làm tăng phạm vi dữ liệu có thể đọc; endpoint phải tối thiểu, có audit và không triển khai giả danh người dùng trong MVP.
