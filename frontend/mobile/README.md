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

## Xem thử với dữ liệu mẫu

- Nhập **số điện thoại bất kỳ (10 số)**, mã OTP là **123456**. Giao diện không hiển thị mã thử này.
- Số bắt đầu bằng `09` → vào thẳng tiệm mẫu “Tiệm tạp hoá cô Thỏ”. Số khác → đi qua bước tạo tiệm (tên + ngành hàng).
- Sau khi đăng nhập, Home mở phần giới thiệu ba bước về trợ lý, bán hàng và quản lý tiệm. Chọn Chatbot/Giọng nói ở bước đầu để vào thẳng màn tương ứng, hoặc dùng Tiếp/Quay lại, Bắt đầu, đóng/“Để sau”; phần giới thiệu không hiện lại trong phiên đó.
- Tải lại app (reload) để đưa dữ liệu trong bộ nhớ về trạng thái ban đầu.

## Màn hình

| Route | Màn |
| --- | --- |
| `/` | Splash |
| `/(auth)/welcome`, `/otp`, `/setup` | Đăng nhập SĐT, OTP, tạo tiệm |
| `/(tabs)` | Trang chủ: doanh thu hôm nay/tuần này/tháng này, việc cần xử lý, gợi ý và bán chạy |
| `/analytics` | Phân tích theo kỳ: doanh thu, diễn biến theo giờ/ngày trong tuần/tuần trong tháng, chi phí, lãi gộp ước tính, bán chạy, công nợ |
| `/(tabs)/invoices` | Hoá đơn: lọc theo thời gian, nguồn (AI/POS/nhập tay), ghi nợ, đã huỷ, tìm kiếm |
| `/(tabs)/sales` | Bán hàng: vào thẳng danh mục, chọn món và xem giỏ; Zen ring (kéo thả, dính cạnh trái/phải, giữ vị trí qua các tab) mở Chatbot, Giọng nói hoặc Gợi ý phân tích nhanh |
| `/(tabs)/expenses` | Chi phí theo tháng, cơ cấu chi, thêm chi phí bằng giọng nói / nhập tay |
| `/(tabs)/more` | Khác: hồ sơ, báo cáo, hàng hoá, chi phí, công nợ và đăng xuất |
| `/voice` | Waveform theo âm lượng micro khi được cấp quyền; nhập đơn bằng văn bản hoặc câu gợi ý, hỏi thêm món lạ vào danh mục và sửa số lượng. Chưa có chuyển giọng nói thành text. |
| `/pos` | Chọn hàng nhanh dạng lưới, giỏ hàng, món ngoài danh mục |
| `/checkout` | Thanh toán: tiền mặt (tiền thối), chuyển khoản (QR minh hoạ), ghi nợ |
| `/invoice/[id]` | Chi tiết hoá đơn: in, sửa, huỷ |
| `/products` | Hàng hoá & tồn kho, thêm/sửa/xoá, “chụp ảnh AI” giả lập |
| `/debts` | Sổ nợ: trả một phần / trả hết, lịch sử, gọi / nhắc nợ |
| `/bestsellers` | Xếp hạng món bán chạy, gợi ý hàng bán chậm |
| `/staff` | Nhân viên, doanh thu theo người, thêm / tạm khoá |
| `/profile` | Sửa thông tin cá nhân & tiệm |
| `/ai` | Trợ lý AI (trả lời từ dữ liệu mẫu: doanh thu, bán chạy, nhập hàng, lời lãi, công nợ) |
| `/printer` | Màn cấu hình máy in K80/K58; chưa có kết nối thiết bị |

## Thử nhận diện đơn

Ô “Nhập tên hàng hoặc yêu cầu…” ở màn `/voice` chạy bộ nhận diện rule-based trong `src/lib/parseOrder.ts`. Ví dụ:

