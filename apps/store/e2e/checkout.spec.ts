import { expect, test } from '@playwright/test';

import { expectOrderConfirmed, fillCart, fillContact, forceStub } from './helpers';

// With the stub, the variant comes from an override (store plan, D1). Real assignment by the
// author's code is covered in e2e/sdk/ (T12).

test('AC-8.3: the control variant renders the one-page checkout', async ({ page, context }) => {
  await fillCart(context);
  await page.goto('/checkout');
  await expect(page.locator('[data-checkout-layout="one-page"]')).toBeVisible();
  await expect(page.getByTestId('checkout-variant')).toHaveText('one-page');
  await expect(page.getByRole('list', { name: 'Etapas' })).toHaveCount(0);

  await fillContact(page);
  await page.getByLabel('Pagamento').selectOption('boleto');
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expectOrderConfirmed(page);
});

test('AC-8.3: the multi-step variant renders the checkout in steps', async ({ page, context }) => {
  await fillCart(context, 3);
  await forceStub(context, { experiments: { 'checkout-layout': 'multi-step' } });

  await page.goto('/checkout');
  await expect(page.locator('[data-checkout-layout="multi-step"]')).toBeVisible();
  await expect(page.getByTestId('checkout-variant')).toHaveText('multi-step');

  // A step out of order goes back to the first incomplete one.
  await page.goto('/checkout?step=3');
  await expect(page.getByRole('listitem').filter({ hasText: '1. Dados' })).toHaveAttribute(
    'aria-current',
    'step',
  );

  await fillContact(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL('/checkout?step=2');

  await page.getByLabel('Frete').selectOption('express');
  await page.getByLabel('Pagamento').selectOption('cartao-teste');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL('/checkout?step=3');
  await expect(page.getByText('Rua Imaginária, 100, Cidade Demo')).toBeVisible();

  await page.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expectOrderConfirmed(page);
});

test('AC-8.3: a variant change mid-flow restarts the new layout with the typed data', async ({
  page,
  context,
}) => {
  await fillCart(context);
  await forceStub(context, { experiments: { 'checkout-layout': 'multi-step' } });
  await page.goto('/checkout');
  await fillContact(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL('/checkout?step=2');

  await forceStub(context, {});
  await page.goto('/checkout');
  await expect(page.locator('[data-checkout-layout="one-page"]')).toBeVisible();
  await expect(page.getByLabel('Nome')).toHaveValue('Pessoa Fictícia');
});
