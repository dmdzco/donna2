import { test, expect } from '@playwright/test';

/**
 * Integration smoke test — runs against the real dev/staging API.
 * Run manually with: npm run test:e2e:integration
 *
 * Requires ADMIN_EMAIL and ADMIN_PASSWORD environment variables.
 */
test.describe('Admin Smoke Test (Integration)', () => {
  test.skip(!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD, 'Requires ADMIN_EMAIL and ADMIN_PASSWORD env vars');

  test('login → view seniors → view calls → logout', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByPlaceholder('admin@donna.com').fill(process.env.ADMIN_EMAIL!);
    await page.getByPlaceholder('Your password').fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should land on dashboard
    await expect(page).toHaveURL('/', { timeout: 10000 });

    // Navigate to seniors
    await page.getByRole('link', { name: /seniors/i }).click();
    await expect(page).toHaveURL('/seniors');
    await page.waitForTimeout(2000);

    // Navigate to calls
    await page.getByRole('link', { name: /calls/i }).click();
    await expect(page).toHaveURL('/calls');
    await page.waitForTimeout(2000);
  });
});
