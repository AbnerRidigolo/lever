import { expect, test } from '@playwright/test';

// With the stub, the value of new-banner comes from the panel override (store plan, D1).
// The same flow with the real SDK is in e2e/sdk/ (T12).

test('AC-8.2: new-banner controls the home banner (stub override)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-banner="default"]')).toBeVisible();
  await expect(page.locator('[data-banner="new"]')).toHaveCount(0);
  await expect(page.getByTestId('panel-new-banner')).toHaveText('false');

  await page.getByLabel('new-banner').selectOption('on');
  await page.getByRole('button', { name: 'Aplicar sobrescritas' }).click();
  await expect(page.locator('[data-banner="new"]')).toBeVisible();
  await expect(page.locator('[data-banner="default"]')).toHaveCount(0);
  await expect(page.getByTestId('panel-new-banner')).toHaveText('true');

  // Q3: the next page load already reflects the value.
  await page.reload();
  await expect(page.locator('[data-banner="new"]')).toBeVisible();

  await page.getByLabel('new-banner').selectOption('auto');
  await page.getByRole('button', { name: 'Aplicar sobrescritas' }).click();
  await expect(page.locator('[data-banner="default"]')).toBeVisible();
});
