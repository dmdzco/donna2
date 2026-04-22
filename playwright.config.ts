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
    // Setup: Clerk testing token (runs first)
    {
      name: 'clerk-setup',
      testMatch: /global\.setup\.ts/,
      testDir: './tests/e2e',
    },

    // Admin dashboard tests (JWT auth, no Clerk dependency)
    {
      name: 'admin',
      testDir: './tests/e2e/admin',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5175',
      },
    },

    // Public website pages (no auth needed). Project name kept for compatibility with existing scripts.
    {
      name: 'consumer',
      testDir: './tests/e2e/consumer',
      testIgnore: ['**/authenticated/**'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5174',
      },
    },

    // Website authenticated pages (signs in via @clerk/testing per test)
    {
      name: 'consumer-authenticated',
      testDir: './tests/e2e/consumer/authenticated',
      dependencies: ['clerk-setup'],
      timeout: 60000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5174',
      },
    },

    // Observability dashboard tests (JWT auth, no Clerk dependency)
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
      command: 'npm run dev --prefix apps/website',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        ...process.env,
        VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_ZXhwZXJ0LWFudC01Ny5jbGVyay5hY2NvdW50cy5kZXYk',
      },
    },
    {
      command: 'npm run dev --prefix apps/observability',
      url: 'http://localhost:3002',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
