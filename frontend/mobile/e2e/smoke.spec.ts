import { expect, test } from '@playwright/test';
import { collectPageErrors } from './helpers';

test('mở app thấy màn đăng nhập, vào app bằng tài khoản mock thấy Tổng quan', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/');

  await expect(page.getByText('Đăng nhập', { exact: true })).toBeVisible();

  await page.getByText('Vào app', { exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Tổng quan', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Quản lý' })).toBeVisible();
  expect(errors).toEqual([]);
});
