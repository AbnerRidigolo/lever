import { randomInt } from 'node:crypto';

import { z } from 'zod';

import { checkoutLayoutSchema, type CheckoutLayout } from '@/lever/keys';

import type { CartView } from './cart';
import { parseJsonCookie } from './cookies';

// Fictitious checkout (AC-8.1, AC-8.3, store plan section 4). No card fields: nothing that
// looks like payment data is ever collected, stored or logged.

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(160),
  city: z.string().trim().min(2).max(80),
});
export type Contact = z.infer<typeof contactSchema>;

export const SHIPPING_OPTIONS = ['standard', 'express'] as const;
export const PAYMENT_OPTIONS = ['pix', 'boleto', 'cartao-teste'] as const;

export const deliverySchema = z.object({
  shipping: z.enum(SHIPPING_OPTIONS),
  payment: z.enum(PAYMENT_OPTIONS),
});
export type Delivery = z.infer<typeof deliverySchema>;

export const SHIPPING: Record<Delivery['shipping'], { label: string; cents: number }> = {
  standard: { label: 'Padrão (grátis)', cents: 0 },
  express: { label: 'Expressa', cents: 1990 },
};

export const PAYMENT_LABELS: Record<Delivery['payment'], string> = {
  pix: 'Pix fictício',
  boleto: 'Boleto fictício',
  'cartao-teste': 'Cartão de teste (sem número)',
};

/** Data typed so far, kept in the `lever_checkout` cookie for one hour. */
export const checkoutDraftSchema = z.object({
  layout: checkoutLayoutSchema,
  contact: contactSchema.optional(),
  delivery: deliverySchema.optional(),
});
export type CheckoutDraft = z.infer<typeof checkoutDraftSchema>;

export function parseCheckoutDraft(value: string | undefined): CheckoutDraft | undefined {
  return parseJsonCookie(checkoutDraftSchema, value);
}

export const MULTI_STEP_STEPS = [1, 2, 3] as const;
export type Step = (typeof MULTI_STEP_STEPS)[number];

function firstIncompleteStep(draft: CheckoutDraft | undefined): Step {
  if (draft?.contact === undefined) return 1;
  if (draft.delivery === undefined) return 2;
  return 3;
}

/**
 * Step of the multi-step checkout to show. A step out of order goes back to the first
 * incomplete one; a draft from another layout (the variant changed mid-flow, for example
 * on login) restarts at step 1, keeping the data already typed.
 */
export function resolveStep(requested: unknown, draft: CheckoutDraft | undefined): Step {
  if (draft !== undefined && draft.layout !== 'multi-step') return 1;
  const firstIncomplete = firstIncompleteStep(draft);
  const parsed = z.coerce.number().int().min(1).max(3).safeParse(requested);
  const step = parsed.success ? parsed.data : firstIncomplete;
  return Math.min(step, firstIncomplete) as Step;
}

/** Keeps the valid parts of a submitted form, so nothing typed is lost on a rejection. */
export function mergeDraft(
  previous: CheckoutDraft | undefined,
  layout: CheckoutLayout,
  fields: Record<string, unknown>,
): CheckoutDraft {
  const contact = contactSchema.safeParse(fields);
  const delivery = deliverySchema.safeParse(fields);
  const draft: CheckoutDraft = { layout };
  const mergedContact = contact.success ? contact.data : previous?.contact;
  const mergedDelivery = delivery.success ? delivery.data : previous?.delivery;
  if (mergedContact !== undefined) draft.contact = mergedContact;
  if (mergedDelivery !== undefined) draft.delivery = mergedDelivery;
  return draft;
}

/** Summary shown on the confirmation page: no name nor address. */
export const lastOrderSchema = z.object({
  number: z.string().regex(/^LV-[A-Z0-9]{8}$/),
  itemCount: z.int().min(1),
  subtotalCents: z.int().min(0),
  shippingCents: z.int().min(0),
  totalCents: z.int().min(0),
  shipping: z.enum(SHIPPING_OPTIONS),
  payment: z.enum(PAYMENT_OPTIONS),
  layout: checkoutLayoutSchema,
});
export type LastOrder = z.infer<typeof lastOrderSchema>;

const ORDER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newOrderNumber(): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += ORDER_ALPHABET.charAt(randomInt(ORDER_ALPHABET.length));
  return `LV-${suffix}`;
}

export function createOrder(input: {
  cart: CartView;
  delivery: Delivery;
  layout: CheckoutLayout;
  number: string;
}): LastOrder {
  const shippingCents = SHIPPING[input.delivery.shipping].cents;
  return lastOrderSchema.parse({
    number: input.number,
    itemCount: input.cart.itemCount,
    subtotalCents: input.cart.totalCents,
    shippingCents,
    totalCents: input.cart.totalCents + shippingCents,
    shipping: input.delivery.shipping,
    payment: input.delivery.payment,
    layout: input.layout,
  });
}
