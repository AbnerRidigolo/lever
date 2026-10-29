import { z } from 'zod';

import { configVersionSchema, resourceKeySchema } from './common.js';

/** Event passed to the SDK `onExposure` hook on every variant assignment (AC-5.7). */
export const exposureEventSchema = z.object({
  type: z.literal('exposure'),
  experimentKey: resourceKeySchema,
  variantKey: resourceKeySchema,
  userId: z.string().min(1).max(256),
  configVersion: configVersionSchema,
  timestamp: z.iso.datetime({ offset: true }),
});
export type ExposureEvent = z.infer<typeof exposureEventSchema>;
