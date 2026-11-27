import { expect, test } from '@playwright/test';
import { collectPageErrors, enterSampleShop } from './helpers';

// Bản mock coi như tiền về sau 15 giây và kích hoạt gói sau 5 giây nữa (mockCore.ts)
const ACTIVATION_TIMEOUT = 40_000;

test('mua gói 1 tháng: chọn gói, chuyển khoản theo QR rồi gói được kích hoạt', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectPageErrors(page);
  await enterSampleShop(page);

  await page.getByRole('tab', { name: 'Quản lý' }).click();
  await page.getByRole('button', { name: /^Mua gói\. Bạn đang dùng gói Miễn phí/ }).click();
  await expect(page).toHaveURL(/plans/);

  // Giá và thời hạn lấy từ catalog; gói 1 tháng được chọn sẵn và có nhãn
  await expect(page.getByRole('radio', { name: 'Gói Miễn phí, 0đ' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Gói 3 tháng, 297.000đ' })).toBeVisible();
  await expect(page.getByText('Phổ biến nhất', { exact: true })).toBeVisible();
  await expect(page.getByText('Thanh toán 99.000đ', { exact: true })).toBeVisible();

  // Chọn Miễn phí thì không có gì để trả
  await page.getByRole('radio', { name: 'Gói Miễn phí, 0đ' }).click();
  await expect(page.getByText('Bạn đang dùng gói Miễn phí', { exact: true }).last()).toBeVisible();
  await page.getByRole('radio', { name: 'Gói 1 tháng, 99.000đ' }).click();

  await page.getByText('Thanh toán 99.000đ', { exact: true }).click();
  await expect(page).toHaveURL(/plan-payment\?id=1/);
  await expect(page.getByText('Chờ thanh toán', { exact: true })).toBeVisible();
  await expect(page.getByText(/^SLP[A-Z0-9]{12}$/)).toBeVisible();

  await expect(page.getByText('Gói đã được kích hoạt', { exact: true })).toBeVisible({ timeout: ACTIVATION_TIMEOUT });
  await page.getByText('Xong', { exact: true }).click();
  await expect(page).toHaveURL(/more/);
  await expect(page.getByRole('button', { name: /^Mua gói\. Gói trả phí dùng đến/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('thoát ra khi đang chờ thanh toán thì card mở lại đúng yêu cầu cũ', async ({ page }) => {
  await enterSampleShop(page);
  await page.getByRole('tab', { name: 'Quản lý' }).click();
  await page.getByRole('button', { name: /^Mua gói\./ }).click();
  await page.getByText('Thanh toán 99.000đ', { exact: true }).click();
  await expect(page).toHaveURL(/plan-payment\?id=1/);
  const code = await page.getByText(/^SLP[A-Z0-9]{12}$/).textContent();

  await page.goBack();
  await expect(page.getByRole('button', { name: 'Mở yêu cầu thanh toán đang chờ' })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'Mua gói. Chờ thanh toán' }).click();

  // Không tạo yêu cầu thứ hai: cùng id và cùng nội dung chuyển khoản
  await expect(page).toHaveURL(/plan-payment\?id=1/);
  await expect(page.getByText(code ?? '', { exact: true })).toBeVisible();
});

test('huỷ yêu cầu đang chờ thì về màn chọn gói và tạo được yêu cầu mới', async ({ page }) => {
  await enterSampleShop(page);
  await page.getByRole('tab', { name: 'Quản lý' }).click();
  await page.getByRole('button', { name: /^Mua gói\./ }).click();
  await page.getByText('Thanh toán 99.000đ', { exact: true }).click();
  await expect(page).toHaveURL(/plan-payment\?id=1/);

  // Hỏi lại trước khi huỷ; "Tiếp tục thanh toán" giữ nguyên yêu cầu
  await page.getByRole('button', { name: 'Huỷ yêu cầu' }).click();
  await expect(page.getByText('Huỷ yêu cầu thanh toán?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục thanh toán' }).click();
  await expect(page.getByText('Chờ thanh toán', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Huỷ yêu cầu' }).first().click();
  await page.getByRole('button', { name: 'Huỷ yêu cầu' }).last().click();
  await expect(page).toHaveURL(/plans/);
  await expect(page.getByRole('button', { name: 'Mở yêu cầu thanh toán đang chờ' })).toHaveCount(0);

  await page.getByText('Thanh toán 99.000đ', { exact: true }).click();
  await expect(page).toHaveURL(/plan-payment\?id=2/);
});
