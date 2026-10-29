import { z } from 'zod';

import { resourceKeySchema } from './common.js';

/** Operators supported by segment rules (AC-4.2). */
export const SEGMENT_OPERATORS = [
  'equals',
  'not_equals',
  'in',
  'not_in',
  'greater_than',
  'less_than',
  'contains',
] as const;
export const segmentOperatorSchema = z.enum(SEGMENT_OPERATORS);
export type SegmentOperator = z.infer<typeof segmentOperatorSchema>;

export const MAX_SEGMENT_CONDITIONS = 20;
export const MAX_SEGMENT_LIST_VALUES = 100;

const attributeSchema = z.string().min(1).max(128);
const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);

/** One condition on a user attribute. The shape of `value` depends on the operator. */
export const segmentConditionSchema = z.discriminatedUnion('operator', [
  z.strictObject({
    attribute: attributeSchema,
    operator: z.enum(['equals', 'not_equals']),
    value: scalarSchema,
  }),
  z.strictObject({
    attribute: attributeSchema,
    operator: z.enum(['in', 'not_in']),
    value: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .max(MAX_SEGMENT_LIST_VALUES),
  }),
  z.strictObject({
    attribute: attributeSchema,
    operator: z.enum(['greater_than', 'less_than']),
    value: z.number(),
  }),
  z.strictObject({
    attribute: attributeSchema,
    operator: z.literal('contains'),
    value: z.string().min(1),
  }),
]);
export type SegmentCondition = z.infer<typeof segmentConditionSchema>;

/**
 * Rules of a segment, stored as jsonb in `segments.rules`.
 * In phase 1 every condition must match (AND); see spec 001, section 13.
 */
export const segmentRulesSchema = z.strictObject({
  conditions: z.array(segmentConditionSchema).min(1).max(MAX_SEGMENT_CONDITIONS),
});
export type SegmentRules = z.infer<typeof segmentRulesSchema>;

/** Segment as created in the console (AC-4.1). */
export const segmentDefinitionSchema = z.object({
  key: resourceKeySchema,
  name: z.string().trim().min(1).max(120),
  rules: segmentRulesSchema,
});
export type SegmentDefinition = z.infer<typeof segmentDefinitionSchema>;

/** Segment as delivered in an environment configuration. */
export const segmentConfigSchema = z.object({
  key: resourceKeySchema,
  rules: segmentRulesSchema,
});
export type SegmentConfig = z.infer<typeof segmentConfigSchema>;
