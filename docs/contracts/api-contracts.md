# Hợp đồng API — SmartLedger MVP

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đề xuất — Core theo FE; AI theo kiến trúc MVP |
| Chủ sở hữu | Chủ Core, AI và FE |
| Cập nhật lần cuối | 2026-09-15 |

## Tài liệu liên quan

- [PRD](../product/product-requirements.md): `FR-*` mà hợp đồng phải phủ.
- [Thiết kế kỹ thuật](../architecture/technical-design.md): module và luồng.

## Phạm vi

- API công khai cho mobile OWNER và dashboard web ADMIN nằm dưới `/api/v1`; base URL do môi trường cấu hình.
- API Core ↔ AI nằm dưới `/internal/v1` và không công khai cho FE.
- Không dùng cổng trong sơ đồ kiến trúc làm hợp đồng API.
- Redis, Qdrant, Langfuse và LiteLLM không có API công khai. FE không gọi trực tiếp các thành phần này.

## Quy ước request

- FE gửi `Authorization: Bearer <identity-token>`.
- Endpoint nghiệp vụ của OWNER gửi thêm `X-Shop-Id: <uuid>`; Core kiểm tra tiệm thuộc OWNER.
- Dashboard chỉ gọi `/api/v1/admin/*`; Core lấy phạm vi từ quyền ADMIN, không tin `X-Shop-Id` để mở rộng quyền.
- Core gọi AI bằng service credential và truyền `shopId` đã xác thực; AI không tin `shopId` trực tiếp từ client.
- Tiền là số nguyên VND. Mọi thời gian là ISO 8601 UTC.

## 0. Hợp đồng lỗi

```json
{
  "code": "string",
  "message": "string",
  "details": [{ "field": "string", "issue": "string" }],
  "traceId": "string"
}
```

`code`, `message`, `traceId` luôn có. `details` khi lỗi theo trường. 401 → đăng xuất.

## 1. Auth và tiệm

| Method | Đường | Body / query | Trả về |
|---|---|---|---|
| `POST` | `/api/v1/auth/session` | `{ provider: PHONE|GOOGLE|ZALO }` + Bearer token của provider | `SessionView` |
| `GET` | `/api/v1/me` | — | `SessionView` |
| `POST` | `/api/v1/shops` | `{ name, phone?, address?, industries? }` | `ShopView` |
| `GET` | `/api/v1/shops/current` | — | `ShopView` |
| `PATCH` | `/api/v1/shops/current` | `{ name?, phone?, address?, industries? }` | `ShopView` |

`SessionView`: `{ user, role: OWNER|ADMIN, shops, needsOnboarding }`. Với ADMIN, `shops` rỗng và `needsOnboarding` là `false`. Core quyết định role từ dữ liệu server; request đăng nhập không được truyền hoặc tự nâng role ADMIN.

