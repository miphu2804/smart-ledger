import { defineConfig, devices } from '@playwright/test';

/** Cổng riêng, khác 8081/8082 hay dùng khi chạy tay, để test không dính vào server của worktree khác. */
const PORT = 8090;

/**
 * Test giao diện chạy trên máy dev với bản Expo web và dữ liệu mock (không cần Firebase hay Core). Metro build lần đầu mất vài
 * phút, nên chờ server lâu và chạy tuần tự. Mock chạy trong trình duyệt nên mỗi test mở trang là có dữ liệu mới.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      CI: '1',
      // Bắt buộc phải có lúc build; mock không gọi địa chỉ này
      EXPO_PUBLIC_API_ENDPOINT: 'http://localhost:8000',
      EXPO_PUBLIC_USE_MOCK: 'true',
      EXPO_PUBLIC_MOCK_CORE: 'true',
      EXPO_PUBLIC_MOCK_SHOPS: 'true',
    },
  },
});
