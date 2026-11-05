import { expect, test } from '@playwright/test';

import { fillCart, forceStub } from '../helpers';

import { storeGauge } from './metrics';

// These run without the author's evaluation: the SDK connects, keeps the configuration and,
// while evaluation throws `not implemented`, serves the default value and the control variant.

test('AC-5.3, section 10: the store SDK receives the configuration from the decision service', async ({
  request,
}) => {
  await request.get('/');
  await expect
    .poll(() => storeGauge(request, 'lever_sdk_config_version'), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  const age = await storeGauge(request, 'lever_sdk_config_age_seconds');
  expect(age).not.toBeNull();
  expect(age).toBeLessThan(60);
});

test('AC-8.5: pages are evaluated on the server by the SDK', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByTestId('panel-adapter')).toHaveText('sdk');
  // new-banner is off in the seed, so the default banner is right with or without evaluation.
  await expect(page.locator('[data-banner="default"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aplicar sobrescritas' })).toHaveCount(0);

  const metrics = await (await request.get('/metrics')).text();
  expect(metrics).toMatch(/lever_sdk_evaluations_total\{kind="flag",key="new-banner"\} [1-9]/);
});

test('D1: stub overrides are ignored in sdk mode', async ({ page, context }) => {
  await forceStub(context, { flags: { 'new-banner': true } });
  await page.goto('/');
  await expect(page.locator('[data-banner="default"]')).toBeVisible();
  await expect(page.locator('[data-banner="new"]')).toHaveCount(0);
});

test('AC-8.3: the checkout renders one layout of the experiment', async ({ page, context }) => {
  await fillCart(context);
  await page.goto('/checkout');
  await expect(page.getByTestId('checkout-variant')).toHaveText(/^(one-page|multi-step)$/);
  await expect(page.locator('[data-checkout-layout]')).toHaveCount(1);
});
