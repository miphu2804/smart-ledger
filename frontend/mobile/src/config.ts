/**
 * Environment configuration for the mobile app.
 * Expo exposes only variables prefixed with EXPO_PUBLIC_ in the bundle (see .env.example).
 *
 * API_ENDPOINT and the three mock flags are required environment values with no defaults: if a value is missing or a
 * flag is not true/false, the app fails at launch instead of silently using the wrong mode. Read the values directly
 * from `process.env.EXPO_PUBLIC_X` so Expo can substitute them in the bundle during the build.
 */
export const API_ENDPOINT = requiredEnv('EXPO_PUBLIC_API_ENDPOINT', process.env.EXPO_PUBLIC_API_ENDPOINT);
export const USE_MOCK = envFlag('EXPO_PUBLIC_USE_MOCK', process.env.EXPO_PUBLIC_USE_MOCK);
/**
 * Simulated Core session and profile calls. This is always enabled when USE_MOCK=true; set EXPO_PUBLIC_MOCK_CORE=true
 * to use real Firebase authentication while keeping Core calls simulated for isolated client testing.
 */
export const USE_MOCK_CORE = envFlag('EXPO_PUBLIC_MOCK_CORE', process.env.EXPO_PUBLIC_MOCK_CORE) || USE_MOCK;
/**
 * Simulate only shop creation and update. Core provides POST /api/v1/shops; set EXPO_PUBLIC_MOCK_SHOPS=true when a
 * test must avoid that real call. Mock shops live only in the client-side simulator and are not deployment evidence.
 */
export const USE_MOCK_SHOPS = envFlag('EXPO_PUBLIC_MOCK_SHOPS', process.env.EXPO_PUBLIC_MOCK_SHOPS) || USE_MOCK_CORE;

/**
 * Firebase Auth (sign-in and email verification), used only when USE_MOCK=false.
 * - Web (Expo web): reads the EXPO_PUBLIC_FIREBASE_* values below (Firebase Console → Project settings → Your apps → Web).
 * - Android/iOS: reads from google-services.json / GoogleService-Info.plist (see the mobile README).
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

/**
 * Android speech recognition (the sherpa-onnx model runs on the device). The app downloads model files from this base
 * URL into app storage when the voice screen first needs them (see assets/models/README.md). It should end with `/`;
 * when empty, the microphone flow reports that no model is available.
 */
export const STT_MODEL_URL = process.env.EXPO_PUBLIC_STT_MODEL_URL ?? '';

/**
 * URL of the released APK's version.json (for example, https://pub-xxx.r2.dev/android/production/version.json).
 * CD writes this file after a release; when set, Android checks for a newer version. Empty disables the check for
 * development builds and Play Store distribution.
 */
export const APP_UPDATE_URL = (process.env.EXPO_PUBLIC_UPDATE_URL ?? '').trim();

/**
 * Enables the Zalo button on web (sign-in through the Zalo window, contract Zalo CORE-015). Set `true` only when
 * that environment has Core `ZALO_ENABLED` and the web origin in `ZALO_CLIENT_ORIGINS`; otherwise the button says
 * "Sắp có". Android uses the native client ID below instead.
 */
export const ZALO_LOGIN_ENABLED = process.env.EXPO_PUBLIC_ZALO_LOGIN === 'true';

/**
 * Android Zalo sign-in (contract Zalo CORE-016): the value must be the `ZALO_NATIVE_CLIENT_ID` for the target Core
 * environment. When set at build time, Android enables the "Zalo" button and declares the App Link
 * `https://<Core>/mobile/auth/zalo/complete` (see app.config.js); when empty, the button says "Sắp có". Core must
 * also enable `ZALO_NATIVE_ENABLED` for this package and the signing certificate SHA-256, or the App Link cannot
 * return to the app.
 */
export const ZALO_NATIVE_CLIENT_ID = (process.env.EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID ?? '').trim();

/** Support email shown on the email-verification screen; empty means that contact line is hidden. */
/** Public product pages: policy (/chinh-sach) and account deletion instructions (/delete-account). */
export const WEBSITE_URL = 'https://songheloi.id.vn';

export const SUPPORT_EMAIL = (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '').trim();

function requiredEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`${name} chưa đặt (xem frontend/mobile/.env.example)`);
  return value;
}

function envFlag(name: string, value: string | undefined): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} phải là true hoặc false, đang là ${JSON.stringify(value)} (xem frontend/mobile/.env.example)`);
}
