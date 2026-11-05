import { resourceKeySchema } from '@lever/schemas';
import type { Logger } from 'pino';

import { sameFlagType, type EvaluationObserver, type LeverAdapter } from './adapter';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Wraps an adapter so a page never breaks because of Lever (store plan, section 4): any
 * exception, including the author's `not implemented`, becomes the default value or the
 * fallback variant, is logged without user data and is counted.
 */
export function withSafety(
  adapter: LeverAdapter,
  { logger, observer }: { logger: Logger; observer: EvaluationObserver },
): LeverAdapter {
  return {
    async getFlag(key, user, defaultValue) {
      observer.evaluated('flag', key);
      try {
        const value = await adapter.getFlag(key, user, defaultValue);
        if (sameFlagType(value, defaultValue)) return value;
        logger.warn({ flagKey: key }, 'flag value of an unexpected type, using the default');
        return defaultValue;
      } catch (error) {
        observer.failed('flag');
        logger.error({ flagKey: key, error: messageOf(error) }, 'flag evaluation failed');
        return defaultValue;
      }
    },

    async getVariant(key, user, fallbackVariant) {
      observer.evaluated('variant', key);
      try {
        const variant = await adapter.getVariant(key, user, fallbackVariant);
        if (resourceKeySchema.safeParse(variant).success) return variant;
        logger.warn({ experimentKey: key }, 'invalid variant key, using the fallback');
        return fallbackVariant;
      } catch (error) {
        observer.failed('variant');
        logger.error({ experimentKey: key, error: messageOf(error) }, 'variant evaluation failed');
        return fallbackVariant;
      }
    },

    configAgeSeconds() {
      try {
        return adapter.configAgeSeconds();
      } catch {
        return null;
      }
    },

    configVersion() {
      try {
        return adapter.configVersion();
      } catch {
        return null;
      }
    },
  };
}
