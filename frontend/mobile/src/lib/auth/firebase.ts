import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { debugLog, maskId } from '../debug';
import { mapFirebaseError } from './firebaseErrors';
import { AuthClient, AuthError } from './types';

/**
 * Firebase Auth trên Android / iOS bằng React Native Firebase — cần development build, KHÔNG chạy trên Expo Go.
 * Bản web dùng firebase.web.ts (Metro tự chọn theo nền tảng).
 *
 * Gói được nạp lười trong try/catch: chưa cài Firebase thì bản mock / Expo Go vẫn chạy bình thường,
 * và chỉ khi USE_MOCK=false mới báo AuthError('not-configured') kèm hướng dẫn.
 * Hỗ trợ cả API modular (getAuth, signInWithEmailAndPassword…) lẫn API namespaced cũ (auth().…).
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

/**
 * Thư viện Google Sign-In nạp lười như Facebook: bản build cũ chưa có mô-đun native vẫn mở được app.
 * Web client ID lấy từ `extra.googleWebClientId` (app.config.js đọc trong google-services.json lúc build). Android bắt buộc
 * có nó thì Google mới trả ID token; iOS tự lấy client iOS trong GoogleService-Info.plist (plugin của thư viện gắn vào lúc
 * prebuild) và token đó Firebase cũng nhận, nên ở iOS Web client ID là tuỳ chọn.
 */
let googleConfigured = false;
function loadGoogle(): any {
  const webClientId = (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)?.googleWebClientId;
  if (!webClientId && Platform.OS === 'android') {
    throw new AuthError(
      'not-configured',
      'Bản build này chưa có Web client ID của Google: google-services.json lúc build thiếu oauth_client client_type 3 (bật Google trong Firebase rồi tải lại file)',
    );
  }
  try {
    const g = require('@react-native-google-signin/google-signin');
    if (!googleConfigured) {
      g.GoogleSignin.configure({ webClientId });
      googleConfigured = true;
    }
    return g;
  } catch {
    throw new AuthError('not-configured', 'Bản build này chưa có thư viện Google Sign-In: cần build lại APK');
  }
}

/** Lỗi riêng của thư viện Google (mã của nó không có tiền tố auth/), còn lại để mapFirebaseError xử lý. */
function mapGoogleError(e: unknown, statusCodes: Record<string, string>): AuthError {
  if (e instanceof AuthError) return e;
  const code = String((e as { code?: unknown })?.code ?? '');
  if (code === statusCodes.SIGN_IN_CANCELLED) return new AuthError('cancelled');
  if (code === statusCodes.IN_PROGRESS) return new AuthError('unknown', 'Đang mở đăng nhập Google, vui lòng đợi');
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return new AuthError('unknown', 'Máy chưa có hoặc cần cập nhật Google Play Services để đăng nhập bằng Google');
  }
  // DEVELOPER_ERROR (10): Google không nhận cặp tên gói + SHA-1 của khoá đã ký bản này
  if (code === '10' || code === 'DEVELOPER_ERROR') {
    debugLog('auth', 'Google lỗi DEVELOPER_ERROR:', (e as { message?: string })?.message ?? '');
    return new AuthError('not-configured', 'Google từ chối bản build này (DEVELOPER_ERROR): SHA-1 của khoá ký chưa có trong Firebase project');
  }
  return mapFirebaseError(e);
}

export const firebaseAuth: AuthClient = {
  async signInWithGoogle() {
    const { m, auth } = load();
    const { GoogleSignin, statusCodes } = loadGoogle();
    debugLog('auth', 'signInWithGoogle →');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (result?.type === 'cancelled') throw new AuthError('cancelled');
      const idToken = result?.data?.idToken;
      if (!idToken) throw new AuthError('unknown', 'Google không trả về mã đăng nhập. Vui lòng thử lại');
      const provider = m.GoogleAuthProvider ?? m.default?.GoogleAuthProvider;
      const credential = provider.credential(idToken);
      if (typeof m.signInWithCredential === 'function') await m.signInWithCredential(auth, credential);
      else await auth.signInWithCredential(credential);
      debugLog('auth', 'signInWithGoogle ✓');
    } catch (e) {
      throw mapGoogleError(e, statusCodes);
    }
  },

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

  async sendPasswordReset(email) {
    const { m, auth } = load();
    debugLog('auth', 'sendPasswordReset →', maskId(email));
    try {
      if (typeof m.sendPasswordResetEmail === 'function') await m.sendPasswordResetEmail(auth, email.trim());
      else await auth.sendPasswordResetEmail(email.trim());
      debugLog('auth', 'sendPasswordReset ✓');
    } catch (e) {
      // Email chưa có tài khoản: coi như đã gửi, để không lộ email nào đã đăng ký
      if (String((e as { code?: unknown })?.code ?? '').replace(/^auth\//, '') === 'user-not-found') return;
      throw mapFirebaseError(e);
    }
  },

  async sendEmailVerification() {
    const { m, auth } = load();
    const user = auth.currentUser;
    if (!user) throw new AuthError('unknown');
    try {
      if (typeof m.sendEmailVerification === 'function') await m.sendEmailVerification(user);
      else await user.sendEmailVerification();
      debugLog('auth', 'sendEmailVerification ✓');
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
      if (typeof m.reload === 'function') await m.reload(user);
      else await user.reload();
      const fresh = auth.currentUser ?? user;
      if (fresh.emailVerified) await fresh.getIdToken(true); // đưa cờ email_verified vào token mới
      debugLog('auth', 'refreshEmailVerified →', !!fresh.emailVerified);
      return !!fresh.emailVerified;
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

  hasPassword() {
    try {
      const user = load().auth.currentUser;
      return !!user?.email && (user.providerData ?? []).some((p: { providerId?: string }) => p?.providerId === 'password');
    } catch {
      return false;
    }
  },

  async changePassword(currentPassword, newPassword) {
    const { m, auth } = load();
    const user = auth.currentUser;
    if (!user?.email) throw new AuthError('unknown');
    debugLog('auth', 'changePassword →');
    try {
      // Firebase đòi đăng nhập gần đây mới cho đổi mật khẩu: xác thực lại bằng mật khẩu hiện tại ngay trước khi đổi
      const provider = m.EmailAuthProvider ?? m.default?.EmailAuthProvider;
      const credential = provider.credential(user.email, currentPassword);
      if (typeof m.reauthenticateWithCredential === 'function') await m.reauthenticateWithCredential(user, credential);
      else await user.reauthenticateWithCredential(credential);
      if (typeof m.updatePassword === 'function') await m.updatePassword(user, newPassword);
      else await user.updatePassword(newPassword);
      debugLog('auth', 'changePassword ✓');
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
    // Google cũng nhớ tài khoản đã chọn; đăng xuất để lần sau hiện lại hộp chọn tài khoản
    try {
      await loadGoogle().GoogleSignin.signOut();
    } catch {
      /* chưa có thư viện Google hoặc chưa cấu hình trong bản build này */
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
