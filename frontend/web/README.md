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
| `VITE_API_ENDPOINT` | `http://localhost:8080` | Địa chỉ Core, không kèm `/api/v1` |
| `VITE_USE_MOCK` | (bật) | Đặt `false` để trang quản trị đọc API thật của Core thay vì dữ liệu mẫu |
| `VITE_FIREBASE_API_KEY` | (trống) | Chế độ thật: Web API key của dự án Firebase mà Core dùng để kiểm token (đăng nhập quản trị bằng email + mật khẩu) |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST` | (trống) | Chỉ khi chạy thử trên máy: host của Firebase Auth Emulator, vd. `localhost:9099` |
| `VITE_ANDROID_APK_URL` | (trống) | Liên kết tải APK Android trên trang giới thiệu (xem [Publish the APK for the landing page](../../docs/development/ci-cd.md#publish-the-apk-for-the-landing-page)). Để trống thì nút tải hiện "Sắp ra mắt" và không bấm được |
| `VITE_ADMIN_ENABLED` | (tắt) | `true` bật trang quản trị `/admin`. Tắt thì bản build không có mã admin, tài khoản demo cũng không lọt vào bundle. Đặt `true` trong `.env.local` khi phát triển |
| `VITE_LEGAL_DRAFT` | `true` | Hai trang pháp lý hiện nhãn "Bản nháp" cho đến khi chủ sản phẩm duyệt; đặt `false` lúc build để gỡ nhãn |

Thông tin liên hệ công khai nằm trong [`site.yaml`](site.yaml), không phải biến môi trường: `contact_email` (hiện ở mục Liên hệ, `/privacy` và `/data-deletion`) và `social.facebook`, `social.tiktok`, `social.instagram` (icon trên thanh điều hướng và footer). Mục nào để trống thì trang không hiện mục đó.

## Trang quản trị

Chỉ chạy khi `VITE_ADMIN_ENABLED=true` (mặc định tắt). Khi phát triển, đặt trong `.env.local`. Bản landing công khai không đặt biến này; trang quản trị được deploy riêng từ cùng mã nguồn bằng job `deploy-admin` (xem [Admin dashboard on Vercel](../../docs/development/ci-cd.md#admin-dashboard-on-vercel)).

**Hai chế độ:**

- **Dữ liệu thật** (`VITE_USE_MOCK=false`): các trang trong `src/pages/admin/core/` đọc API quản trị của Core (`/api/v1/admin/*`, [API contracts §7](../../docs/contracts/api-contracts.md)) qua `src/services/adminApi.ts`. Đăng nhập Firebase bằng email + mật khẩu qua REST (`src/services/firebaseAuth.ts`, không cài SDK `firebase`), rồi `GET /api/v1/me`: chỉ tài khoản Core có `role` ADMIN mới vào được. Tài khoản quản trị là một user email/mật khẩu trong Firebase của môi trường đó, có hồ sơ Core `system_role=ADMIN` và ACTIVE (Core không tự nâng quyền). ID token chỉ nằm trong bộ nhớ và tự làm mới; refresh token được lưu (localStorage khi "Ghi nhớ đăng nhập", sessionStorage khi không) để tải lại trang không phải đăng nhập lại; đăng xuất xoá cả hai. Core có tổng quan, chủ tiệm, cửa hàng (kèm lịch sử trạng thái, tạm ngưng / mở lại qua `PATCH /api/v1/shops/{id}/status`) và nhật ký truy cập của chính ADMIN; Core chưa có task, AI Support, tìm nhanh hay thông báo, nên các mục đó ẩn.
- **Dữ liệu mẫu** (mặc định): các trang cũ chạy trên `localStorage`, có thêm AI Support và Tasks để demo (xem [Dữ liệu mẫu](#dữ-liệu-mẫu-mock)).

Chạy thử chế độ thật trên máy: Core chạy ở `localhost:8080` với `CORS_ALLOWED_ORIGINS` có `http://localhost:5173`, rồi `VITE_ADMIN_ENABLED=true VITE_USE_MOCK=false VITE_FIREBASE_API_KEY=<key> npm run dev`.

Giao diện "calm operations": nền trung tính ấm, accent xanh lá (#2F7A43 / #8FD17D), radius 16/10/999, font Geist, icon Phosphor (regular). Token nằm đầu `src/styles/admin.css`, toàn bộ CSS admin nằm trong `.adm` nên không ảnh hưởng trang giới thiệu.

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Trang giới thiệu |
| `/privacy` | Chính sách quyền riêng tư (bản nháp, chờ duyệt) |
| `/data-deletion` | Hướng dẫn xoá dữ liệu người dùng (Meta yêu cầu cho Facebook Login) |
| `/admin/login` | Đăng nhập (chỉ ADMIN vào được) |
| `/admin` | Thật: chủ tiệm và cửa hàng theo trạng thái, số mới trong 7/30/90 ngày, 5 cửa hàng mới nhất, truy cập gần đây. Mock: 4 KPI · xu hướng hỗ trợ · Cần chú ý · cơ sở/OWNER mới |
| `/admin/customers?tab=owners\|shops` | Tab Chủ tiệm / Cửa hàng, tìm, lọc trạng thái, phân trang. Bấm dòng → drawer chi tiết (`&owner=` / `&shop=`); drawer cửa hàng có lịch sử trạng thái và nút tạm ngưng / mở lại (chế độ thật). Mỗi lần tìm và mở đều được ghi nhật ký |
| `/admin/access-logs` | Chỉ chế độ thật: nhật ký truy cập quản trị của chính ADMIN, lọc theo thao tác, mã cửa hàng, khoảng ngày |
| `/admin/ai` | Chỉ mock: AI Support (hội thoại · chat · ngữ cảnh cơ sở); task draft chỉ tạo khi ADMIN xác nhận |
| `/admin/tasks` | Chỉ mock: Kanban hỗ trợ; kéo thả; drawer chi tiết + lịch sử |
| `/admin/settings/profile\|appearance\|security\|audit` | Hồ sơ · Giao diện (lưu trên trình duyệt) · Bảo mật & quyền (chỉ đọc) · Nhật ký (chỉ mock; chế độ thật chuyển sang `/admin/access-logs`) |

URL cũ vẫn chạy: `/admin/customers/:id` → drawer cơ sở, `/admin/logs` → nhật ký, `/admin/accounts` → `/admin/customers`. Chế độ thật: `/admin/ai` và `/admin/tasks` về Dashboard.

**Phân quyền:** chưa đăng nhập → `/admin/login`. Tài khoản không phải ADMIN (vd. OWNER) → mọi URL `/admin/*` hiện trang **403**, không có menu quản trị.

**Không có:** giả danh / đăng nhập thay OWNER, xem hay sửa hoá đơn/chi phí/công nợ/tồn kho, tự nâng quyền, tắt audit. AI không tự tạo hay di chuyển task.

**Ghi & đồng thời:** tạo task gửi idempotency key (bấm 2 lần hay xác nhận lại cùng đề xuất không tạo trùng). Mỗi lần sửa task gửi `version`; nếu tab/người khác đã sửa trước → báo "Xung đột phiên bản" và tải bản mới. Mọi chuyển trạng thái, gán người, đổi mức độ đều ghi lịch sử + audit.

**Responsive:** ≥1280 sidebar 248px · 768–1279 sidebar 72px, cột phụ xuống dưới · <768 sidebar thành drawer, KPI cuộn ngang, bảng thành danh sách, Kanban cuộn ngang có snap. Có skip link, focus rõ, vùng bấm 40px, tôn trọng `prefers-reduced-motion`.

**Tài khoản demo** (chỉ chế độ mock; trang đăng nhập có nút "Điền"):

| Email | Mật khẩu | Role | Kết quả |
| --- | --- | --- | --- |
| `admin@songhloi.vn` | `admin123` | ADMIN | Vào dashboard |
| `owner@songhloi.vn` | `owner123` | OWNER | Trang 403 |

## Trang giới thiệu và trang pháp lý

Giao diện theo app mobile mới: tím thương hiệu `#482AAC`, nền kem `#F7F6F2`, xanh lá `#8FDB6E` làm điểm nhấn. Token nằm trong `.lp` của `src/styles/landing.css` nên không ảnh hưởng trang quản trị. Nội dung chỉ nói những gì app đã có; máy in, gói trả phí và hoá đơn điện tử không thuộc MVP nên không được quảng cáo ở đây.

**Hình ảnh** nằm trong `public/`:

| Đường dẫn | Nguồn |
| --- | --- |
| `screens/{home,voice,checkout,orders,pos,reports,products,debts}.webp` | Ảnh chụp app mobile ở chế độ mock (`EXPO_PUBLIC_USE_MOCK=true`), chụp toàn màn hình trên iOS Simulator iPhone 17 Pro Max (440×956 pt), xuất 660×1434. Đã xoá thanh trạng thái (giờ, sóng, pin, Dynamic Island). Dữ liệu trong ảnh là dữ liệu mẫu; ẩn mascot nổi khi chụp để không đè nội dung. Riêng `debts.webp` chụp từ bản web mock (`npm run web` trong `../mobile`, khung 440×956, chừa 62 pt trên cho thanh trạng thái) |
| `brand/logo.webp`, `favicon.png`, `apple-touch-icon.png` | `frontend/mobile/assets/brand-logo.png` (icon của app) |
| `brand/robot.webp`, `brand/agent-*.webp` | `frontend/mobile/assets/bubblelogo.png`, `assets/voice/agent-*.png` |
| `brand/icons/*.webp` | Icon 3D trong `frontend/mobile/assets/tab1-overview` và `tab4-management` |
| `brand/app-icon-1024.png` | Icon 1024×1024 cho trang cài đặt app Meta (Facebook Login), dựng từ `bubblelogo.png` |

Chụp lại ảnh khi giao diện app đổi: chạy dev build trên simulator ở chế độ mock (`npx expo start --dev-client` trong `../mobile` với ba biến `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE`, `EXPO_PUBLIC_MOCK_SHOPS` đặt `true`), chụp bằng `xcrun simctl io booted screenshot`, phủ 186 px trên cùng (thanh trạng thái @3x) bằng hàng điểm ảnh ngay bên dưới, rồi `cwebp -q 82 -resize 660 0`. Giữ đúng tỉ lệ 440:956 để ảnh khớp khung điện thoại trong `landing.css`.

**Trang pháp lý** (`src/pages/legal/`) chưa được duyệt theo [AGENTS.md](../../AGENTS.md). Trước khi công khai: chủ sản phẩm duyệt nội dung (kể cả cam kết xử lý yêu cầu xoá trong `DELETION_DAYS`, `src/pages/legal/legalConfig.ts`) rồi đặt `VITE_LEGAL_DRAFT=false`.

**Triển khai:** job `deploy-landing` trong [`ci.yml`](../../.github/workflows/ci.yml) build web này và đẩy lên một dự án Vercel riêng tên `landing`. Vercel Git không deploy (`git.deploymentEnabled: false` trong `vercel.json`). Pull request tạm không deploy preview (giới hạn deploy/ngày của Vercel Hobby). Các môi trường, chi tiết ở [CI/CD](../../docs/development/ci-cd.md#landing-page-on-vercel):

| Môi trường | Nhánh | Địa chỉ |
| --- | --- | --- |
| Staging | `staging` | `LANDING_URL` của environment `landing-staging` |
| Production | `main` (cần duyệt) | `LANDING_URL` của environment `landing-production` |

Thiết lập một lần trên Vercel: New Project → import repo này → Root Directory `frontend/web` (framework Vite tự nhận). Lấy project ID đặt làm secret `VERCEL_PROJECT_ID` trong ba environment `landing-*`. Biến `VITE_LEGAL_DRAFT` và `LANDING_URL` đặt làm Variables của từng environment.

`rewrites` trong `vercel.json` chuyển mọi đường dẫn về `index.html` để `/privacy`, `/data-deletion` mở trực tiếp được.

## Trạng thái dùng chung

`src/components/States.tsx` — `LoadingState`, `EmptyState`, `ErrorState` (nút Thử lại), `ForbiddenState`, `ReadOnlyState`.
`src/hooks/useAsync.ts` — trả `{ data, error, loading, reload }`.

Kiểm tra nhanh (chế độ mock): thêm `?mock=slow`, `?mock=empty` hoặc `?mock=error` vào URL admin, hoặc chọn ở ô **Dữ liệu mẫu** cuối sidebar. `?mock=normal` để tắt. Khi AI Support lỗi, nội dung câu hỏi được giữ lại để bấm Thử lại.

## Dữ liệu mẫu (mock)

- `src/types.ts` mô tả hợp đồng API **giả định** (`AdminOverviewView`, `AdminUserItem`, `AdminShopDetailView`, `SupportTask`, `AiMessage`…). Các field của `AdminOverviewView` là giả định, cần khoá lại với backend.
- `src/mocks/accounts.ts` sinh 48 OWNER / 53 cơ sở; `src/mocks/tasks.ts` sinh 11 support task. Chỉ có dữ liệu hỗ trợ. "Hôm nay" của dữ liệu mẫu là `MOCK_TODAY` (16/09/2026).
- `src/services/mockStore.ts` là "backend giả" lưu trong `localStorage` (`snl_mock_db`, `snl_mock_tasks`, `snl_mock_ai`, `snl_mock_audit`, `snl_mock_idem`). Nút **Khôi phục dữ liệu mẫu** đưa về ban đầu. Tuỳ chọn cá nhân lưu ở `snl_admin_prefs`.
- AI Support trong mock là bộ trả lời theo luật (`src/services/aiService.ts`), không gọi model thật.
- Các trang mock (`DashboardPage`, `CustomersPage`, `AiSupportPage`, `TasksPage`, nhật ký trong Cài đặt) dùng hợp đồng giả định trong `src/types.ts` và `accountService`/`taskService`/`aiService`, khác API thật của Core; chế độ thật dùng `src/pages/admin/core/` thay cho chúng. Core chưa có task, thành viên, hội thoại AI, gói, thiết bị hay xu hướng, nên các phần đó chỉ có ở mock.

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
