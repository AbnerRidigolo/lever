import { z } from 'zod';

import { configVersionSchema, resourceKeySchema } from './common.js';
import { flagValueSchema } from './flag.js';
import { userContextSchema } from './user-context.js';

export const MAX_EVALUATE_KEYS = 100;

/** Body of `POST /v1/evaluate` (FR-007). Omitted lists mean "all". */
export const evaluateRequestSchema = z.object({
  user: userContextSchema,
  flags: z.array(resourceKeySchema).max(MAX_EVALUATE_KEYS).optional(),
  experiments: z.array(resourceKeySchema).max(MAX_EVALUATE_KEYS).optional(),
});
export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

/** Response of `POST /v1/evaluate`: flag values and variant keys by resource key. */
export const evaluateResponseSchema = z.object({
  flags: z.record(resourceKeySchema, flagValueSchema),
  experiments: z.record(resourceKeySchema, resourceKeySchema),
  version: configVersionSchema,
});
export type EvaluateResponse = z.infer<typeof evaluateResponseSchema>;
