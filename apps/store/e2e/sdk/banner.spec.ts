import { expect, test } from '@playwright/test';

import { setNewBanner } from './db';

// Needs evaluateFlag from @lever/evaluation: until then the SDK serves the default (false).

test.afterEach(async () => {
  await setNewBanner(false);
});

test('AC-8.2, AC-1.1, AC-1.2: turning new-banner on and off shows on the next load within 5 s', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-banner="default"]')).toBeVisible();

  await setNewBanner(true);
  await expect(async () => {
    await page.reload();
    await expect(page.locator('[data-banner="new"]')).toBeVisible({ timeout: 200 });
  }).toPass({ timeout: 5_000, intervals: [250] });

  await setNewBanner(false);
  await expect(async () => {
    await page.reload();
    await expect(page.locator('[data-banner="default"]')).toBeVisible({ timeout: 200 });
  }).toPass({ timeout: 5_000, intervals: [250] });
});
