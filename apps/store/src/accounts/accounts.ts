import { z } from 'zod';

import { verifySignedValue } from '@/server/session';

// Fictitious store accounts (store plan, D4): fixed ids, no e-mail and no password.
// They are not console users and live in no database table.

export const STORE_ACCOUNTS = [
  { id: 'store-account-0001', name: 'Ana Exemplo' },
  { id: 'store-account-0002', name: 'Bruno Teste' },
  { id: 'store-account-0003', name: 'Carla Demo' },
  { id: 'store-account-0004', name: 'Diego Fictício' },
] as const;

export type StoreAccount = (typeof STORE_ACCOUNTS)[number];

export function findAccount(id: string | undefined): StoreAccount | undefined {
  return STORE_ACCOUNTS.find((account) => account.id === id);
}

export const accountIdSchema = z
  .string()
  .refine((id) => findAccount(id) !== undefined, 'unknown store account');

/** Account id of a signed cookie; a bad signature or an unknown id means "no account". */
export function readAccountId(cookieValue: string | undefined, secret: string): string | undefined {
  const parsed = accountIdSchema.safeParse(verifySignedValue(cookieValue, secret));
  return parsed.success ? parsed.data : undefined;
}
