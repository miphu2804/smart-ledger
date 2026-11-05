import { expect, test, type Page } from '@playwright/test';
import { collectPageErrors, openQuickNav } from './helpers';

/** Mở danh sách tiệm từ menu chuyển nhanh. */
async function openShopList(page: Page) {
  await openQuickNav(page);
  await page.getByRole('button', { name: /đổi hoặc tạo cửa hàng/ }).click();
}

async function openProfile(page: Page, shopName: string) {
  await page.getByRole('tab', { name: 'Quản lý' }).click();
  await page.getByText(shopName, { exact: true }).last().click();
  await expect(page).toHaveURL(/profile/);
}

test('tạo cửa hàng thứ hai, đổi qua lại, mỗi cửa hàng giữ tài khoản ngân hàng riêng', async ({ page }) => {
  const errors = collectPageErrors(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Đăng nhập bằng Google' }).click();
  await page.getByPlaceholder('VD: Nguyễn Thị Lan').fill('Chủ Test');
  await page.keyboard.press('Enter');
  await page.getByPlaceholder('VD: Tiệm tạp hoá cô Thỏ').fill('ZZ-TEST Tiệm A');
  await page.getByText('Đồ ăn', { exact: true }).click();
  await page.getByText('Bắt đầu bán hàng', { exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ qua hướng dẫn' }).click();

  await openShopList(page);
  await page.getByRole('button', { name: 'Tạo cửa hàng mới' }).click();
  await expect(page).toHaveURL(/shop-new/);
  await page.getByPlaceholder('VD: Tiệm tạp hoá cô Thỏ').fill('ZZ-TEST Tiệm B');
  await page.getByRole('checkbox', { name: 'Đồ uống' }).click();
  await page.getByRole('button', { name: 'Tạo cửa hàng', exact: true }).click();
  await expect(page.getByText('Đã tạo ZZ-TEST Tiệm B')).toBeVisible();

  await openProfile(page, 'ZZ-TEST Tiệm B');
  await page.getByPlaceholder('VD: Vietcombank').fill('ZZ Bank B');
  await page.getByPlaceholder('VD: 0123456789').fill('111222333');
  await page.getByText('Lưu thay đổi', { exact: true }).click();
  await expect(page).toHaveURL(/more/);

  await openShopList(page);
  await expect(page.getByRole('button', { name: 'Dùng ZZ-TEST Tiệm A' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Dùng ZZ-TEST Tiệm A' }).click();
  await expect(page.getByText('Đang dùng ZZ-TEST Tiệm A')).toBeVisible();

  await openProfile(page, 'ZZ-TEST Tiệm A');
  await expect(page.getByPlaceholder('VD: 0123456789')).not.toHaveValue('111222333');
  await page.getByRole('button', { name: 'Quay lại' }).click();

  await openShopList(page);
  await page.getByRole('button', { name: 'Dùng ZZ-TEST Tiệm B' }).click();
  await openProfile(page, 'ZZ-TEST Tiệm B');
  await expect(page.getByPlaceholder('VD: 0123456789')).toHaveValue('111222333');

  expect(errors).toEqual([]);
});
