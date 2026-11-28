import { z } from 'zod';

import { resourceKeySchema } from './common.js';
import { eventNameSchema } from './events.js';

export const METRIC_TYPES = ['conversion', 'mean', 'ratio'] as const;
export const metricTypeSchema = z.enum(METRIC_TYPES);
export type MetricType = z.infer<typeof metricTypeSchema>;

export const METRIC_DIRECTIONS = ['increase', 'decrease'] as const;
export const metricDirectionSchema = z.enum(METRIC_DIRECTIONS);
export type MetricDirection = z.infer<typeof metricDirectionSchema>;

export const METRIC_ROLES = ['primary', 'secondary', 'guardrail'] as const;
export const metricRoleSchema = z.enum(METRIC_ROLES);
export type MetricRole = z.infer<typeof metricRoleSchema>;

const metricBaseShape = {
  key: resourceKeySchema,
  name: z.string().min(1).max(120),
  direction: metricDirectionSchema,
  eventName: eventNameSchema,
};

/** Metric definition; each type carries its own fields (002/AC-4.1). */
export const metricDefinitionSchema = z.discriminatedUnion('type', [
  z.object({ ...metricBaseShape, type: z.literal('conversion') }),
  z.object({
    ...metricBaseShape,
    type: z.literal('mean'),
    valueProperty: z.string().min(1).max(64),
  }),
  z.object({
    ...metricBaseShape,
    type: z.literal('ratio'),
    denominatorEventName: eventNameSchema,
  }),
]);
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;

/** Secondary metrics allowed per experiment (002/AC-4.2). */
export const MAX_SECONDARY_METRICS = 10;

export const experimentMetricEntrySchema = z.object({
  metricKey: resourceKeySchema,
  role: metricRoleSchema,
});
export type ExperimentMetricEntry = z.infer<typeof experimentMetricEntrySchema>;

/** Exactly one primary, up to 10 secondary, any number of guardrails, unique keys (002/AC-4.2). */
export const experimentMetricsSchema = z
  .array(experimentMetricEntrySchema)
  .superRefine((entries, ctx) => {
    const count = (role: MetricRole) => entries.filter((entry) => entry.role === role).length;
    if (count('primary') !== 1) {
      ctx.addIssue({ code: 'custom', message: 'exactly one primary metric is required' });
    }
    if (count('secondary') > MAX_SECONDARY_METRICS) {
      ctx.addIssue({
        code: 'custom',
        message: `at most ${MAX_SECONDARY_METRICS} secondary metrics`,
      });
    }
    const keys = entries.map((entry) => entry.metricKey);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', message: 'metric keys must be unique' });
    }
  });
export type ExperimentMetrics = z.infer<typeof experimentMetricsSchema>;
