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

- Chọn **Đăng nhập bằng email**, tab **Tạo tài khoản**, nhập email và mật khẩu bất kỳ (từ 6 ký tự); màn xác minh email chỉ cần bấm **Tôi đã xác minh**. Nút Facebook đăng nhập thẳng vào người dùng mẫu.
- Email nào cũng là người dùng mới: sau khi xác minh sẽ đi qua bước tạo tiệm (tên + ngành hàng). Chỉ nút Facebook (mock) mới vào thẳng tiệm mẫu “Tiệm tạp hoá cô Thỏ”.
- Sau khi đăng nhập, Home mở phần giới thiệu `src/components/AssistantIntroModal.tsx` (Trợ lý, Bán hàng, Tổng quan, Quản lý); phần giới thiệu không hiện lại trong phiên đó.
- Tải lại app (reload) để đưa dữ liệu trong bộ nhớ về trạng thái ban đầu.

## Màn hình

| Route | Màn |
| --- | --- |
| `/` | Splash |
| `/(auth)/welcome`, `/email`, `/verify-email`, `/profile`, `/setup` | Chọn cách đăng nhập, email + mật khẩu (đăng ký, quên mật khẩu), xác minh email, nhập tên lần đầu, tạo tiệm |
| `/(tabs)` | Trang chủ: doanh thu hôm nay/tuần này/tháng này, việc cần xử lý, gợi ý và bán chạy |
| `/analytics` | Phân tích theo kỳ: doanh thu, diễn biến theo giờ/ngày trong tuần/tuần trong tháng, chi phí, lãi gộp ước tính, bán chạy, công nợ |
| `/(tabs)/invoices` | Đơn hàng: lọc theo thời gian, nguồn (AI/POS/nhập tay), ghi nợ, đã huỷ, tìm kiếm |
| `/(tabs)/sales` | Bán hàng: vào thẳng danh mục, chọn món và xem giỏ; Zen ring (kéo thả, dính cạnh trái/phải, giữ vị trí qua các tab) mở Hỏi đáp, Đọc đơn hoặc Báo cáo hôm nay |
| `/(tabs)/more` | Quản lý: hồ sơ, báo cáo, hàng hoá, chi phí, công nợ, cài đặt và đăng xuất |
| `/expenses` | Chi phí theo tháng, cơ cấu chi, thêm chi phí bằng giọng nói / nhập tay |
| `/voice` | Đọc đơn: nhập văn bản hoặc giữ nút mic, hỏi thêm món lạ vào danh mục, sửa số lượng. Mic: web dùng Web Speech API (`vi-VN`); Android dùng model sherpa-onnx chạy trên máy (xem “Nhận dạng giọng nói trên Android”), không còn câu mẫu giả. Không có gì hỗ trợ thì app báo rõ và dùng nút Nhập tay |
| `/pos` | Chọn hàng nhanh dạng lưới, giỏ hàng, thêm nhanh mặt hàng vào danh mục |
| `/checkout` | Thanh toán: tiền mặt (tiền thối), chuyển khoản (QR minh hoạ), ghi nợ |
| `/invoice/[id]` | Chi tiết đơn bán nội bộ: xem đơn, void toàn bộ và xem khoản hoàn; chưa có in/sửa sale |
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
- `bánh mì 20k cà phê 20k` hoặc nói “bánh mì hai mươi nghìn cà phê hai mươi nghìn” → hai món, mỗi món một giá

Chữ nhận được từ mic (hay gõ tay) đi qua `parseOrder()` (`src/lib/parseOrder.ts`); app chưa gọi AI để nhận diện đơn. Model giọng nói xuất câu liền, không dấu câu, số đọc bằng chữ, nên `parseOrder` đọc cả số tiền viết bằng chữ số (`20k`, `20.000đ`, `1,5tr`) lẫn bằng chữ (`hai mươi nghìn`, `hai lăm ca`) và tách món theo ba cách: (1) dấu câu và các từ nối (`và`, `với`, `thêm`, `kèm`, `cùng`, `rồi`, `nha`, `nhé`); (2) mỗi giá nói ra kết thúc một món (“bánh mì 20k cà phê 20k” → hai món có giá; món chưa có trong kho thì hỏi thêm vào danh mục với giá điền sẵn); (3) câu liền có nhiều món trong kho thì cắt trước mỗi tên món, lùi qua số lượng và đơn vị đứng ngay trước (“hai cà phê sữa một bánh mì thịt”). Hạn chế: nhiều món chưa có trong kho, không nói giá và không có từ nối vẫn gộp thành một; giá nói trước tên món và giá không kèm đơn vị tiền (“bánh mì hai mươi”) không được nhận; món có trong kho luôn lấy giá của kho, giá nói ra chỉ dùng để tách món. “Chi”, “mua”, “trả”, “nộp”… chỉ mở một khoản chi khi đứng đầu mệnh đề, sau một giá hoặc sau một món trong kho (nên “trà sữa 30k”, “chị lấy bánh mì 20k”, “bánh mì ba chỉ 20k” là món, không phải chi). `src/sst/` là khung cũ chưa chạy model thật và chưa màn nào dùng; nhận dạng giọng nói đang chạy nằm ở `src/lib/speech/`.

