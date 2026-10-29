import { z } from 'zod';

import { configVersionSchema } from './common.js';
import { experimentConfigSchema } from './experiment.js';
import { flagConfigSchema } from './flag.js';
import { segmentConfigSchema } from './segment.js';

/** Full configuration of one environment: response of `GET /v1/config` (FR-005). */
export const environmentConfigSchema = z
  .object({
    version: configVersionSchema,
    flags: z.array(flagConfigSchema),
    experiments: z.array(experimentConfigSchema),
    segments: z.array(segmentConfigSchema),
  })
  .superRefine((config, ctx) => {
    for (const collection of ['flags', 'experiments', 'segments'] as const) {
      const seen = new Set<string>();
      config[collection].forEach((item, index) => {
        if (seen.has(item.key)) {
          ctx.addIssue({
            code: 'custom',
            message: `duplicate key "${item.key}"`,
            path: [collection, index, 'key'],
          });
        }
        seen.add(item.key);
      });
    }

    const segmentKeys = new Set(config.segments.map((segment) => segment.key));
    for (const collection of ['flags', 'experiments'] as const) {
      config[collection].forEach((item, index) => {
        if (item.segmentKey !== null && !segmentKeys.has(item.segmentKey)) {
          ctx.addIssue({
            code: 'custom',
            message: `unknown segment "${item.segmentKey}"`,
            path: [collection, index, 'segmentKey'],
          });
        }
      });
    }
  });
export type EnvironmentConfig = z.infer<typeof environmentConfigSchema>;
