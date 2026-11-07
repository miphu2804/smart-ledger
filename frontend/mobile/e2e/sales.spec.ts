import { expect, test, type Page } from '@playwright/test';
import { collectPageErrors, enterSampleShop } from './helpers';

async function addFirstProductAndCheckout(page: Page) {
  await page.getByRole('tab', { name: 'Tạo đơn' }).click();
  await page.locator('[aria-label="Thêm"]').first().click();
  await expect(page.getByText('1 món đã chọn')).toBeVisible();
}

test('chọn hàng, tăng số lượng, thanh toán thì có đơn mới', async ({ page }) => {
  const errors = collectPageErrors(page);
  await enterSampleShop(page);

  await addFirstProductAndCheckout(page);
  await page.locator('[aria-label="Tăng số lượng"]').first().click();
  // Dòng "N món đã chọn" đếm số mặt hàng, số lượng nằm trên thẻ mặt hàng
  await expect(page.getByRole('button', { name: /đã chọn 2$/ })).toBeVisible();

  await page.getByText('Thanh toán', { exact: true }).last().click();
  await expect(page).toHaveURL(/checkout/);
  await page.getByText('Hoàn tất', { exact: true }).click();

  await expect(page.getByText('Xem đơn', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('ghi nợ thì phải có tên khách', async ({ page }) => {
  await enterSampleShop(page);

  await addFirstProductAndCheckout(page);
  await page.getByText('Thanh toán', { exact: true }).last().click();
  await expect(page).toHaveURL(/checkout/);
  await page.getByText('Ghi nợ', { exact: true }).click();

  await page.getByText('Hoàn tất', { exact: true }).click();
  await expect(page.getByText('Cần nhập tên khách để ghi nợ')).toBeVisible();

  await page.getByPlaceholder('VD: Chị Ba').fill('ZZ-TEST Khách nợ');
  await page.getByText('Hoàn tất', { exact: true }).click();
  await expect(page.getByText('Xem đơn', { exact: true })).toBeVisible();
});
