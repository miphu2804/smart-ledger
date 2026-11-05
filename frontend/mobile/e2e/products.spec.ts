import { expect, test } from '@playwright/test';
import { collectPageErrors, enterSampleShop, openFromQuickNav } from './helpers';

test('thêm, sửa rồi xoá một mặt hàng', async ({ page }) => {
  const errors = collectPageErrors(page);
  await enterSampleShop(page);
  await openFromQuickNav(page, 'Hàng hoá');
  await expect(page).toHaveURL(/products/);

  await page.getByText('Thêm', { exact: true }).first().click();
  await page.getByPlaceholder('VD: Nước suối').fill('ZZ-TEST Nước');
  await page.getByPlaceholder('5000').fill('7000');
  await page.getByPlaceholder('VD: ly, chai, cái').fill('chai');
  await page.getByText('Thêm mặt hàng', { exact: true }).last().click();

  const search = page.getByPlaceholder('Tìm theo tên hoặc mã vạch…');
  await search.fill('ZZ-TEST');
  await expect(page.getByText('ZZ-TEST Nước', { exact: true })).toBeVisible();

  await page.getByText('ZZ-TEST Nước', { exact: true }).click();
  await page.getByPlaceholder('VD: Nước suối').fill('ZZ-TEST Nước đổi tên');
  await page.getByText('Lưu thay đổi', { exact: true }).click();
  await expect(page.getByText('ZZ-TEST Nước đổi tên', { exact: true })).toBeVisible();

  await page.getByText('ZZ-TEST Nước đổi tên', { exact: true }).click();
  await page.getByText('Xoá mặt hàng', { exact: true }).click();
  await page.getByText('Xoá', { exact: true }).last().click();
  await expect(page.getByText('ZZ-TEST Nước đổi tên', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Không tìm thấy mặt hàng', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
