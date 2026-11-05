import { expect, type Page } from '@playwright/test';

/** Vào app bằng tiệm mẫu (nút "Vào app" của bản dev). Mock giữ phiên trong bộ nhớ: sau bước này chỉ đi bằng giao diện, `page.goto` sẽ đăng xuất. */
export async function enterSampleShop(page: Page) {
  await page.goto('/');
  await page.getByText('Vào app', { exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Quản lý' })).toBeVisible();
}

/** Đăng ký bằng email tới khi có tiệm và vào các tab, bỏ qua phần hướng dẫn của tài khoản mới. */
export async function signUpWithEmail(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByText('Chưa có tài khoản? Tạo tài khoản', { exact: true }).click();
  await page.getByPlaceholder('ten@example.com').fill(email);
  await page.getByPlaceholder('Ít nhất 6 ký tự').fill(password);
  await page.getByPlaceholder('Gõ lại mật khẩu ở trên').fill(password);
  await page.getByText('Tạo tài khoản', { exact: true }).last().click();
  await page.getByText('Tôi đã xác minh', { exact: true }).click();
  await page.getByPlaceholder('VD: Nguyễn Thị Lan').fill('Chủ Test');
  await page.keyboard.press('Enter');
  await page.getByPlaceholder('VD: Tiệm tạp hoá cô Thỏ').fill('ZZ-TEST Tiệm Email');
  await page.getByText('Đồ ăn', { exact: true }).click();
  await page.getByText('Bắt đầu bán hàng', { exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ qua hướng dẫn' }).click();
  await expect(page.getByRole('tab', { name: 'Quản lý' })).toBeVisible();
}

/** Mở menu chuyển nhanh của màn đang hoạt động; Playwright bỏ qua tab nền có aria-hidden. */
export async function openQuickNav(page: Page) {
  await page.getByRole('button', { name: 'Mở menu chuyển nhanh', exact: true }).first().click();
}

/** Mở một màn ngoài tab từ menu chuyển nhanh. */
export async function openFromQuickNav(page: Page, label: string) {
  await openQuickNav(page);
  await page.getByRole('button', { name: label, exact: true }).click();
}

/** Bắt lỗi JavaScript trên trang; gọi `expect(errors).toEqual([])` ở cuối test. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
