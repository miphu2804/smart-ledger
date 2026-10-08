import Constants from 'expo-constants';
import { debugLog, maskId } from '../debug';
import { mapFirebaseError } from './firebaseErrors';
import { AuthClient, AuthError } from './types';

/**
 * Firebase Auth trên Android / iOS bằng React Native Firebase — cần development build, KHÔNG chạy trên Expo Go.
 * Bản web dùng firebase.web.ts (Metro tự chọn theo nền tảng).
 *
 * Gói được nạp lười trong try/catch: chưa cài Firebase thì bản mock / Expo Go vẫn chạy bình thường,
 * và chỉ khi USE_MOCK=false mới báo AuthError('not-configured') kèm hướng dẫn.
 * Hỗ trợ cả API modular (getAuth, signInWithPhoneNumber…) lẫn API namespaced cũ (auth().…).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loaded = { m: any; auth: any };

function load(): Loaded {
  let m: any;
  try {
    m = require('@react-native-firebase/auth');
  } catch {
    throw new AuthError('not-configured', 'Chưa cài @react-native-firebase/auth (xem README, mục “Gắn Firebase”)');
  }
  try {
    return { m, auth: typeof m.getAuth === 'function' ? m.getAuth() : m.default() };
  } catch {
    throw new AuthError(
      'not-configured',
      'Firebase chưa khởi tạo: cần development build và file google-services.json / GoogleService-Info.plist (không chạy trên Expo Go)',
    );
  }
}

/**
 * Facebook SDK nạp lười để bản dev client cũ (chưa có mô-đun native của Facebook) không sập ngay khi mở app.
 * `extra.facebookConfigured` do app.config.js đặt khi có FACEBOOK_APP_ID và FACEBOOK_CLIENT_TOKEN lúc build.
 */
function loadFacebook(): any {
  if (!(Constants.expoConfig?.extra as { facebookConfigured?: boolean } | undefined)?.facebookConfigured) {
    throw new AuthError(
      'not-configured',
      'Bản build này chưa cấu hình đăng nhập Facebook: cần FACEBOOK_APP_ID và FACEBOOK_CLIENT_TOKEN lúc build (xem README, mục “Đăng nhập Facebook”)',
    );
  }
  try {
    return require('react-native-fbsdk-next');
  } catch {
    throw new AuthError('not-configured', 'Bản build này chưa có Facebook SDK: cần build lại development build (xem README, mục “Đăng nhập Facebook”)');
  }
}

export const firebaseAuth: AuthClient = {
  async signInWithFacebook() {
    const { m, auth } = load();
    const fb = loadFacebook();
    debugLog('auth', 'signInWithFacebook →');
    try {
      // Chỉ xin public_profile: Meta tự cấp cho mọi app nên không cần xét duyệt. `email` phải thêm vào trường hợp sử dụng
      // trong Meta Dashboard và có thể kéo theo xét duyệt khi mở cho người ngoài; chưa thêm thì Facebook báo "Invalid Scopes: email".
      const result = await fb.LoginManager.logInWithPermissions(['public_profile']);
      if (result?.isCancelled) throw new AuthError('cancelled');
      const token = await fb.AccessToken.getCurrentAccessToken();
      if (!token?.accessToken) throw new AuthError('unknown', 'Facebook không trả về mã đăng nhập. Vui lòng thử lại');
      const provider = m.FacebookAuthProvider ?? m.default?.FacebookAuthProvider;
      const credential = provider.credential(token.accessToken);
      if (typeof m.signInWithCredential === 'function') await m.signInWithCredential(auth, credential);
      else await auth.signInWithCredential(credential);
      debugLog('auth', 'signInWithFacebook ✓');
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  async sendOtp(phone) {
    const { m, auth } = load();
    debugLog('auth', 'sendOtp →', maskId(phone));
    try {
      const conf =
        typeof m.signInWithPhoneNumber === 'function'
          ? await m.signInWithPhoneNumber(auth, phone)
          : await auth.signInWithPhoneNumber(phone);
      return {
        async confirm(code) {
          try {
            await conf.confirm(code);
            debugLog('auth', 'confirm OTP ✓');
          } catch (e) {
            // Android có thể tự xác minh SMS (instant verification): người dùng đã được đăng nhập trước khi kịp nhập mã
            if (auth.currentUser?.phoneNumber === phone) return;
            throw mapFirebaseError(e);
          }
        },
      };
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  async signInWithEmail(email, password) {
    const { m, auth } = load();
    debugLog('auth', 'signInWithEmail →', maskId(email));
    try {
      if (typeof m.signInWithEmailAndPassword === 'function') await m.signInWithEmailAndPassword(auth, email.trim(), password);
      else await auth.signInWithEmailAndPassword(email.trim(), password);
      debugLog('auth', 'signInWithEmail ✓');
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  async signUpWithEmail(email, password) {
    const { m, auth } = load();
    debugLog('auth', 'signUpWithEmail →', maskId(email));
    try {
      if (typeof m.createUserWithEmailAndPassword === 'function') await m.createUserWithEmailAndPassword(auth, email.trim(), password);
      else await auth.createUserWithEmailAndPassword(email.trim(), password);
      debugLog('auth', 'signUpWithEmail ✓');
    } catch (e) {
      throw mapFirebaseError(e);
    }
  },

  async getIdToken(forceRefresh) {
    const { auth } = load();
    return (await auth.currentUser?.getIdToken(forceRefresh)) ?? null;
  },

  async signOut() {
    const { m, auth } = load();
    if (typeof m.signOut === 'function') await m.signOut(auth);
    else await auth.signOut();
    // Facebook SDK giữ phiên riêng; không đăng xuất thì lần sau không hỏi lại tài khoản. Lỗi ở đây không được chặn đăng xuất.
    try {
      loadFacebook().LoginManager.logOut();
    } catch {
      /* chưa có Facebook SDK trong bản build này */
    }
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
      const handler = (user: unknown) => {
        debugLog('auth', 'trạng thái đăng nhập →', !!user);
        cb(!!user);
      };
      return typeof m.onAuthStateChanged === 'function' ? m.onAuthStateChanged(auth, handler) : auth.onAuthStateChanged(handler);
    } catch {
      // Chưa cài / chưa cấu hình Firebase: coi như chưa đăng nhập để màn splash không bị treo
      void Promise.resolve().then(() => cb(false));
      return () => undefined;
    }
  },
};
