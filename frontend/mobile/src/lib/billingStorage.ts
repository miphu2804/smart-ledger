import { File, Paths } from 'expo-file-system';
import type { StoredPayment } from './billing';
import { debugLog } from './debug';

/**
 * Yêu cầu thanh toán đang theo dõi của từng tài khoản, bản Android/iOS: một file JSON trong thư mục tài liệu của app.
 * Web: `billingStorage.web.ts`. Mở lại màn mua gói thì tiếp tục yêu cầu này thay vì tạo yêu cầu thứ hai.
 */
const file = () => new File(Paths.document, 'billing-pending.json');

type Store = Record<string, StoredPayment>;

async function readAll(): Promise<Store> {
  try {
    const f = file();
    if (!f.exists) return {};
    const data = JSON.parse(await f.text());
    return data && typeof data === 'object' ? (data as Store) : {};
  } catch (e) {
    debugLog('billing', 'đọc yêu cầu thanh toán ✗', String(e));
    return {};
  }
}

function writeAll(store: Store) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(store));
  } catch (e) {
    debugLog('billing', 'lưu yêu cầu thanh toán ✗', String(e));
  }
}

export async function loadStoredPayment(userId: string): Promise<StoredPayment | null> {
  const item = (await readAll())[userId];
  return item && typeof item.id === 'number' ? item : null;
}

export async function saveStoredPayment(userId: string, payment: StoredPayment): Promise<void> {
  writeAll({ ...(await readAll()), [userId]: payment });
}

export async function clearStoredPayment(userId: string): Promise<void> {
  const all = await readAll();
  if (!(userId in all)) return;
  delete all[userId];
  writeAll(all);
}
