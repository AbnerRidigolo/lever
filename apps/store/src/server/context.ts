import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { personaSchema, resolveAttributes } from './attributes';
import { COOKIES, parseJsonCookie } from './cookies';
import { logger } from './logger';
import { buildIdentity, isValidUid, newUid, type Identity } from './user';

/** Identity of the current request, built once per render (store plan, section 4). */
export const getIdentity = cache(async (): Promise<Identity> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  let uid = cookieStore.get(COOKIES.uid)?.value;
  if (!isValidUid(uid)) {
    // The proxy always sets it; this only happens on routes outside its matcher.
    logger.warn('request without an anonymous id cookie');
    uid = newUid();
  }

  const attributes = resolveAttributes({
    userAgent: headerStore.get('user-agent'),
    acceptLanguage: headerStore.get('accept-language'),
    persona: parseJsonCookie(personaSchema, cookieStore.get(COOKIES.persona)?.value),
  });

  return buildIdentity({ uid, accountId: undefined, attributes });
});
