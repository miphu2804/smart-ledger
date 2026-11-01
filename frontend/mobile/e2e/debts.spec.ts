import { expect, test } from '@playwright/test';
import { collectPageErrors, enterSampleShop, openFromQuickNav } from './helpers';

test('ghi nhận khách trả một phần thì số còn nợ giảm', async ({ page }) => {
  const errors = collectPageErrors(page);
  await enterSampleShop(page);
  await openFromQuickNav(page, 'Công nợ');
  await expect(page).toHaveURL(/debts/);

  const debt = page.getByRole('button', { name: /^Khoản nợ đơn #/ }).first();
  const before = await debt.getAttribute('aria-label');
  await debt.click();

  await page.getByText('Trả một phần', { exact: true }).click();
  await page.getByPlaceholder(/^Còn nợ/).fill('1000');
  await page.getByText('Ghi nhận 1.000đ', { exact: true }).click();

  await expect(page.getByPlaceholder(/^Còn nợ/)).toHaveCount(0);
  await expect(page.locator(`[aria-label="${before}"]`)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tìm khách không có thì báo không tìm thấy', async ({ page }) => {
  await enterSampleShop(page);
  await openFromQuickNav(page, 'Công nợ');

  await page.getByPlaceholder('Tìm tên hoặc SĐT khách').fill('zz-khong-co-khach-nay');

  await expect(page.getByText('Không tìm thấy khách', { exact: true })).toBeVisible();
});
