# Sổ Nghe Lời — Web (landing + admin)

Sổ bán hàng AI cho quán nhỏ: nói một câu, AI tự ghi món, số lượng, giá. Dự án EXE201 của Team HEXA (FPT University).

Trang giới thiệu và trang quản trị. Dùng Vite, React 19, TypeScript và react-router-dom.

## Chạy

Yêu cầu Node.js 20 trở lên.

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # kiểm tra kiểu (tsc) rồi build ra dist/
npm run preview    # chạy thử bản build
npm run typecheck  # chỉ kiểm tra TypeScript
npm run lint       # oxlint
```

Biến môi trường (xem `.env.example`):

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `VITE_API_ENDPOINT` | `http://localhost:8000` | Địa chỉ backend |
| `VITE_USE_MOCK` | (bật) | Đặt `false` để gọi API thật thay vì dữ liệu mẫu |

## Trang quản trị (theo `admin-dashboard-mvp-plan.md`)

Giao diện "calm operations": nền trung tính ấm, accent xanh lá (#2F7A43 / #8FD17D), radius 16/10/999, font Geist, icon Phosphor (regular). Token nằm đầu `src/styles/admin.css`, toàn bộ CSS admin nằm trong `.adm` nên không ảnh hưởng trang giới thiệu.

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Trang giới thiệu |
| `/admin/login` | Đăng nhập (chỉ ADMIN vào được) |
| `/admin` | Dashboard: 4 KPI · xu hướng hỗ trợ (8 cột) + Cần chú ý (4 cột, chỉ đọc) · cơ sở/OWNER mới + truy cập gần đây của ADMIN |
| `/admin/customers?tab=owners\|shops` | Tab OWNER / Cơ sở, tìm theo tên, email, SĐT, tên cơ sở; lọc; phân trang. Bấm dòng → drawer chi tiết bên phải (`&owner=` / `&shop=`), mỗi lần mở đều ghi audit |
| `/admin/ai` | AI Support: hội thoại (240) · chat (gợi ý, tin nhắn, composer + phạm vi) · ngữ cảnh cơ sở (320). Câu trả lời có phạm vi, bằng chứng, giới hạn; task draft chỉ tạo khi ADMIN xác nhận |
| `/admin/tasks` | Kanban Inbox / Đang điều tra / Chờ phản hồi / Đã xử lý; lọc người phụ trách, mức độ, nguồn, hạn, "Của tôi"; kéo thả; drawer chi tiết + lịch sử; đề xuất AI chỉ để xem lại |
| `/admin/settings/profile\|appearance\|security\|audit` | Hồ sơ (tên, màu avatar, ngôn ngữ) · Giao diện (sáng/theo hệ thống, mật độ — lưu trên trình duyệt) · Bảo mật & quyền (chỉ đọc) · Nhật ký (luôn bật) |

URL cũ vẫn chạy: `/admin/customers/:id` → drawer cơ sở, `/admin/logs` → `/admin/settings/audit`, `/admin/accounts` → `/admin/customers`.

**Phân quyền:** chưa đăng nhập → `/admin/login`. Tài khoản không phải ADMIN (vd. OWNER) → mọi URL `/admin/*` hiện trang **403**, không có menu quản trị.

**Không có:** giả danh / đăng nhập thay OWNER, xem hay sửa hoá đơn/chi phí/công nợ/tồn kho, tự nâng quyền, tắt audit. AI không tự tạo hay di chuyển task.

**Ghi & đồng thời:** tạo task gửi idempotency key (bấm 2 lần hay xác nhận lại cùng đề xuất không tạo trùng). Mỗi lần sửa task gửi `version`; nếu tab/người khác đã sửa trước → báo "Xung đột phiên bản" và tải bản mới. Mọi chuyển trạng thái, gán người, đổi mức độ đều ghi lịch sử + audit.

**Responsive:** ≥1280 sidebar 248px · 768–1279 sidebar 72px, cột phụ xuống dưới · <768 sidebar thành drawer, KPI cuộn ngang, bảng thành danh sách, Kanban cuộn ngang có snap. Có skip link, focus rõ, vùng bấm 40px, tôn trọng `prefers-reduced-motion`.

**Tài khoản demo** (trang đăng nhập có nút "Điền"):

| Email | Mật khẩu | Role | Kết quả |
| --- | --- | --- | --- |
| `admin@songhloi.vn` | `admin123` | ADMIN | Vào dashboard |
| `owner@songhloi.vn` | `owner123` | OWNER | Trang 403 |

Ảnh màn hình ứng dụng trên trang giới thiệu nằm ở `public/screens/{overview,voice,invoices,products}.png` (585×1266), chụp từ bản mockup Expo trong `../mobile`.

## Trạng thái dùng chung

`src/components/States.tsx` — `LoadingState`, `EmptyState`, `ErrorState` (nút Thử lại), `ForbiddenState`, `ReadOnlyState`.
`src/hooks/useAsync.ts` — trả `{ data, error, loading, reload }`.

Kiểm tra nhanh (chế độ mock): thêm `?mock=slow`, `?mock=empty` hoặc `?mock=error` vào URL admin, hoặc chọn ở ô **Dữ liệu mẫu** cuối sidebar. `?mock=normal` để tắt. Khi AI Support lỗi, nội dung câu hỏi được giữ lại để bấm Thử lại.

## Dữ liệu mẫu (mock) — chưa có backend

- `src/types.ts` mô tả hợp đồng API **giả định** (`AdminOverviewView`, `AdminUserItem`, `AdminShopDetailView`, `SupportTask`, `AiMessage`…). Các field của `AdminOverviewView` là giả định, cần khoá lại với backend.
- `src/mocks/accounts.ts` sinh 48 OWNER / 53 cơ sở; `src/mocks/tasks.ts` sinh 11 support task. Chỉ có dữ liệu hỗ trợ. "Hôm nay" của dữ liệu mẫu là `MOCK_TODAY` (16/09/2026).
- `src/services/mockStore.ts` là "backend giả" lưu trong `localStorage` (`snl_mock_db`, `snl_mock_tasks`, `snl_mock_ai`, `snl_mock_audit`, `snl_mock_idem`). Nút **Khôi phục dữ liệu mẫu** đưa về ban đầu. Tuỳ chọn cá nhân lưu ở `snl_admin_prefs`.
- AI Support trong mock là bộ trả lời theo luật (`src/services/aiService.ts`), không gọi model thật.
- Khi có backend: đặt `VITE_USE_MOCK=false`. Endpoint giả định (đánh dấu `TODO(backend)`):
  - `POST /auth/login`
  - `GET /admin/overview?days=`
  - `GET /admin/users` · `GET /admin/users/{id}`
  - `GET /admin/shops` · `GET /admin/shops/{id}`
  - `GET /admin/support-tasks` · `POST /admin/support-tasks` (header `Idempotency-Key`) · `PATCH /admin/support-tasks/{id}` (kèm `version`) · `GET /admin/support-tasks/suggestions` · `GET /admin/members`
  - `GET /admin/ai/conversations` · `POST /admin/ai/conversations[/{id}]/messages` · `DELETE /admin/ai/conversations/{id}`
  - `GET /admin/audit-logs`

## Cấu trúc

```
src/
  App.tsx, main.tsx          định tuyến
  config.ts                  USE_MOCK, API_ENDPOINT, hạn mức gói
  types.ts                   kiểu dữ liệu / hợp đồng API giả định
  mocks/                     sinh dữ liệu mẫu, task mẫu, giả lập tình huống API
  services/                  api, auth, account, task, ai, preferences, mockStore
  components/admin/          ui (Panel, Pill, Avatar, DetailDrawer…), charts
  components/                States, Pagination, RequireAuth, Modal, Toast
  pages/landing/             trang giới thiệu
  pages/admin/               Login, AdminLayout (AppShell), Dashboard, Customers, AiSupport, Tasks, Settings
  pages/admin/tasks/         TaskFormModal
  pages/ForbiddenPage        trang 403
  styles/                    base, landing, admin (token theo plan)
```

## App mobile

App Expo nằm ở thư mục cùng cấp `../mobile` — xem `../mobile/README.md`.
