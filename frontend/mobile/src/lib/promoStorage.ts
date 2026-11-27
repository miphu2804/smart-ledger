import { File, Paths } from 'expo-file-system';
import { debugLog } from './debug';
import { parsePromoState, type PromoState } from './promo';

/** Trạng thái quảng cáo mua gói theo tài khoản, bản Android/iOS: một file JSON. Web: `promoStorage.web.ts`. */
const file = () => new File(Paths.document, 'plan-promo.json');

async function readAll(): Promise<Record<string, unknown>> {
  try {
    const f = file();
    if (!f.exists) return {};
    const data = JSON.parse(await f.text());
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch (e) {
    debugLog('promo', 'đọc trạng thái quảng cáo ✗', String(e));
    return {};
  }
}

export async function loadPromoState(owner: string): Promise<PromoState> {
  return parsePromoState((await readAll())[owner]);
}

export async function savePromoState(owner: string, state: PromoState): Promise<void> {
  try {
    const all = await readAll();
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify({ ...all, [owner]: state }));
  } catch (e) {
    debugLog('promo', 'lưu trạng thái quảng cáo ✗', String(e));
  }
}
