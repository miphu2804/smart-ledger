import { expect, test } from '@playwright/test';
import { collectPageErrors, enterSampleShop, openFromQuickNav } from './helpers';

test('ghi một khoản chi thì khoản đó hiện trong danh sách', async ({ page }) => {
  const errors = collectPageErrors(page);
  await enterSampleShop(page);
  await openFromQuickNav(page, 'Chi phí');
  await expect(page).toHaveURL(/expenses/);
  await expect(page.getByText('Khoản chi', { exact: true })).toBeVisible();

  await page.getByText('Thêm chi phí', { exact: true }).click();
  await page.getByPlaceholder('VD: Mua 2 cây đá').fill('ZZ-TEST Mua đá');
  await page.getByPlaceholder('0', { exact: true }).fill('12000');
  await page.getByText('Lưu khoản chi', { exact: true }).click();

  await expect(page.getByText('ZZ-TEST Mua đá', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
