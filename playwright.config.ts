import { defineConfig, devices } from '@playwright/test';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('E2E tests require a dedicated DATABASE_URL whose database name ends in _test');
}
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'npm run dev -w apps/api',
      url: 'http://127.0.0.1:3002/api/v1/health',
      reuseExistingServer: false,
      env: {
        PORT: '3002',
        PUBLIC_URL: 'http://127.0.0.1:5174',
        NODE_ENV: 'test',
        COOKIE_SECURE: 'false',
      },
      timeout: 60000,
    },
    {
      command: 'npm run dev -w apps/web -- --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      env: { API_PROXY: 'http://127.0.0.1:3002' },
      timeout: 60000,
    },
  ],
});
