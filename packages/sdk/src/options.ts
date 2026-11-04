import { STREAM_PING_INTERVAL_MS } from '@lever/schemas';
import { z } from 'zod';

import { isLeverLogger, type LeverLogger } from './logger.js';

/** `lvr_dev_...` or `lvr_prd_...` (decision plan, D3). */
export const API_KEY_PATTERN = /^lvr_(?:dev|prd)_[A-Za-z0-9_-]+$/;

/** Three missed pings mean the stream is dead (sdk plan, D4). */
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 3 * STREAM_PING_INTERVAL_MS;
export const DEFAULT_INITIAL_DELAY_MS = 500;
export const DEFAULT_MAX_DELAY_MS = 30_000;
export const DEFAULT_READY_TIMEOUT_MS = 5_000;

const backoffOptionsSchema = z
  .object({
    initialDelayMs: z.int().min(1).max(60_000).default(DEFAULT_INITIAL_DELAY_MS),
    maxDelayMs: z.int().min(1).max(600_000).default(DEFAULT_MAX_DELAY_MS),
  })
  .refine((backoff) => backoff.initialDelayMs <= backoff.maxDelayMs, {
    message: 'initialDelayMs must not be greater than maxDelayMs',
    path: ['initialDelayMs'],
  });

/** Options of `createLeverClient`, validated at the boundary (AGENTS.md, sdk plan D8). */
export const leverClientOptionsSchema = z.object({
  apiKey: z.string().regex(API_KEY_PATTERN, 'must be a Lever API key (lvr_dev_... or lvr_prd_...)'),
  baseUrl: z.url({ protocol: /^https?$/ }),
  logger: z
    .custom<LeverLogger>(isLeverLogger, 'must have debug, info, warn and error methods')
    .optional(),
  backoff: backoffOptionsSchema.prefault({}),
  heartbeatTimeoutMs: z.int().min(10).max(600_000).default(DEFAULT_HEARTBEAT_TIMEOUT_MS),
});

export type LeverClientOptions = z.input<typeof leverClientOptionsSchema>;
export type ResolvedOptions = z.output<typeof leverClientOptionsSchema>;

/** Validates the options. Invalid options are a programming error, so this throws. */
export function resolveOptions(options: unknown): ResolvedOptions {
  const result = leverClientOptionsSchema.safeParse(options);
  if (!result.success) {
    // Issues carry paths and messages only, never the input values (no API key leaks).
    const details = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new TypeError(`Invalid Lever client options: ${details}`);
  }
  return result.data;
}
