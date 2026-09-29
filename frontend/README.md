# Sổ Nghe Lời — Frontend

Sổ bán hàng AI cho quán nhỏ (EXE201 · Team HEXA). Frontend gồm 2 project độc lập, mỗi project có `package.json` riêng:

| Thư mục | Nội dung | Stack | Chạy |
| --- | --- | --- | --- |
| [`web/`](web/README.md) | Landing page + trang quản trị (`/admin`) | Vite · React 19 · TypeScript | `cd web && npm install && npm run dev` |
| [`mobile/`](mobile/README.md) | App bán hàng (mockup UI) | Expo SDK 57 · expo-router | `cd mobile && npm install && npx expo start` |

Cả hai đang chạy bằng dữ liệu mẫu (mock), không cần backend.

- Admin demo: `admin@songhloi.vn` / `admin123`
- App demo: số điện thoại bất kỳ, OTP `123456`

Biến môi trường: `web/.env.example` (`VITE_*`) và `mobile/.env.example` (`EXPO_PUBLIC_*`).
