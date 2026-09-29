import { FIREBASE_WEB_CONFIG } from '../../config';
import { debugLog, maskId } from '../debug';
import { mapFirebaseError } from './firebaseErrors';
import { AuthClient, AuthError } from './types';

/**
 * Firebase Auth trên web (expo web) bằng Firebase JS SDK — xác thực SĐT qua reCAPTCHA vô hình.
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

const HOLDER_ID = 'recaptcha-container';
let verifier: any = null;

/** Mỗi lần gửi OTP dùng một reCAPTCHA mới (verifier cũ đã dùng thì không tái sử dụng được). */
function freshVerifier({ m, auth }: Loaded) {
  verifier?.clear?.();
  document.getElementById(HOLDER_ID)?.remove();
  const holder = document.createElement('div');
  holder.id = HOLDER_ID;
  document.body.appendChild(holder);
  verifier = new m.RecaptchaVerifier(auth, holder, { size: 'invisible' });
  return verifier;
}

export const firebaseAuth: AuthClient = {
  async sendOtp(phone) {
    const sdk = load();
    debugLog('auth', 'sendOtp →', maskId(phone));
    try {
      const result = await sdk.m.signInWithPhoneNumber(sdk.auth, phone, freshVerifier(sdk));
      return {
        async confirm(code) {
          try {
            await result.confirm(code);
            debugLog('auth', 'confirm OTP ✓');
          } catch (e) {
            throw mapFirebaseError(e);
          }
        },
      };
    } catch (e) {
      verifier?.clear?.();
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
