import type { Logger } from 'pino';
import { z } from 'zod';

// Resources created by the seed of packages/db (store plan, section 0).

export const NEW_BANNER_FLAG = 'new-banner';
export const CHECKOUT_LAYOUT_EXPERIMENT = 'checkout-layout';

export const CHECKOUT_LAYOUTS = ['one-page', 'multi-step'] as const;
export const checkoutLayoutSchema = z.enum(CHECKOUT_LAYOUTS);
export type CheckoutLayout = z.infer<typeof checkoutLayoutSchema>;

/** Control variant of `checkout-layout`: also the fallback when Lever cannot answer. */
export const CHECKOUT_CONTROL: CheckoutLayout = 'one-page';

/**
 * Layout to render for a variant. A variant the store does not know (for example a third
 * one created in the console) renders the control and logs a warning (store plan, section 4).
 */
export function resolveCheckoutLayout(variant: string, logger: Logger): CheckoutLayout {
  const parsed = checkoutLayoutSchema.safeParse(variant);
  if (parsed.success) return parsed.data;
  logger.warn(
    { experimentKey: CHECKOUT_LAYOUT_EXPERIMENT, variantKey: variant },
    'unknown checkout variant, rendering the control layout',
  );
  return CHECKOUT_CONTROL;
}
