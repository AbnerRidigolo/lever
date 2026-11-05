import { describe, expect, it } from 'vitest';

import { findProductById, listProducts } from '@/catalog/catalog';
import { viewCart } from '@/server/cart';
import {
  checkoutDraftSchema,
  createOrder,
  lastOrderSchema,
  mergeDraft,
  newOrderNumber,
  parseCheckoutDraft,
  resolveStep,
  type CheckoutDraft,
} from '@/server/checkout';

const contact = { name: 'Pessoa Fictícia', address: 'Rua Imaginária, 100', city: 'Cidade Demo' };
const delivery = { shipping: 'express', payment: 'pix' } as const;

describe('AC-8.3: multi-step checkout steps', () => {
  it('AC-8.3: starts at step 1 and moves forward as steps are saved', () => {
    expect(resolveStep(undefined, undefined)).toBe(1);
    expect(resolveStep(undefined, { layout: 'multi-step', contact })).toBe(2);
    expect(resolveStep(undefined, { layout: 'multi-step', contact, delivery })).toBe(3);
  });

  it('AC-8.3: a step out of order goes back to the first incomplete one', () => {
    expect(resolveStep('3', undefined)).toBe(1);
    expect(resolveStep('3', { layout: 'multi-step', contact })).toBe(2);
    expect(resolveStep('1', { layout: 'multi-step', contact, delivery })).toBe(1);
    expect(resolveStep('abc', { layout: 'multi-step', contact })).toBe(2);
  });

  it('AC-8.3: a draft from the one-page layout restarts at step 1 with its data', () => {
    const draft: CheckoutDraft = { layout: 'one-page', contact, delivery };
    expect(resolveStep('3', draft)).toBe(1);
  });
});

describe('checkout draft', () => {
  it('keeps the valid parts of a form and the previous data', () => {
    const first = mergeDraft(undefined, 'multi-step', { ...contact, shipping: 'teleport' });
    expect(first).toEqual({ layout: 'multi-step', contact });
    const second = mergeDraft(first, 'multi-step', delivery);
    expect(second).toEqual({ layout: 'multi-step', contact, delivery });
  });

  it('drops an invalid draft cookie', () => {
    expect(parseCheckoutDraft('{"layout":"express"}')).toBeUndefined();
    expect(parseCheckoutDraft(JSON.stringify({ layout: 'one-page', contact }))).toEqual({
      layout: 'one-page',
      contact,
    });
  });

  it('rejects contact data out of bounds', () => {
    expect(
      checkoutDraftSchema.safeParse({ layout: 'one-page', contact: { ...contact, name: 'A' } })
        .success,
    ).toBe(false);
  });
});

describe('AC-8.1: fictitious order', () => {
  it('AC-8.1: totals the cart and the shipping, without personal data', () => {
    const [product] = listProducts();
    if (product === undefined) throw new Error('empty catalog');
    const cart = viewCart([{ productId: product.id, quantity: 2 }], findProductById);
    const order = createOrder({ cart, delivery, layout: 'multi-step', number: 'LV-ABCD2345' });

    expect(order).toEqual({
      number: 'LV-ABCD2345',
      itemCount: 2,
      subtotalCents: product.priceCents * 2,
      shippingCents: 1990,
      totalCents: product.priceCents * 2 + 1990,
      shipping: 'express',
      payment: 'pix',
      layout: 'multi-step',
    });
    expect(JSON.stringify(order)).not.toContain(contact.name);
    expect(JSON.stringify(order)).not.toContain(contact.address);
  });

  it('generates valid order numbers', () => {
    const number = newOrderNumber();
    expect(number).toMatch(/^LV-[A-Z0-9]{8}$/);
    expect(lastOrderSchema.shape.number.safeParse(number).success).toBe(true);
  });
});
