import { expect, test } from '@playwright/test';
import { collectPageErrors, signUpWithEmail } from './helpers';

test('đăng ký bằng email, xác minh, đặt tên, tạo tiệm rồi vào các tab', async ({ page }) => {
  const errors = collectPageErrors(page);

  await signUpWithEmail(page, 'zz-test-onboarding@example.com', 'matkhau123');

  await expect(page.getByText('ZZ-TEST Tiệm Email', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Đơn hàng' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mật khẩu nhập lại không khớp thì báo lỗi và chưa tạo được tài khoản', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Chưa có tài khoản? Tạo tài khoản', { exact: true }).click();
  await page.getByPlaceholder('ten@example.com').fill('zz-test-sai@example.com');
  await page.getByPlaceholder('Ít nhất 6 ký tự').fill('matkhau123');
  await page.getByPlaceholder('Gõ lại mật khẩu ở trên').fill('matkhau456');

  await expect(page.getByText('Hai mật khẩu chưa giống nhau')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo tài khoản', disabled: true })).toBeVisible();
});

test('chưa đăng nhập mở thẳng màn trong app thì về màn đăng nhập', async ({ page }) => {
  await page.goto('/ai');

  await expect(page).toHaveURL(/welcome/);
  await expect(page.getByText('Chào Lan')).toHaveCount(0);
});
