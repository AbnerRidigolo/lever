'use server';

import { z } from 'zod';

import { findProductById } from '@/catalog/catalog';
import { productIdSchema } from '@/catalog/schema';
import { addToCart, MAX_QUANTITY, removeFromCart, setQuantity } from '@/server/cart';
import { readCart, writeCart } from '@/server/cart-cookie';
import { logger } from '@/server/logger';

export interface AddToCartState {
  status: 'idle' | 'added' | 'full' | 'invalid';
}

const addInputSchema = z.object({
  productId: productIdSchema,
  quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY).default(1),
});

const quantityInputSchema = z.object({
  productId: productIdSchema,
  quantity: z.coerce.number().int().min(0).max(MAX_QUANTITY),
});

const removeInputSchema = z.object({ productId: productIdSchema });

function fields(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

export async function addToCartAction(
  _previous: AddToCartState,
  formData: FormData,
): Promise<AddToCartState> {
  const input = addInputSchema.safeParse(fields(formData));
  if (!input.success || findProductById(input.data.productId) === undefined) {
    logger.warn('invalid add to cart request');
    return { status: 'invalid' };
  }
  const result = addToCart(await readCart(), input.data.productId, input.data.quantity);
  if (result.status === 'added') await writeCart(result.cart);
  return { status: result.status };
}

export async function updateQuantityAction(formData: FormData): Promise<void> {
  const input = quantityInputSchema.safeParse(fields(formData));
  if (!input.success) {
    logger.warn('invalid cart quantity request');
    return;
  }
  await writeCart(setQuantity(await readCart(), input.data.productId, input.data.quantity));
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  const input = removeInputSchema.safeParse(fields(formData));
  if (!input.success) {
    logger.warn('invalid cart removal request');
    return;
  }
  await writeCart(removeFromCart(await readCart(), input.data.productId));
}
