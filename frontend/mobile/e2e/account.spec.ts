import { expect, test } from '@playwright/test';
import { collectPageErrors, enterSampleShop, openFromQuickNav, signUpWithEmail } from './helpers';

test('sửa tên tiệm trong hồ sơ, link Facebook sai thì không lưu được', async ({ page }) => {
  const errors = collectPageErrors(page);
  await signUpWithEmail(page, 'zz-test-hoso@example.com', 'matkhau123');

  await page.getByRole('tab', { name: 'Quản lý' }).click();
  await page.getByText('ZZ-TEST Tiệm Email', { exact: true }).last().click();
  await expect(page).toHaveURL(/profile/);

  await page.getByPlaceholder('facebook.com/tenban').fill('khong phai link');
  await expect(page.getByText('Link Facebook chưa đúng, VD: facebook.com/tenban')).toBeVisible();
  await page.getByPlaceholder('facebook.com/tenban').fill('facebook.com/tiemtest');

  // Ô tên tiệm không có placeholder: thứ tự trên màn là họ tên, email, Facebook, tên tiệm
  await page.getByRole('textbox').nth(3).fill('ZZ-TEST Tiệm Đổi Tên');
  await page.getByText('Lưu thay đổi', { exact: true }).click();

  await expect(page).toHaveURL(/more/);
  await expect(page.getByText('ZZ-TEST Tiệm Đổi Tên', { exact: true }).last()).toBeVisible();
  expect(errors).toEqual([]);
});

test('đổi mật khẩu: sai mật khẩu cũ thì báo lỗi, đúng thì đăng nhập lại được bằng mật khẩu mới', async ({ page }) => {
  await signUpWithEmail(page, 'zz-test-matkhau@example.com', 'matkhau123');

  await page.getByRole('tab', { name: 'Quản lý' }).click();
  await page.getByText('Đổi mật khẩu', { exact: true }).click();
  await expect(page).toHaveURL(/change-password/);

  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill('sai-mat-khau');
  await passwords.nth(1).fill('matkhaumoi456');
  await passwords.nth(2).fill('matkhaumoi456');
  await page.getByText('Đổi mật khẩu', { exact: true }).last().click();
  await expect(page.getByText('Mật khẩu hiện tại chưa đúng')).toBeVisible();

  await passwords.nth(0).fill('matkhau123');
  await page.getByText('Đổi mật khẩu', { exact: true }).last().click();
  await expect(page.getByText('Đã đổi mật khẩu')).toBeVisible();

  await page.getByRole('tab', { name: 'Quản lý' }).click();
  await page.getByText('Đăng xuất', { exact: true }).first().click();
  await page.getByText('Đăng xuất', { exact: true }).last().click();
  await expect(page).toHaveURL(/welcome/);

  await page.getByPlaceholder('Nhập địa chỉ email của bạn').fill('zz-test-matkhau@example.com');
  await page.getByRole('button', { name: /Tiếp tục$/ }).click();
  await expect(page.getByPlaceholder('ten@example.com')).toHaveValue('zz-test-matkhau@example.com');
  await page.getByPlaceholder('Ít nhất 6 ký tự').fill('matkhaumoi456');
  await page.getByText('Đăng nhập', { exact: true }).last().click();
  await expect(page.getByRole('tab', { name: 'Quản lý' })).toBeVisible();
});

test('tài khoản không có mật khẩu thì không thấy mục đổi mật khẩu', async ({ page }) => {
  await enterSampleShop(page);

  await page.getByRole('tab', { name: 'Quản lý' }).click();

  await expect(page.getByText('Đổi mật khẩu', { exact: true })).toHaveCount(0);
});

test('tắt rung phản hồi trong cài đặt', async ({ page }) => {
  await enterSampleShop(page);
  await openFromQuickNav(page, 'Cài đặt');
  await expect(page).toHaveURL(/settings/);

  const toggle = page.getByRole('switch').first();
  const wasOn = await toggle.isChecked();
  await toggle.click();
  await expect(toggle).toBeChecked({ checked: !wasOn });
});
