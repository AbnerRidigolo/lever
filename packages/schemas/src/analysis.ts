import { z } from 'zod';

import { basisPointsSchema, MAX_BASIS_POINTS, resourceKeySchema } from './common.js';
import { metricTypeSchema } from './metrics.js';

export const MDE_KINDS = ['absolute', 'relative'] as const;
export const mdeKindSchema = z.enum(MDE_KINDS);
export type MdeKind = z.infer<typeof mdeKindSchema>;

/** Largest value of a Postgres int4 column. */
const INT4_MAX = 2_147_483_647;

export const DEFAULT_ALPHA = 0.05;
export const DEFAULT_POWER = 0.8;

/** Sample-size plan of an experiment (002/AC-5.1, AC-5.4). */
export const experimentPlanSchema = z.object({
  plannedSampleSize: z.int().min(1).max(INT4_MAX).nullable(),
  mde: z.object({ kind: mdeKindSchema, value: z.number().gt(0) }).nullable(),
  alpha: z.number().min(0.001).max(0.2).default(DEFAULT_ALPHA),
  power: z.number().min(0.5).max(0.99).default(DEFAULT_POWER),
});
export type ExperimentPlan = z.infer<typeof experimentPlanSchema>;

/** A p-value below this flags a sample ratio mismatch (002/AC-7.2). */
export const SRM_P_VALUE_THRESHOLD = 0.001;
/** Days of pre-experiment data used as the CUPED covariate (002/AC-8.1). */
export const CUPED_PRE_PERIOD_DAYS = 14;
export const GUARDRAIL_DEFAULT_ALPHA = 0.05;

/** Sufficient statistics of a mean or conversion metric; the CUPED block is null without a covariate. */
export const meanStatsSchema = z.object({
  kind: z.literal('mean'),
  n: z.int().min(0),
  sumY: z.number(),
  sumY2: z.number().min(0),
  cuped: z.object({ sumX: z.number(), sumX2: z.number().min(0), sumXY: z.number() }).nullable(),
});
export type MeanStats = z.infer<typeof meanStatsSchema>;

export const ratioStatsSchema = z.object({
  kind: z.literal('ratio'),
  n: z.int().min(0),
  sumNum: z.number(),
  sumNum2: z.number().min(0),
  sumDen: z.number(),
  sumDen2: z.number().min(0),
  sumNumDen: z.number(),
});
export type RatioStats = z.infer<typeof ratioStatsSchema>;

/** Per-variant statistics read from the gold; incoherent rows fail at the boundary. */
export const variantStatsSchema = z
  .object({
    experimentKey: resourceKeySchema,
    variantKey: resourceKeySchema,
    metricKey: resourceKeySchema,
    metricType: metricTypeSchema,
    stats: z.discriminatedUnion('kind', [meanStatsSchema, ratioStatsSchema]),
  })
  .superRefine((value, ctx) => {
    const expectedKind = value.metricType === 'ratio' ? 'ratio' : 'mean';
    if (value.stats.kind !== expectedKind) {
      ctx.addIssue({
        code: 'custom',
        path: ['stats', 'kind'],
        message: `${value.metricType} metrics need ${expectedKind} statistics`,
      });
      return;
    }
    // A conversion outcome is 0 or 1, so sum(y) equals sum(y^2) and cannot exceed n.
    if (value.metricType === 'conversion' && value.stats.kind === 'mean') {
      const { sumY, sumY2, n } = value.stats;
      if (!Number.isInteger(sumY) || sumY !== sumY2 || sumY > n) {
        ctx.addIssue({
          code: 'custom',
          path: ['stats'],
          message: 'conversion statistics need an integer sumY equal to sumY2 and at most n',
        });
      }
    }
  });
export type VariantStats = z.infer<typeof variantStatsSchema>;

/** Input of the sample ratio mismatch check; weights add up to 100% (002/AC-7.1). */
export const srmInputSchema = z.object({
  variants: z
    .array(
      z.object({
        variantKey: resourceKeySchema,
        users: z.int().min(0),
        weightBps: basisPointsSchema,
      }),
    )
    .min(2)
    .refine((variants) => new Set(variants.map((v) => v.variantKey)).size === variants.length, {
      message: 'variant keys must be unique',
    })
    .refine((variants) => variants.reduce((sum, v) => sum + v.weightBps, 0) === MAX_BASIS_POINTS, {
      message: `weights must sum to ${MAX_BASIS_POINTS} bps`,
    }),
});
export type SrmInput = z.infer<typeof srmInputSchema>;

export const ANALYSIS_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const;
export const analysisRunStatusSchema = z.enum(ANALYSIS_RUN_STATUSES);
export type AnalysisRunStatus = z.infer<typeof analysisRunStatusSchema>;

export const RESULT_METHODS = ['z_test_proportions', 'welch_t_test', 'delta_method'] as const;
export const resultMethodSchema = z.enum(RESULT_METHODS);
export type ResultMethod = z.infer<typeof resultMethodSchema>;

const probabilitySchema = z.number().min(0).max(1);

/** Result row of a variant for a metric; effect fields are null on the control row (002/AC-6.1). */
export const experimentResultSchema = z
  .object({
    metricKey: resourceKeySchema,
    variantKey: resourceKeySchema,
    users: z.int().min(0),
    value: z.number(),
    deltaAbs: z.number().nullable(),
    deltaRel: z.number().nullable(),
    ciLow: z.number().nullable(),
    ciHigh: z.number().nullable(),
    pValue: probabilitySchema.nullable(),
    pValueAdjusted: probabilitySchema.nullable(),
    cuped: z.boolean(),
    method: resultMethodSchema,
  })
  .refine((row) => (row.ciLow === null) === (row.ciHigh === null), {
    path: ['ciHigh'],
    message: 'ciLow and ciHigh must both be set or both be null',
  })
  .refine((row) => row.ciLow === null || row.ciHigh === null || row.ciLow <= row.ciHigh, {
    path: ['ciLow'],
    message: 'ciLow must not exceed ciHigh',
  });
export type ExperimentResult = z.infer<typeof experimentResultSchema>;

export const srmCheckSchema = z.object({
  observed: z.record(resourceKeySchema, z.int().min(0)),
  expected: z.record(resourceKeySchema, z.number().min(0)),
  pValue: probabilitySchema,
  excludedUsers: z.int().min(0),
});
export type SrmCheck = z.infer<typeof srmCheckSchema>;
