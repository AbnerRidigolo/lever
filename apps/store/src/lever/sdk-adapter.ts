import type { FlagValue, UserContext } from '@lever/schemas';
import { createLeverClient, type LeverClient } from '@lever/sdk';
import type { Logger } from 'pino';

import type { LeverAdapter } from './adapter';
import { logExposure } from './exposure';

/** How long the first request waits for the configuration; after that, defaults are served. */
export const SDK_READY_TIMEOUT_MS = 2_000;

type SdkClient = Pick<LeverClient, 'getFlag' | 'getVariant' | 'getMetrics'>;

/** Calls the typed overload of `getFlag` that matches the default value (sdk plan, D7). */
function sdkFlag<T extends FlagValue>(
  client: SdkClient,
  key: string,
  user: UserContext,
  defaultValue: T,
): T {
  if (typeof defaultValue === 'boolean') return client.getFlag(key, user, defaultValue) as T;
  if (typeof defaultValue === 'string') return client.getFlag(key, user, defaultValue) as T;
  if (typeof defaultValue === 'number') return client.getFlag(key, user, defaultValue) as T;
  if (defaultValue !== null) return client.getFlag(key, user, defaultValue) as T;
  // No flag type has a null value: nothing to evaluate.
  return defaultValue;
}

/**
 * `LeverAdapter` over `@lever/sdk` (store plan, D1 and T12). The SDK evaluates locally and never
 * throws; `getVariant` answers null without configuration or for an unknown experiment, which
 * becomes the fallback (control) variant.
 */
export function createSdkAdapter(client: SdkClient): LeverAdapter {
  return {
    getFlag: (key, user, defaultValue) => Promise.resolve(sdkFlag(client, key, user, defaultValue)),
    getVariant: (key, user, fallbackVariant) =>
      Promise.resolve(client.getVariant(key, user) ?? fallbackVariant),
    configAgeSeconds() {
      const ageMs = client.getMetrics().configAgeMs;
      return ageMs === null ? null : ageMs / 1000;
    },
    configVersion: () => client.getMetrics().configVersion,
  };
}

export interface SdkRuntime {
  client: LeverClient;
  /** True once the SDK has a configuration; false means defaults are being served. */
  ready: Promise<boolean>;
}

/**
 * Starts the client and waits for the first configuration. Anything but `ready` (timeout,
 * closed, unauthorized or a result added later) is logged and means "serve defaults"; the SDK
 * keeps reconnecting in the background (AC-5.5).
 */
export function startSdk(options: {
  apiKey: string;
  baseUrl: string;
  logger: Logger;
  create?: typeof createLeverClient;
}): SdkRuntime {
  const create = options.create ?? createLeverClient;
  const client = create({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    logger: options.logger,
  });
  client.onExposure((event) => {
    logExposure(options.logger, event);
  });
  const ready = client.ready({ timeoutMs: SDK_READY_TIMEOUT_MS }).then((result: string) => {
    if (result === 'ready') return true;
    options.logger.warn({ result }, 'lever sdk has no configuration yet; serving default values');
    return false;
  });
  return { client, ready };
}

const GLOBAL_KEY = '__leverStoreSdk';
type GlobalWithSdk = typeof globalThis & { [GLOBAL_KEY]?: SdkRuntime };

/** One SDK client per process, kept across hot reloads of `next dev`. */
export function sdkRuntime(options: {
  apiKey: string;
  baseUrl: string;
  logger: Logger;
}): SdkRuntime {
  const scope = globalThis as GlobalWithSdk;
  const existing = scope[GLOBAL_KEY];
  if (existing !== undefined) return existing;
  const created = startSdk(options);
  scope[GLOBAL_KEY] = created;
  return created;
}
