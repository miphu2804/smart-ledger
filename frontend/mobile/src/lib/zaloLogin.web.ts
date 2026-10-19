import { API_ENDPOINT, USE_MOCK, ZALO_LOGIN_ENABLED } from '../config';
import { apiRequest } from './api';
import { ApiError } from './apiError';
import { authClient, AuthError } from './auth';
import { challengeFor, randomToken, readZaloMessage, type ZaloPurpose } from './auth/zaloProof';
import { debugLog } from './debug';

/**
 * Đăng nhập Zalo trên web theo hợp đồng Zalo CORE-015: Core mở trang Zalo trong popup, trang callback của Core gửi `proof`
 * về cửa sổ app bằng postMessage, app đổi proof (kèm `clientVerifier` chỉ app giữ) lấy Firebase custom token rồi đăng nhập
 * Firebase. Bước mở phiên Core (`/auth/session`) do màn đăng nhập gọi như các cách khác.
 * Cần Core bật `ZALO_ENABLED` và có origin của trang này trong `ZALO_CLIENT_ORIGINS`; bản build bật bằng EXPO_PUBLIC_ZALO_LOGIN.
 */
export const ZALO_LOGIN_AVAILABLE = USE_MOCK || ZALO_LOGIN_ENABLED;

/** Lượt đăng nhập bỏ dở quá lâu thì dừng chờ (phiên Zalo ở Core mặc định hết hạn sau 300 giây). */
const FLOW_TIMEOUT_MS = 5 * 60_000;
/** Trang callback gửi message rồi tự đóng popup: thấy popup đã đóng thì chờ thêm chút cho message kịp tới. */
const CLOSE_GRACE_MS = 1_000;

export async function signInWithZalo(): Promise<{ displayName: string }> {
  if (USE_MOCK) {
    // Bản giả lập không có Zalo thật: đăng nhập Firebase giả với một người dùng Zalo mẫu
    await authClient.signInWithCustomToken('mock-zalo');
    return { displayName: 'Khách Zalo' };
  }
  const { proof, clientVerifier } = await zaloProof('LOGIN');
  const res = await apiRequest<{ firebaseCustomToken: string; displayName: string }>('/auth/zalo/exchange', {
    method: 'POST',
    body: { proof, clientVerifier },
    handle401: false,
    anonymous: true,
  });
  await authClient.signInWithCustomToken(res.firebaseCustomToken);
  debugLog('auth', 'zalo ✓');
  return { displayName: res.displayName };
}

/**
 * Mở popup của Core và chờ proof. Popup phải mở ngay trong lượt bấm, trước mọi `await`, nếu không trình duyệt (nhất là
 * Safari trên iPhone) chặn cửa sổ bật lên; vì vậy mở trang trống trước rồi mới tính challenge và gán địa chỉ.
 */
function zaloProof(purpose: ZaloPurpose): Promise<{ proof: string; clientVerifier: string }> {
  const popup = window.open('', 'smartledger-zalo', 'popup,width=480,height=720');
  if (!popup) {
    return Promise.reject(
      new AuthError('unknown', 'Trình duyệt đã chặn cửa sổ đăng nhập Zalo. Hãy cho phép cửa sổ bật lên rồi thử lại'),
    );
  }
  const coreOrigin = new URL(API_ENDPOINT).origin;
  const clientVerifier = randomToken();
  const requestId = randomToken(24);

  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (settle: () => void) => {
      if (finished) return;
      finished = true;
      window.removeEventListener('message', onMessage);
      clearInterval(watch);
      clearTimeout(timeout);
      if (!popup.closed) popup.close();
      settle();
    };
    const onMessage = (event: MessageEvent) => {
      const result = readZaloMessage(event.origin, event.source === popup, event.data, { coreOrigin, requestId, purpose });
      if (result.kind === 'ignore') return;
      if (result.kind === 'proof') finish(() => resolve({ proof: result.proof, clientVerifier }));
      else {
        debugLog('auth', 'zalo popup ✗', result.error);
        // Người dùng từ chối cấp quyền trên Zalo: coi như huỷ, không báo lỗi. Mã lỗi khác (Zalo không phản hồi, hết hạn,
        // đang tắt…) hiện như lỗi Core cùng mã, giống bản Android; mã lạ thì câu chung
        finish(() =>
          reject(
            result.error === 'zalo_consent_denied'
              ? new AuthError('cancelled')
              : new ApiError(0, result.error, 'Không đăng nhập được bằng Zalo. Vui lòng thử lại'),
          ),
        );
      }
    };
    window.addEventListener('message', onMessage);
    // Người dùng tự đóng popup: không có message nào tới thì coi như huỷ
    const watch = setInterval(() => {
      if (!popup.closed) return;
      clearInterval(watch);
      setTimeout(() => finish(() => reject(new AuthError('cancelled'))), CLOSE_GRACE_MS);
    }, 500);
    const timeout = setTimeout(
      () => finish(() => reject(new AuthError('unknown', 'Đăng nhập Zalo quá lâu. Vui lòng thử lại'))),
      FLOW_TIMEOUT_MS,
    );

    challengeFor(clientVerifier)
      .then((clientChallenge) => {
        if (finished) return;
        const query = new URLSearchParams({ purpose, clientOrigin: window.location.origin, requestId, clientChallenge });
        popup.location.href = `${API_ENDPOINT}/api/v1/auth/zalo/authorize?${query.toString()}`;
      })
      .catch(() => finish(() => reject(new AuthError('unknown', 'Trình duyệt này không hỗ trợ đăng nhập Zalo'))));
  });
}
