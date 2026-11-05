import { expect, test } from '@playwright/test';

import { expectOrderConfirmed, fillContact, FIRST_PRODUCT } from './helpers';

test('AC-8.1: storefront → product → cart → fictitious checkout → confirmation', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('product-card')).toHaveCount(24);

  await page.getByRole('link', { name: 'Cozinha', exact: true }).click();
  await expect(page.getByTestId('product-card')).toHaveCount(6);

  await page.goto('/');
  await page.getByTestId('product-card').filter({ hasText: FIRST_PRODUCT.name }).click();
  await expect(page).toHaveURL(`/products/${FIRST_PRODUCT.slug}`);
  await expect(page.getByRole('heading', { name: FIRST_PRODUCT.name })).toBeVisible();

  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.getByRole('status')).toHaveText('Adicionado ao carrinho.');
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  await page.getByRole('link', { name: /Carrinho/ }).click();
  await expect(page.getByTestId('cart-line')).toHaveCount(1);
  await page.getByLabel(`Quantidade de ${FIRST_PRODUCT.name}`).fill('2');
  await page.getByRole('button', { name: 'Atualizar' }).click();
  await expect(page.getByTestId('cart-count')).toHaveText('2');

  await page.getByRole('link', { name: 'Finalizar compra' }).click();
  await expect(page.locator('[data-checkout-layout="one-page"]')).toBeVisible();
  await fillContact(page);
  await page.getByLabel('Frete').selectOption('express');
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();

  await expectOrderConfirmed(page);
});

test('AC-8.1: removing the last item empties the cart and the checkout sends back to it', async ({
  page,
}) => {
  await page.goto(`/products/${FIRST_PRODUCT.slug}`);
  await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');

  await page.goto('/cart');
  await page.getByRole('button', { name: 'Remover' }).click();
  await expect(page.getByText('Seu carrinho está vazio.')).toBeVisible();

  await page.goto('/checkout');
  await expect(page).toHaveURL('/cart');
});

test('unknown products answer 404', async ({ page }) => {
  const response = await page.goto('/products/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Página não encontrada')).toBeVisible();
});
