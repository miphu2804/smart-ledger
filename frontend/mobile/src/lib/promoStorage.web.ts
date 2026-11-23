import { parsePromoState, type PromoState } from './promo';

/** Trạng thái quảng cáo mua gói, bản web: `localStorage` (bị chặn thì chỉ không nhớ được, không lỗi). */
const KEY = 'plan-promo';

function readAll(): Record<string, unknown> {
  try {
    const data = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function loadPromoState(owner: string): Promise<PromoState> {
  return parsePromoState(readAll()[owner]);
}

export async function savePromoState(owner: string, state: PromoState): Promise<void> {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [owner]: state }));
  } catch {
    // Chế độ ẩn danh hoặc bị chặn lưu: bỏ qua
  }
}
