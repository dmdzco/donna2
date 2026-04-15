import { test, expect } from '@playwright/test';
import { loginAsObserver } from '../fixtures/auth';
import { mockObservabilityAPIs } from '../fixtures/api-mocks';

test.describe('Observability Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsObserver(page);
    await mockObservabilityAPIs(page);
  });

  test('toggle between History and Live modes', async ({ page }) => {
    await page.goto('/');

    const liveBtn = page.locator('.app-mode-toggle').getByText('Live');
    if (await liveBtn.isVisible()) {
      await liveBtn.click();
      await expect(page.locator('.live-monitor')).toBeVisible({ timeout: 5000 });
    }

    const historyBtn = page.locator('.app-mode-toggle').getByText('History');
    if (await historyBtn.isVisible()) {
      await historyBtn.click();
      await expect(page.locator('.call-list')).toBeVisible({ timeout: 5000 });
    }
  });

  test('switch between Timeline, Observer, and Metrics views', async ({ page }) => {
    await page.goto('/');

    await page.locator('.call-list-item').first().click();
    await page.waitForTimeout(500);

    const analysisBtn = page.locator('.view-toggle').getByText('Analysis');
    if (await analysisBtn.isVisible()) {
      await analysisBtn.click();
      await expect(page.locator('.analysis-panel')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Post-Call Analysis')).toBeVisible();
    }

    const observerBtn = page.locator('.view-toggle').getByText('Observer');
    if (await observerBtn.isVisible()) {
      await observerBtn.click();
      await expect(page.locator('.observer-panel')).toBeVisible({ timeout: 5000 });
    }

    const metricsBtn = page.locator('.view-toggle').getByText('Metrics');
    if (await metricsBtn.isVisible()) {
      await metricsBtn.click();
      await expect(page.locator('.metrics-panel')).toBeVisible({ timeout: 5000 });
    }

    const timelineBtn = page.locator('.view-toggle').getByText('Timeline');
    if (await timelineBtn.isVisible()) {
      await timelineBtn.click();
      await expect(page.locator('.timeline')).toBeVisible({ timeout: 5000 });
    }
  });
});
