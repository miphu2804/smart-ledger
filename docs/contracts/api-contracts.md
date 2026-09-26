# Hợp đồng API — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đích MVP; các endpoint đã triển khai được đánh dấu riêng bên dưới |
| Chủ sở hữu | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-09-24 |

## Tài liệu liên quan

- [PRD](../product/product-requirements.md): `FR-*` mà hợp đồng phải phủ.
- [Thiết kế kỹ thuật](../architecture/technical-design.md): module và luồng.

## Phạm vi

- API công khai cho mobile OWNER và dashboard web ADMIN nằm dưới `/api/v1`; base URL do môi trường cấu hình.
- API Core ↔ AI nằm dưới `/internal/v1` và không công khai cho FE.
- Không dùng cổng trong sơ đồ kiến trúc làm hợp đồng API.
- Redis, Qdrant, Langfuse và LiteLLM không có API công khai. FE không gọi trực tiếp các thành phần này.

**Trạng thái code tại `staging`:** Core mới có `POST /api/v1/auth/session` và `GET /api/v1/me`; AI có `GET /health` và năm endpoint `/internal/v1/agent/*` (chat, list, detail, rename, delete). Các đường Core còn lại trong tài liệu là hợp đồng đích, chưa có controller. Core chưa proxy tới AI; web admin dùng mock theo mặc định và client API thật của web chưa khớp hợp đồng này.

## Quy ước request

- FE gửi `Authorization: Bearer <identity-token>`.
- Endpoint nghiệp vụ của OWNER theo đích MVP gửi thêm `X-Shop-Id: <shop-id>`; Core phải kiểm tra tiệm thuộc OWNER. Chưa có endpoint nghiệp vụ để xác minh kiểm tra này. ID shop trong migration Core hiện là `BIGINT`.
- Dashboard chỉ gọi `/api/v1/admin/*`; Core lấy phạm vi từ quyền ADMIN, không tin `X-Shop-Id` để mở rộng quyền.
- Tiền là số nguyên VND. Mọi thời gian là ISO 8601 UTC.
- Endpoint AI dùng snake_case. Hai endpoint Core đã triển khai dùng camelCase trong JSON (`displayName`, `needsOnboarding`, `avatarUrl`); hợp đồng cho các endpoint Core chưa triển khai cần chốt quy ước trước khi code.

## 0. Hợp đồng lỗi hiện có

Core trả `{ "code": "string", "message": "string", "details": [{ "field": "string", "issue": "string" }], "traceId": "string" }` (bỏ `details` khi rỗng). AI dùng dạng FastAPI:

```json
{
  "detail": "string"
}
```

Endpoint AI nội bộ trả `503` với `detail: "ai_unavailable"` khi model chưa cấu hình hoặc lời gọi model thất bại. Không áp dụng payload lỗi AI cho Core.

## 1. Auth và tiệm

| Method | Đường | Body / query | Trả về |
|---|---|---|---|
| `POST` | `/api/v1/auth/session` | Firebase ID token + `{ displayName? }`; `displayName` bắt buộc khi tạo tài khoản lần đầu | `SessionView` — đã triển khai |
| `GET` | `/api/v1/me` | Firebase ID token | `SessionView` — đã triển khai |
| `POST` | `/api/v1/shops` | `{ name, phone?, address?, industries? }` | `ShopView` |
| `GET` | `/api/v1/shops/current` | — | `ShopView` |
| `PATCH` | `/api/v1/shops/current` | `{ name?, phone?, address?, industries? }` | `ShopView` |

`SessionView` hiện có: `{ user, role: OWNER|ADMIN, shops, needsOnboarding }`; `user` và `shops` dùng ID số `BIGINT`. Với ADMIN, `shops` rỗng và `needsOnboarding` là `false`. Core quyết định role từ dữ liệu server; request đăng nhập không được truyền hoặc tự nâng role ADMIN.

Core xác thực Firebase ID token rồi tìm/tạo tài khoản theo UID trong `auth_identities`. Không lưu access token thô. Firebase Phone đã có client mobile; nút Google chưa kết nối, Zalo chưa được tích hợp. Ba endpoint shop ở bảng trên chưa được triển khai.

Phủ `FR-010`, `FR-011`, `FR-022`.

## 2. Sản phẩm

| Method | Đường | Body | Trả về |
|---|---|---|---|
| `GET` | `/api/v1/products` | — | `ProductView[]` |
| `POST` | `/api/v1/products` | `{ name, price, stock?, tracked?, category? }` | `ProductView` |
| `PATCH` | `/api/v1/products/{id}` | các trường tùy chọn như trên | `ProductView` |
| `DELETE` | `/api/v1/products/{id}` | — | 204 |

Phủ `FR-009`, `FR-013`.

