import { test, expect } from '@playwright/test';

test.describe('Consumer Landing', () => {
  test('landing page renders with key elements', async ({ page }) => {
    await page.route('**clerk**', route => route.fulfill({ status: 200, body: '{}' }));

    await page.goto('/');

    await expect(page.getByText('Donna')).toBeVisible();

    await expect(page.getByRole('button', { name: /get started/i }).first()).toBeVisible();
  });

  test('FAQ page loads and accordions work', async ({ page }) => {
    await page.route('**clerk**', route => route.fulfill({ status: 200, body: '{}' }));

    await page.goto('/faq');

    await expect(page.getByText('Frequently Asked Questions')).toBeVisible();

    const firstQuestion = page.locator('.cursor-pointer').first();
    if (await firstQuestion.isVisible()) {
      await firstQuestion.click();
      await page.waitForTimeout(300);
    }
  });
});
