import { cookies } from 'next/headers';

import { findProductById } from '@/catalog/catalog';

import { parseCart, serializeCart, viewCart, type Cart, type CartView } from './cart';
import { COOKIES, cookieOptions } from './cookies';

export async function readCart(): Promise<Cart> {
  return parseCart((await cookies()).get(COOKIES.cart)?.value);
}

export async function readCartView(): Promise<CartView> {
  return viewCart(await readCart(), findProductById);
}

/** Only from Server Actions: Server Components cannot set cookies. */
export async function writeCart(cart: Cart): Promise<void> {
  const cookieStore = await cookies();
  if (cart.length === 0) cookieStore.delete(COOKIES.cart);
  else cookieStore.set(COOKIES.cart, serializeCart(cart), cookieOptions('cart'));
}
