import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';
import { mockAdminAPIs } from '../fixtures/api-mocks';

test.describe('Admin Seniors', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await mockAdminAPIs(page);
  });

  test('senior list loads with mock data', async ({ page }) => {
    await page.goto('/seniors');

    await expect(page.getByText('Martha Johnson')).toBeVisible();
    await expect(page.getByText('Robert Smith')).toBeVisible();
  });

  test('create senior via form', async ({ page }) => {
    await page.goto('/seniors');

    await page.getByPlaceholder('Full name').fill('Jane Doe');
    await page.getByPlaceholder('+1234567890').fill('+15551112222');
    await page.getByPlaceholder('City, State').fill('Portland, OR');
    await page.getByPlaceholder('gardening, crosswords, jazz').fill('reading, cooking');

    await page.getByRole('button', { name: /add senior/i }).click();

    await page.waitForTimeout(500);
  });
});
