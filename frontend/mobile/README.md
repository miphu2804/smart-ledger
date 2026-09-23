# Sổ Nghe Lời — Mobile (Expo mockup)

Bản mockup UI của app bán hàng bằng giọng nói, dựng theo prototype `Sổ Nghe Lời`. Toàn bộ dữ liệu là **dữ liệu mẫu trong bộ nhớ** — mở app là test được ngay, không cần backend.

Stack: Expo SDK 57 · React Native 0.86 · expo-router · TypeScript · react-native-svg · font Plus Jakarta Sans.

## Chạy

```bash
npm install
npx expo start          # quét QR bằng Expo Go (bản hỗ trợ SDK 57)
npm run web             # hoặc bấm w: chạy trên trình duyệt (khung giới hạn 440px)
npm run typecheck
npm run export:web      # build web tĩnh ra dist/
```

## Tài khoản demo

- Nhập **số điện thoại bất kỳ (10 số)**, mã OTP là **123456** (có nút “Điền nhanh”).
- Số bắt đầu bằng `09` → vào thẳng tiệm mẫu “Tiệm tạp hoá cô Thỏ”. Số khác → đi qua bước tạo tiệm (tên + ngành hàng).
- Google / Facebook / Apple: đăng nhập giả lập, vào thẳng Trang chủ.
- Muốn làm lại từ đầu: **Khác → Khôi phục dữ liệu mẫu**. Tải lại app (reload) cũng reset dữ liệu.

## Màn hình

| Route | Màn |
| --- | --- |
| `/` | Splash |
| `/(auth)/welcome`, `/otp`, `/setup` | Đăng nhập SĐT, OTP, tạo tiệm |
| `/(tabs)` | Trang chủ: doanh thu hôm nay/hôm qua/tháng, biểu đồ, AI gợi ý, quản lý tiệm, bán chạy |
| `/(tabs)/invoices` | Hoá đơn: lọc theo thời gian, nguồn (AI/POS/nhập tay), ghi nợ, đã huỷ, tìm kiếm |
| `/(tabs)/expenses` | Chi phí theo tháng, cơ cấu chi, thêm chi phí bằng giọng nói / nhập tay |
| `/(tabs)/more` | Khác: hồ sơ, gói Cơ bản (hạn mức 200 đơn) / Pro, menu quản lý, đăng xuất |
| `/voice` | **Nói để lên đơn** — ghi âm giả lập, AI tách món, hỏi thêm món lạ vào danh mục, sửa số lượng |
| `/pos` | Chọn hàng nhanh dạng lưới, giỏ hàng, món ngoài danh mục |
| `/checkout` | Thanh toán: tiền mặt (tiền thối), chuyển khoản (QR minh hoạ), ghi nợ |
| `/invoice/[id]` | Chi tiết hoá đơn: in, sửa, huỷ |
| `/products` | Hàng hoá & tồn kho, thêm/sửa/xoá, “chụp ảnh AI” giả lập |
| `/debts` | Sổ nợ: trả một phần / trả hết, lịch sử, gọi / nhắc nợ |
| `/bestsellers` | Xếp hạng món bán chạy, gợi ý hàng bán chậm |
| `/staff` | Nhân viên, doanh thu theo người, thêm / tạm khoá |
| `/profile` | Sửa thông tin cá nhân & tiệm |
| `/ai` | Trợ lý AI (trả lời từ dữ liệu mẫu: doanh thu, bán chạy, nhập hàng, lời lãi, công nợ) |
| `/printer` | Kết nối máy in K80/K58 (giả lập, IP `192.168.x.x` → thành công) |

## Tính năng Giọng nói On-Device (Voice POS Engine)

Ứng dụng tích hợp bộ xử lý giọng nói và bóc tách đơn hàng on-device (`src/sst/`):
- **Cơ chế Nhấn & Giữ (Hold-to-Talk):** Bấm giữ nút mic để nói liên tục và thả tay để chốt đơn ngay lập tức.
- **Khử từ đệm & cà lăm:** Tự động loại bỏ *à ừm, cho cho em, 2 2 ly*.
- **So khớp thực đơn thông minh (Fuzzy Matching):** Khớp với danh mục món của quán, hỗ trợ alias và tính điểm tin cậy.
- **Phân giải biến thể (Disambiguation):** Tự động bật popup chọn loại cụ thể khi khách gọi món chung chung (như *bạc xỉu đá / nóng*, *sting dâu / vàng*).
- **Tự động ghi nhận chi tiêu:** Tự động phát hiện các câu chi tiền (như *"chi 20k mua đá"*) để lưu vào Sổ chi tiêu.

### Thử nghiệm:
1. Mở tab **Bán hàng** (`/voice`).
2. Nhấn giữ nút **"Nhấn & Giữ để nói"** và nói: *"cho 2 bánh mì ốp la 1 bạc xỉu với chi 20k mua đá"*.
3. Hoặc gõ trực tiếp vào ô nhập văn bản để kiểm tra tốc độ bóc tách (< 2ms).

## Cấu trúc

```
app/                    route (expo-router)
src/
  theme.ts              màu, font, bo góc, đổ bóng (theo prototype)
  config.ts             EXPO_PUBLIC_API_ENDPOINT, EXPO_PUBLIC_USE_MOCK
  data/types.ts         kiểu dữ liệu dùng chung
  data/mock.ts          dữ liệu mẫu + bộ sinh hoá đơn/chi phí theo ngày hiện tại
  store/AppStore.tsx    state toàn app (context) + mọi action
  lib/                  format tiền/ngày, thống kê, bộ nhận diện đơn giả lập
  components/           UI kit, biểu đồ, logo, toast, QR minh hoạ
```

## Nối backend sau này

1. Copy `.env.example` thành `.env`, đặt `EXPO_PUBLIC_USE_MOCK=false` và `EXPO_PUBLIC_API_ENDPOINT`.
2. Thay các action trong `src/store/AppStore.tsx` bằng lời gọi API (giữ nguyên kiểu trong `src/data/types.ts`).
3. Thay `parseOrder()` bằng API nhận diện giọng nói / ngôn ngữ tự nhiên thật; giao diện đã có sẵn bước xác nhận trước khi lưu.

Ghi chú: mã QR chuyển khoản, tỉ lệ thuế 1,5% trên hoá đơn và gói Pro đều chỉ để minh hoạ.
