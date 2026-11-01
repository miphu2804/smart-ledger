import { expect, test } from '@playwright/test';
import { collectPageErrors, enterSampleShop } from './helpers';

test('xem danh sách đơn rồi mở chi tiết một đơn', async ({ page }) => {
  const errors = collectPageErrors(page);
  await enterSampleShop(page);

  await page.getByRole('tab', { name: 'Đơn hàng' }).click();
  await expect(page).toHaveURL(/invoices/);
  await page.getByText(/^#\d+ · /).first().click();

  await expect(page).toHaveURL(/invoice\//);
  await expect(page.getByText(/^Đơn #\d+$/)).toBeVisible();
  await expect(page.getByText('Huỷ đơn', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('tìm từ khoá không có đơn nào thì báo không tìm thấy', async ({ page }) => {
  await enterSampleShop(page);

  await page.getByRole('tab', { name: 'Đơn hàng' }).click();
  await page.getByPlaceholder(/^Tìm theo khách/).fill('zz-khong-co-don-nay');

  await expect(page.getByText('Không tìm thấy đơn', { exact: true })).toBeVisible();
});
