import { cookies } from 'next/headers';
import { cache } from 'react';

import { getIdentity } from '@/server/context';
import { COOKIES, parseJsonCookie } from '@/server/cookies';
import { storeEnv } from '@/server/env';
import { logger } from '@/server/logger';

import { noopObserver, type LeverAdapter } from './adapter';
import { withSafety } from './decorate';
import { logExposure } from './exposure';
import {
  CHECKOUT_CONTROL,
  CHECKOUT_LAYOUT_EXPERIMENT,
  NEW_BANNER_FLAG,
  resolveCheckoutLayout,
  type CheckoutLayout,
} from './keys';
import { createStubAdapter } from './stub-adapter';
import { mergeOverrides, stubOverridesSchema } from './stub-overrides';

/** Lever for the current request (store plan, D1). Today always the stub; T12 adds the SDK. */
export const getLever = cache(async (): Promise<LeverAdapter> => {
  const env = storeEnv();
  const cookieStore = await cookies();
  const overrides = mergeOverrides(
    env.LEVER_STUB_OVERRIDES,
    parseJsonCookie(stubOverridesSchema, cookieStore.get(COOKIES.stubOverrides)?.value),
  );
  const adapter = createStubAdapter({
    overrides,
    onExposure: (event) => {
      logExposure(logger, event);
    },
  });
  return withSafety(adapter, { logger, observer: noopObserver });
});

/** Whether `new-banner` is on for the current user (AC-8.2). One evaluation per request. */
export const isNewBannerOn = cache(async (): Promise<boolean> => {
  const [lever, identity] = await Promise.all([getLever(), getIdentity()]);
  return lever.getFlag(NEW_BANNER_FLAG, identity.user, false);
});

/**
 * Checkout layout of the current user (AC-8.3). Evaluated only where it is used, so only
 * users who reach the checkout are exposed (store plan, D9).
 */
export const getCheckoutLayout = cache(async (): Promise<CheckoutLayout> => {
  const [lever, identity] = await Promise.all([getLever(), getIdentity()]);
  const variant = await lever.getVariant(
    CHECKOUT_LAYOUT_EXPERIMENT,
    identity.user,
    CHECKOUT_CONTROL,
  );
  return resolveCheckoutLayout(variant, logger);
});
