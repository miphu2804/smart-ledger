import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ApiError } from './apiError';
import { keepStoredPayment, type PaymentRequest, type Subscription } from './billing';
import { getPaymentRequest, getSubscription } from './billingApi';
import { clearStoredPayment, loadStoredPayment } from './billingStorage';

/**
 * Khoá lưu yêu cầu thanh toán trên máy: id tài khoản Core. Lối "Vào app" chỉ có ở bản dev chưa có id nên dùng khoá 'dev'.
 */
export function billingOwnerKey(userId: string | null): string | null {
  return userId ?? (__DEV__ ? 'dev' : null);
}

/**
 * Gói đang dùng và yêu cầu thanh toán còn theo dõi của tài khoản, tải lại mỗi lần màn được mở lại.
 * Lỗi đọc gói (ví dụ Core chưa bật billing, 503) không chặn màn: bên gọi vẫn hiện danh sách gói.
 */
export function useBillingStatus(userId: string | null) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [pending, setPending] = useState<PaymentRequest | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const run = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++run.current;
    const [sub, req] = await Promise.all([
      getSubscription().then(
        (s) => ({ ok: true as const, s }),
        (e: unknown) => ({ ok: false as const, e }),
      ),
      trackedPayment(billingOwnerKey(userId)),
    ]);
    if (mine !== run.current) return;
    if (sub.ok) {
      setSubscription(sub.s);
      setError(null);
    } else {
      setError(sub.e);
    }
    setPending(req);
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { subscription, pending, error, loading, reload };
}

/** Yêu cầu đã lưu trên máy, đọc lại trạng thái từ Core; bỏ khi đã kích hoạt, quá hạn hẳn hoặc Core không còn thấy. */
async function trackedPayment(userId: string | null): Promise<PaymentRequest | null> {
  if (!userId) return null;
  const stored = await loadStoredPayment(userId);
  if (!stored) return null;
  try {
    const req = await getPaymentRequest(stored.id);
    if (keepStoredPayment(req, Date.now())) return req;
    await clearStoredPayment(userId);
    return null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) await clearStoredPayment(userId);
    return null;
  }
}
