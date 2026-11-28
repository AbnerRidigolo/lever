import { z } from 'zod';

import { uuidSchema } from './common.js';
import { exposureEventSchema } from './exposure.js';

/** Snake_case event name, 1 to 64 characters (002/AC-1.7). */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const eventNameSchema = z.string().regex(EVENT_NAME_PATTERN, 'must be snake_case');

export const MAX_EVENT_PROPERTIES = 32;
export const MAX_EVENT_PROPERTY_STRING = 1024;

/** Flat map of primitives: no nesting, no arrays; z.number() already rejects NaN and Infinity (002/AC-1.7). */
export const eventPropertiesSchema = z
  .record(
    z.string().min(1).max(64),
    z.union([z.string().max(MAX_EVENT_PROPERTY_STRING), z.number(), z.boolean()]),
  )
  .refine((properties) => Object.keys(properties).length <= MAX_EVENT_PROPERTIES, {
    message: `at most ${MAX_EVENT_PROPERTIES} properties`,
  });
export type EventProperties = z.infer<typeof eventPropertiesSchema>;

export const sdkInfoSchema = z.object({
  name: z.literal('@lever/sdk'),
  version: z.string().min(1).max(32),
});
export type SdkInfo = z.infer<typeof sdkInfoSchema>;

/** Spec 001 exposure plus the fields the collector requires (002/AC-1.2, AC-1.4). */
export const collectorExposureEventSchema = exposureEventSchema.extend({
  eventId: z.uuid(),
  sdk: sdkInfoSchema,
});
export type CollectorExposureEvent = z.infer<typeof collectorExposureEventSchema>;

/** Custom event sent by `lever.track` (002/AC-1.1). */
export const trackEventSchema = z.object({
  type: z.literal('track'),
  eventId: z.uuid(),
  name: eventNameSchema,
  userId: z.string().min(1).max(256),
  timestamp: z.iso.datetime({ offset: true }),
  properties: eventPropertiesSchema.default({}),
  sdk: sdkInfoSchema,
});
export type TrackEvent = z.infer<typeof trackEventSchema>;

export const collectorEventSchema = z.discriminatedUnion('type', [
  collectorExposureEventSchema,
  trackEventSchema,
]);
export type CollectorEvent = z.infer<typeof collectorEventSchema>;

export const MAX_BATCH_EVENTS = 500;
export const MAX_BATCH_BYTES = 524_288;

/**
 * Batch container. Events stay `unknown` on purpose: each one is validated on its own,
 * so a single invalid event never rejects the whole batch (002/AC-2.1, AC-2.2).
 */
export const eventBatchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(MAX_BATCH_EVENTS),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;

export const EVENT_REJECTION_CODES = ['invalid_event', 'timestamp_out_of_range'] as const;
export const eventRejectionCodeSchema = z.enum(EVENT_REJECTION_CODES);
export type EventRejectionCode = z.infer<typeof eventRejectionCodeSchema>;

export const eventBatchResponseSchema = z.object({
  accepted: z.int().min(0),
  rejected: z.array(
    z.object({
      index: z.int().min(0),
      code: eventRejectionCodeSchema,
      message: z.string(),
    }),
  ),
});
export type EventBatchResponse = z.infer<typeof eventBatchResponseSchema>;

/** Accepted timestamp window: at most 5 min in the future, at most 7 days old (002/AC-2.7). */
export const MAX_EVENT_FUTURE_SKEW_MS = 300_000;
export const MAX_EVENT_AGE_MS = 604_800_000;

/** Bronze row: the event plus the context the server derives, never the client (002/AC-2.4). */
export const bronzeEventRecordSchema = z.object({
  event: collectorEventSchema,
  receivedAt: z.iso.datetime({ offset: true }),
  environmentId: uuidSchema,
  apiKeyId: uuidSchema,
});
export type BronzeEventRecord = z.infer<typeof bronzeEventRecordSchema>;