## 3. Hóa đơn bán hàng (chốt giỏ)

`POST /api/v1/invoices` là bước chốt duy nhất (`FR-004`, `NFR-001`). Không có `POST /transactions/parse`.

Body:

```json
{
  "customer_name": "An",
  "customer_phone": "0901234567",
  "items": [{ "product_id": null, "name": "Ổi", "qty": 1, "unit_price": 30000 }],
  "kind": "AI",
  "status": "PAID",
  "paid": 30000
}
```

`kind`: `AI` | `POS` | `MANUAL`. `status`: `PAID` | `DEBT` | `PARTIAL`.

Core trừ tồn hàng `tracked` và ghi nợ trong cùng transaction khi `status` là `DEBT` hoặc `PARTIAL`.

| Method | Đường | Ghi chú |
|---|---|---|
| `GET` | `/api/v1/invoices?period=` | `period`: `today` \| `yesterday` \| `this_week` \| `week` \| `month` |
| `GET` | `/api/v1/invoices/{id}` | chi tiết |
| `PATCH` | `/api/v1/invoices/{id}` | `{ customer_name?, items }` |
| `DELETE` | `/api/v1/invoices/{id}` | xóa cứng MVP; `OQ-002` |

Phủ `FR-004`, `FR-005`, `FR-014`.

## 4. Chi phí, nợ, báo cáo

| Method | Đường | Body / query | Trả về |
|---|---|---|---|
| `GET` | `/api/v1/expenses?period=` | — | `ExpenseView[]` |
| `POST` | `/api/v1/expenses` | `{ name, amount }` | `ExpenseView` |
| `DELETE` | `/api/v1/expenses/{id}` | — | 204 |
| `GET` | `/api/v1/debts` | — | `DebtView[]` |
| `POST` | `/api/v1/debts/{id}/payments` | `{ amount }` | `{ paid_off, debt? }` |
| `DELETE` | `/api/v1/debts/{id}` | — | 204 |
| `GET` | `/api/v1/reports/summary?period=` | — | `SummaryView` |

`period` giống hóa đơn: `week` là 7 ngày gần nhất tính cả hôm nay; `this_week` là tuần lịch từ thứ Hai tới hiện tại, cùng múi giờ với `today`. `SummaryView` gồm `revenue`, `expense`, `profit` (ước tính), `order_count`, `outstanding_debt`, `series`, `best_sellers`.

Phủ `FR-006`, `FR-015`, `FR-016`.

## 5. AI qua Core

AI chỉ tạo bản nháp/gợi ý và câu trả lời chat. Các endpoint này không ghi invoice, expense hoặc tồn kho.

| Method | Đường | Input | Trả về |
|---|---|---|---|
| `POST` | `/api/v1/ai/drafts` | JSON `{ type: TEXT, mode, text }` hoặc multipart `type=AUDIO|IMAGE`, `mode=SALE|EXPENSE`, `file` | `DraftView` |
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

Các endpoint Agent yêu cầu OWNER đã xác thực và `X-Shop-Id` hợp lệ. Core lấy user từ danh tính đã xác thực; FE không gửi `user_id` để tự xác định quyền. Danh sách, xem, chat và xóa đều giới hạn theo user/shop đang xác thực.

Phủ `FR-007`, `FR-008`, `FR-017`, `FR-018`, `FR-020`, `FR-021`, `FR-025`.

## 6. Core ↔ AI nội bộ

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
- service credential cho Core ↔ AI chưa được triển khai; `/internal/v1` phải được giới hạn ở mạng nội bộ và không công khai cho FE.

## 7. Dashboard quản trị

Các endpoint dưới đây chỉ đọc, yêu cầu role `ADMIN` và ghi audit khi truy cập dữ liệu chi tiết. OWNER nhận `403 forbidden`.

| Method | Đường | Body / query | Trả về |
|---|---|---|---|
| `GET` | `/api/v1/admin/overview` | — | `AdminOverviewView` |
| `GET` | `/api/v1/admin/users?query=&page=` | tìm theo tên, email hoặc số điện thoại | `AdminUserPage` |
| `GET` | `/api/v1/admin/shops?query=&page=` | tìm theo tên hoặc thông tin liên hệ | `AdminShopPage` |
| `GET` | `/api/v1/admin/shops/{id}` | — | `AdminShopDetailView` |

`AdminOverviewView` chỉ gồm số liệu tổng hợp tối thiểu phục vụ hỗ trợ. `AdminShopDetailView` không trả token, secret hoặc dữ liệu sổ chi tiết ngoài phạm vi hỗ trợ. MVP không có giả danh OWNER và không có endpoint ADMIN sửa hóa đơn, chi phí, công nợ hoặc tồn kho.

Phủ `FR-022`–`FR-024`, `NFR-003`, `NFR-009`.
