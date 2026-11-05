import { expect, test } from '@playwright/test';

import { createSegment, setNewBanner } from './db';
import { AUTHOR_PENDING_REASON, AUTHOR_READY } from './env';

// Needs matchesSegment and evaluateFlag from @lever/evaluation.
test.skip(!AUTHOR_READY, AUTHOR_PENDING_REASON);

test.afterEach(async () => {
  await setNewBanner(false);
});

test('AC-4.3, AC-8.4: new-banner limited to country = BR follows the demo persona', async ({
  page,
}) => {
  const segmentId = await createSegment('store-e2e-brazil', {
    conditions: [{ attribute: 'country', operator: 'equals', value: 'BR' }],
  });
  await setNewBanner(true, segmentId);

  await page.goto('/');
  await page.getByLabel('country').selectOption('BR');
  await page.getByRole('button', { name: 'Aplicar persona' }).click();
  await expect(async () => {
    await page.reload();
    await expect(page.locator('[data-banner="new"]')).toBeVisible({ timeout: 200 });
  }).toPass({ timeout: 5_000, intervals: [250] });

  await page.getByLabel('country').selectOption('US');
  await page.getByRole('button', { name: 'Aplicar persona' }).click();
  await expect(page.locator('[data-banner="default"]')).toBeVisible();
});