### Nhận dạng giọng nói trên Android

Màn Đọc đơn nhận giọng nói trên Android bằng model tiếng Việt streaming Zipformer chạy ngay trên máy (thư viện `react-native-sherpa-onnx`, kèm đọc mic native). Code ở `src/lib/speech/` (`sherpaEngine.ts`; phần thuần để kiểm thử ở `core.ts`).

- **Cần bản dev client mới:** thư viện có mô-đun native, nên phải build lại dev client (`npx eas-cli build --profile dev-client --platform android`) sau khi cài. Bản cũ chưa có mô-đun thì màn Đọc đơn báo “chưa hỗ trợ ghi âm giọng nói” thay vì sập.
- **Model không nằm trong git** (49 MB). File ở `assets/models/` (xem `assets/models/README.md`); app tải về bộ nhớ của app ở lần đầu mở màn Đọc đơn từ `EXPO_PUBLIC_STT_MODEL_URL`. Khi phát triển chạy `node scripts/serve-stt-model.js` để phục vụ thư mục đó, rồi đặt `EXPO_PUBLIC_STT_MODEL_URL=http://10.0.2.2:8090/` (emulator) hoặc `http://<IP máy tính>:8090/` (điện thoại thật, cần mở cổng 8090 trên tường lửa).
- **Nhúng model vào APK (chạy offline):** plugin `plugins/withBundledSttModel.js` chép model vào `android/app/src/main/assets/models/stt-model-<phiên bản>/` khi `expo prebuild`; thư mục `android/` đã sinh sẵn thì chạy `node plugins/withBundledSttModel.js`. App tự nhận model nhúng (`listAssetModels`) và bỏ qua bước tải; thư viện chép nó ra bộ nhớ app ở lần mở đầu. Máy build không có model thì plugin chỉ cảnh báo và APK rơi về cách tải ở trên. Tên thư mục lấy từ `STT_MODEL_VERSION` trong `src/lib/speech/core.ts`.
- **Bản vá thư viện:** `react-native-sherpa-onnx` 0.4.4 cố định `modelType = "zipformer"` cho mọi model transducer nên model `zipformer2` (như model đang dùng) làm app sập lúc nạp. `patches/react-native-sherpa-onnx+0.4.4.patch` (áp tự động bởi `postinstall` qua `patch-package`, kể cả trên máy build EAS) để trống giá trị này cho sherpa-onnx tự nhận loại theo metadata. Nâng phiên bản thư viện thì xem lại bản vá, và đổi bản vá là phải build lại dev client.
- **Quyền micro:** app xin quyền khi mở màn Đọc đơn. Khi giữ nút mic có thanh “Mức mic” đo từ micro thật; không ra chữ thì app báo “micro không thu được âm thanh” hoặc “có tiếng nhưng chưa nhận ra chữ”.
- **Chưa kiểm tra / chưa làm:** iOS; hotword từ menu (`bpe.model`); tinh chỉnh thời gian ngắt câu; Android 15+ yêu cầu thư viện native căn lề 16 KB khi đưa lên Google Play (cần kiểm tra các file `.so` của sherpa-onnx).

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
  lib/speech/           nhận dạng giọng nói trên máy (Android): tải model, đọc mic, sherpa-onnx; core.ts là phần thuần
  sst/                  khung nhận dạng giọng nói cũ (chưa chạy model thật), chưa được màn nào dùng
  components/           UI kit, biểu đồ, logo, toast, QR minh hoạ