Core xác thực token bằng adapter tương ứng rồi upsert `auth_identities(provider, provider_subject)`. Không lưu access token thô.

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
  "customerName": "An",
  "customerPhone": "0901234567",
  "items": [{ "productId": null, "name": "Ổi", "qty": 1, "unitPrice": 30000 }],
  "kind": "AI",
  "status": "PAID",
  "paid": 30000
}
```

`kind`: `AI` | `POS` | `MANUAL`. `status`: `PAID` | `DEBT` | `PARTIAL`.

Core trừ tồn hàng `tracked` và ghi nợ trong cùng transaction khi `status` là `DEBT` hoặc `PARTIAL`.

| Method | Đường | Ghi chú |
|---|---|---|
| `GET` | `/api/v1/invoices?period=` | `period`: `today` \| `yesterday` \| `week` \| `month` |
| `GET` | `/api/v1/invoices/{id}` | chi tiết |
| `PATCH` | `/api/v1/invoices/{id}` | `{ customerName?, items }` |
| `DELETE` | `/api/v1/invoices/{id}` | xóa cứng MVP; `OQ-002` |

Phủ `FR-004`, `FR-005`, `FR-014`.

## 4. Chi phí, nợ, báo cáo

| Method | Đường | Body / query | Trả về |
|---|---|---|---|
| `GET` | `/api/v1/expenses?period=` | — | `ExpenseView[]` |
| `POST` | `/api/v1/expenses` | `{ name, amount }` | `ExpenseView` |
| `DELETE` | `/api/v1/expenses/{id}` | — | 204 |
| `GET` | `/api/v1/debts` | — | `DebtView[]` |
| `POST` | `/api/v1/debts/{id}/payments` | `{ amount }` | `{ paidOff, debt? }` |
| `DELETE` | `/api/v1/debts/{id}` | — | 204 |
| `GET` | `/api/v1/reports/summary?period=` | — | `SummaryView` |

`period` giống hóa đơn. `SummaryView` gồm `revenue`, `expense`, `profit` (ước tính), `orderCount`, `outstandingDebt`, `series`, `bestSellers`.

Phủ `FR-006`, `FR-015`, `FR-016`.

## 5. AI qua Core

AI chỉ tạo bản nháp/gợi ý. Các endpoint này không ghi invoice, expense hoặc tồn kho.

| Method | Đường | Input | Trả về |
|---|---|---|---|
| `POST` | `/api/v1/ai/drafts` | JSON `{ type: TEXT, mode, text }` hoặc multipart `type=AUDIO|IMAGE`, `mode=SALE|EXPENSE`, `file` | `DraftView` |
| `GET` | `/api/v1/replenishment?period=` | — | `ReplenishmentView[]` |
| `POST` | `/api/v1/insights/chat` | `{ conversationId?, message, period? }` | `InsightMessageView` |

`DraftView`:

```json
{
  "requestId": "uuid",
  "transcript": "bán hai cà phê sữa",
  "mode": "SALE",
  "items": [
    {
      "productId": "uuid-or-null",
      "name": "Cà phê sữa",
      "qty": 2,
      "unitPrice": 25000,
      "confidence": 0.94
    }
  ],
  "warnings": []
}
```

`ReplenishmentView` gồm `productId`, `productName`, `suggestedQty`, `period`, `reason`. `InsightMessageView` gồm `conversationId`, `messageId`, `answer`, `period`, `citations`, `insufficientData`.

Phủ `FR-007`, `FR-008`, `FR-017`–`FR-021`.

## 6. Core ↔ AI nội bộ

| Method | Đường | Trách nhiệm |
|---|---|---|
| `POST` | `/internal/v1/drafts/parse` | Text/voice/image → `DraftView` |
| `POST` | `/internal/v1/rag/search` | Truy xuất vector có filter `shopId` |
| `POST` | `/internal/v1/recommendations/replenishment` | Tạo gợi ý nhập hàng có lý do |
| `POST` | `/internal/v1/insights/chat` | Trả lời có citation và phạm vi thời gian |
| `POST` | `/internal/v1/admin/support/analyze` | Phân tích context hỗ trợ đã lọc, trả lời có căn cứ và task draft không có side effect |

Yêu cầu chung:

- timeout AI trả `503 ai_unavailable`; Core không retry đồng bộ quá một lần;
- mọi response có `requestId`, `model`, `modelVersion`;
- AI không có endpoint tạo/sửa/xóa dữ liệu nghiệp vụ;
- Core và AI cùng kiểm tra `shopId`; test chéo shop là bắt buộc.

## 7. Dashboard quản trị

Các endpoint dưới đây yêu cầu role `ADMIN`. OWNER nhận `403 forbidden`. Truy cập dữ liệu chi tiết, tạo task và cập nhật task đều ghi audit. Endpoint ghi chỉ áp dụng cho support task và preference của chính ADMIN, không sửa sổ nghiệp vụ hoặc role.

| Method | Đường | Body / query | Trả về |
|---|---|---|---|
| `GET` | `/api/v1/admin/overview` | — | `AdminOverviewView` |
| `GET` | `/api/v1/admin/users?query=&page=` | tìm theo tên, email hoặc số điện thoại | `AdminUserPage` |
| `GET` | `/api/v1/admin/shops?query=&page=` | tìm theo tên hoặc thông tin liên hệ | `AdminShopPage` |
| `GET` | `/api/v1/admin/shops/{id}` | — | `AdminShopDetailView` |
| `POST` | `/api/v1/admin/support/chat` | `{ message, conversationId?, shopId? }` | `AdminSupportMessageView` |
| `GET` | `/api/v1/admin/tasks?status=&assignee=&priority=&query=&page=` | lọc task hỗ trợ | `AdminTaskPage` |
| `POST` | `/api/v1/admin/tasks` | `CreateAdminTaskRequest`; yêu cầu `Idempotency-Key` | `AdminTaskView` |
| `GET` | `/api/v1/admin/tasks/{id}` | — | `AdminTaskView` |
| `PATCH` | `/api/v1/admin/tasks/{id}` | `UpdateAdminTaskRequest` gồm `version` | `AdminTaskView` |
| `GET` | `/api/v1/admin/preferences` | — | `AdminPreferencesView` |
| `PATCH` | `/api/v1/admin/preferences` | `{ theme, density, locale }` | `AdminPreferencesView` |

`AdminOverviewView` chỉ gồm số liệu tổng hợp tối thiểu phục vụ hỗ trợ. `AdminShopDetailView` không trả token, secret hoặc dữ liệu sổ chi tiết ngoài phạm vi hỗ trợ. `AdminSupportMessageView` gồm `conversationId`, `messageId`, `answer`, `scope`, `citations`, `insufficientData` và `taskDraft?`; task draft không tạo task.

`AdminTaskView` gồm `id`, `title`, `shopId?`, `ownerUserId?`, `priority`, `assigneeUserId?`, `dueAt?`, `source`, `status`, `version`, `createdAt`, `updatedAt`. `status` chỉ nhận `INBOX|INVESTIGATING|WAITING|RESOLVED`. `UpdateAdminTaskRequest` chỉ cho sửa title, priority, assignee, due date và status; version cũ trả `409 conflict`. Cùng `Idempotency-Key` và cùng actor không tạo trùng task.

`AdminPreferencesView` chỉ gồm `theme`, `density`, `locale`; role/quyền lấy từ session và không có endpoint client tự đổi. MVP không có giả danh OWNER và không có endpoint ADMIN sửa hóa đơn, chi phí, công nợ hoặc tồn kho.

Phủ `FR-022`–`FR-028`, `NFR-003`, `NFR-009`–`NFR-011`.
