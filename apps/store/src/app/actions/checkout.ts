'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { checkoutLayoutSchema } from '@/lever/keys';
import { readCartView } from '@/server/cart-cookie';
import {
  contactSchema,
  createOrder,
  deliverySchema,
  mergeDraft,
  newOrderNumber,
  parseCheckoutDraft,
  type CheckoutDraft,
} from '@/server/checkout';
import { COOKIES, cookieOptions } from '@/server/cookies';
import { logger } from '@/server/logger';

function fields(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

async function readDraft(): Promise<CheckoutDraft | undefined> {
  return parseCheckoutDraft((await cookies()).get(COOKIES.checkout)?.value);
}

async function writeDraft(draft: CheckoutDraft): Promise<void> {
  (await cookies()).set(COOKIES.checkout, JSON.stringify(draft), cookieOptions('checkout'));
}

/** Multi-step, step 1: name and fictitious address. */
export async function saveContactAction(formData: FormData): Promise<void> {
  const input = fields(formData);
  await writeDraft(mergeDraft(await readDraft(), 'multi-step', input));
  redirect(
    contactSchema.safeParse(input).success ? '/checkout?step=2' : '/checkout?step=1&error=1',
  );
}

/** Multi-step, step 2: shipping and fictitious payment. */
export async function saveDeliveryAction(formData: FormData): Promise<void> {
  const input = fields(formData);
  await writeDraft(mergeDraft(await readDraft(), 'multi-step', input));
  redirect(
    deliverySchema.safeParse(input).success ? '/checkout?step=3' : '/checkout?step=2&error=1',
  );
}

/**
 * Places the fictitious order: from the form in the one-page layout, from the saved steps
 * in the multi-step one. Nothing is persisted; the log carries no personal data.
 */
export async function placeOrderAction(formData: FormData): Promise<void> {
  const input = fields(formData);
  const layout = checkoutLayoutSchema.catch('one-page').parse(input.layout);
  const cart = await readCartView();
  if (cart.lines.length === 0) redirect('/cart');

  const draft = mergeDraft(await readDraft(), layout, layout === 'one-page' ? input : {});
  if (draft.contact === undefined || draft.delivery === undefined) {
    await writeDraft(draft);
    redirect(layout === 'one-page' ? '/checkout?error=1' : '/checkout');
  }

  const order = createOrder({ cart, delivery: draft.delivery, layout, number: newOrderNumber() });
  const cookieStore = await cookies();
  cookieStore.set(COOKIES.lastOrder, JSON.stringify(order), cookieOptions('lastOrder'));
  cookieStore.delete(COOKIES.cart);
  cookieStore.delete(COOKIES.checkout);
  logger.info(
    {
      orderNumber: order.number,
      itemCount: order.itemCount,
      totalCents: order.totalCents,
      layout: order.layout,
    },
    'order completed',
  );
  redirect('/checkout/confirmation');
}
