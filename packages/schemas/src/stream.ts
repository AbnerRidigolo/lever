import { z } from 'zod';

import { environmentConfigSchema } from './config.js';

/** Interval between `ping` events on `GET /v1/stream`. */
export const STREAM_PING_INTERVAL_MS = 15_000;

export const configStreamEventSchema = z.object({
  event: z.literal('config'),
  data: environmentConfigSchema,
});

export const pingStreamEventSchema = z.object({
  event: z.literal('ping'),
  data: z.strictObject({}),
});

/**
 * Server-Sent Event of `GET /v1/stream` (FR-006).
 * `event` is the SSE event name and `data` its JSON payload.
 */
export const streamEventSchema = z.discriminatedUnion('event', [
  configStreamEventSchema,
  pingStreamEventSchema,
]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
