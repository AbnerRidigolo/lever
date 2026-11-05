import type { ExposureEvent } from '@lever/schemas';

import { sameFlagType, type LeverAdapter } from './adapter';
import type { StubOverrides } from './stub-overrides';

/** Fictitious config version of the stub: the minimum accepted by `configVersionSchema`. */
export const STUB_CONFIG_VERSION = 1;

/**
 * Stand-in for `@lever/sdk` until it merges (store plan, D1). No network, no database and
 * no hashing or bucketing (reserved for the author): it serves the default value or the
 * fallback variant, unless an override forces another one.
 */
export function createStubAdapter(options: {
  overrides: StubOverrides;
  onExposure: (event: ExposureEvent) => void;
  now?: () => Date;
}): LeverAdapter {
  const now = options.now ?? (() => new Date());

  return {
    getFlag(key, _user, defaultValue) {
      const forced = options.overrides.flags[key];
      return Promise.resolve(
        forced !== undefined && sameFlagType(forced, defaultValue) ? forced : defaultValue,
      );
    },

    getVariant(key, user, fallbackVariant) {
      const variantKey = options.overrides.experiments[key] ?? fallbackVariant;
      options.onExposure({
        type: 'exposure',
        experimentKey: key,
        variantKey,
        userId: user.id,
        configVersion: STUB_CONFIG_VERSION,
        timestamp: now().toISOString(),
      });
      return Promise.resolve(variantKey);
    },

    configAgeSeconds: () => null,
    configVersion: () => null,
  };
}
