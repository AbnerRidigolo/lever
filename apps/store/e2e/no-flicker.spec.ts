import { expect, test } from '@playwright/test';

import { fillCart, forceStub } from './helpers';

// AC-8.5: the variant is decided on the server. The very first HTML response already holds
// only the right version, so nothing can flash before hydration.

test('AC-8.5: the first response of a new visitor holds only the default banner', async ({
  playwright,
}) => {
  const request = await playwright.request.newContext({ baseURL: 'http://localhost:3102' });
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const html = await response.text();
  expect(html).toContain('data-banner="default"');
  expect(html).not.toContain('data-banner="new"');
  await request.dispose();
});

test('AC-8.5: with the flag on, the HTML holds only the new banner', async ({ page, context }) => {
  await forceStub(context, { flags: { 'new-banner': true } });
  const html = await (await page.request.get('/')).text();
  expect(html).toContain('data-banner="new"');
  expect(html).not.toContain('data-banner="default"');
});

test('AC-8.5: the checkout HTML holds only the layout of the variant', async ({
  page,
  context,
}) => {
  await fillCart(context);
  await forceStub(context, { experiments: { 'checkout-layout': 'multi-step' } });
  const multiStep = await (await page.request.get('/checkout')).text();
  expect(multiStep).toContain('data-checkout-layout="multi-step"');
  expect(multiStep).not.toContain('data-checkout-layout="one-page"');
  // The hidden field of the one-page form; the panel's option lists are not layouts.
  expect(multiStep).not.toMatch(/name="layout"[^>]*value="one-page"/);

  await forceStub(context, {});
  const onePage = await (await page.request.get('/checkout')).text();
  expect(onePage).toContain('data-checkout-layout="one-page"');
  expect(onePage).not.toContain('data-checkout-layout="multi-step"');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('AC-8.5: the page is complete and right before any script runs', async ({
    page,
    context,
  }) => {
    await fillCart(context);
    await forceStub(context, {
      flags: { 'new-banner': true },
      experiments: { 'checkout-layout': 'multi-step' },
    });
    await page.goto('/');
    await expect(page.locator('[data-banner="new"]')).toBeVisible();
    await page.goto('/checkout');
    await expect(page.locator('[data-checkout-layout="multi-step"]')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Etapas' })).toBeVisible();
  });
});
