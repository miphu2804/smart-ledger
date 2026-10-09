import { FIREBASE_WEB_CONFIG } from '../../config';
import { debugLog, maskId } from '../debug';
import { mapFirebaseError } from './firebaseErrors';
import { AuthClient, AuthError } from './types';

/**
 * Firebase Auth trên web (expo web) bằng Firebase JS SDK: email + mật khẩu (gồm quên mật khẩu, xác minh email) và popup Facebook.
 * Android / iOS dùng firebase.ts (React Native Firebase).
 *
 * Gói `firebase` được nạp lười trong try/catch: chưa cài thì bản mock vẫn chạy bình thường.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loaded = { m: any; auth: any };
let cached: Loaded | null = null;

function load(): Loaded {
  if (cached) return cached;
  const c = FIREBASE_WEB_CONFIG;
  if (!c.apiKey || !c.projectId || !c.appId) {
    throw new AuthError('not-configured', 'Thiếu cấu hình Firebase: đặt các biến EXPO_PUBLIC_FIREBASE_* trong .env (xem README)');
  }
  let appMod: any;
  let m: any;
  try {
    appMod = require('firebase/app');
    m = require('firebase/auth');
  } catch {
    throw new AuthError('not-configured', 'Chưa cài gói “firebase” (npm install firebase — xem README, mục “Gắn Firebase”)');
  }
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(c);
  cached = { m, auth: m.getAuth(app) };
  return cached;
}

export const firebaseAuth: AuthClient = {
  /** Web dùng cửa sổ popup của Firebase (cần địa chỉ redirect của Firebase trong cấu hình Facebook Login). */
  async signInWithFacebook() {
    const { m, auth } = load();
    debugLog('auth', 'signInWithFacebook (web) →');
    try {
      // Mặc định chỉ có public_profile (xem ghi chú ở firebase.ts về quyền email)
      await m.signInWithPopup(auth, new m.FacebookAuthProvider());
      debugLog('auth', 'signInWithFacebook (web) ✓');
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  async sendPasswordReset(email) {
    const { m, auth } = load();
    debugLog('auth', 'sendPasswordReset (web) →', maskId(email));
    try {
      await m.sendPasswordResetEmail(auth, email.trim());
      debugLog('auth', 'sendPasswordReset (web) ✓');
    } catch (e) {
      // Email chưa có tài khoản: coi như đã gửi, để không lộ email nào đã đăng ký
      if (String((e as { code?: unknown })?.code ?? '').replace(/^auth\//, '') === 'user-not-found') return;
      throw mapFirebaseError(e);
    }
  },

  async sendEmailVerification() {
    const { m, auth } = load();
    if (!auth.currentUser) throw new AuthError('unknown');
    try {
      await m.sendEmailVerification(auth.currentUser);
      debugLog('auth', 'sendEmailVerification (web) ✓');
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  needsEmailVerification() {
    try {
      const user = load().auth.currentUser;
      return !!user && !user.emailVerified && (user.providerData ?? []).some((p: { providerId?: string }) => p?.providerId === 'password');
    } catch {
      return false;
    }
  },

  async refreshEmailVerified() {
    const { m, auth } = load();
    const user = auth.currentUser;
    if (!user) return false;
    try {
      await m.reload(user);
      const fresh = auth.currentUser ?? user;
      if (fresh.emailVerified) await fresh.getIdToken(true); // đưa cờ email_verified vào token mới
      return !!fresh.emailVerified;
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  async signInWithEmail(email, password) {
    const { m, auth } = load();
    debugLog('auth', 'signInWithEmail →', maskId(email));
    try {
      await m.signInWithEmailAndPassword(auth, email.trim(), password);
      debugLog('auth', 'signInWithEmail ✓');
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  async signUpWithEmail(email, password) {
    const { m, auth } = load();
    debugLog('auth', 'signUpWithEmail →', maskId(email));
    try {
      await m.createUserWithEmailAndPassword(auth, email.trim(), password);
      debugLog('auth', 'signUpWithEmail ✓');
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  async getIdToken(forceRefresh) {
    return (await load().auth.currentUser?.getIdToken(forceRefresh)) ?? null;
  },

  async signOut() {
    const { m, auth } = load();
    await m.signOut(auth);
  },

  currentEmail() {
    try {
      return load().auth.currentUser?.email ?? null;
    } catch {
      return null;
    }
  },

  currentPhone() {
    try {
      return load().auth.currentUser?.phoneNumber ?? null;
    } catch {
      return null;
    }
  },

  onAuthStateChanged(cb) {
    try {
      const { m, auth } = load();
      return m.onAuthStateChanged(auth, (user: unknown) => {
        debugLog('auth', 'trạng thái đăng nhập →', !!user);
        cb(!!user);
      });
    } catch {
      // Chưa cài / chưa cấu hình Firebase: coi như chưa đăng nhập để màn splash không bị treo
      void Promise.resolve().then(() => cb(false));
      return () => undefined;
    }
  },
};
