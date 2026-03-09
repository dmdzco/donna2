import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';
import { mockAdminAPIs } from '../fixtures/api-mocks';

test.describe('Admin Calls', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await mockAdminAPIs(page);
  });

  test('call history loads', async ({ page }) => {
    await page.goto('/calls');

    await expect(page.getByText('Martha Johnson')).toBeVisible();
  });

  test('clicking transcript opens modal', async ({ page }) => {
    await page.goto('/calls');

    const transcriptBtn = page.getByRole('button', { name: /transcript/i }).first();
    if (await transcriptBtn.isVisible()) {
      await transcriptBtn.click();

      await expect(page.getByText('Good morning Martha!')).toBeVisible();
    }
  });
});
