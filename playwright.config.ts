import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/integration/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30000,

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'admin',
      testDir: './tests/e2e/admin',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5175',
      },
    },
    {
      name: 'consumer',
      testDir: './tests/e2e/consumer',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5174',
      },
    },
    {
      name: 'observability',
      testDir: './tests/e2e/observability',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3002',
      },
    },
  ],

  webServer: [
    {
      command: 'npm run dev --prefix apps/admin-v2',
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'npm run dev --prefix apps/consumer',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'npm run dev --prefix apps/observability',
      url: 'http://localhost:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
