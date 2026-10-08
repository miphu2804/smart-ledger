# Sổ Nghe Lời — Web (landing + admin)

Sổ bán hàng AI cho quán nhỏ: nói một câu, AI tự ghi món, số lượng, giá. Dự án EXE201 của Team HEXA (FPT University).

Trang giới thiệu và trang quản trị. Dùng Vite, React 19, TypeScript và react-router-dom.

## Chạy

Yêu cầu Node.js 20 trở lên.

```bash
cd frontend/web
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
| `VITE_CONTACT_EMAIL` | (trống) | Email nhận yêu cầu về dữ liệu cá nhân, hiện trên `/privacy` và `/data-deletion`. Để trống thì hai trang hiện chỗ trống thay vì địa chỉ giả |
| `VITE_LEGAL_DRAFT` | `true` | Hai trang pháp lý hiện nhãn "Bản nháp" cho đến khi chủ sản phẩm duyệt; đặt `false` lúc build để gỡ nhãn |

## Trang quản trị

Giao diện "calm operations": nền trung tính ấm, accent xanh lá (#2F7A43 / #8FD17D), radius 16/10/999, font Geist, icon Phosphor (regular). Token nằm đầu `src/styles/admin.css`, toàn bộ CSS admin nằm trong `.adm` nên không ảnh hưởng trang giới thiệu.

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Trang giới thiệu |
| `/privacy` | Chính sách quyền riêng tư (bản nháp, chờ duyệt) |
| `/data-deletion` | Hướng dẫn xoá dữ liệu người dùng (Meta yêu cầu cho Facebook Login) |
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

## Trang giới thiệu và trang pháp lý

Giao diện theo app mobile mới: tím thương hiệu `#482AAC`, nền kem `#F7F6F2`, xanh lá `#8FDB6E` làm điểm nhấn. Token nằm trong `.lp` của `src/styles/landing.css` nên không ảnh hưởng trang quản trị. Nội dung chỉ nói những gì app đã có; máy in, gói trả phí và hoá đơn điện tử không thuộc MVP nên không được quảng cáo ở đây.

**Hình ảnh** nằm trong `public/`:

| Đường dẫn | Nguồn |
| --- | --- |
| `screens/{home,voice,checkout,orders,pos,reports,products}.webp` | Ảnh chụp app mobile ở chế độ mock (`EXPO_PUBLIC_USE_MOCK=true`), viewport 390×844, tỉ lệ 2x. Dữ liệu trong ảnh là dữ liệu mẫu; ẩn mascot nổi khi chụp để không đè nội dung |
| `brand/logo.webp`, `favicon.png`, `apple-touch-icon.png` | `frontend/mobile/assets/brand-logo.png` (icon của app) |
| `brand/robot.webp`, `brand/agent-*.webp` | `frontend/mobile/assets/bubblelogo.png`, `assets/voice/agent-*.png` |
| `brand/icons/*.webp` | Icon 3D trong `frontend/mobile/assets/tab1-overview` và `tab4-management` |
| `brand/app-icon-1024.png` | Icon 1024×1024 cho trang cài đặt app Meta (Facebook Login), dựng từ `bubblelogo.png` |

Chụp lại ảnh khi giao diện app đổi: chạy app ở chế độ mock (`npx expo start --web` trong `../mobile` với ba biến `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE`, `EXPO_PUBLIC_MOCK_SHOPS` đặt `true`), mở bằng trình duyệt cỡ 390×844 rồi lưu WebP.

**Trang pháp lý** (`src/pages/legal/`) chưa được duyệt theo [AGENTS.md](../../AGENTS.md). Trước khi công khai: điền `VITE_CONTACT_EMAIL`, chủ sản phẩm duyệt nội dung (kể cả cam kết xử lý yêu cầu xoá trong `DELETION_DAYS`, `src/pages/legal/legalConfig.ts`) rồi đặt `VITE_LEGAL_DRAFT=false`.

**Triển khai:** CI hiện chỉ đưa bản web của `../mobile` lên Vercel; web này chưa có luồng deploy. `vercel.json` chuyển mọi đường dẫn về `index.html` để `/privacy`, `/data-deletion` mở trực tiếp được khi dùng một dự án Vercel riêng (Root Directory `frontend/web`).

## Trạng thái dùng chung

`src/components/States.tsx` — `LoadingState`, `EmptyState`, `ErrorState` (nút Thử lại), `ForbiddenState`, `ReadOnlyState`.
`src/hooks/useAsync.ts` — trả `{ data, error, loading, reload }`.

Kiểm tra nhanh (chế độ mock): thêm `?mock=slow`, `?mock=empty` hoặc `?mock=error` vào URL admin, hoặc chọn ở ô **Dữ liệu mẫu** cuối sidebar. `?mock=normal` để tắt. Khi AI Support lỗi, nội dung câu hỏi được giữ lại để bấm Thử lại.

## Dữ liệu mẫu (mock) — chưa có backend

- `src/types.ts` mô tả hợp đồng API **giả định** (`AdminOverviewView`, `AdminUserItem`, `AdminShopDetailView`, `SupportTask`, `AiMessage`…). Các field của `AdminOverviewView` là giả định, cần khoá lại với backend.
- `src/mocks/accounts.ts` sinh 48 OWNER / 53 cơ sở; `src/mocks/tasks.ts` sinh 11 support task. Chỉ có dữ liệu hỗ trợ. "Hôm nay" của dữ liệu mẫu là `MOCK_TODAY` (16/09/2026).
- `src/services/mockStore.ts` là "backend giả" lưu trong `localStorage` (`snl_mock_db`, `snl_mock_tasks`, `snl_mock_ai`, `snl_mock_audit`, `snl_mock_idem`). Nút **Khôi phục dữ liệu mẫu** đưa về ban đầu. Tuỳ chọn cá nhân lưu ở `snl_admin_prefs`.
- AI Support trong mock là bộ trả lời theo luật (`src/services/aiService.ts`), không gọi model thật.
- Khi có backend: đặt `VITE_USE_MOCK=false`. Core chưa có các endpoint dưới đây: Core xác thực bằng Firebase ID token qua `POST /api/v1/auth/session` (không có `/auth/login`), và API ADMIN duy nhất hiện có là `PATCH /api/v1/shops/{shopId}/status`. Hợp đồng đích của dashboard nằm trong [API contracts §7](../../docs/contracts/api-contracts.md#7-dashboard-quản-trị--hợp-đồng-đích). Endpoint giả định trong code (đánh dấu `TODO(backend)`):
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
  pages/landing/             trang giới thiệu, chân trang dùng chung
  pages/legal/               chính sách quyền riêng tư, hướng dẫn xoá dữ liệu
  pages/admin/               Login, AdminLayout (AppShell), Dashboard, Customers, AiSupport, Tasks, Settings
  pages/admin/tasks/         TaskFormModal
  pages/ForbiddenPage        trang 403
  styles/                    base, landing, admin (token theo plan)
```

## App mobile

App Expo nằm ở thư mục cùng cấp `../mobile` — xem `../mobile/README.md`.
