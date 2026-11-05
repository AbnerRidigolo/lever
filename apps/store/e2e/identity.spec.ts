import { devices, expect, test } from '@playwright/test';

import { uidCookie } from './helpers';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('AC-8.4: the anonymous id is created on the first visit and kept', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const cookie = await uidCookie(context);
  expect(cookie?.value).toMatch(UUID);
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  const days = ((cookie?.expires ?? 0) - Date.now() / 1000) / 86_400;
  expect(days).toBeGreaterThan(364);
  expect(days).toBeLessThanOrEqual(365);

  // AC-8.5: the first page was already evaluated with the id the browser kept.
  await expect(page.getByTestId('panel-user-id')).toHaveAttribute(
    'data-user-id',
    cookie?.value ?? '',
  );
  await expect(page.getByTestId('panel-source')).toHaveText('anônimo');

  await page.goto('/cart');
  await page.reload();
  expect((await uidCookie(context))?.value).toBe(cookie?.value);
  await expect(page.getByTestId('panel-user-id')).toHaveAttribute(
    'data-user-id',
    cookie?.value ?? '',
  );
});

test('AC-8.4: country and device come from the headers and the demo persona', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
  await page.goto('/');
  await expect(page.getByTestId('panel-country')).toHaveText('BR');
  await expect(page.getByTestId('panel-device')).toHaveText('desktop');

  await page.getByLabel('country').selectOption('US');
  await page.getByLabel('device').selectOption('tablet');
  await page.getByRole('button', { name: 'Aplicar persona' }).click();
  await expect(page.getByTestId('panel-country')).toHaveText('US');
  await expect(page.getByTestId('panel-device')).toHaveText('tablet');

  await page.getByLabel('country').selectOption('auto');
  await page.getByLabel('device').selectOption('auto');
  await page.getByRole('button', { name: 'Aplicar persona' }).click();
  await expect(page.getByTestId('panel-country')).toHaveText('BR');
});

test.describe('on a phone', () => {
  test.use({ userAgent: devices['iPhone 15'].userAgent, locale: 'en-US' });

  test('AC-8.4: a mobile User-Agent gives device=mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('panel-device')).toHaveText('mobile');
    await expect(page.getByTestId('panel-country')).toHaveText('US');
  });
});

test('section 13: login replaces the anonymous id and logout brings it back', async ({
  page,
  context,
}) => {
  await page.goto('/');
  const uid = (await uidCookie(context))?.value ?? '';

  await page.goto('/account');
  await page.getByRole('button', { name: 'Entrar como Bruno Teste' }).click();
  await expect(page.getByTestId('account-name')).toHaveText('Bruno Teste');
  await expect(page.getByTestId('panel-user-id')).toHaveAttribute(
    'data-user-id',
    'store-account-0002',
  );
  await expect(page.getByTestId('panel-source')).toHaveText('conta');

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByTestId('panel-user-id')).toHaveAttribute('data-user-id', uid);
  await expect(page.getByTestId('panel-source')).toHaveText('anônimo');
});

test('section 13: a forged account cookie is ignored', async ({ page, context }) => {
  await context.addCookies([
    {
      name: 'lever_account',
      value: 'store-account-0001.forged-signature',
      url: 'http://localhost:3102',
    },
  ]);
  await page.goto('/');
  await expect(page.getByTestId('panel-source')).toHaveText('anônimo');
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
});
