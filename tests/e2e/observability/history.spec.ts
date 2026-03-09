import { test, expect } from '@playwright/test';
import { loginAsObserver } from '../fixtures/auth';
import { mockObservabilityAPIs } from '../fixtures/api-mocks';

test.describe('Observability History', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsObserver(page);
    await mockObservabilityAPIs(page);
  });

  test('call list loads in history mode', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.call-list-item').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Martha Johnson')).toBeVisible();
  });

  test('selecting a call shows timeline', async ({ page }) => {
    await page.goto('/');

    await page.locator('.call-list-item').first().click();

    await expect(page.locator('.timeline-event').first()).toBeVisible({ timeout: 5000 });
  });
});
