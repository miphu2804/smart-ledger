import { USE_MOCK_CORE, USE_MOCK_SHOPS } from '../config';
import { mockStore, mockUser } from '../data/mock';
import type { SessionView, ShopView } from '../data/types';
import { ApiError, apiRequest } from './api';
import { authClient } from './auth';
import { fromE164VN } from './auth/phone';
import { industriesToCore, type ShopChanges } from './shopProfile';

/**
 * Phiên đăng nhập với Core (backend/core, nhánh feat/auth-session):
 *   Firebase xác thực SĐT → FE gửi Firebase ID token (Bearer) → Core xác thực token, tạo/tìm tài khoản, trả phiên.
 *
 * - POST /api/v1/auth/session  body `{ displayName? }` — `displayName` BẮT BUỘC ở lần đăng nhập đầu của một tài khoản
 *   Firebase (thiếu → 400 validation_failed, details.field = displayName). Đăng nhập các lần sau không cần gửi.
 * - GET  /api/v1/me            — khôi phục phiên; 404 auth_profile_not_found nếu Core chưa có tài khoản.
 * - POST /api/v1/shops         — Core CHƯA có endpoint này (mới có auth), xem USE_MOCK_SHOPS.
 */

// ---- Core giả lập: mô phỏng đúng hành vi của Core thật (tài khoản mới phải gửi displayName) ----
interface MockAccount {
  name: string;
  shop?: ShopView;
}
const mockAccounts = new Map<string, MockAccount>(); // theo SĐT E.164

// Khoá tài khoản giả lập: SĐT (E.164) hoặc email của người đang đăng nhập
const mockKey = () => authClient.currentPhone() || authClient.currentEmail() || '+84901234567';

function mockAccountFor(phone: string): MockAccount | undefined {
  // Số 09 = tài khoản có sẵn với tiệm mẫu; số khác và mọi email là người dùng mới
  if (!mockAccounts.has(phone) && !phone.includes('@') && fromE164VN(phone).startsWith('09')) {
    mockAccounts.set(phone, {
      name: mockUser.name,
      shop: {
        id: 'mock-shop',
        name: mockStore.name,
        address: mockStore.address,
        industries: mockStore.industries,
        status: 'ACTIVE',
      },
    });
  }
  return mockAccounts.get(phone);
}

function mockView(phone: string, acc: MockAccount): SessionView {
  return {
    user: phone.includes('@')
      ? { id: 'mock-user', displayName: acc.name, email: phone, phone: null }
      : { id: 'mock-user', displayName: acc.name, phone },
    role: 'OWNER',
    shops: acc.shop ? [acc.shop] : [],
    needsOnboarding: !acc.shop,
  };
}

function mockCreate(displayName?: string): SessionView {
  const phone = mockKey();
  let acc = mockAccountFor(phone);
  if (!acc) {
    if (!displayName?.trim()) {
      throw new ApiError(400, 'validation_failed', 'displayName is required when creating a SmartLedger account.', undefined, [
        { field: 'displayName', issue: 'is required for a new account' },
      ]);
    }
    acc = { name: displayName.trim() };
    mockAccounts.set(phone, acc);
  }
  return mockView(phone, acc);
}

function mockMe(): SessionView {
  const phone = mockKey();
  const acc = mockAccountFor(phone);
  if (!acc) throw new ApiError(404, 'auth_profile_not_found', 'No SmartLedger profile exists for this Firebase account.');
  return mockView(phone, acc);
}

function mockCreateShop(input: { name: string; industries: string[] }): ShopView {
  const shop: ShopView = { id: 'mock-shop', name: input.name, industries: input.industries, status: 'ACTIVE' };
  const acc = mockAccounts.get(mockKey());
  if (acc) acc.shop = shop;
  return shop;
}

/** Giống Core: chỉ đổi các trường được gửi; địa chỉ rỗng là xoá địa chỉ. */
function mockUpdateShop(changes: ShopChanges): ShopView {
  const acc = mockAccounts.get(mockKey());
  if (!acc?.shop) throw new ApiError(404, 'shop_not_found', 'This shop is unavailable.');
  const shop = acc.shop;
  acc.shop = {
    ...shop,
    name: changes.name ?? shop.name,
    address: changes.address === undefined ? shop.address : changes.address || null,
    industries: changes.industries ?? shop.industries,
  };
  return acc.shop;
}

export const sessionApi = {
  /** POST /auth/session. Gửi `displayName` khi Core đòi (tài khoản mới). Lỗi: 400 (thiếu tên), 401, 403 account_disabled. */
  create: async (displayName?: string): Promise<SessionView> =>
    USE_MOCK_CORE
      ? mockCreate(displayName)
      : apiRequest<SessionView>('/auth/session', {
          method: 'POST',
          body: displayName ? { displayName } : {},
          handle401: false,
        }),

  /** GET /me: khôi phục phiên khi mở lại app (Firebase còn đăng nhập). */
  me: async (): Promise<SessionView> => (USE_MOCK_CORE ? mockMe() : apiRequest<SessionView>('/me')),

  /**
   * POST /shops: tạo tiệm lần đầu. Core lưu MỘT ngành dạng chuỗi (`industry`), không phải mảng như UI cho chọn
   * nhiều — nối các ngành đã chọn bằng ", ". USE_MOCK_SHOPS chỉ còn dùng khi test với Core giả lập.
   */
  createShop: async (input: { name: string; industries: string[] }): Promise<ShopView> =>
    USE_MOCK_SHOPS
      ? mockCreateShop(input)
      : apiRequest<ShopView>('/shops', { method: 'POST', body: { name: input.name, industry: industriesToCore(input.industries) } }),

  /**
   * PATCH /shops/{shopId}: sửa tên, ngành, địa chỉ của tiệm (OWNER, tiệm ACTIVE). ID nằm trong đường dẫn nên không cần header
   * X-Shop-Id. Chỉ gửi các trường có trong `changes`: Core bỏ qua trường vắng/null và trả `400 shop_update_required` khi
   * không có trường nào; địa chỉ rỗng xoá địa chỉ. Trả về tiệm sau khi sửa (đã cắt khoảng trắng).
   */
  updateShop: async (shopId: string, changes: ShopChanges): Promise<ShopView> =>
    USE_MOCK_SHOPS
      ? mockUpdateShop(changes)
      : apiRequest<ShopView>(`/shops/${encodeURIComponent(shopId)}`, {
          method: 'PATCH',
          body: {
            ...(changes.name !== undefined && { name: changes.name }),
            ...(changes.industries !== undefined && { industry: industriesToCore(changes.industries) }),
            ...(changes.address !== undefined && { address: changes.address }),
          },
        }),
};
