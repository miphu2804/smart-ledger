import { expect, test } from '@playwright/test';
import { collectPageErrors, enterSampleShop, openFromQuickNav } from './helpers';

test('xem thông báo và đánh dấu đọc hết', async ({ page }) => {
  const errors = collectPageErrors(page);
  await enterSampleShop(page);

  await page.locator('[aria-label="Thông báo"]').first().click();
  await expect(page).toHaveURL(/notifications/);
  await expect(page.getByText(/thông báo chưa đọc$/)).toBeVisible();

  await page.locator('[aria-label="Đánh dấu đọc hết"]').click();

  await expect(page.getByText(/thông báo chưa đọc$/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tắt một loại thông báo trong cài đặt', async ({ page }) => {
  await enterSampleShop(page);
  await openFromQuickNav(page, 'Cài đặt');
  await page.getByText('Cài đặt thông báo', { exact: true }).click();
  await expect(page).toHaveURL(/notification-settings/);

  const toggle = page.getByRole('switch').first();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
});
