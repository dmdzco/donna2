import { test, expect } from '@playwright/test';
import { loginAsCaregiver } from '../fixtures/auth';
import { mockConsumerAPIs } from '../fixtures/api-mocks';

test.describe('Consumer Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCaregiver(page);
    await mockConsumerAPIs(page);

    // Override caregiver check to simulate NOT yet onboarded
    await page.route('**/api/caregivers/me', route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) })
    );
  });

  test('onboarding flow progresses through steps', async ({ page }) => {
    await page.goto('/onboarding');

    // Step 1: Senior Profile
    await page.getByPlaceholder(/martha/i).fill('Betty White');
    await page.getByPlaceholder(/555/i).fill('(555) 987-6543');

    const relationSelect = page.locator('select').first();
    if (await relationSelect.isVisible()) {
      await relationSelect.selectOption('Mother');
    }

    // Click Next
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForTimeout(300);

    // Step 3: Interests
    const sportsTopic = page.getByText('Sports');
    if (await sportsTopic.isVisible()) {
      await sportsTopic.click();
      await page.waitForTimeout(200);
    }

    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForTimeout(300);

    // Step 4: Schedule
    const mondayBtn = page.getByText('Mon');
    if (await mondayBtn.isVisible()) {
      await mondayBtn.click();
    }

    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForTimeout(300);

    // Step 5: Review
    await expect(page.getByText('Betty White')).toBeVisible();
  });
});
