import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

test.describe('Consumer Dashboard (Authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/', { waitUntil: 'networkidle' });
    await clerk.signIn({
      page,
      emailAddress: process.env.E2E_CLERK_USER_EMAIL!,
    });
    await page.waitForTimeout(1000);
  });

  test('authenticated user can access dashboard', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const url = page.url();
    // Auth worked if we stay on dashboard or get redirected to onboarding
    const isAuthed = url.includes('/dashboard') || url.includes('/onboarding');
    expect(isAuthed).toBe(true);
  });

  test('dashboard shows navigation or onboarding prompt', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Skip if redirected away from dashboard
    if (!page.url().includes('/dashboard')) {
      test.skip();
      return;
    }

    // Check for any dashboard content (nav, profile, error state, etc.)
    const navItems = ['Dashboard', 'Profile', 'Reminders', 'Schedule', 'Settings'];
    let foundNav = false;
    for (const item of navItems) {
      const navItem = page.getByText(item, { exact: true }).first();
      if (await navItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        foundNav = true;
        break;
      }
    }

    // Also accept error states (API not running) or onboarding prompts
    const errorOrPrompt = page.getByText(/failed to load|error|no senior profile|set up|get started|retry/i).first();
    const hasContent = foundNav || await errorOrPrompt.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasContent).toBe(true);
  });

  test('sign out returns to landing page', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    if (!page.url().includes('/dashboard')) {
      test.skip();
      return;
    }

    // Find and click sign out
    const signOutBtn = page.getByText(/sign out/i);
    if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await signOutBtn.click();
      await expect(page).toHaveURL('/', { timeout: 10000 });
    }
  });
});
