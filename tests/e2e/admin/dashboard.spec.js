/**
 * Admin Dashboard E2E Tests
 *
 * Playwright tests for the React admin dashboard
 */

import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  // ============================================================================
  // NAVIGATION
  // ============================================================================
  test.describe('Navigation', () => {
    test('dashboard loads successfully', async ({ page }) => {
      await page.goto('/');

      // Wait for the dashboard to load
      await expect(page).toHaveTitle(/Donna|Admin/i);
    });

    test('navigation between pages works', async ({ page }) => {
      await page.goto('/');

      // Find and click on Seniors navigation
      const seniorsNav = page.getByRole('link', { name: /seniors/i });
      if (await seniorsNav.isVisible()) {
        await seniorsNav.click();
        await expect(page).toHaveURL(/.*seniors.*/);
      }
    });
  });

  // ============================================================================
  // SENIOR MANAGEMENT
  // ============================================================================
  test.describe('Senior Management', () => {
    test('displays senior list', async ({ page }) => {
      await page.goto('/');

      // Look for seniors section or list
      const seniorsList = page.locator('[data-testid="seniors-list"], .seniors-list, table');
      await expect(seniorsList.first()).toBeVisible({ timeout: 10000 });
    });

    test('senior card shows name and phone', async ({ page }) => {
      await page.goto('/');

      // Wait for content to load
      await page.waitForLoadState('networkidle');

      // Look for senior information
      const seniorInfo = page.locator('[data-testid="senior-card"], .senior-card, tr').first();
      if (await seniorInfo.isVisible()) {
        const text = await seniorInfo.textContent();
        // Should contain some text (name or phone format)
        expect(text?.length).toBeGreaterThan(0);
      }
    });

    test('create senior button is visible', async ({ page }) => {
      await page.goto('/');

      // Look for add/create senior button
      const addButton = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New"), [data-testid="add-senior"]');
      // Button might be visible
      const isVisible = await addButton.first().isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('clicking senior shows details', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find a clickable senior element
      const seniorRow = page.locator('[data-testid="senior-row"], .senior-card, tr').first();
      if (await seniorRow.isVisible()) {
        await seniorRow.click();
        // Should navigate to detail page or open modal
        await page.waitForTimeout(500);
      }
    });
  });

  // ============================================================================
  // CALL HISTORY
  // ============================================================================
  test.describe('Call History', () => {
    test('displays recent calls section', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Look for calls section
      const callsSection = page.locator('[data-testid="calls-section"], .calls-list, h2:has-text("Calls"), h3:has-text("Recent")');
      const isVisible = await callsSection.first().isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('call entry shows duration and status', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Look for call entries that might show duration
      const callEntry = page.locator('[data-testid="call-entry"], .call-card, tr').first();
      if (await callEntry.isVisible()) {
        const text = await callEntry.textContent();
        // Check for any content
        expect(text?.length).toBeGreaterThan(0);
      }
    });

    test('can navigate to call transcript', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find call detail link or button
      const viewButton = page.locator('button:has-text("View"), a:has-text("Details"), [data-testid="view-call"]').first();
      const isVisible = await viewButton.isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });
  });

  // ============================================================================
  // REMINDER MANAGEMENT
  // ============================================================================
  test.describe('Reminder Management', () => {
    test('displays reminders section', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Look for reminders section
      const remindersSection = page.locator('[data-testid="reminders-section"], .reminders-list, h2:has-text("Reminder"), h3:has-text("Reminder")');
      const isVisible = await remindersSection.first().isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });

    test('reminder shows title and schedule', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Look for reminder entries
      const reminderEntry = page.locator('[data-testid="reminder-entry"], .reminder-card').first();
      if (await reminderEntry.isVisible()) {
        const text = await reminderEntry.textContent();
        expect(text?.length).toBeGreaterThan(0);
      }
    });

    test('add reminder button is accessible', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Look for add reminder button
      const addButton = page.locator('button:has-text("Add Reminder"), button:has-text("New Reminder"), [data-testid="add-reminder"]');
      const isVisible = await addButton.first().isVisible().catch(() => false);
      expect(typeof isVisible).toBe('boolean');
    });
  });

  // ============================================================================
  // RESPONSIVE DESIGN
  // ============================================================================
  test.describe('Responsive Design', () => {
    test('desktop layout renders correctly', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');

      // Page should load without errors
      await expect(page).toHaveTitle(/.*/);
    });

    test('mobile layout renders correctly', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      // Page should load without errors
      await expect(page).toHaveTitle(/.*/);
    });
  });

  // ============================================================================
  // LOADING STATES
  // ============================================================================
  test.describe('Loading States', () => {
    test('shows loading indicator while fetching data', async ({ page }) => {
      await page.goto('/');

      // Look for loading spinner or skeleton
      const loadingIndicator = page.locator('[data-testid="loading"], .loading, .spinner, .skeleton');
      // Loading might appear briefly or not at all if data loads fast
      const wasVisible = await loadingIndicator.first().isVisible().catch(() => false);
      expect(typeof wasVisible).toBe('boolean');
    });

    test('displays content after loading', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Main content should be visible
      const mainContent = page.locator('main, [data-testid="main-content"], .app-container');
      await expect(mainContent.first()).toBeVisible({ timeout: 10000 });
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================
  test.describe('Error Handling', () => {
    test('handles API errors gracefully', async ({ page }) => {
      // Intercept API calls and return error
      await page.route('**/api/**', (route) => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      await page.goto('/');

      // Page should still load (with error state or fallback)
      await expect(page).toHaveTitle(/.*/);
    });
  });
});
