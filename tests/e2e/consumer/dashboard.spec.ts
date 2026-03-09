import { test, expect } from '@playwright/test';

test.describe('Consumer Protected Routes', () => {
  test('unauthenticated user is redirected from dashboard', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    // Without Clerk auth, ProtectedRoute redirects to landing
    await expect(page).toHaveURL('/', { timeout: 15000 });
  });

  test('unauthenticated user is redirected from onboarding', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'networkidle' });

    // Without Clerk auth, should redirect to landing
    await expect(page).toHaveURL('/', { timeout: 15000 });
  });
});
