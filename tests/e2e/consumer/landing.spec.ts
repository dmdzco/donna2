import { test, expect } from '@playwright/test';

test.describe('Consumer Landing', () => {
  test('landing page renders with key elements', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.getByText('Donna').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: /sign up on our website/i })).toBeVisible();
  });

  test('FAQ page loads and accordions work', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: /frequently asked questions/i })).toBeVisible({ timeout: 15000 });

    const question = page.getByRole('button', { name: /what is donna/i });
    await question.click();
    await expect(
      page.locator('.faq__item--open .faq__answer').getByText(/elderly loved ones as often as you choose/i),
    ).toBeVisible();
  });

  test('legal and support pages render', async ({ page }) => {
    await page.goto('/privacypolicy', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();

    await page.goto('/third-party', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Third-Party Services' })).toBeVisible();

    await page.goto('/support', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Support', exact: true })).toBeVisible();
  });
});