- `2 ly cà phê sữa 50 nghìn, thêm 1 trà đá`
- `bán 3 bánh mì 45k, 2 coca`
- `lấy 1 chục trứng với 2 gói mì`
- `bán 1 hộp sữa chua nếp cẩm 12k` → món chưa có, app hỏi có thêm vào danh mục không

Nút “Thử câu gợi ý” lần lượt điền các câu trong `voiceSamples` (`src/data/mock.ts`). Micro chỉ cấp mức âm lượng cho waveform khi màn Voice mở; app không lưu audio hoặc dùng audio để tạo đơn. Nếu không cấp quyền micro, nhập text và chọn hàng vẫn dùng được.

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
  lib/auth/             đăng nhập: giao diện AuthClient, mock, Firebase (native + web)
  lib/api.ts            client gọi Core (Bearer Firebase ID token, X-Shop-Id, lỗi chuẩn)
  lib/sessionApi.ts     /auth/session, /me, /shops
  components/           UI kit, biểu đồ, logo, toast, QR minh hoạ
```

## Nối backend sau này

1. Copy `.env.example` thành `.env`, đặt `EXPO_PUBLIC_USE_MOCK=false` và `EXPO_PUBLIC_API_ENDPOINT`.
2. Thay các action trong `src/store/AppStore.tsx` bằng lời gọi API (giữ nguyên kiểu trong `src/data/types.ts`).
3. Thay `parseOrder()` bằng API nhận diện giọng nói / ngôn ngữ tự nhiên thật; giao diện đã có sẵn bước xác nhận trước khi lưu.

## Gắn Firebase (đăng nhập + xác thực số điện thoại)

Code đã nối sẵn theo `docs/contracts/api-contracts.md`: Firebase xác thực SĐT → app gửi Firebase ID token (`Authorization: Bearer …`) tới `POST /api/v1/auth/session` → nhận `SessionView` (role, tiệm, `needsOnboarding`). Với `EXPO_PUBLIC_USE_MOCK=true` app chạy như cũ (OTP `123456`); với `false` app dùng Firebase + Core thật. Chỉ cần cài gói và điền cấu hình:

1. **Firebase Console** → Authentication → Sign-in method → bật **Phone**.
   - Settings → *SMS region policy*: cho phép Việt Nam (+84).
   - *Phone numbers for testing*: thêm số test + mã cố định để dev không tốn SMS.
   - Settings → *Authorized domains*: thêm domain của bản web (localhost có sẵn).
2. **Thêm app** trong Project settings → Your apps:
   - **Web** → lấy 4 giá trị điền vào `.env` (`EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`).
   - **Android** (package `vn.teamhexa.songheloi`) → tải `google-services.json`; thêm **SHA-1 và SHA-256** của keystore dùng để build (`npx eas-cli credentials -p android`).
   - **iOS** (bundle `vn.teamhexa.songheloi`) → tải `GoogleService-Info.plist`; upload **APNs key** ở Cloud Messaging để xác minh SMS không cần reCAPTCHA.
   - Đặt hai file trên vào thư mục `frontend/mobile/`.
3. **Cài gói native** (trong `frontend/mobile`; Firebase JS SDK cho web đã có trong dependencies):
   ```bash
   npx expo install @react-native-firebase/app @react-native-firebase/auth expo-build-properties
   ```
4. **`app.json`**: thêm `"googleServicesFile": "./google-services.json"` vào `android`, `"googleServicesFile": "./GoogleService-Info.plist"` vào `ios`, và vào `plugins`:
   ```json
   "@react-native-firebase/app",
   "@react-native-firebase/auth",
   ["expo-build-properties", { "ios": { "useFrameworks": "static" } }]
   ```
5. **`.env`** (copy từ `.env.example`): `EXPO_PUBLIC_USE_MOCK=false`, `EXPO_PUBLIC_API_ENDPOINT=<URL Core>`, cùng 4 biến Firebase web. Nếu chưa kết nối Core, đặt `EXPO_PUBLIC_MOCK_CORE=true` để giả lập `/auth/session`, `/me`, `/shops`. Core hiện có `/auth/session` và `/me` nhưng chưa có `/shops`; để thử hai endpoint thật và giả lập riêng bước tạo tiệm, đặt `EXPO_PUBLIC_MOCK_SHOPS=true`. Đổi `.env` xong phải chạy lại `npx expo start --clear` (Metro cache giá trị cũ).
6. **Chạy**:
   - Web: `npm run web` — dùng Firebase JS SDK + reCAPTCHA vô hình.
   - Android/iOS: **không chạy trên Expo Go** (React Native Firebase cần code native). Tạo development build: `npx eas-cli build:configure`, rồi `npx eas-cli build --profile development --platform android` (thêm `"developmentClient": true` cho profile `development` trong `eas.json`), cài bản build và chạy `npx expo start --dev-client`. iOS cần tài khoản Apple Developer.

Nơi code: `src/lib/auth/` (giao diện `AuthClient`; `mock.ts`, `firebase.ts` cho native, `firebase.web.ts` cho web), `src/lib/api.ts` (Bearer + `X-Shop-Id` + lỗi `{code,message,traceId}`, 401 → đăng xuất), `src/lib/sessionApi.ts` (`/auth/session`, `/me`, `/shops`), luồng đăng nhập trong `src/store/AppStore.tsx` (`signIn`, `logout`, khởi động chờ Firebase khôi phục phiên).

### Nối Core thật (nhánh `feat/auth-session`)

Luồng: Firebase xác thực SĐT → FE gửi **Firebase ID token** (`Authorization: Bearer …`) xuống Core → Core xác thực bằng Firebase Admin SDK, tạo/tìm tài khoản, trả phiên.

1. Đăng nhập lần đầu: `POST /api/v1/auth/session` với `{ displayName }`. Core **bắt buộc** `displayName` cho tài khoản mới (thiếu → 400) nên app có màn “Bạn tên gì?” (`app/(auth)/profile.tsx`). Các lần sau không cần gửi.
2. Mở lại app: Firebase tự khôi phục phiên → `GET /api/v1/me`. `404 auth_profile_not_found` (Firebase còn đăng nhập nhưng Core chưa có tài khoản) → app vào lại màn nhập tên. `401` → đăng xuất. `403 account_disabled` → đăng xuất và báo tài khoản bị khoá.
3. `needsOnboarding = true` (chưa có tiệm) → màn tạo tiệm. Core chưa có `POST /shops` nên tạm dùng `EXPO_PUBLIC_MOCK_SHOPS=true`.

`.env` để chạy với Core thật (Core chạy bằng `docker compose up` thì cổng mặc định là `8000`):

```
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_MOCK_CORE=false
EXPO_PUBLIC_MOCK_SHOPS=true
EXPO_PUBLIC_API_ENDPOINT=http://<IP LAN của máy chạy Core>:8000   # máy ảo Android: http://10.0.2.2:8000
```

Core cần `FIREBASE_PROJECT_ID` trùng project của `google-services.json` và file service account (xem `backend/core/.env.example`). Điện thoại và máy chạy Core phải cùng mạng.

### Đăng nhập bằng email + mật khẩu

Màn đầu có liên kết “Đăng nhập bằng email và mật khẩu” (`app/(auth)/email.tsx`): chọn **Tạo tài khoản** để tự đăng ký (Firebase `createUserWithEmailAndPassword`, không cần ai thêm user trong Console) hoặc **Đăng nhập**. Cần bật Email/Password ở Firebase Console → Authentication → Sign-in method. Sau khi Firebase xác thực, luồng giống số điện thoại: gửi Firebase ID token xuống Core (`POST /auth/session`). Core nhận token của mọi provider, tài khoản email không có số điện thoại. Tiện để thử API khi không có SMS hay điện thoại thật.

## Debug

- **Log:** chỉ chạy ở bản dev (`__DEV__`), mọi thứ có tiền tố `[api]`, `[auth]`, `[session]`. Không ghi token, mật khẩu, SĐT/email đầy đủ. Xem ở terminal đang chạy `npx expo start --dev-client` (bấm `j` mở React Native DevTools), hoặc:
  ```bash
  adb logcat -s ReactNativeJS
  ```
- **Màn “Chẩn đoán kết nối”** (`/debug`, chỉ dùng nội bộ ở bản dev): hiện chế độ (mock/thật), `API_ENDPOINT`, trạng thái Firebase, nút **Kiểm tra kết nối Core** (gọi `/v3/api-docs` không cần token), **Xem token** (aud/iss/hạn dùng; Core cần `FIREBASE_PROJECT_ID` trùng `aud`), **Gọi GET /me**, và nhật ký gần đây. Màn này không nằm trong menu Khác.
- **Chạy bản web để thử nhanh (không cần build APK):** `npm run web`, đăng nhập bằng email. Trình duyệt bị CORS chặn khi gọi Core (Core chưa bật CORS) nên chạy thêm proxy dev ở một terminal khác rồi trỏ app vào proxy:
  ```bash
  node scripts/dev-cors-proxy.js
  ```
  và đặt `EXPO_PUBLIC_API_ENDPOINT=http://127.0.0.1:8010` trong `.env` (chạy lại `npm run web -- --clear` sau khi đổi). Chỉ Firebase mà chưa cần Core thì đặt `EXPO_PUBLIC_MOCK_CORE=true`, không cần proxy. Web không thử được: adapter native, đăng nhập SĐT trên máy thật, mạng Android.
