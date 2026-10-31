/**
 * Các màn ngoài nhóm (tabs) và (auth) chỉ mở khi đã đăng nhập và có tiệm. Tab tự chặn trong `app/(tabs)/_layout.tsx`, nên không
 * nằm ở đây: nếu chặn cả tab thì `router.replace('/(tabs)')` ngay sau khi đăng nhập xong sẽ bị từ chối vì app chưa kịp vẽ lại.
 * Thêm một màn mới ở `app/` thì thêm vào đây; `tests/authGate.test.ts` báo lỗi khi quên.
 */
export const PROTECTED_SCREENS = [
  'ai',
  'analytics',
  'bestsellers',
  'change-password',
  'checkout',
  'debts',
  'expenses',
  'invoice/[id]',
  'notification-settings',
  'notifications',
  'pos',
  'printer',
  'products',
  'profile',
  'settings',
  'staff',
  'voice',
] as const;

/** Lúc chưa khôi phục xong phiên cũng coi là chưa đăng nhập, để màn không gọi API khi chưa có token. */
export function canOpenProtectedScreens(state: { authReady: boolean; loggedIn: boolean; onboarded: boolean }): boolean {
  return state.authReady && state.loggedIn && state.onboarded;
}
