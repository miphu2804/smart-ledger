---
type: Service Guide
title: "Sổ Nghe Lời — Mobile (Expo)"
description: "How to run, configure and test the OWNER mobile app, including Firebase, speech and Core setup."
owner: FE owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-06T22:18:48+07:00 }
stale_after: 2027-01-05T22:18:48+07:00
---
# Sổ Nghe Lời — Mobile (Expo)

The OWNER app of Sổ Nghe Lời. The run mode comes entirely from env: `EXPO_PUBLIC_API_ENDPOINT`, `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE` and `EXPO_PUBLIC_MOCK_SHOPS` must be set (copy `.env.example`), and the app stops on launch if any is missing (`src/config.ts`). `USE_MOCK=false` uses the real Firebase and Core (see [Connect to the real Core](#connect-to-the-real-core)); set `EXPO_PUBLIC_USE_MOCK=true` so every Core call goes to the in-memory simulator `src/lib/mockCore.ts` — the app is testable right away, with no backend.

Stack: Expo SDK 57, React Native 0.86, expo-router, TypeScript, react-native-svg, the Plus Jakarta Sans font.

## Run

```bash
npm install
npx expo start          # scan the QR with Expo Go (a build that supports SDK 57)
npm run web             # or press w: run in the browser (440px frame)
npm run typecheck
npm test                # tests for the assistant answer parser (node --test, no device needed)
npm run export:web      # build static web into dist/
../../scripts/release/ios-device-release.sh   # default: build Release (staging Core) and install on the iOS Simulator; a menu picks a paired iPhone; --simulator, --device <name|UDID>, --check only checks
../../scripts/release/android-release.sh      # default on a machine: build a Release APK (staging Core) for the emulator ABI, install and open it on the Android emulator (starts the AVD if it is not running)
../../scripts/release/android-release.sh --build-only [--abis arm64-v8a]   # build the APK exactly like CI and print its size; --install [--device <serial>] installs on a phone through adb; --check only checks
```

The two local build scripts check the environment before building. When a new machine is missing something (Xcode, its license, CocoaPods, JDK 17, Android Studio and the SDK, Firebase files, an Apple ID, a provisioning profile, an iPhone that has not tapped Trust, Developer Mode, USB debugging, a phone with an unsupported ABI or an Android version that is too old, an installed build signed with a different key…), the script lists every error with its fix, then asks whether to open the download page, open Xcode or Android Studio, or run the fix command. It runs one fix at a time: when a command succeeds the script rechecks from the start, and when it opens a page or an app it stops so you can finish and run it again. When the iOS Simulator runtime or an AVD is missing, the script offers the command to download or create it. If the first Node on PATH differs from the pinned version (`NODE_MAJOR` in `mobile-release.yml`) and the pinned version is installed through Homebrew `node@22`, nvm, fnm, Volta, asdf, mise or n, the script uses the pinned version for that run (without changing the machine's default Node), reinstalls `node_modules` when the previous install ran on a different major, and records the Node path for Xcode in `ios/.xcode.env.local`. Terminal messages are in English.

## Try it with sample data

- Tap **Tạo tài khoản** at the bottom of the sign-in card and enter any email and password (6 characters or more); on the email verification screen just tap **Tôi đã xác minh**. Dev builds have a **Vào app** button under the card that goes straight to the sample user.
- Every email is a new user: after verification it goes through shop creation (name and industry). Only the **Vào app** button (dev builds) goes straight to the sample shop “Tiệm tạp hoá cô Thỏ”.
- The first time an account opens Tổng quan on a device, the app runs the overlay guide `src/components/GuideTour.tsx` (steps in `src/lib/guideSteps.ts`): it highlights each button (Đọc đơn, Chọn hàng, Quét mã, Trợ lý, Bobi, Thông báo, the quick-switch menu, the Đơn hàng tab, the Quản lý tab). Finishing or skipping is remembered on the device and the guide does not reopen by itself; replay it from Quản lý → Xem lại hướng dẫn.
- Reload the app to reset the in-memory data to its initial state.

## Screens

| Route | Screen |
| --- | --- |
| `/` | Splash |
| `/(auth)/welcome`, `/email`, `/verify-email`, `/profile`, `/setup` | Choose a sign-in method, email and password (sign up, forgot password), email verification, first-time name entry, shop creation |
| `/(tabs)` | Home: revenue today/this week/this month, tasks to handle, suggestions and best sellers |
| `/analytics` | Analysis by period: revenue, trend by hour/day of week/week of month, expenses, estimated gross profit, best sellers, debts |
| `/(tabs)/invoices` | Orders: infinite scroll, 20 orders at a time; time filter and search run in Core |
| `/(tabs)/sales` | Sales: opens straight to the paged catalog (20 items per page, search/filter/sort in Core), pick items and view the cart; the Zen ring (drag and drop, snaps to the left/right edge, keeps its position across tabs) opens Q&A, Đọc đơn or today's report |
| `/(tabs)/more` | Management: profile, reports, goods, expenses, debts, settings and sign out |
| `/expenses` | Expenses by month, expense breakdown, add an expense by voice / manual entry |
| `/voice` | Đọc đơn: type text or hold the mic button, offer to add unknown items to the catalog, edit quantities. Mic: web uses the Web Speech API (`vi-VN`); Android uses the sherpa-onnx model on the device (see “Speech recognition on Android”), with no fake sample phrases any more. When nothing is supported the app says so and uses the Nhập tay button |
| `/pos` | Quick item picking in a grid, the cart, quickly adding an item to the catalog |
| `/checkout` | Payment: cash (change), bank transfer (illustrative QR), credit |
| `/invoice/[id]` | Internal sale detail: view the order, void it in full and view the refund; no printing/sale editing yet |
| `/products` | Goods and stock, add/edit/delete, simulated “AI photo” |
| `/debts` | Debt book: partial / full repayment, history, call / remind |
| `/bestsellers` | Best-seller ranking, slow-seller suggestions |
| `/profile` | Edit shop details (name, address, industry), saved to Core through `PATCH /api/v1/shops/{shopId}`; full name, email, Facebook and bank account are stored only on the device |
| `/settings` | Sound, vibration, read back the order, auto-open printing |
| `/notifications` | In-app notifications |
| `/ai` | Q&A with the assistant through `src/lib/agentApi.ts` → Core `/api/v1/agent/*`; conversation history. Assistant answers go through `components/ChatText.tsx` and are read by `lib/chatMarkdown.ts` for both streaming text and stored answers: `**bold**`, `` `code` ``, headings, `-`/`1.` lists, tables, ```chart blocks (bar/area charts) and ```actions blocks (`splitActions` separates them from the text; buttons that open screens per `SCREEN_LINKS` show in a separate card under the bubble, only once the answer is complete); other markup shows as plain text. With mocks on, `mockCore` answers with fake data; ask with the word "biểu đồ" or "bảng" to see tables and charts, and ask "sắp hết hàng" to see the screen button card under the bubble |
| `/printer` | K80/K58 printer settings screen; no device connection yet |
| `/debug` | Connection diagnostics, dev builds only (see [Debug](#debug)) |

`/staff` still has a route file but no entry point: the product has only the OWNER and ADMIN roles.

## Try order recognition

The “Nhập tên hàng + giá” field on the `/voice` screen runs the rule-based recognizer in `src/lib/parseOrder.ts`. Examples:

- `2 ly cà phê sữa 50 nghìn, thêm 1 trà đá`
- `bán 3 bánh mì 45k, 2 coca`
- `lấy 1 chục trứng với 2 gói mì`
- `bán 1 hộp sữa chua nếp cẩm 12k` → the item does not exist yet, so the app asks whether to add it to the catalog
- `bánh mì 20k cà phê 20k` or saying “bánh mì hai mươi nghìn cà phê hai mươi nghìn” → two items, each with its own price

Text from the mic (or typed) goes through `parseOrder()` (`src/lib/parseOrder.ts`); the app does not call AI to recognize orders yet. The speech model outputs one run-on sentence with no punctuation and numbers spoken as words, so `parseOrder` reads amounts written as digits (`20k`, `20.000đ`, `1,5tr`) as well as words (`hai mươi nghìn`, `hai lăm ca`) and splits items in three ways: (1) punctuation and connecting words (`và`, `với`, `thêm`, `kèm`, `cùng`, `rồi`, `nha`, `nhé`); (2) each spoken price ends an item (“bánh mì 20k cà phê 20k” → two priced items; an item not in stock prompts to add it to the catalog with the price prefilled); (3) a run-on sentence with several items in stock is cut before each item name, stepping back over the quantity and unit right before it (“hai cà phê sữa một bánh mì thịt”). Limits: several items not in stock, with no price and no connecting word, are still merged into one; a price spoken before the item name and a price without a currency unit (“bánh mì hai mươi”) are not recognized; an item in stock always takes the stock price, and a spoken price is only used to split items. “Chi”, “mua”, “trả”, “nộp”… open an expense only at the start of a clause, after a price or after an item in stock (so “trà sữa 30k”, “chị lấy bánh mì 20k”, “bánh mì ba chỉ 20k” are items, not expenses). `src/sst/` is an old skeleton that never ran a real model and no screen uses it; the working speech recognition is in `src/lib/speech/`.

### Speech recognition on Android

The Đọc đơn screen recognizes speech on Android with a Vietnamese streaming Zipformer model that runs on the device (the `react-native-sherpa-onnx` library, with native mic capture). The code is in `src/lib/speech/` (`sherpaEngine.ts`; the pure, testable part in `core.ts`).

- **Needs a new dev client:** the library has a native module, so the dev client must be rebuilt (`npx eas-cli build --profile dev-client --platform android`) after installing it. An older build without the module shows “chưa hỗ trợ ghi âm giọng nói” on the Đọc đơn screen instead of crashing.
- **The model is not in git** (49 MB). The files go in `assets/models/` (see `assets/models/README.md`); the app downloads them into app storage from `EXPO_PUBLIC_STT_MODEL_URL` the first time the Đọc đơn screen opens. During development, run `node scripts/serve-stt-model.js` to serve that folder, then set `EXPO_PUBLIC_STT_MODEL_URL=http://10.0.2.2:8090/` (emulator) or `http://<computer IP>:8090/` (a real phone; port 8090 must be open in the firewall).
- **Embed the model in the APK (offline):** the plugin `plugins/withBundledSttModel.js` copies the model into `android/app/src/main/assets/models/stt-model-<version>/` on `expo prebuild`; if the `android/` folder is already generated, run `node plugins/withBundledSttModel.js`. The app detects the embedded model (`listAssetModels`) and skips the download; the library copies it into app storage on first launch. If the build machine has no model, the plugin only warns and the APK falls back to the download above. The folder name comes from `STT_MODEL_VERSION` in `src/lib/speech/core.ts`.
- **Library patch:** `react-native-sherpa-onnx` 0.4.4 hard-codes `modelType = "zipformer"` for every transducer model, so a `zipformer2` model (like the one in use) crashes the app on load. `patches/react-native-sherpa-onnx+0.4.4.patch` (applied automatically by `postinstall` through `patch-package`, including on EAS build machines) leaves this value empty so sherpa-onnx detects the type from metadata. When upgrading the library, review the patch, and any patch change requires rebuilding the dev client.
- **Microphone permission:** the app asks for permission when the Đọc đơn screen opens. While the mic button is held, a “Mức mic” bar measures the real microphone; when no text comes out, the app says “micro không thu được âm thanh” or “có tiếng nhưng chưa nhận ra chữ”.
- **FFmpeg and libarchive are off:** `plugins/withAndroidApkSize.js` sets `sherpaOnnxDisableFfmpeg` and `sherpaOnnxDisableLibarchive` because the app only recognizes PCM from the mic and downloads the model file by file. The library's `convertAudio*`, `decodeAudioFileToFloatSamples` (for non-WAV files) and `extractTarBz2` therefore fail; to use them, remove the flags in the plugin and remove the matching `.so` files from `packagingOptions.exclude` in `app.json`.
- **Not checked / not done:** iOS; menu hotwords (`bpe.model`); tuning the sentence-end timeout; Android 15+ requires native libraries aligned to 16 KB for Google Play (the sherpa-onnx `.so` files need checking).

### Android APK size

Release builds use these settings (measured on `arm64-v8a`, same commit: 95.2 MB → 40.3 MB; see [CI/CD](../../docs/development/ci-cd.md#measured-and-not-yet-verified)):

- `expo-build-properties` in `app.json`: `useLegacyPackaging` compresses the `.so` files in the APK (previously stored uncompressed, taking 62 MB); `enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds` enable R8 and drop unused resources; `packagingOptions.exclude` drops the FFmpeg and libarchive `.so` files.
- `extraProguardRules` keeps the `com.k2fsa.sherpa.onnx.**` and `com.sherpaonnx.**` classes intact: sherpa-onnx native code reads them by name and the library ships no R8 rules for them. If another native library crashes in release (but not in debug), suspect R8 first and add a `-keep` rule here.
- `plugins/withAndroidApkSize.js`: disables FFmpeg and libarchive in sherpa-onnx (see Speech recognition on Android) and keeps only the `vi` and `en` strings of the libraries.
- Remeasure: `scripts/release/apk-contents.sh <file.apk>` prints the size by ABI, dex, resources, assets and the 40 largest files; `scripts/release/android-release.sh` (run locally and in CI) calls it after every APK build.
- Trade-off: native libraries are extracted onto the device at install, so the installed size is larger than the APK file; installs from Google Play (AAB) are not affected.

## Structure

```
app/                    routes (expo-router)
src/
  theme.ts              colors, fonts, radii, shadows (per the prototype)
  config.ts             EXPO_PUBLIC_API_ENDPOINT, EXPO_PUBLIC_USE_MOCK
  data/types.ts         shared data types
  data/mock.ts          sample data + invoice/expense generators based on the current date
  store/AppStore.tsx    app-wide state (context) + every action, calls Core through lib/*Api.ts
  lib/                  money/date formatting, statistics, rule-based order recognizer
  lib/auth/             sign-in: the AuthClient interface, mock, Firebase (native + web)
  lib/api.ts            Core client (Bearer Firebase ID token, X-Shop-Id, Idempotency-Key, standard errors); USE_MOCK → mockCore
  lib/*Api.ts           session, catalog, customer, sales, debt, expense, agent
  lib/mockCore.ts       in-memory simulation of the Core endpoints
  lib/useCoreData.ts    loads orders, products, debts, expenses from Core for Home, Management, Analytics, Best sellers, Notifications
  lib/usePagedList.ts   infinite list, 20 rows at a time (Orders); lib/usePagedPage.ts paged list (Sales)
  lib/checkoutSession.ts keeps the draft between payment taps so a retry does not record a duplicate sale
  lib/speech/           on-device speech recognition (Android): model download, mic capture, sherpa-onnx; core.ts is the pure part
  sst/                  old speech recognition skeleton (never ran a real model), not used by any screen
  components/           UI kit, charts, logo, toast, illustrative QR
```

## Set up Firebase (email, Facebook and Google sign-in)

The code is already wired per `docs/contracts/api-contracts.md`: Firebase authenticates (email and password, Facebook or Google) → the app sends the Firebase ID token (`Authorization: Bearer …`) to `POST /api/v1/auth/session` → receives a `SessionView` (role, shops, `needsOnboarding`). With `EXPO_PUBLIC_USE_MOCK=true` the app runs simulated (no Firebase calls); with `false` it uses the real Firebase and Core. You only need to install packages and fill in configuration:

1. **Firebase Console** → Authentication → Sign-in method → enable **Email/Password** (and **Facebook**, **Google** if used; see the sections below). The app no longer signs in with a phone number.
   - Templates → *Email address verification* and *Password reset*: set the sender name and subject; set *Reply-to* to the project's support email (Firebase sends from `noreply@…firebaseapp.com`; sending from your own address needs custom SMTP).
   - Settings → *Authorized domains*: add the web build's domain (localhost is already there).
2. **Add apps** in Project settings → Your apps:
   - **Web** → take the 4 values for `.env` (`EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`).
   - **Android** (package `vn.teamhexa.songheloi`) → download `google-services.json`; add the **SHA-1 and SHA-256** of the build keystore (`npx eas-cli credentials -p android`).
   - **iOS** (bundle `vn.teamhexa.songheloi`) → download `GoogleService-Info.plist`; upload an **APNs key** under Cloud Messaging so SMS verification does not need reCAPTCHA.
   - Put both files in `frontend/mobile/`.
3. **Install the native packages** (in `frontend/mobile`; the Firebase JS SDK for web is already in dependencies):
   ```bash
   npx expo install @react-native-firebase/app @react-native-firebase/auth expo-build-properties
   ```
4. **`app.json`** already configures `googleServicesFile` for `android`/`ios` and the plugins:
   ```json
   ["@react-native-firebase/app", { "ios": { "disableSPM": true } }],
   "@react-native-firebase/auth",
   ["expo-build-properties", { "ios": { "useFrameworks": "static", "usePrecompiledModules": false } }]
   ```
   `disableSPM` avoids a `pod install` error when Firebase installs through SPM together with static frameworks; `usePrecompiledModules: false` avoids a launch crash from a missing `FirebaseCoreInternal.framework`. The `ios/` folder is generated from `app.json` (gitignored), so do not edit it by hand.
5. **`.env`** (copied from `.env.example`): `EXPO_PUBLIC_USE_MOCK=false`, `EXPO_PUBLIC_API_ENDPOINT=<Core URL>`, plus the 4 Firebase web variables. To try Firebase alone without Core, set `EXPO_PUBLIC_MOCK_CORE=true` (simulates `/auth/session`, `/me`, `/shops`). After changing `.env`, rerun `npx expo start --clear` (Metro caches old values).
6. **Run**:
   - Web: `npm run web` — uses the Firebase JS SDK + invisible reCAPTCHA.
   - Android/iOS: **does not run in Expo Go** (React Native Firebase needs native code). Create a development build: `npx eas-cli build --profile dev-client --platform android` (the `development` profile does not receive `GOOGLE_SERVICES_JSON`, see below), install it and run `npx expo start --dev-client`. iOS needs an Apple Developer account.

Profiles in `eas.json`:

- `development`: development client, internal install.
- `dev-client`: extends `development` but uses the `preview` environment to receive the `GOOGLE_SERVICES_JSON` file variable and produce an APK. Use it to try Firebase sign-in and call the real Core from the Android emulator: install the APK on the emulator, set `EXPO_PUBLIC_API_ENDPOINT` in `.env` per [Connect to the real Core](#connect-to-the-real-core) with `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE` and `EXPO_PUBLIC_MOCK_SHOPS` all `false`, then run `npx expo start --dev-client --android`. JS loads from Metro, so changing the Core address only needs an `.env` edit and a Metro restart, not an APK rebuild. It shares the `phone-test` keystore, so it installs over that build and uses the same SHA registered in Firebase.
- `preview`: internal install build, an APK on Android.
- `phone-test`: extends `preview`, real Firebase with a simulated Core session (`MOCK_CORE`, `MOCK_SHOPS`) to try Firebase (email) sign-in on a real device before Core is deployed; the business screens still call the real API, so they show network errors when Core is unreachable.
- `production`: auto-increments the build number.

`google-services.json` is gitignored, so EAS builds cannot see it. `app.config.js` reads the path from the file-type environment variable `GOOGLE_SERVICES_JSON` (`eas env:create --type file`, currently set in the `preview` environment); local machines still use `./google-services.json`. `.env` does not reach EAS either, so each profile must set its own `EXPO_PUBLIC_*` variables. Every build keystore needs its SHA-1/SHA-256 added to Firebase before sign-in works.

Where the code lives: `src/lib/auth/` (the `AuthClient` interface; `mock.ts`, `firebase.ts` for native, `firebase.web.ts` for web), `src/lib/api.ts` (Bearer + `X-Shop-Id` + `{code,message,traceId}` errors, 401 → sign out), `src/lib/sessionApi.ts` (`/auth/session`, `/me`, `/shops`), and the sign-in flow in `src/store/AppStore.tsx` (`signIn`, `logout`, startup waits for Firebase to restore the session).

### Connect to the real Core

Flow: Firebase authenticates (email or Facebook) → FE sends the **Firebase ID token** (`Authorization: Bearer …`) to Core → Core verifies it with the Firebase Admin SDK, creates/finds the account and returns the session.

1. First sign-in: `POST /api/v1/auth/session` with `{ displayName }`. Core **requires** `displayName` for a new account (missing → 400), so the app has the “Bạn tên gì?” screen (`app/(auth)/profile.tsx`). Later sign-ins do not send it.
2. Reopening the app: Firebase restores the session → `GET /api/v1/me`. `404 auth_profile_not_found` (still signed in to Firebase but Core has no account) → the app returns to the name screen. `401` → sign out. `403 account_disabled` → sign out and report that the account is locked.
3. `needsOnboarding = true` (no shop yet) → the shop creation screen, which calls the real `POST /shops` (Core stores `industry` as a string — the chosen industries are joined with ", ").

The business APIs (catalog/products, customers, POS/checkout creating a draft then confirming, orders, debts, expenses, assistant) all need the `X-Shop-Id` header; the contract is in [API contracts](../../docs/contracts/api-contracts.md). With the real Core, mobile uses the `src/lib/*Api.ts` clients for the connected flows; Home/Analytics do not call `/api/v1/reports/summary` yet (see [Home/Analytics metrics](#homeanalytics-metrics)). `SaleDraft.confirm` accepts any `initialPaidVnd` from 0 to the order total — when underpaid, Core (`SaleDraftServiceImpl.confirm`/`customerForConfirmation`) creates a `Debt` for the customer (it needs an existing `customerId` or a `customerName` so Core can create a new customer; with neither it fails with `customer_required_for_debt`); this matches the mobile credit payment screen. `EXPO_PUBLIC_USE_MOCK=true` enables a preview mode without the real Core — `src/lib/mockCore.ts` simulates those endpoints in memory.

Mobile checkout currently requires a `productId` for every item. The “Món ngoài danh mục” flow quickly creates a Product with `tracked=false`, then adds it to the cart; it does not use a custom item with `productId=null` yet, although Core supports it.

During mobile development the app calls the staging Core on the VPS (deployed from the `staging` branch, see [CI/CD](../../docs/development/ci-cd.md)), so dev machines need no backend or Docker. The staging domain is fixed and does not change between deploys. `.env`:

```
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_MOCK_CORE=false
EXPO_PUBLIC_MOCK_SHOPS=false
EXPO_PUBLIC_API_ENDPOINT=https://staging.103-162-31-93.sslip.io
```

- Data created from the app lives in the staging database, shared with the whole team and the UAT environment.
- The app calls the Core merged into `staging`; unmerged APIs cannot be called yet.
- The app's Firebase (`google-services.json`, the `EXPO_PUBLIC_FIREBASE_*` variables) must be the same project as the staging Core's `FIREBASE_PROJECT_ID`, otherwise Core returns `401`.

Run Core locally only when changing the backend (see [Local development](../../docs/development/local-development.md#run-each-service)); then set `EXPO_PUBLIC_API_ENDPOINT=http://<LAN IP of the machine running Core>:8000` (Android emulator: `http://10.0.2.2:8000`, port `8000` when running with Compose). Core needs a `FIREBASE_PROJECT_ID` matching the project of `google-services.json` and a service account file (see `backend/core/.env.example`). The phone and the machine running Core must be on the same network.

### Home/Analytics metrics

Home and Analytics load the sale/product/debt/expense lists through [`useCoreData.ts`](src/lib/useCoreData.ts), convert the data with [`coreAdapters.ts`](src/lib/coreAdapters.ts), then compute metrics on the device with [`stats.ts`](src/lib/stats.ts). This is not the Core summary response:

- Orders use `soldAt` as the sale time; orders currently `VOIDED` are excluded and periods are filtered by device time. Voiding an order from an earlier period can change that old period's figures, instead of creating an adjustment in the `voidedAt` period as Core does.
- Revenue is the total of the remaining orders, without separating `grossRevenueVnd`, `voidedRevenueVnd`, `netRevenueVnd` or cash flow by `receivedAt`/`refundedAt`.
- Gross profit is revenue minus the **estimated** cost of goods, before operating expenses. Cost comes from the current catalog; without `costPriceVnd` the adapter estimates 60% of the catalog selling price, and a line that matches no product uses 60% of the line unit price. This is not a historical cost snapshot or official profit.

The standard Core summary definition is in [API contract — Period overview](../../docs/contracts/api-contracts.md#period-overview). Moving FE to the summary needs its own integration task and acceptance; editing this document does not prove that mobile reports match Core or meet `FR-006`/`AC-031`.

### Email and password sign-in

The first screen is a card in the Runpod layout (`app/(auth)/welcome.tsx`): Google and Zalo buttons, an **Địa chỉ email** field with a **Tiếp tục** button to `app/(auth)/email.tsx` (email prefilled), **Quên mật khẩu?** and the card footer **Chưa có tài khoản? Tạo tài khoản**; the most recent successful sign-in method on the device has a **Lần trước dùng** label (`src/lib/lastSignInStorage.ts`). There is no Facebook button any more; Zalo is clickable when the build has Zalo configuration (Android: `EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID`, web: `EXPO_PUBLIC_ZALO_LOGIN=true`), otherwise it shows the “Sắp có” label; the app no longer signs in with a phone number.

- **Tạo tài khoản** self-registers through Firebase (`createUserWithEmailAndPassword`, nobody needs to add the user in the Console), sends a verification email (`sendEmailVerification`), then moves to `app/(auth)/verify-email.tsx`. Only when the user taps **Tôi đã xác minh** and Firebase reports `emailVerified` does the app send the Firebase ID token to Core (`POST /auth/session`). Reopening the app before verification returns to this screen. This is an app-side block; Core does not check `email_verified` yet.
- **Signing in** with an unverified email also goes through the verification screen (it does not resend the email by itself; tap **Gửi lại thư xác minh**, with 60 seconds between sends). A wrong email or password shows a “tạo tài khoản” or “đặt lại mật khẩu” suggestion instead of an error.
- **Forgot password** sends a reset email (`sendPasswordResetEmail`); an unregistered email also reports that it was sent, so it does not reveal which emails have accounts.
- Email/Password must be enabled in Firebase Console → Authentication → Sign-in method; set *Reply-to* of both email templates under Templates. The optional variable `EXPO_PUBLIC_SUPPORT_EMAIL` shows the “Cần hỗ trợ?” line on the verification screen.

### Facebook sign-in

The sign-in screen has dropped the Facebook button; the Facebook sign-in code and SDK are kept so it can be turned back on. With the button, the flow signs in through the Facebook SDK (`react-native-fbsdk-next`), then exchanges the access token for a Firebase account (`FacebookAuthProvider.credential` + `signInWithCredential`, in `src/lib/auth/firebase.ts`). After that the flow matches email: send the Firebase ID token to Core (`POST /auth/session`); a new account (Core requires `displayName`) goes through the "Bạn tên gì?" screen, then shop creation. Core stores only the Firebase UID, so it needs no change. The web uses Firebase's popup window; the mock build signs in as a sample user (`facebook.demo@example.com`).

One-time setup (done by the Facebook app and Firebase administrator):

1. **Meta for Developers:** create an app and add the Facebook Login product. Take the **App ID** (App settings → Basic), the **App Secret** (same page) and the **Client Token** (App settings → Advanced → Security). Add the **Android** platform: package name `vn.teamhexa.songheloi`, class name `vn.teamhexa.songheloi.MainActivity`, and the signing key's **key hash** (Base64 of the SHA-1: EAS key `QU+neYI9yeNs0x2cI7KScGEbywI=`, debug key `Xo8WBi6jzSxKDVR4drqm84yr9iU=`; a Google Play build also needs the Google key's hash). While the app is in Development mode, only people with a role in the app can sign in; switch it to Live for others.
2. **Firebase Console → Authentication → Sign-in method:** enable **Facebook** and paste the App ID and App Secret. Add the redirect address Firebase shows (`<project>.firebaseapp.com/__/auth/handler`) to Facebook Login → Valid OAuth Redirect URIs.
3. **Build:** `app.config.js` adds the Facebook plugin only when `FACEBOOK_APP_ID` and `FACEBOOK_CLIENT_TOKEN` are present (set in `.env` when running `npx expo prebuild --platform android`, or as EAS environment variables). These two values are not committed to the public repo, and **the App Secret never goes into the app or `.env`**. The library has native code, so the dev client/APK must be rebuilt, and it **does not run in Expo Go**; without configuration, tapping the button shows a clear error instead of crashing. If the `android/` folder is already generated, rerun prebuild after changing the two variables.

Limits: each sign-in method is a separate Firebase account, so the same person signing in another way becomes a different Core user unless the accounts are linked in Firebase (not done). If the Facebook email is already used by another sign-in method, Firebase can return `account-exists-with-different-credential` and the app tells the user to use the earlier method. Not checked: iOS, and real Facebook sign-in on a device.

### Google sign-in

The Google button on the first screen (`app/(auth)/welcome.tsx`) uses `@react-native-google-signin/google-signin` on phones: Google returns an ID token, the app exchanges it for a Firebase account (`GoogleAuthProvider.credential` + `signInWithCredential`, in `src/lib/auth/firebase.ts`), then continues like Facebook (Core `POST /auth/session`, new accounts go through the "Bạn tên gì?" screen). The web uses Firebase's Google popup (`signInWithPopup`); the mock build signs in as the sample user `google.demo@example.com`. Signing out also signs out of Google so the account picker shows again next time. Core needs no change.

One-time setup, on **each** Firebase project (staging `smart-ledger-c2892` for `android-dev`/`android-staging`, production `smart-ledger-production` for `android-production`):

1. **Authentication → Sign-in method:** enable **Google**.
2. **Project settings → Your apps → Android `vn.teamhexa.songheloi` → Add fingerprint:** add the SHA-1 and SHA-256 of every signing key whose builds point at that project. Staging: the debug key (`android/app/debug.keystore`, SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`). Production: the release key (SHA-1 `F9:2B:40:76:E8:B8:01:BB:B9:D8:6E:78:8E:A5:3E:87:C2:54:A1:D5`; the workflow prints the certificate in the "Publish the APK to R2" step), and later the Google Play key. Do not add the debug key to production: it is public in the repo. A build signed with a key whose SHA is missing is rejected by Google (`DEVELOPER_ERROR`, the app shows "Cách đăng nhập này chưa dùng được").
3. **Download `google-services.json` again** (it must have an `oauth_client` with `client_type` 1 carrying the SHA-1 above and one with `client_type` 3), then update the `ANDROID_GOOGLE_SERVICES_JSON` secret of the matching GitHub environment. `app.config.js` reads the Web client ID (`client_type` 3) from this file into `extra.googleWebClientId`, so there is no separate environment variable.
4. **Web:** add the web build's domain to Authentication → Settings → Authorized domains.

The library has native code, so the APK must be rebuilt. The `@react-native-google-signin/google-signin` plugin in `app.json` attaches the iOS client from `GoogleService-Info.plist` on iOS prebuild; on iOS the library uses that client by itself, so the Web client ID is not required there (it is on Android). Not checked: iOS. The account linking limit is the same as Facebook (see above).

## UI tests with Playwright

Tests in `e2e/` run the Expo web build with mock data on port 8090 and need no Firebase or Core. Playwright starts the server and stops it when done; the first Metro build takes a few minutes.

```bash
npx playwright install chromium
npm run test:e2e
```

Add `-- --headed` to watch the browser, `-- --ui` to step through. The report is in `e2e-report/`, screenshots and traces of failing tests in `e2e-results/`.

## Debug

- **Logs:** only in dev builds (`__DEV__`), everything prefixed with `[api]`, `[auth]`, `[session]`. Tokens, passwords and full phone numbers/emails are never logged. View them in the terminal running `npx expo start --dev-client` (press `j` to open React Native DevTools), or:
  ```bash
  adb logcat -s ReactNativeJS
  ```
- **The “Chẩn đoán kết nối” screen** (`/debug`, internal use in dev builds only): shows the mode (mock/real), `API_ENDPOINT`, Firebase status, a **Kiểm tra kết nối Core** button (calls `/v3/api-docs` without a token), **Xem token** (aud/iss/expiry; Core needs `FIREBASE_PROJECT_ID` to match `aud`), **Gọi GET /me**, and the recent log. This screen is not in the Quản lý tab.
- **Run the web build for a quick try (no APK build needed):** `npm run web` and sign in with email. Core accepts only origins in `CORS_ALLOWED_ORIGINS` (see [CI/CD](../../docs/development/ci-cd.md)), so the dev machine's `localhost` is blocked; run the dev proxy in another terminal and point the app at it:
  ```bash
  CORE_URL=https://staging.103-162-31-93.sslip.io node scripts/dev-cors-proxy.js
  ```
  and set `EXPO_PUBLIC_API_ENDPOINT=http://127.0.0.1:8010` in `.env` (rerun `npm run web -- --clear` after the change). Without `CORE_URL` the proxy points at the local Core (`http://localhost:8000`). For Firebase alone without Core, set `EXPO_PUBLIC_MOCK_CORE=true` and skip the proxy. The web cannot test native adapters, phone sign-in on a real device or Android networking.
- **Timeout:** every Core call stops after 15 seconds (`ApiError` code `timeout`) instead of spinning forever on a wrong IP or a blocking firewall.
- **Common errors:** `network` = Core unreachable (IP, firewall, Android blocking HTTP); `timeout` = the firewall drops packets; `401 unauthorized` = the token does not match Core's project; `400 validation_failed` on `/auth/session` = a new account needs `displayName` (normal); `provider-disabled` = the sign-in method is not enabled in Firebase Console.

Not done: Apple sign-in (Facebook: see above), Zalo on iOS (Core has no flow for it), AI order recognition (the Đọc đơn screen still uses `parseOrder()` on the device).

Note: the bank transfer QR code is illustrative only and does not confirm a bank transaction.

## Vercel browser preview

`vercel.json` configures the Expo export to `dist/` and routes Expo Router paths to the SPA entry. CD builds the web app and uploads it to Vercel (the `deploy-web` job in `cd.yml`, called by CI after the `mobile-web` job passes): `staging` has a fixed alias and `main` is production; pull requests have no preview for now because of the Vercel Hobby limit of 100 deploys per day. The `EXPO_PUBLIC_*` variables are set in the GitHub Environments `vercel-preview`/`vercel-staging`/`vercel-production`, not on Vercel; see [CI/CD](../../docs/development/ci-cd.md#mobile-web-on-vercel).

`EXPO_PUBLIC_*` variables are baked into the browser bundle, so never put service-account keys there. The web preview helps check the responsive UI and flows against the staging Core; it does not replace native testing on iOS/Android.
