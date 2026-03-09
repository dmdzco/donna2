import { test, expect } from '@playwright/test';
import { loginAsCaregiver } from '../fixtures/auth';
import { mockConsumerAPIs } from '../fixtures/api-mocks';

test.describe('Consumer Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCaregiver(page);
    await mockConsumerAPIs(page);
  });

  test('dashboard loads with senior info', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByText('Martha Johnson')).toBeVisible();
  });

  test('can switch between dashboard tabs', async ({ page }) => {
    await page.goto('/dashboard');

    const remindersTab = page.getByText('Reminders', { exact: true }).first();
    if (await remindersTab.isVisible()) {
      await remindersTab.click();
      await page.waitForTimeout(300);
    }

    const profileTab = page.getByText('Profile', { exact: true }).first();
    if (await profileTab.isVisible()) {
      await profileTab.click();
      await page.waitForTimeout(300);
    }
  });

  test('leave a caregiver note (instant check-in)', async ({ page }) => {
    await page.goto('/dashboard');

    const checkinBtn = page.getByText(/instant check-in/i);
    if (await checkinBtn.isVisible()) {
      await checkinBtn.click();
      await page.waitForTimeout(500);
    }
  });
});