- **Timeout:** mọi lời gọi Core tự dừng sau 15 giây (`ApiError` code `timeout`) thay vì quay vô hạn khi sai IP hoặc tường lửa chặn.
- **Lỗi thường gặp:** `network` = không tới được Core (IP, tường lửa, Android chặn HTTP); `timeout` = tường lửa thả gói; `401 unauthorized` = token không khớp project của Core; `400 validation_failed` ở `/auth/session` = tài khoản mới cần `displayName` (bình thường); `provider-disabled` = chưa bật phương thức đăng nhập trong Firebase Console.

Chưa làm: đăng nhập Google/Facebook/Apple (bản thật hiện báo “sắp có”), Zalo (Firebase không có sẵn provider — cần Core cấp custom token), và các action dữ liệu trong `AppStore` (sản phẩm, hoá đơn…) vẫn là dữ liệu mẫu cho tới khi Core có API. Core chưa có `POST /shops` (đặt `EXPO_PUBLIC_MOCK_SHOPS=true` để test tiếp). Docs ghi payload snake_case và id uuid, nhưng Core đang trả camelCase và id số; FE bám theo code của Core (sửa ở `src/data/types.ts` nếu backend đổi).

Ghi chú: mã QR chuyển khoản, tỉ lệ thuế 1,5% trên hoá đơn và gói Pro đều chỉ để minh hoạ.

## Vercel preview trên trình duyệt

`vercel.json` đã cấu hình Expo export ra `dist/` và chuyển các đường dẫn Expo Router về SPA entry. Khi tạo project Vercel:

1. Chọn thư mục gốc `frontend/mobile`.
2. Đặt production branch là `main`; pull request và nhánh `staging` sẽ có preview deployment.
3. Bật `EXPO_PUBLIC_USE_MOCK=true` trong Preview environment để dùng OTP mẫu `123456` và dữ liệu mẫu. Bản preview không cần Firebase hoặc backend secrets.

Muốn thử Firebase trên web thì cần thêm Firebase web app config vào Preview variables (`EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`), thêm preview domain vào Firebase Authorized domains, và bật HTTPS/CORS cho Core nếu gọi API thật. Các biến `EXPO_PUBLIC_*` được đóng vào bundle trình duyệt, vì vậy không đặt service-account keys ở đây. Preview web giúp kiểm tra giao diện responsive và luồng mock; nó không thay thế kiểm tra native trên iOS/Android.
