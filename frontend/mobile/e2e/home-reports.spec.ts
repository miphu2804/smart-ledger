import { expect, test } from '@playwright/test';
import { collectPageErrors, enterSampleShop } from './helpers';

test('Tổng quan đổi được kỳ, mở báo cáo rồi tới hàng bán chạy', async ({ page }) => {
  const errors = collectPageErrors(page);
  await enterSampleShop(page);

  await expect(page.getByText('Ưu tiên hôm nay', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Tuần này' }).click();
  await expect(page.locator('[aria-label="Xem phân tích doanh thu Tuần này"]').first()).toBeAttached();

  await page.locator('[aria-label="Xem phân tích doanh thu Tuần này"]').first().click();
  await expect(page).toHaveURL(/analytics/);
  await expect(page.getByText('Doanh thu theo ngày', { exact: true })).toBeVisible();

  await page.getByText('Xem tất cả', { exact: true }).last().click();
  await expect(page).toHaveURL(/bestsellers/);
  await expect(page.getByText('Hàng bán chạy', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Xếp hạng \(\d+ món\)$/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('thẻ Thu khoản còn nợ mở màn Công nợ', async ({ page }) => {
  await enterSampleShop(page);

  await page.getByText('Thu khoản còn nợ', { exact: true }).click();

  await expect(page).toHaveURL(/debts/);
});
