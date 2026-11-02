import { expect, test, type BrowserContext, type Locator } from '@playwright/test';

/** Bản web mở link ở tab mới kiểu `noopener`, nên tab mới chỉ báo ở cấp context, không qua sự kiện `popup` của trang. */
async function opensUrl(context: BrowserContext, link: Locator, url: string) {
  const [tab] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await expect(tab).toHaveURL(url);
  await tab.close();
}

test.beforeEach(async ({ context }) => {
  // Không tải trang thật: test chỉ kiểm tra app mở đúng địa chỉ
  await context.route('https://songheloi.id.vn/**', (route) => route.fulfill({ status: 200, body: '' }));
});

test('màn đăng nhập có link chính sách', async ({ page, context }) => {
  await page.goto('/');
  await opensUrl(context, page.getByText('Chính sách và điều khoản', { exact: true }), 'https://songheloi.id.vn/chinh-sach');
});

test('tab Quản lý mở được chính sách và trang xoá tài khoản', async ({ page, context }) => {
  await page.goto('/');
  await page.getByText('Vào app', { exact: true }).click();
  await page.getByRole('tab', { name: 'Quản lý' }).click();

  await opensUrl(context, page.getByRole('button', { name: 'Chính sách và điều khoản' }), 'https://songheloi.id.vn/chinh-sach');
  await opensUrl(context, page.getByRole('button', { name: 'Xoá tài khoản' }), 'https://songheloi.id.vn/delete-account');
});
