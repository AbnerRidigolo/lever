import { expect, type BrowserContext, type Page } from '@playwright/test';

import { STORE_URL } from './env';

/** First product of the versioned catalog (src/catalog/products.json). */
export const FIRST_PRODUCT = { id: 'prd-0001', slug: 'cesto-cerrado', name: 'Cesto Cerrado' };

/** Cookie values are URI-encoded, as Next.js writes and reads them. */
async function setCookie(context: BrowserContext, name: string, value: unknown): Promise<void> {
  await context.addCookies([
    {
      name,
      value: encodeURIComponent(JSON.stringify(value)),
      url: STORE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

/** Values forced by the stub adapter for this browser only (store plan, D1). */
export async function forceStub(
  context: BrowserContext,
  overrides: { flags?: Record<string, unknown>; experiments?: Record<string, string> },
): Promise<void> {
  await setCookie(context, 'lever_stub_overrides', {
    flags: overrides.flags ?? {},
    experiments: overrides.experiments ?? {},
  });
}

export async function fillCart(context: BrowserContext, quantity = 1): Promise<void> {
  await setCookie(context, 'lever_cart', [{ productId: FIRST_PRODUCT.id, quantity }]);
}

export async function uidCookie(context: BrowserContext) {
  return (await context.cookies(STORE_URL)).find((cookie) => cookie.name === 'lever_uid');
}

export async function fillContact(page: Page): Promise<void> {
  await page.getByLabel('Nome').fill('Pessoa Fictícia');
  await page.getByLabel('Endereço').fill('Rua Imaginária, 100');
  await page.getByLabel('Cidade').fill('Cidade Demo');
}

export async function expectOrderConfirmed(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/checkout\/confirmation$/);
  await expect(page.getByTestId('order-number')).toHaveText(/^LV-[A-Z0-9]{8}$/);
  await expect(page.getByTestId('cart-count')).toHaveText('0');
}
