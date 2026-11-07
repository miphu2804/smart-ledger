---
type: Service Guide
title: "Sổ Nghe Lời — Mobile (Expo)"
description: "How to run, configure and test the OWNER mobile app, including Firebase, speech and Core setup."
owner: FE owner
author: miphu2804
status: stable
stale_after: 2027-01-05T22:18:48+07:00
---
# Sổ Nghe Lời — Mobile (Expo)

The OWNER mobile app is an Expo Router application. The route tree is under `app/`: `(auth)` contains onboarding, `(tabs)` contains the main navigation, and protected top-level routes include sales, orders, assistant, reports, settings and `/voice`. Shared behavior is under `src/`, with Core clients in `src/lib/*Api.ts` and application state in `src/store/AppStore.tsx`.

Source review: `staging` commit `a2766ee3a37e23c0f03fd43383b608c1b2fac898`. This guide describes the checked-in implementation. Code presence does not prove that a build is deployed or that a product acceptance criterion has passed; deployment and integrated acceptance are not verified here.

## Run and test

From this directory:

```bash
npm install
npx expo start
npm run web
npm run typecheck
npm run export:web
npm test
npm run test:e2e
```

`npm run test:e2e` starts the Expo web test server with the mock configuration from `playwright.config.ts`; install Playwright Chromium first when needed:

```bash
npx playwright install chromium
```

Use a development client for native modules. Expo Go is not sufficient for React Native Firebase or `react-native-sherpa-onnx`:

```bash
npx eas-cli build --profile dev-client --platform android
npx expo start --dev-client
```

The repository release scripts can build and install native artifacts when their documented prerequisites are available. They do not replace device testing or production acceptance.

## Required environment and mock safety

Copy `.env.example` to `.env`, or use the repository secrets workflow. `src/config.ts` intentionally fails at launch unless all four values below are explicit and valid:

```dotenv
EXPO_PUBLIC_API_ENDPOINT=https://<core-host>
EXPO_PUBLIC_USE_MOCK=false
EXPO_PUBLIC_MOCK_CORE=false
EXPO_PUBLIC_MOCK_SHOPS=false
```

`EXPO_PUBLIC_USE_MOCK` enables the in-memory simulator. `EXPO_PUBLIC_MOCK_CORE` simulates Core session calls, and `EXPO_PUBLIC_MOCK_SHOPS` simulates shop creation/update. `USE_MOCK` implies the other mock paths, but the variables must still be present and explicitly `true` or `false`. Keep mocks enabled only for local or test scenarios; simulated data is not evidence of Core availability, deployment or acceptance.

The real Firebase/Core path uses a Firebase ID token and the existing API client. Shop onboarding calls Core `POST /api/v1/shops`; the shop mock flag remains useful when testing without that real call. Business requests use the existing auth and shop context. Read the endpoint status and payload contract in [`docs/contracts/api-contracts.md`](../../docs/contracts/api-contracts.md) before changing a client.

## Firebase and Core setup

For real authentication, set the four web variables in `.env` and provide the native Firebase files required by `app.json`:

- Web: `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_APP_ID`.
- Android: `google-services.json` for the configured application and signing certificate.
- iOS: `GoogleService-Info.plist` and the required Apple/Firebase configuration.

The native files are not committed. EAS receives file secrets through its environment configuration; `.env` values are not automatically copied into EAS builds. After changing environment values, restart Metro with a cleared cache.

For local Core development, use the address reachable from the device (`http://10.0.2.2:8000` for the Android emulator when Core listens on the host). For a browser against a remote Core, use `scripts/dev-cors-proxy.js` and point `EXPO_PUBLIC_API_ENDPOINT` at the local proxy. Never put service-account keys or other secrets in `EXPO_PUBLIC_*` variables because they are bundled into the client.

### Google Analytics

`@react-native-firebase/analytics` sends usage events to GA4 only after the user agrees in the one-time prompt after sign-in or in Settings ([ADR-0010](../../docs/architecture/adr/0010-mobile-usage-analytics-ga4.md)). Each Firebase project sends to its own GA4 property: `android-production` builds to the production property used for product metrics, `android-dev` and `android-staging` builds to the staging property used for testing; the event catalogue is `src/lib/analyticsEvents.ts`.

## Android speech recognition

The `/voice` screen accepts typed input everywhere and uses the browser Web Speech API where available. Android native recording uses the streaming Vietnamese transducer model through `react-native-sherpa-onnx` in `src/lib/speech/`. An older development client without the native module reports an unsupported capability instead of importing the module at screen load.

The model is not tracked in git. See [`assets/models/README.md`](assets/models/README.md) for the four required files, expected sizes, the trusted local model server and the optional R2 source. Set `EXPO_PUBLIC_STT_MODEL_URL` when the model is not embedded. The Android config plugin can embed the model during prebuild; otherwise the app downloads missing files into app storage. Rebuild the native development client after changing the native speech dependency or patch.

The current native path requests microphone permission, captures 16 kHz mono PCM, reports microphone level, and validates downloaded file sizes. iOS native speech is not provided by this implementation. Model availability, native-library compatibility and device behavior still require runtime verification on the target build.

## Order parsing boundary

The `/voice` screen passes typed or transcribed text to `src/lib/parseOrder.ts`. `parseOrder()` is a deterministic, rule-based parser: it recognizes quantities, units, prices and known products, returns unknown or ambiguous items for user handling, and can produce expense drafts that the caller must confirm. It is not AI order recognition and does not call the AI service.

Keep parser examples and edge cases in [`tests/parseOrder.test.ts`](tests/parseOrder.test.ts). When changing parsing behavior, update focused tests and preserve the confirmation step before saving expenses or adding unknown products.

## Detailed operations

The FE-owned [Mobile integration and native operations](docs/operations.md) guide preserves release commands, provider setup, speech-library patches, APK packaging, diagnostics and report-calculation limitations. Its measurements and device/provider evidence retain their original limits; the guide is not fresh device acceptance.

## Repository workflow and diagnostics

- Follow the root [`AGENTS.md`](../../AGENTS.md) and the additive mobile rules in [`AGENTS.md`](AGENTS.md) before editing.
- Keep visual changes aligned with `src/theme.ts`, shared components and measured layout; a passing typecheck is not visual verification. Use an Android or iOS runtime and an actual screenshot for visual claims.
- The development-only `/debug` route reports mock mode, endpoint, Firebase status and recent API diagnostics. Logs are development-only and must not contain tokens, passwords or complete personal identifiers.
- The illustrative bank-transfer QR does not confirm a payment.
- Use [`docs/development/local-development.md`](../../docs/development/local-development.md) for cross-service setup and [`docs/development/ci-cd.md`](../../docs/development/ci-cd.md) for release/deployment ownership. Do not infer live deployment from this README.
