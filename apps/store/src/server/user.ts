import { userContextSchema, type UserContext } from '@lever/schemas';
import { z } from 'zod';

import type { StoreAttributes } from './attributes';

// Identity of the store user (AC-8.4, spec 001 section 13, store plan D3 and D4).

export const uidSchema = z.uuid();

export function isValidUid(value: string | undefined): value is string {
  return value !== undefined && uidSchema.safeParse(value).success;
}

export function newUid(): string {
  return crypto.randomUUID();
}

export type IdentitySource = 'anonymous' | 'account';

export interface Identity {
  user: UserContext;
  source: IdentitySource;
}

/**
 * The account id replaces the anonymous id while the user is logged in (section 13).
 * The anonymous id is kept, so logging out brings the previous id back.
 */
export function buildIdentity(input: {
  uid: string;
  accountId: string | undefined;
  attributes: StoreAttributes;
}): Identity {
  const source: IdentitySource = input.accountId === undefined ? 'anonymous' : 'account';
  const user = userContextSchema.parse({
    id: input.accountId ?? input.uid,
    attributes: { ...input.attributes },
  });
  return { user, source };
}
