import { z } from 'zod';

import { basisPointsSchema, MAX_BASIS_POINTS, resourceKeySchema, saltSchema } from './common.js';

/** Experiment states (AC-3.5). Only `running` assigns variants. */
export const EXPERIMENT_STATUSES = ['draft', 'running', 'paused', 'completed'] as const;
export const experimentStatusSchema = z.enum(EXPERIMENT_STATUSES);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const MIN_VARIANTS = 2;
export const MAX_VARIANTS = 5;

export const experimentVariantSchema = z.object({
  key: resourceKeySchema,
  weightBps: basisPointsSchema,
  isControl: z.boolean(),
});
export type ExperimentVariant = z.infer<typeof experimentVariantSchema>;

/** 2 to 5 variants, unique keys, weights summing to 10,000 bps and exactly one control (AC-3.1). */
export const experimentVariantsSchema = z
  .array(experimentVariantSchema)
  .min(MIN_VARIANTS)
  .max(MAX_VARIANTS)
  .superRefine((variants, ctx) => {
    const totalBps = variants.reduce((sum, variant) => sum + variant.weightBps, 0);
    if (totalBps !== MAX_BASIS_POINTS) {
      ctx.addIssue({
        code: 'custom',
        message: `variant weights must sum to ${MAX_BASIS_POINTS} bps (got ${totalBps})`,
      });
    }

    const controls = variants.filter((variant) => variant.isControl).length;
    if (controls !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `exactly one variant must be the control (got ${controls})`,
      });
    }

    const seen = new Set<string>();
    variants.forEach((variant, index) => {
      if (seen.has(variant.key)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate variant key "${variant.key}"`,
          path: [index, 'key'],
        });
      }
      seen.add(variant.key);
    });
  });

/** Experiment as created in the console (FR-003). */
export const experimentDefinitionSchema = z.object({
  key: resourceKeySchema,
  hypothesis: z.string().trim().min(1).max(2_000),
  variants: experimentVariantsSchema,
  segmentKey: resourceKeySchema.nullable(),
});
export type ExperimentDefinition = z.infer<typeof experimentDefinitionSchema>;

/**
 * Experiment as delivered in an environment configuration (`GET /v1/config`).
 * `status` is the per-environment status (spec 001, section 13).
 */
export const experimentConfigSchema = z.object({
  key: resourceKeySchema,
  salt: saltSchema,
  status: experimentStatusSchema,
  segmentKey: resourceKeySchema.nullable(),
  variants: experimentVariantsSchema,
});
export type ExperimentConfig = z.infer<typeof experimentConfigSchema>;
