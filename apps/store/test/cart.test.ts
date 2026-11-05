import { describe, expect, it } from 'vitest';

import { findProductById, listProducts } from '@/catalog/catalog';
import {
  addToCart,
  MAX_CART_LINES,
  MAX_QUANTITY,
  parseCart,
  removeFromCart,
  serializeCart,
  setQuantity,
  viewCart,
  type Cart,
} from '@/server/cart';

const [first, second] = listProducts();
if (first === undefined || second === undefined) throw new Error('empty catalog');

describe('AC-8.1: cart', () => {
  it('AC-8.1: adds a product and adds again to the same line', () => {
    let cart: Cart = [];
    cart = addToCart(cart, first.id).cart;
    cart = addToCart(cart, first.id, 2).cart;
    cart = addToCart(cart, second.id).cart;
    expect(cart).toEqual([
      { productId: first.id, quantity: 3 },
      { productId: second.id, quantity: 1 },
    ]);
  });

  it('caps the quantity of a line', () => {
    const cart = addToCart([{ productId: first.id, quantity: 9 }], first.id, 5).cart;
    expect(cart[0]?.quantity).toBe(MAX_QUANTITY);
    expect(setQuantity(cart, first.id, 50)[0]?.quantity).toBe(MAX_QUANTITY);
  });

  it('refuses a new line when the cart is full', () => {
    const full: Cart = Array.from({ length: MAX_CART_LINES }, (_, i) => ({
      productId: `prd-${String(9000 + i)}`,
      quantity: 1,
    }));
    const result = addToCart(full, first.id);
    expect(result.status).toBe('full');
    expect(result.cart).toBe(full);
  });

  it('AC-8.1: sets quantities and removes lines', () => {
    const cart: Cart = [
      { productId: first.id, quantity: 2 },
      { productId: second.id, quantity: 1 },
    ];
    expect(setQuantity(cart, first.id, 4)[0]?.quantity).toBe(4);
    expect(setQuantity(cart, first.id, 0)).toEqual([{ productId: second.id, quantity: 1 }]);
    expect(removeFromCart(cart, second.id)).toEqual([{ productId: first.id, quantity: 2 }]);
  });

  it('AC-8.1: computes subtotals, item count and total', () => {
    const view = viewCart(
      [
        { productId: first.id, quantity: 2 },
        { productId: second.id, quantity: 1 },
        { productId: 'prd-9999', quantity: 1 },
      ],
      findProductById,
    );
    expect(view.lines).toHaveLength(2);
    expect(view.itemCount).toBe(3);
    expect(view.totalCents).toBe(first.priceCents * 2 + second.priceCents);
  });

  it('an invalid cookie is an empty cart', () => {
    expect(parseCart(undefined)).toEqual([]);
    expect(parseCart('nonsense')).toEqual([]);
    expect(parseCart('[{"productId":"prd-0001","quantity":99}]')).toEqual([]);
    expect(parseCart('[{"productId":"x","quantity":1}]')).toEqual([]);
  });

  it('round-trips through the cookie', () => {
    const cart: Cart = [{ productId: first.id, quantity: 2 }];
    expect(parseCart(serializeCart(cart))).toEqual(cart);
  });
});
