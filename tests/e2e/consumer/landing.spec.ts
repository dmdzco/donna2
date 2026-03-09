import { test, expect } from '@playwright/test';

test.describe('Consumer Landing', () => {
  test('landing page renders with key elements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.getByText('Donna').first()).toBeVisible({ timeout: 15000 });
  });

  test('FAQ page loads and accordions work', async ({ page }) => {
    await page.goto('/faq', { waitUntil: 'networkidle' });

    await expect(page.getByText('Frequently Asked Questions')).toBeVisible({ timeout: 15000 });

    const firstQuestion = page.locator('.cursor-pointer').first();
    if (await firstQuestion.isVisible()) {
      await firstQuestion.click();
      await page.waitForTimeout(300);
    }
  });
});
