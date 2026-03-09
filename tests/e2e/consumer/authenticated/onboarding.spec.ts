import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

test.describe('Consumer Onboarding (Authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/', { waitUntil: 'networkidle' });
    await clerk.signIn({
      page,
      emailAddress: process.env.E2E_CLERK_USER_EMAIL!,
    });
    await page.waitForTimeout(1000);
  });

  test('onboarding page loads for authenticated user', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const url = page.url();
    // Should stay on onboarding or redirect to dashboard (if already onboarded)
    const isAuthed = url.includes('/onboarding') || url.includes('/dashboard');
    expect(isAuthed).toBe(true);
  });

  test('onboarding shows form fields when available', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Skip if redirected to dashboard (already onboarded)
    if (!page.url().includes('/onboarding')) {
      test.skip();
      return;
    }

    // Look for onboarding form elements
    const hasForm = await page.locator('input, select, button').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasForm).toBe(true);
  });
});
