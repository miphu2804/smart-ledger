import { expect, test, type Page } from '@playwright/test';
import { weekKey } from '../src/lib/format';
import { collectPageErrors, enterSampleShop } from './helpers';

// Popup lúc mở app chờ 2,5 giây sau khi vào các tab (PlanPromo.tsx)
const LAUNCH_WAIT = 6_000;
const HOUR = 60 * 60 * 1000;

/** Ghi sẵn trạng thái quảng cáo của tài khoản mock ("dev") trước khi trang chạy. */
async function seedPromoState(page: Page, state: Record<string, unknown>) {
  await page.addInitScript((value) => {
    if (!window.localStorage.getItem('plan-promo')) window.localStorage.setItem('plan-promo', JSON.stringify({ dev: value }));
  }, state);
}

test('lần đầu mở app không quảng cáo, lần mở sau hiện và tick thì nghỉ hết hôm nay', async ({ page }) => {
  const errors = collectPageErrors(page);
  await enterSampleShop(page);
  await page.waitForTimeout(LAUNCH_WAIT);
  await expect(page.getByText('Hỏi Bobi thoải mái hơn', { exact: true })).toHaveCount(0);

  // Mở lại app: popup hiện với giá từ catalog
  await enterSampleShop(page);
  await expect(page.getByText('Hỏi Bobi thoải mái hơn', { exact: true })).toBeVisible({ timeout: LAUNCH_WAIT });
  await expect(page.getByText('1 tháng 99.000đ · 3 tháng 297.000đ, không tự gia hạn', { exact: true })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Không hiện lại hôm nay' }).click();
  await page.getByText('Để sau', { exact: true }).click();
  await expect(page.getByText('Hỏi Bobi thoải mái hơn', { exact: true })).toHaveCount(0);

  // Đã tick: mở lại trong ngày không hiện nữa
  await enterSampleShop(page);
  await page.waitForTimeout(LAUNCH_WAIT);
  await expect(page.getByText('Hỏi Bobi thoải mái hơn', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('nút Xem các gói mở màn mua gói', async ({ page }) => {
  await seedPromoState(page, { sessions: 4 });
  await enterSampleShop(page);
  await page.getByText('Xem các gói', { exact: true }).click({ timeout: LAUNCH_WAIT });
  await expect(page).toHaveURL(/plans/);
  await expect(page.getByText('Thanh toán 99.000đ', { exact: true })).toBeVisible();
});

test('hỏi Bobi đủ lượt Miễn phí trong tuần thì gợi ý mua gói một lần', async ({ page }) => {
  test.setTimeout(90_000);
  // Đã quảng cáo lúc mở app 2 tiếng trước: lần này không hiện lại, nhưng đã qua khoảng cách 1 tiếng giữa hai quảng cáo
  const shownAt = Date.now() - 2 * HOUR;
  // Tuần này đã hỏi 98 câu: còn 2 câu nữa là chạm 100 lượt/tuần của gói Miễn phí
  await seedPromoState(page, { sessions: 4, launchShownAt: shownAt, lastShownAt: shownAt, aiWeek: weekKey(new Date()), aiAnswers: 98 });
  await enterSampleShop(page);
  await page.getByRole('tab', { name: 'Trợ lý Bobi' }).click();
  await expect(page).toHaveURL(/ai/);

  const ask = async (q: string) => {
    await page.getByLabel('Tin nhắn cho trợ lý').fill(q);
    await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
    await expect(page.getByText(q, { exact: true })).toBeVisible();
  };
  await ask('Doanh thu hôm nay bao nhiêu?');
  await page.waitForTimeout(8_000);
  await expect(page.getByText('Cần hỏi Bobi nhiều hơn?', { exact: true })).toHaveCount(0);

  await ask('Món nào bán chạy nhất?');
  await expect(page.getByText('Cần hỏi Bobi nhiều hơn?', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Tuần này bạn đã hỏi Bobi 100 câu. Gói Miễn phí có 100 lượt/tuần, gói trả phí có 300 lượt/tuần.', { exact: true })).toBeVisible();
  // Popup khi dùng Bobi không có ô tick; một lần mỗi ngày
  await expect(page.getByRole('checkbox', { name: 'Không hiện lại hôm nay' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();

  await ask('Còn bao nhiêu khách nợ?');
  await page.waitForTimeout(10_000);
  await expect(page.getByText('Cần hỏi Bobi nhiều hơn?', { exact: true })).toHaveCount(0);
});