```

## Gắn Firebase (đăng nhập bằng email và Facebook)

Code đã nối sẵn theo `docs/contracts/api-contracts.md`: Firebase xác thực (email + mật khẩu hoặc Facebook) → app gửi Firebase ID token (`Authorization: Bearer …`) tới `POST /api/v1/auth/session` → nhận `SessionView` (role, tiệm, `needsOnboarding`). Với `EXPO_PUBLIC_USE_MOCK=true` app chạy giả lập (không gọi Firebase); với `false` app dùng Firebase + Core thật. Chỉ cần cài gói và điền cấu hình:

1. **Firebase Console** → Authentication → Sign-in method → bật **Email/Password** (và **Facebook** nếu dùng, xem mục Facebook bên dưới). App không còn đăng nhập bằng số điện thoại.
   - Templates → *Email address verification* và *Password reset*: đặt tên người gửi, tiêu đề; điền *Reply-to* là email hỗ trợ của dự án (Firebase gửi từ địa chỉ `noreply@…firebaseapp.com`; muốn gửi từ địa chỉ riêng cần SMTP tuỳ chỉnh).
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
- `phone-test`: kế thừa `preview`, Firebase thật với phiên Core giả lập (`MOCK_CORE`, `MOCK_SHOPS`) để thử đăng nhập Firebase (email) trên máy thật khi chưa có Core deploy; các màn nghiệp vụ vẫn gọi API thật nên báo lỗi mạng nếu không tới được Core.
- `production`: tự tăng số build.

`google-services.json` bị gitignore nên build trên EAS không thấy file này. `app.config.js` đọc đường dẫn từ biến môi trường kiểu file `GOOGLE_SERVICES_JSON` (`eas env:create --type file`, hiện đặt trong environment `preview`); ở máy local vẫn dùng `./google-services.json`. `.env` cũng không lên EAS, nên profile phải tự đặt các biến `EXPO_PUBLIC_*`. Mỗi keystore build cần thêm SHA-1/SHA-256 vào Firebase trước khi đăng nhập được.

Nơi code: `src/lib/auth/` (giao diện `AuthClient`; `mock.ts`, `firebase.ts` cho native, `firebase.web.ts` cho web), `src/lib/api.ts` (Bearer + `X-Shop-Id` + lỗi `{code,message,traceId}`, 401 → đăng xuất), `src/lib/sessionApi.ts` (`/auth/session`, `/me`, `/shops`), luồng đăng nhập trong `src/store/AppStore.tsx` (`signIn`, `logout`, khởi động chờ Firebase khôi phục phiên).

### Nối Core thật

Luồng: Firebase xác thực (email hoặc Facebook) → FE gửi **Firebase ID token** (`Authorization: Bearer …`) xuống Core → Core xác thực bằng Firebase Admin SDK, tạo/tìm tài khoản, trả phiên.

1. Đăng nhập lần đầu: `POST /api/v1/auth/session` với `{ displayName }`. Core **bắt buộc** `displayName` cho tài khoản mới (thiếu → 400) nên app có màn “Bạn tên gì?” (`app/(auth)/profile.tsx`). Các lần sau không cần gửi.
2. Mở lại app: Firebase tự khôi phục phiên → `GET /api/v1/me`. `404 auth_profile_not_found` (Firebase còn đăng nhập nhưng Core chưa có tài khoản) → app vào lại màn nhập tên. `401` → đăng xuất. `403 account_disabled` → đăng xuất và báo tài khoản bị khoá.
3. `needsOnboarding = true` (chưa có tiệm) → màn tạo tiệm, gọi `POST /shops` thật (Core lưu một `industry` dạng chuỗi — các ngành đã chọn được nối bằng ", ").

Các API nghiệp vụ (danh mục/sản phẩm, khách, POS/checkout tạo đơn nháp rồi xác nhận, đơn hàng, công nợ, chi phí, trợ lý) đều cần header `X-Shop-Id`; hợp đồng nằm trong [API contracts](../../docs/contracts/api-contracts.md). Khi chạy với Core thật, mobile dùng các client `src/lib/*Api.ts` cho những luồng đã nối; Home/Analytics chưa gọi `/api/v1/reports/summary` (xem [Chỉ số trên Home/Analytics](#chỉ-số-trên-homeanalytics)). `SaleDraft.confirm` chấp nhận `initialPaidVnd` bất kỳ từ 0 tới tổng đơn — trả thiếu thì Core (`SaleDraftServiceImpl.confirm`/`customerForConfirmation`) tự tạo một `Debt` cho khách (cần có `customerId` có sẵn hoặc `customerName` để Core tạo khách mới, thiếu cả hai thì lỗi `customer_required_for_debt`); khớp với màn Thanh toán ghi nợ của mobile. `EXPO_PUBLIC_USE_MOCK=true` bật chế độ xem trước không cần Core thật — `src/lib/mockCore.ts` giả lập các endpoint trên trong bộ nhớ.

Checkout mobile hiện yêu cầu mỗi món có `productId`. Luồng “Món ngoài danh mục” tạo nhanh một Product với `tracked=false` rồi thêm vào giỏ; chưa dùng custom item `productId=null` dù Core đã hỗ trợ.

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

### Chỉ số trên Home/Analytics

Home và Analytics lấy danh sách sale/product/debt/expense qua [`useCoreData.ts`](src/lib/useCoreData.ts), chuyển dữ liệu bằng [`coreAdapters.ts`](src/lib/coreAdapters.ts), rồi tính chỉ số trên thiết bị bằng [`stats.ts`](src/lib/stats.ts). Đây không phải response của Core summary:

- Đơn dùng `soldAt` làm thời điểm bán; loại các đơn hiện đã `VOIDED` và lọc kỳ theo giờ thiết bị. Hủy một đơn kỳ trước có thể làm số liệu kỳ bán cũ thay đổi, không tạo điều chỉnh ở kỳ `voidedAt` như Core.
- Doanh thu là tổng giá trị các đơn còn lại, không tách `grossRevenueVnd`, `voidedRevenueVnd`, `netRevenueVnd` hoặc dòng tiền theo `receivedAt`/`refundedAt`.
- Lãi gộp là doanh thu trừ giá vốn **ước tính**, chưa trừ khoản chi vận hành. Giá vốn lấy từ danh mục hiện có; thiếu `costPriceVnd` thì adapter ước tính 60% giá bán danh mục, còn dòng không khớp product dùng 60% đơn giá dòng. Đây không phải snapshot giá vốn lịch sử hoặc lợi nhuận chính thức.

Định nghĩa summary chuẩn của Core nằm trong [API contract — Tổng quan theo kỳ](../../docs/contracts/api-contracts.md#tổng-quan-theo-kỳ). Việc nối FE sang summary cần task tích hợp và nghiệm thu riêng; sửa tài liệu này không chứng minh báo cáo mobile đã tương đương Core hay đã đạt `FR-006`/`AC-031`.

### Đăng nhập bằng email + mật khẩu

Màn đầu có nút **Đăng nhập bằng email** và liên kết **Tạo tài khoản** (`app/(auth)/welcome.tsx` → `app/(auth)/email.tsx`). Google và Zalo hiện nhãn “Sắp có”; app không còn đăng nhập bằng số điện thoại.

- **Tạo tài khoản** tự đăng ký bằng Firebase (`createUserWithEmailAndPassword`, không cần ai thêm user trong Console), gửi thư xác minh (`sendEmailVerification`) rồi chuyển sang `app/(auth)/verify-email.tsx`. Chỉ khi người dùng bấm **Tôi đã xác minh** và Firebase báo `emailVerified` thì app mới gửi Firebase ID token xuống Core (`POST /auth/session`). Mở lại app khi chưa xác minh vẫn quay về màn này. Đây là chặn ở phía app; Core chưa kiểm tra `email_verified`.
- **Đăng nhập** bằng email chưa xác minh cũng đi qua màn xác minh (không tự gửi lại thư; bấm **Gửi lại thư xác minh**, chờ 60 giây giữa hai lần). Sai email hoặc mật khẩu hiện gợi ý “tạo tài khoản” hoặc “đặt lại mật khẩu” thay vì báo lỗi.
- **Quên mật khẩu** gửi thư đặt lại (`sendPasswordResetEmail`); email chưa đăng ký cũng báo đã gửi để không lộ email nào có tài khoản.
- Cần bật Email/Password ở Firebase Console → Authentication → Sign-in method; đặt *Reply-to* của hai mẫu thư ở mục Templates. Biến `EXPO_PUBLIC_SUPPORT_EMAIL` (tuỳ chọn) hiện dòng “Cần hỗ trợ?” ở màn xác minh.

### Đăng nhập bằng Facebook

Nút Facebook ở màn đầu (`app/(auth)/welcome.tsx`) đăng nhập bằng Facebook SDK (`react-native-fbsdk-next`) rồi đổi mã truy cập sang tài khoản Firebase (`FacebookAuthProvider.credential` + `signInWithCredential`, ở `src/lib/auth/firebase.ts`). Sau đó luồng giống email: gửi Firebase ID token xuống Core (`POST /auth/session`); tài khoản mới (Core đòi `displayName`) đi qua màn "Bạn tên gì?" rồi màn tạo tiệm. Core chỉ lưu Firebase UID nên không cần sửa. Trên web dùng cửa sổ popup của Firebase; bản mock đăng nhập vào một người dùng mẫu (`facebook.demo@example.com`).

Cấu hình một lần (người quản trị app Facebook và Firebase làm):

1. **Meta for Developers:** tạo app, thêm sản phẩm Facebook Login. Lấy **App ID** (Cài đặt ứng dụng → Cơ bản), **App Secret** (cùng trang) và **Client Token** (Cài đặt ứng dụng → Nâng cao → Bảo mật). Thêm nền tảng **Android**: tên gói `vn.teamhexa.songheloi`, tên lớp `vn.teamhexa.songheloi.MainActivity`, **key hash** của khoá ký (Base64 của SHA-1: khoá EAS `QU+neYI9yeNs0x2cI7KScGEbywI=`, khoá debug `Xo8WBi6jzSxKDVR4drqm84yr9iU=`; bản đưa lên Google Play cần thêm key hash của khoá Google). Chỉ người có vai trò trong app mới đăng nhập được khi app ở chế độ Development; muốn người khác dùng phải chuyển sang Live.
2. **Firebase Console → Authentication → Sign-in method:** bật **Facebook**, dán App ID và App Secret. Thêm địa chỉ redirect Firebase hiển thị (`<project>.firebaseapp.com/__/auth/handler`) vào Facebook Login → Valid OAuth Redirect URIs.
3. **Build:** `app.config.js` chỉ thêm plugin Facebook khi có `FACEBOOK_APP_ID` và `FACEBOOK_CLIENT_TOKEN` (đặt trong `.env` khi chạy `npx expo prebuild --platform android`, hoặc làm biến môi trường EAS). Hai giá trị này không đưa vào repo công khai và **App Secret không bao giờ đặt trong app hay `.env`**. Thư viện có mã native nên phải build lại dev client/APK, **không chạy trên Expo Go**; thiếu cấu hình thì bấm nút báo lỗi rõ ràng thay vì sập. Thư mục `android/` đã sinh sẵn thì chạy lại prebuild sau khi đổi hai biến.

Giới hạn: mỗi cách đăng nhập là một tài khoản Firebase riêng, nên cùng một người đăng nhập bằng cách khác sẽ thành người dùng khác trong Core trừ khi liên kết ở Firebase (chưa làm). Nếu email Facebook đã dùng ở cách đăng nhập khác, Firebase có thể trả `account-exists-with-different-credential` và app báo người dùng dùng cách cũ. Chưa kiểm tra: iOS, và đăng nhập Facebook thật trên máy.

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

Chưa làm: đăng nhập Google/Apple (bản thật hiện báo “sắp có”; Facebook xem mục trên), Zalo (Firebase không có sẵn provider — cần Core cấp custom token), nhận diện đơn bằng AI (màn Đọc đơn vẫn dùng `parseOrder()` trên máy).

Ghi chú: mã QR chuyển khoản chỉ để minh hoạ, không xác nhận giao dịch ngân hàng.

## Vercel preview trên trình duyệt

`vercel.json` cấu hình Expo export ra `dist/` và chuyển các đường dẫn Expo Router về SPA entry. CI build web và tải lên Vercel (job `deploy-web`): mỗi PR có URL preview, `staging` có alias cố định, `main` là production. Biến `EXPO_PUBLIC_*` đặt ở GitHub Environment `vercel-preview`/`vercel-staging`/`vercel-production`, không đặt trên Vercel; xem [CI/CD](../../docs/development/ci-cd.md#mobile-web-on-vercel).

Các biến `EXPO_PUBLIC_*` được đóng vào bundle trình duyệt, vì vậy không đặt service-account keys ở đó. Preview web giúp kiểm tra giao diện responsive và luồng với Core staging; nó không thay thế kiểm tra native trên iOS/Android.
