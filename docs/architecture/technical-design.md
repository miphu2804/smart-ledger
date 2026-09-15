# Thiết kế kỹ thuật — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đề xuất |
| Chủ sở hữu | Chủ kỹ thuật |
| Người rà soát | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-09-15 |

## Tài liệu liên quan

- [BRD](../product/business-requirements.md) và [PRD](../product/product-requirements.md): nguồn `BO/BR → FR/NFR → AC`.
- [Sơ đồ kiến trúc MVP](diagrams/src/architecture.mmd); bản vẽ [drawio](diagrams/src/architecture.drawio), [SVG](diagrams/images/architecture.svg), [PNG](diagrams/images/architecture.png).
- [Hợp đồng API](../contracts/api-contracts.md): FE ↔ Core và Core ↔ AI.
- Nguồn đối chiếu FE: [orei1i/EXE201/frontend](https://github.com/orei1i/EXE201/tree/main/frontend), kiểm tra 2026-09-15.

## 1. Phạm vi

Kiến trúc trong sơ đồ là **đích MVP**: Mobile dành cho OWNER và dashboard web dành cho ADMIN cùng gọi Core; Core sở hữu API công khai và điều phối AI; PostgreSQL lưu sổ nghiệp vụ; Redis, Qdrant, Langfuse và LiteLLM hỗ trợ AI.

**Đã xác minh:** FE ngoài repo có màn đăng nhập, danh mục, POS, câu bán hàng, thu/chi/nợ và báo cáo. FE hiện dùng Firebase ID token, `X-Shop-Id`, STT giả lập và parser cục bộ. Repo này chưa có Core/AI runtime.

**Chưa xác minh:** FE chưa có tích hợp chạy thật cho image analysis, RAG, recommendation và insight chat. Các phần này thuộc đích MVP nhưng chỉ được nghiệm thu khi có luồng UI/API và `AC-010`–`AC-014`.

## 2. Thành phần và quyền sở hữu

| Thành phần | Trách nhiệm |
|---|---|
| Mobile/FE | Giao diện OWNER: thu input, hiển thị bản nháp, bắt buộc người dùng xác nhận, chỉ gọi Core |
| Dashboard web | Giao diện ADMIN: tra cứu OWNER/cơ sở khách hàng và xem tổng quan hỗ trợ; không sửa sổ nghiệp vụ |
| Core | Auth/session, kiểm soát OWNER/ADMIN, API quản trị và audit, sản phẩm, checkout, thu/chi/nợ, báo cáo, replenishment, điều phối AI |
| AI | Voice/text parse, image analysis, RAG, recommendation, insight chat; chỉ trả đề xuất |
| PostgreSQL | Dữ liệu nghiệp vụ, hội thoại và audit AI tối thiểu |
| Redis | Cache/giới hạn tốc độ/tác vụ ngắn hạn; không là nguồn dữ liệu chuẩn |
| Qdrant | Vector cho RAG, luôn lọc theo `shop_id` |
| LiteLLM | Chọn model và quản lý khóa model ở phía server |
| Langfuse | Trace AI; không ghi audio/ảnh hoặc dữ liệu nhạy cảm thô mặc định |

Chỉ Core có API công khai. FE không gọi AI, PostgreSQL, Redis, Qdrant, LiteLLM hoặc Langfuse trực tiếp.

## 3. Luồng chính

1. OWNER đăng nhập mobile qua nhà cung cấp định danh; Core xác thực token, tạo phiên ứng dụng và trả tiệm do OWNER sở hữu.
2. Mọi request nghiệp vụ gửi `X-Shop-Id`; Core kiểm tra tiệm thuộc OWNER và từ chối ADMIN trên các endpoint ghi sổ.
3. Người bán lên giỏ bằng POS, text, voice hoặc ảnh. Core gửi input AI khi cần.
4. AI trả **bản nháp**; FE cho sửa; chỉ `POST /api/v1/invoices` mới chốt giao dịch.
5. Core ghi invoice, items, tồn và nợ trong một transaction; báo cáo chỉ đọc dữ liệu đã chốt.
6. Replenishment và insight chat đọc dữ liệu theo shop; kết quả có giải thích/căn cứ và không tự sửa sổ.

Nếu AI lỗi hoặc timeout, người dùng vẫn có thể nhập tay/POS. AI không được tạo invoice hay expense trực tiếp.

Luồng ADMIN: dashboard web gọi `/api/v1/admin/*`; Core kiểm tra role ADMIN, chỉ trả dữ liệu hỗ trợ đã cho phép và ghi `admin_audit_logs` cho truy cập nhạy cảm. Dashboard không có luồng giả danh OWNER hoặc gọi endpoint ghi sổ.

## 4. Dữ liệu và ràng buộc

[ERD](diagrams/src/erd.dbml) là schema logic tối thiểu. Migration thực tế phải bảo đảm:

- mọi dữ liệu nghiệp vụ và AI gắn `shop_id`;
- `users.role` chỉ nhận `OWNER|ADMIN`; mỗi shop có một `owner_user_id` trong MVP;
- truy cập nhạy cảm của ADMIN ghi `admin_audit_logs`;
- checkout là một transaction;
- tiền lưu bằng số nguyên VND;
- token chỉ lưu dạng hash khi Core tự phát hành session;
- AI proposal và model/version được audit đủ để điều tra, không lưu media thô mặc định;
- Qdrant collection bắt buộc có filter `shop_id`.

Schema PostgreSQL được quản lý bằng migration SQL có phiên bản trong Git. Không sửa schema trực tiếp trên Supabase Dashboard. Migration phải chạy được trên PostgreSQL chuẩn; extension, trigger hoặc API riêng của Supabase chỉ được dùng khi có quyết định kỹ thuật riêng.

## 5. Auth và phân quyền

- MVP hỗ trợ Google, số điện thoại OTP và Zalo qua adapter định danh; Core chuẩn hóa thành `auth_identities(provider, provider_subject)`.
- FE hiện chỉ chứng minh luồng Firebase phone; Google và Zalo cần issue tích hợp riêng.
- Core mặc định tài khoản tự đăng ký là OWNER; role ADMIN chỉ được cấp bằng thao tác vận hành có kiểm soát, không nhận role từ request hoặc claim do client tự tạo.
- `POST /api/v1/auth/session`, `GET /api/v1/me`, `POST /api/v1/shops` không cần `X-Shop-Id`; endpoint nghiệp vụ còn lại cần token và shop thuộc OWNER.
- `/api/v1/admin/*` chỉ nhận ADMIN, không dùng `X-Shop-Id` từ client để mở rộng quyền và không có endpoint ghi sổ nghiệp vụ.
- Chưa được dùng dữ liệu thật trước khi test 401/403 và cô lập chéo shop.

## 6. Cấu hình môi trường

| Thành phần | Cấu hình tối thiểu |
|---|---|
| FE | `API_BASE_URL` |
| Core | `DATABASE_URL`, `REDIS_URL`, `AI_BASE_URL`, cấu hình auth |
| AI | `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL`, `LITELLM_URL`, `LANGFUSE_*` |

Host và port thuộc cấu hình môi trường, không phải API contract.

- Local: PostgreSQL/Supabase local; reset từ migration và seed.
- Dev/staging dùng chung: một Supabase project riêng, không chứa dữ liệu production.
- Runtime dùng connection pooler; migration, `pg_dump` và `pg_restore` dùng kết nối PostgreSQL phù hợp cho tác vụ dài.
- Secret chỉ nằm trong GitHub Environment hoặc secret manager; không commit `DATABASE_URL`.
- Khi chuyển sang Amazon RDS/Aurora PostgreSQL: tạo DB mới, chạy toàn bộ migration, chuyển dữ liệu bằng công cụ PostgreSQL/AWS phù hợp, kiểm tra rồi mới đổi `DATABASE_URL`.

## 7. Kiểm chứng trước merge

| Nhóm | Bằng chứng bắt buộc |
|---|---|
| Core | migration từ DB rỗng trên local và Supabase staging; contract test FE ↔ Core; checkout rollback; test chéo shop |
| AI | contract test Core ↔ AI; timeout/fallback; output schema; filter `shop_id` |
| FE | OWNER: login → chọn shop → tạo/chốt → báo cáo; ADMIN: login → tra cứu cơ sở → xem tổng quan; test role guard và trạng thái loading/error/empty |
| Ops | CI kiểm migration; staging dùng Supabase project riêng; deploy production cần phê duyệt |

## 8. Rủi ro

- Khối lượng năm AI service trong 2–3 tuần là rủi ro chính; backlog phải chia theo vertical slice và ưu tiên luồng voice/text → bản nháp → chốt.
- Xóa cứng invoice/expense làm mất audit; `OQ-002` phải chốt trước pilot dữ liệu thật.
- Zalo auth và nhà cung cấp model phụ thuộc dịch vụ ngoài; cần adapter và fallback, không khóa domain vào SDK.
- Dashboard ADMIN làm tăng phạm vi dữ liệu có thể đọc; endpoint phải tối thiểu, có audit và không triển khai giả danh người dùng trong MVP.
