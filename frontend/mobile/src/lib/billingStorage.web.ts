import type { StoredPayment } from './billing';

/** Yêu cầu thanh toán đang theo dõi, bản web: `localStorage` (bị chặn thì chỉ không nhớ được, không lỗi). */
const KEY = 'billing-pending';

type Store = Record<string, StoredPayment>;

function readAll(): Store {
  try {
    const data = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return data && typeof data === 'object' ? (data as Store) : {};
  } catch {
    return {};
  }
}

function writeAll(store: Store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Chế độ ẩn danh hoặc bị chặn lưu: bỏ qua
  }
}

export async function loadStoredPayment(userId: string): Promise<StoredPayment | null> {
  const item = readAll()[userId];
  return item && typeof item.id === 'number' ? item : null;
}

export async function saveStoredPayment(userId: string, payment: StoredPayment): Promise<void> {
  writeAll({ ...readAll(), [userId]: payment });
}

export async function clearStoredPayment(userId: string): Promise<void> {
  const all = readAll();
  if (!(userId in all)) return;
  delete all[userId];
  writeAll(all);
}
