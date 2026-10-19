import { AppState, Linking, Platform, type AppStateStatus } from 'react-native';
import { API_ENDPOINT, USE_MOCK, ZALO_NATIVE_CLIENT_ID } from '../config';
import { apiRequest } from './api';
import { ApiError } from './apiError';
import { authClient, AuthError } from './auth';
import { challengeFor, originOf, randomToken, readZaloReturn } from './auth/zaloProof';
import { debugLog } from './debug';

/**
 * Đăng nhập Zalo trên Android theo CORE-016 (docs/contracts/api-contracts.md): mở trình duyệt ngoài tới
 * `/auth/zalo/native/authorize`, Zalo đăng nhập trên web, Core redirect về `https://<core>/mobile/auth/zalo/complete#…` và
 * App Link (assetlinks.json của Core khớp package + chứng chỉ của APK) mở lại app với `handoffReference`. App đổi reference
 * (kèm `clientVerifier` chỉ app giữ trong bộ nhớ) lấy Firebase custom token rồi đăng nhập Firebase; màn đăng nhập mở phiên
 * Core như các cách khác. Không dùng Zalo SDK hay WebView. iOS chưa có luồng ở Core nên vẫn "Sắp có". Bản web: `zaloLogin.web.ts`.
 * Cần `EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID` đúng `ZALO_NATIVE_CLIENT_ID` của Core môi trường đó lúc build.
 */
export const ZALO_LOGIN_AVAILABLE = Platform.OS === 'android' && (USE_MOCK || ZALO_NATIVE_CLIENT_ID !== '');

const CORE_ORIGIN = originOf(API_ENDPOINT);
/** Lượt bỏ dở quá lâu thì dừng chờ (phiên Zalo ở Core mặc định hết hạn sau 300 giây). */
const FLOW_TIMEOUT_MS = 5 * 60_000;
/** Quay lại app mà App Link chưa tới: chờ thêm chút (App Link và sự kiện app active tới gần nhau) rồi coi như huỷ. */
const RETURN_GRACE_MS = 2_000;

export async function signInWithZalo(): Promise<{ displayName: string }> {
  if (!ZALO_LOGIN_AVAILABLE) {
    throw new AuthError('not-configured', 'Bản build này chưa bật đăng nhập Zalo (thiếu EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID)');
  }
  if (USE_MOCK) {
    // Bản giả lập không có Zalo thật: đăng nhập Firebase giả với một người dùng Zalo mẫu (giống bản web)
    await authClient.signInWithCustomToken('mock-zalo');
    return { displayName: 'Khách Zalo' };
  }
  const nativeClientId = ZALO_NATIVE_CLIENT_ID;
  const clientVerifier = randomToken();
  const requestId = randomToken(24);
  const clientChallenge = await challengeFor(clientVerifier);
  const query = [
    ['nativeClientId', nativeClientId],
    ['purpose', 'LOGIN'],
    ['requestId', requestId],
    ['clientChallenge', clientChallenge],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const handoff = waitForReturn({ nativeClientId, requestId });
  debugLog('auth', 'zalo (android) → mở trình duyệt');
  try {
    await Linking.openURL(`${API_ENDPOINT}/api/v1/auth/zalo/native/authorize?${query}`);
  } catch {
    handoff.cancel();
    throw new AuthError('unknown', 'Không mở được trình duyệt để đăng nhập Zalo');
  }
  const handoffReference = await handoff.promise;

  const res = await apiRequest<{ firebaseCustomToken: string; displayName: string }>('/auth/zalo/native/exchange', {
    method: 'POST',
    body: { nativeClientId, requestId, handoffReference, clientVerifier },
    handle401: false,
    anonymous: true,
  });
  await authClient.signInWithCustomToken(res.firebaseCustomToken);
  debugLog('auth', 'zalo (android) ✓');
  return { displayName: res.displayName };
}

/** Chờ App Link của đúng lượt này; người dùng quay lại app mà không có link (đóng trình duyệt, bấm back) thì coi như huỷ. */
function waitForReturn(expected: { nativeClientId: string; requestId: string }) {
  let cancel = () => undefined as void;
  const promise = new Promise<string>((resolve, reject) => {
    let finished = false;
    let leftApp = false;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const finish = (settle: () => void) => {
      if (finished) return;
      finished = true;
      linkSub.remove();
      stateSub.remove();
      clearTimeout(timeout);
      if (grace) clearTimeout(grace);
      settle();
    };
    cancel = () => finish(() => reject(new AuthError('cancelled')));
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      const result = readZaloReturn(url, { coreOrigin: CORE_ORIGIN, purpose: 'LOGIN', ...expected });
      if (result.kind === 'ignore') return;
      if (result.kind === 'handoff') finish(() => resolve(result.handoffReference));
      else {
        debugLog('auth', 'zalo (android) trả lỗi', result.error);
        // Mã lỗi cố định trong fragment (hết hạn, Zalo không phản hồi, đang tắt…) hiện như lỗi Core cùng mã
        finish(() =>
          reject(
            result.error === 'zalo_consent_denied'
              ? new AuthError('cancelled')
              : new ApiError(0, result.error, 'Không đăng nhập được bằng Zalo. Vui lòng thử lại'),
          ),
        );
      }
    });
    const stateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') {
        leftApp = true;
        return;
      }
      if (!leftApp || grace) return;
      grace = setTimeout(() => finish(() => reject(new AuthError('cancelled'))), RETURN_GRACE_MS);
    });
    const timeout = setTimeout(
      () => finish(() => reject(new AuthError('unknown', 'Đăng nhập Zalo quá lâu. Vui lòng thử lại'))),
      FLOW_TIMEOUT_MS,
    );
  });
  return { promise, cancel: () => cancel() };
}
