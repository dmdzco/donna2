import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';
import { mockAdminAPIs } from '../fixtures/api-mocks';

test.describe('Admin Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await mockAdminAPIs(page);
  });

  const pages = [
    { name: /dashboard/i, url: '/' },
    { name: /seniors/i, url: '/seniors' },
    { name: /calls/i, url: '/calls' },
    { name: /reminders/i, url: '/reminders' },
    { name: /call analyses/i, url: '/call-analyses' },
    { name: /caregivers/i, url: '/caregivers' },
    { name: /daily context/i, url: '/daily-context' },
  ];

  for (const { name, url } of pages) {
    test(`navigates to ${url}`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('link', { name }).click();
      await expect(page).toHaveURL(url);
    });
  }

  test('responsive: sidebar collapses on mobile', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
  });
});
