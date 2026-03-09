import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/auth';
import { mockAdminAPIs } from '../fixtures/api-mocks';

test.describe('Admin Login', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    await page.route('**/api/admin/login', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'fake-jwt-token' }),
      })
    );
    await page.route('**/api/admin/me', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-admin', email: 'admin@donna.com' }),
      })
    );
    await mockAdminAPIs(page);

    await page.goto('/login');

    await page.getByPlaceholder('admin@donna.com').fill('admin@donna.com');
    await page.getByPlaceholder('Your password').fill('testpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL('/');
  });

  test('failed login shows error message', async ({ page }) => {
    await page.route('**/api/admin/login', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid credentials' }),
      })
    );

    await page.goto('/login');

    await page.getByPlaceholder('admin@donna.com').fill('wrong@email.com');
    await page.getByPlaceholder('Your password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.locator('.text-admin-danger')).toBeVisible();
  });
});
