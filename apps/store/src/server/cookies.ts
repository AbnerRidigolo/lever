import type { z } from 'zod';

// Every cookie of the store: httpOnly, because evaluation happens on the server (store plan, D3).

export const COOKIES = {
  uid: 'lever_uid',
  account: 'lever_account',
  persona: 'lever_persona',
  cart: 'lever_cart',
  checkout: 'lever_checkout',
  lastOrder: 'lever_last_order',
  stubOverrides: 'lever_stub_overrides',
} as const;

const DAY = 24 * 60 * 60;

export const COOKIE_MAX_AGE = {
  uid: 365 * DAY,
  account: 7 * DAY,
  persona: 30 * DAY,
  cart: 30 * DAY,
  checkout: 60 * 60,
  lastOrder: 10 * 60,
  stubOverrides: 30 * DAY,
} as const satisfies Record<keyof typeof COOKIES, number>;

export interface StoreCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
}

/**
 * `Secure` only in production builds. Browsers treat http://localhost as a secure context,
 * so `next start` still works locally.
 */
export function cookieOptions(name: keyof typeof COOKIES): StoreCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE[name],
  };
}

/** Parses a JSON cookie with a schema; anything invalid is treated as absent. */
export function parseJsonCookie<T extends z.ZodType>(
  schema: T,
  value: string | undefined,
): z.infer<T> | undefined {
  if (value === undefined || value === '') return undefined;
  try {
    const result = schema.safeParse(JSON.parse(value));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}
