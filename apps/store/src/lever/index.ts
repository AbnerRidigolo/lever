import { cookies } from 'next/headers';
import { cache } from 'react';

import { getIdentity } from '@/server/context';
import { COOKIES, parseJsonCookie } from '@/server/cookies';
import { storeEnv } from '@/server/env';
import { logger } from '@/server/logger';
import { storeMetrics } from '@/server/metrics';

import type { LeverAdapter } from './adapter';
import { withSafety } from './decorate';
import { logExposure } from './exposure';
import {
  CHECKOUT_CONTROL,
  CHECKOUT_LAYOUT_EXPERIMENT,
  NEW_BANNER_FLAG,
  resolveCheckoutLayout,
  type CheckoutLayout,
} from './keys';
import { createSdkAdapter, sdkRuntime } from './sdk-adapter';
import { createStubAdapter } from './stub-adapter';
import { mergeOverrides, stubOverridesSchema } from './stub-overrides';

/** Adapter of the configured mode, without the safety wrapper (store plan, D1). */
async function createAdapter(): Promise<LeverAdapter> {
  const env = storeEnv();
  if (env.LEVER_ADAPTER === 'sdk') {
    if (env.LEVER_API_KEY === undefined) throw new Error('LEVER_API_KEY is required in sdk mode');
    const runtime = sdkRuntime({
      apiKey: env.LEVER_API_KEY,
      baseUrl: env.LEVER_DECISION_URL,
      logger,
    });
    // Only the first requests wait (up to SDK_READY_TIMEOUT_MS); then this resolves at once.
    await runtime.ready;
    return createSdkAdapter(runtime.client);
  }

  // Stub: the per-browser cookie is read only in this mode.
  const cookieStore = await cookies();
  const overrides = mergeOverrides(
    env.LEVER_STUB_OVERRIDES,
    parseJsonCookie(stubOverridesSchema, cookieStore.get(COOKIES.stubOverrides)?.value),
  );
  return createStubAdapter({
    overrides,
    onExposure: (event) => {
      logExposure(logger, event);
    },
  });
}

/** Lever for the current request: the configured adapter, wrapped by `withSafety`. */
export const getLever = cache(async (): Promise<LeverAdapter> => {
  const metrics = storeMetrics();
  const lever = withSafety(await createAdapter(), { logger, observer: metrics.observer });
  metrics.setConfigSource(lever);
  return lever;
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
