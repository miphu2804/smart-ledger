# Sổ Nghe Lời — Mobile (Expo)

App OWNER của Sổ Nghe Lời. Mặc định (`EXPO_PUBLIC_USE_MOCK=true`) mọi lời gọi Core đi vào bộ giả lập trong bộ nhớ `src/lib/mockCore.ts` — mở app là test được ngay, không cần backend. Đặt `EXPO_PUBLIC_USE_MOCK=false` để dùng Firebase và Core thật (xem [Nối Core thật](#nối-core-thật)).

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
- Sau khi đăng nhập, Home mở phần giới thiệu `src/components/AssistantIntroModal.tsx` (Trợ lý, Bán hàng, Tổng quan, Quản lý); phần giới thiệu không hiện lại trong phiên đó.
- Tải lại app (reload) để đưa dữ liệu trong bộ nhớ về trạng thái ban đầu.

## Màn hình

| Route | Màn |
| --- | --- |
| `/` | Splash |
| `/(auth)/welcome`, `/otp`, `/email`, `/profile`, `/setup` | Đăng nhập SĐT hoặc email, OTP, nhập tên lần đầu, tạo tiệm |
| `/(tabs)` | Trang chủ: doanh thu hôm nay/tuần này/tháng này, việc cần xử lý, gợi ý và bán chạy |
| `/analytics` | Phân tích theo kỳ: doanh thu, diễn biến theo giờ/ngày trong tuần/tuần trong tháng, chi phí, lãi gộp ước tính, bán chạy, công nợ |
| `/(tabs)/invoices` | Đơn hàng: lọc theo thời gian, nguồn (AI/POS/nhập tay), ghi nợ, đã huỷ, tìm kiếm |
| `/(tabs)/sales` | Bán hàng: vào thẳng danh mục, chọn món và xem giỏ; Zen ring (kéo thả, dính cạnh trái/phải, giữ vị trí qua các tab) mở Hỏi đáp, Đọc đơn hoặc Báo cáo hôm nay |
| `/(tabs)/more` | Quản lý: hồ sơ, báo cáo, hàng hoá, chi phí, công nợ, cài đặt và đăng xuất |
| `/expenses` | Chi phí theo tháng, cơ cấu chi, thêm chi phí bằng giọng nói / nhập tay |
| `/voice` | Đọc đơn: nhập văn bản hoặc giữ nút mic, hỏi thêm món lạ vào danh mục, sửa số lượng. Mic chỉ nhận giọng nói trên web (Web Speech API `vi-VN`); trên native nút mic phát lại câu mẫu |
| `/pos` | Chọn hàng nhanh dạng lưới, giỏ hàng, món ngoài danh mục |
| `/checkout` | Thanh toán: tiền mặt (tiền thối), chuyển khoản (QR minh hoạ), ghi nợ |
| `/invoice/[id]` | Chi tiết hoá đơn: in, sửa, huỷ |
| `/products` | Hàng hoá & tồn kho, thêm/sửa/xoá, “chụp ảnh AI” giả lập |
| `/debts` | Sổ nợ: trả một phần / trả hết, lịch sử, gọi / nhắc nợ |
| `/bestsellers` | Xếp hạng món bán chạy, gợi ý hàng bán chậm |
| `/profile` | Sửa thông tin tiệm (tên, địa chỉ, ngành hàng) lưu lên Core qua `PATCH /api/v1/shops/{shopId}`; họ tên, email, Facebook và tài khoản ngân hàng chỉ lưu trên máy |
| `/settings` | Âm thanh, rung, đọc lại đơn, tự mở in |
| `/notifications` | Thông báo trong app |
| `/ai` | Hỏi đáp với trợ lý qua `src/lib/agentApi.ts` → Core `/api/v1/agent/*`; lịch sử hội thoại. Khi bật mock, `mockCore` trả lời giả |
| `/printer` | Màn cấu hình máy in K80/K58; chưa có kết nối thiết bị |
| `/debug` | Chẩn đoán kết nối, chỉ có ở bản dev (xem [Debug](#debug)) |

`/staff` còn file route nhưng không có lối vào: MVP chỉ có hai vai trò OWNER và ADMIN.

## Thử nhận diện đơn

Ô “Nhập tên hàng + giá” ở màn `/voice` chạy bộ nhận diện rule-based trong `src/lib/parseOrder.ts`. Ví dụ:

- `2 ly cà phê sữa 50 nghìn, thêm 1 trà đá`
- `bán 3 bánh mì 45k, 2 coca`
- `lấy 1 chục trứng với 2 gói mì`
- `bán 1 hộp sữa chua nếp cẩm 12k` → món chưa có, app hỏi có thêm vào danh mục không

Nút “Dùng câu gợi ý” lần lượt điền các câu trong `voiceSamples` (`src/data/mock.ts`). Câu nhận được từ mic cũng đi qua cùng `parseOrder()`; app chưa gọi AI để nhận diện đơn. `src/sst/` là module nhận dạng giọng nói on-device chưa được màn nào dùng.

## Cấu trúc

```
app/                    route (expo-router)
src/
  theme.ts              màu, font, bo góc, đổ bóng (theo prototype)
  config.ts             EXPO_PUBLIC_API_ENDPOINT, EXPO_PUBLIC_USE_MOCK
  data/types.ts         kiểu dữ liệu dùng chung
  data/mock.ts          dữ liệu mẫu + bộ sinh hoá đơn/chi phí theo ngày hiện tại
  store/AppStore.tsx    state toàn app (context) + mọi action, gọi Core qua lib/*Api.ts
  lib/                  format tiền/ngày, thống kê, bộ nhận diện đơn rule-based
  lib/auth/             đăng nhập: giao diện AuthClient, mock, Firebase (native + web)
  lib/api.ts            client gọi Core (Bearer Firebase ID token, X-Shop-Id, Idempotency-Key, lỗi chuẩn); USE_MOCK → mockCore
  lib/*Api.ts           session, catalog, customer, sales, debt, expense, agent
  lib/mockCore.ts       giả lập các endpoint Core trong bộ nhớ
  lib/useCoreData.ts    tải đơn, sản phẩm, nợ, chi phí từ Core cho Home, Quản lý, Phân tích, Bán chạy, Thông báo
  lib/checkoutSession.ts giữ đơn nháp giữa các lần bấm thanh toán để thử lại không ghi trùng sale
  sst/                  nhận dạng giọng nói on-device, chưa được màn nào dùng
  components/           UI kit, biểu đồ, logo, toast, QR minh hoạ
```

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
4. **`app.json`** đã cấu hình sẵn `googleServicesFile` cho `android`/`ios` và các plugin:
   ```json
   ["@react-native-firebase/app", { "ios": { "disableSPM": true } }],
   "@react-native-firebase/auth",
   ["expo-build-properties", { "ios": { "useFrameworks": "static", "usePrecompiledModules": false } }]
   ```
   `disableSPM` tránh lỗi `pod install` khi Firebase cài qua SPM cùng static frameworks; `usePrecompiledModules: false` tránh app crash lúc mở vì thiếu `FirebaseCoreInternal.framework`. Thư mục `ios/` được sinh từ `app.json` (gitignore), nên đừng sửa tay trong đó.
5. **`.env`** (copy từ `.env.example`): `EXPO_PUBLIC_USE_MOCK=false`, `EXPO_PUBLIC_API_ENDPOINT=<URL Core>`, cùng 4 biến Firebase web. Để thử riêng Firebase khi chưa chạy Core, đặt `EXPO_PUBLIC_MOCK_CORE=true` (giả lập `/auth/session`, `/me`, `/shops`). Đổi `.env` xong phải chạy lại `npx expo start --clear` (Metro cache giá trị cũ).
6. **Chạy**:
   - Web: `npm run web` — dùng Firebase JS SDK + reCAPTCHA vô hình.
   - Android/iOS: **không chạy trên Expo Go** (React Native Firebase cần code native). Tạo development build: `npx eas-cli build --profile dev-client --platform android` (profile `development` không nhận được `GOOGLE_SERVICES_JSON`, xem bên dưới), cài bản build và chạy `npx expo start --dev-client`. iOS cần tài khoản Apple Developer.

Profile trong `eas.json`:

- `development`: development client, cài nội bộ.
- `dev-client`: kế thừa `development`, nhưng dùng environment `preview` để nhận biến file `GOOGLE_SERVICES_JSON` và ra APK. Dùng để thử đăng nhập Firebase và gọi Core thật từ emulator Android: cài APK vào emulator, đặt trong `.env` `EXPO_PUBLIC_API_ENDPOINT` theo [Nối Core thật](#nối-core-thật) cùng `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE`, `EXPO_PUBLIC_MOCK_SHOPS` đều `false`, rồi chạy `npx expo start --dev-client --android`. JS nạp từ Metro nên đổi địa chỉ Core chỉ cần sửa `.env` và chạy lại Metro, không phải build lại APK. Cùng keystore với `phone-test` nên cài đè được lên bản đó và dùng chung SHA đã đăng ký trong Firebase.
- `preview`: bản cài nội bộ, Android ra APK.
- `phone-test`: kế thừa `preview`, Firebase thật với phiên Core giả lập (`MOCK_CORE`, `MOCK_SHOPS`) để thử đăng nhập SĐT trên máy thật khi chưa có Core deploy; các màn nghiệp vụ vẫn gọi API thật nên báo lỗi mạng nếu không tới được Core.
- `production`: tự tăng số build.

`google-services.json` bị gitignore nên build trên EAS không thấy file này. `app.config.js` đọc đường dẫn từ biến môi trường kiểu file `GOOGLE_SERVICES_JSON` (`eas env:create --type file`, hiện đặt trong environment `preview`); ở máy local vẫn dùng `./google-services.json`. `.env` cũng không lên EAS, nên profile phải tự đặt các biến `EXPO_PUBLIC_*`. Mỗi keystore build cần thêm SHA-1/SHA-256 vào Firebase trước khi đăng nhập được.

Nơi code: `src/lib/auth/` (giao diện `AuthClient`; `mock.ts`, `firebase.ts` cho native, `firebase.web.ts` cho web), `src/lib/api.ts` (Bearer + `X-Shop-Id` + lỗi `{code,message,traceId}`, 401 → đăng xuất), `src/lib/sessionApi.ts` (`/auth/session`, `/me`, `/shops`), luồng đăng nhập trong `src/store/AppStore.tsx` (`signIn`, `logout`, khởi động chờ Firebase khôi phục phiên).

### Nối Core thật

Luồng: Firebase xác thực SĐT → FE gửi **Firebase ID token** (`Authorization: Bearer …`) xuống Core → Core xác thực bằng Firebase Admin SDK, tạo/tìm tài khoản, trả phiên.

1. Đăng nhập lần đầu: `POST /api/v1/auth/session` với `{ displayName }`. Core **bắt buộc** `displayName` cho tài khoản mới (thiếu → 400) nên app có màn “Bạn tên gì?” (`app/(auth)/profile.tsx`). Các lần sau không cần gửi.
2. Mở lại app: Firebase tự khôi phục phiên → `GET /api/v1/me`. `404 auth_profile_not_found` (Firebase còn đăng nhập nhưng Core chưa có tài khoản) → app vào lại màn nhập tên. `401` → đăng xuất. `403 account_disabled` → đăng xuất và báo tài khoản bị khoá.
3. `needsOnboarding = true` (chưa có tiệm) → màn tạo tiệm, gọi `POST /shops` thật (Core lưu một `industry` dạng chuỗi — các ngành đã chọn được nối bằng ", ").

Các API nghiệp vụ (danh mục/sản phẩm, khách, POS/checkout tạo đơn nháp rồi xác nhận, đơn hàng, công nợ, chi phí, báo cáo, trợ lý) đều cần header `X-Shop-Id`; hợp đồng nằm trong [API contracts](../../docs/contracts/api-contracts.md). Frontend gọi đủ các API này khi chạy với Core thật. `SaleDraft.confirm` chấp nhận `initialPaidVnd` bất kỳ từ 0 tới tổng đơn — trả thiếu thì Core (`SaleDraftServiceImpl.confirm`/`customerForConfirmation`) tự tạo một `Debt` cho khách (cần có `customerId` có sẵn hoặc `customerName` để Core tạo khách mới, thiếu cả hai thì lỗi `customer_required_for_debt`); khớp với màn Thanh toán ghi nợ của mobile. `EXPO_PUBLIC_USE_MOCK=true` bật chế độ xem trước không cần Core thật — `src/lib/mockCore.ts` giả lập các endpoint trên trong bộ nhớ.

Khi dev mobile, app gọi Core staging trên Railway (bản deploy từ nhánh `staging`, xem [CI/CD](../../docs/development/ci-cd.md)), nên máy dev không cần chạy backend hay Docker. Domain Railway gắn với service và environment, không đổi sau mỗi lần deploy. `.env`:

```
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_MOCK_CORE=false
EXPO_PUBLIC_MOCK_SHOPS=false
EXPO_PUBLIC_API_ENDPOINT=https://core-staging-01d2.up.railway.app
```

- Dữ liệu tạo từ app nằm trong database staging, dùng chung với cả nhóm và môi trường UAT.
- App gọi bản Core đã merge vào `staging`; API chưa merge thì chưa gọi được.
- Firebase của app (`google-services.json`, biến `EXPO_PUBLIC_FIREBASE_*`) phải cùng project với `FIREBASE_PROJECT_ID` của Core staging, nếu không Core trả `401`.

Chỉ chạy Core trên máy khi đang sửa backend (xem [README gốc](../../README.md#run)); khi đó đặt `EXPO_PUBLIC_API_ENDPOINT=http://<IP LAN của máy chạy Core>:8000` (máy ảo Android: `http://10.0.2.2:8000`, cổng `8000` khi chạy bằng Compose). Core cần `FIREBASE_PROJECT_ID` trùng project của `google-services.json` và file service account (xem `backend/core/.env.example`). Điện thoại và máy chạy Core phải cùng mạng.

### Đăng nhập bằng email + mật khẩu

Màn đầu có liên kết “Đăng nhập bằng email và mật khẩu” (`app/(auth)/email.tsx`): chọn **Tạo tài khoản** để tự đăng ký (Firebase `createUserWithEmailAndPassword`, không cần ai thêm user trong Console) hoặc **Đăng nhập**. Cần bật Email/Password ở Firebase Console → Authentication → Sign-in method. Sau khi Firebase xác thực, luồng giống số điện thoại: gửi Firebase ID token xuống Core (`POST /auth/session`). Core nhận token của mọi provider, tài khoản email không có số điện thoại. Tiện để thử API khi không có SMS hay điện thoại thật.

## Debug

- **Log:** chỉ chạy ở bản dev (`__DEV__`), mọi thứ có tiền tố `[api]`, `[auth]`, `[session]`. Không ghi token, mật khẩu, SĐT/email đầy đủ. Xem ở terminal đang chạy `npx expo start --dev-client` (bấm `j` mở React Native DevTools), hoặc:
  ```bash
  adb logcat -s ReactNativeJS
  ```
- **Màn “Chẩn đoán kết nối”** (`/debug`, chỉ dùng nội bộ ở bản dev): hiện chế độ (mock/thật), `API_ENDPOINT`, trạng thái Firebase, nút **Kiểm tra kết nối Core** (gọi `/v3/api-docs` không cần token), **Xem token** (aud/iss/hạn dùng; Core cần `FIREBASE_PROJECT_ID` trùng `aud`), **Gọi GET /me**, và nhật ký gần đây. Màn này không nằm trong tab Quản lý.
- **Chạy bản web để thử nhanh (không cần build APK):** `npm run web`, đăng nhập bằng email. Core chỉ nhận origin trong `CORS_ALLOWED_ORIGINS` (xem [CI/CD](../../docs/development/ci-cd.md)), nên `localhost` của máy dev bị chặn; chạy thêm proxy dev ở một terminal khác rồi trỏ app vào proxy:
  ```bash
  CORE_URL=https://core-staging-01d2.up.railway.app node scripts/dev-cors-proxy.js
  ```
  và đặt `EXPO_PUBLIC_API_ENDPOINT=http://127.0.0.1:8010` trong `.env` (chạy lại `npm run web -- --clear` sau khi đổi). Bỏ `CORE_URL` thì proxy trỏ về Core trên máy (`http://localhost:8000`). Chỉ Firebase mà chưa cần Core thì đặt `EXPO_PUBLIC_MOCK_CORE=true`, không cần proxy. Web không thử được: adapter native, đăng nhập SĐT trên máy thật, mạng Android.
- **Timeout:** mọi lời gọi Core tự dừng sau 15 giây (`ApiError` code `timeout`) thay vì quay vô hạn khi sai IP hoặc tường lửa chặn.
- **Lỗi thường gặp:** `network` = không tới được Core (IP, tường lửa, Android chặn HTTP); `timeout` = tường lửa thả gói; `401 unauthorized` = token không khớp project của Core; `400 validation_failed` ở `/auth/session` = tài khoản mới cần `displayName` (bình thường); `provider-disabled` = chưa bật phương thức đăng nhập trong Firebase Console.

Chưa làm: đăng nhập Google/Facebook/Apple (bản thật hiện báo “sắp có”), Zalo (Firebase không có sẵn provider — cần Core cấp custom token), nhận diện đơn bằng AI (màn Đọc đơn vẫn dùng `parseOrder()` trên máy).

Ghi chú: mã QR chuyển khoản, tỉ lệ thuế 1,5% trên hoá đơn và gói Pro đều chỉ để minh hoạ.

## Vercel preview trên trình duyệt

`vercel.json` cấu hình Expo export ra `dist/` và chuyển các đường dẫn Expo Router về SPA entry. CI build web và tải lên Vercel (job `deploy-web`): mỗi PR có URL preview, `staging` có alias cố định, `main` là production. Biến `EXPO_PUBLIC_*` đặt ở GitHub Environment `vercel-preview`/`vercel-staging`/`vercel-production`, không đặt trên Vercel; xem [CI/CD](../../docs/development/ci-cd.md#mobile-web-on-vercel).

Các biến `EXPO_PUBLIC_*` được đóng vào bundle trình duyệt, vì vậy không đặt service-account keys ở đó. Preview web giúp kiểm tra giao diện responsive và luồng với Core staging; nó không thay thế kiểm tra native trên iOS/Android.
