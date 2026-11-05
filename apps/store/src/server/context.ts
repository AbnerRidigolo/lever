import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { findAccount, readAccountId, type StoreAccount } from '@/accounts/accounts';

import { personaSchema, resolveAttributes, type Persona } from './attributes';
import { COOKIES, parseJsonCookie } from './cookies';
import { storeEnv } from './env';
import { logger } from './logger';
import { buildIdentity, isValidUid, newUid, type Identity } from './user';

/** Fictitious account of the current request, from the signed cookie (store plan, D4). */
export const getAccount = cache(async (): Promise<StoreAccount | undefined> => {
  const cookieStore = await cookies();
  return findAccount(
    readAccountId(cookieStore.get(COOKIES.account)?.value, storeEnv().STORE_SESSION_SECRET),
  );
});

export const getPersona = cache(async (): Promise<Persona | undefined> =>
  parseJsonCookie(personaSchema, (await cookies()).get(COOKIES.persona)?.value),
);

/** Identity of the current request, built once per render (store plan, section 4). */
export const getIdentity = cache(async (): Promise<Identity> => {
  const [cookieStore, headerStore, account, persona] = await Promise.all([
    cookies(),
    headers(),
    getAccount(),
    getPersona(),
  ]);

  let uid = cookieStore.get(COOKIES.uid)?.value;
  if (!isValidUid(uid)) {
    // The proxy always sets it; this only happens on routes outside its matcher.
    logger.warn('request without an anonymous id cookie');
    uid = newUid();
  }

  const attributes = resolveAttributes({
    userAgent: headerStore.get('user-agent'),
    acceptLanguage: headerStore.get('accept-language'),
    persona,
  });

  return buildIdentity({ uid, accountId: account?.id, attributes });
});
