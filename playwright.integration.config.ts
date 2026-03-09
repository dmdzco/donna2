import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/integration',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 60000,

  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://admin-v2-liart.vercel.app',
    trace: 'on',
    screenshot: 'on',
  },
});
