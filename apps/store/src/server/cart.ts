import { z } from 'zod';

import { productIdSchema, type Product } from '@/catalog/schema';

import { parseJsonCookie } from './cookies';

// Cart kept in the `lever_cart` cookie (AC-8.1, store plan D7). Pure functions: the cookie
// is read in Server Components and written by Server Actions.

export const MAX_CART_LINES = 20;
export const MAX_QUANTITY = 10;

export const cartLineSchema = z.object({
  productId: productIdSchema,
  quantity: z.int().min(1).max(MAX_QUANTITY),
});
export const cartSchema = z.array(cartLineSchema).max(MAX_CART_LINES);
export type Cart = z.infer<typeof cartSchema>;

/** An invalid or missing cookie is an empty cart. */
export function parseCart(value: string | undefined): Cart {
  return parseJsonCookie(cartSchema, value) ?? [];
}

export function serializeCart(cart: Cart): string {
  return JSON.stringify(cartSchema.parse(cart));
}

export type AddResult = { status: 'added'; cart: Cart } | { status: 'full'; cart: Cart };

/** Adds to an existing line (capped at the maximum quantity) or opens a new one. */
export function addToCart(cart: Cart, productId: string, quantity = 1): AddResult {
  const existing = cart.find((line) => line.productId === productId);
  if (existing !== undefined) {
    return {
      status: 'added',
      cart: cart.map((line) =>
        line === existing
          ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + quantity) }
          : line,
      ),
    };
  }
  if (cart.length >= MAX_CART_LINES) return { status: 'full', cart };
  return {
    status: 'added',
    cart: [...cart, { productId, quantity: Math.min(MAX_QUANTITY, Math.max(1, quantity)) }],
  };
}

/** Sets the quantity of a line; zero or less removes it. */
export function setQuantity(cart: Cart, productId: string, quantity: number): Cart {
  if (quantity <= 0) return removeFromCart(cart, productId);
  return cart.map((line) =>
    line.productId === productId ? { ...line, quantity: Math.min(MAX_QUANTITY, quantity) } : line,
  );
}

export function removeFromCart(cart: Cart, productId: string): Cart {
  return cart.filter((line) => line.productId !== productId);
}

export interface CartLineView {
  product: Product;
  quantity: number;
  subtotalCents: number;
}

export interface CartView {
  lines: CartLineView[];
  itemCount: number;
  totalCents: number;
}

/** Lines with their products; products no longer in the catalog are skipped. */
export function viewCart(cart: Cart, findProduct: (id: string) => Product | undefined): CartView {
  const lines = cart.flatMap((line) => {
    const product = findProduct(line.productId);
    return product === undefined
      ? []
      : [{ product, quantity: line.quantity, subtotalCents: product.priceCents * line.quantity }];
  });
  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalCents: lines.reduce((sum, line) => sum + line.subtotalCents, 0),
  };
}
