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

## Các trang

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Trang giới thiệu: tính năng, cách hoạt động, so sánh, bảng giá, hỏi đáp, tải ứng dụng |
| `/admin/login` | Đăng nhập quản trị |
| `/admin` | Tổng quan: KPI, đăng ký theo ngày, phân bổ gói, ngành hàng, tài khoản mới |
| `/admin/accounts` | Quản lý tài khoản: tìm kiếm, lọc, sắp xếp, phân trang, khoá/mở khoá hàng loạt, xem chi tiết, sửa, đổi gói, xoá, xuất CSV |
| `/admin/logs` | Nhật ký thao tác của quản trị viên |

Các trang `/admin/*` đều cần đăng nhập. Nếu chưa đăng nhập, bạn sẽ được chuyển về `/admin/login`.

**Tài khoản demo:** `admin@songhloi.vn` / `admin123` (trang đăng nhập có nút "Điền nhanh").

Ảnh màn hình ứng dụng trên trang giới thiệu nằm ở `public/screens/{overview,voice,invoices,products}.png` (585×1266), chụp từ bản mockup Expo trong `../mobile`. Muốn đổi ảnh thì ghi đè file cùng tên.

## Dữ liệu mẫu (mock)

- `src/mocks/accounts.ts` sinh 48 tài khoản cửa hàng từ seed cố định, nên lần nào cũng ra cùng một bộ dữ liệu. "Hôm nay" của dữ liệu mẫu là ngày `MOCK_TODAY` (16/09/2026) trong `src/config.ts`.
- `src/services/accountService.ts` và `authService.ts` là các hàm async, có độ trễ giả lập. Mọi thay đổi được lưu vào `localStorage` (khoá `snl_mock_accounts` và `snl_mock_audit`), nên vẫn còn sau khi tải lại trang. Nếu trình duyệt chặn storage, dữ liệu chỉ được giữ trong bộ nhớ.
- Nút **"Khôi phục dữ liệu mẫu"** (trên thanh trên cùng và ở sidebar) xoá mọi thay đổi và đưa dữ liệu về trạng thái ban đầu.
- Khi có backend, đặt `VITE_USE_MOCK=false`. Những chỗ cần nối API được đánh dấu `TODO(backend)` trong `src/services/*`. HTTP client dùng chung nằm ở `src/services/api.ts` và tự gửi kèm `Authorization: Bearer <token>`.
- Kiểu dữ liệu dùng chung nằm trong `src/types.ts`.

## Cấu trúc

```
src/
  App.tsx, main.tsx      định tuyến
  config.ts              USE_MOCK, API_ENDPOINT, hạn mức gói
  types.ts               kiểu dữ liệu
  mocks/                 bộ sinh dữ liệu mẫu
  services/              api, auth, account (mock hoặc API thật)
  components/            Logo, Modal/Drawer, Toast, Badge, Sparkline…
  pages/landing/         trang giới thiệu
  pages/admin/           đăng nhập, layout, tổng quan, tài khoản, nhật ký
  styles/                CSS thuần dùng biến màu (base, landing, admin)
```

## App mobile

App Expo nằm ở thư mục cùng cấp `../mobile` — xem `../mobile/README.md`.
