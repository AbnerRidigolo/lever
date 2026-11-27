import { describe, expect, it } from 'vitest';

import {
  CUPED_PRE_PERIOD_DAYS,
  experimentPlanSchema,
  experimentResultSchema,
  SRM_P_VALUE_THRESHOLD,
  srmInputSchema,
  variantStatsSchema,
} from './analysis.js';

const base = {
  experimentKey: 'checkout-flow',
  variantKey: 'multi-step',
  metricKey: 'checkout-rate',
};

function conversion(n: number, sumY: number, sumY2: number) {
  return {
    ...base,
    metricType: 'conversion',
    stats: { kind: 'mean', n, sumY, sumY2, cuped: null },
  };
}

const ratioStats = {
  kind: 'ratio',
  n: 10,
  sumNum: 3,
  sumNum2: 3,
  sumDen: 5,
  sumDen2: 5,
  sumNumDen: 3,
};

const result = {
  metricKey: 'checkout-rate',
  variantKey: 'multi-step',
  users: 1000,
  value: 0.12,
  deltaAbs: 0.01,
  deltaRel: 0.09,
  ciLow: 0.1,
  ciHigh: 0.2,
  pValue: 0.03,
  pValueAdjusted: 0.06,
  cuped: false,
  method: 'z_test_proportions',
};

describe('experimentPlanSchema', () => {
  it('002/AC-5.4: experiment plan defaults alpha and power', () => {
    const plan = experimentPlanSchema.parse({
      plannedSampleSize: 14_748,
      mde: { kind: 'absolute', value: 0.01 },
    });
    expect(plan.alpha).toBe(0.05);
    expect(plan.power).toBe(0.8);
    for (const alpha of [0, 0.25]) {
      expect(
        experimentPlanSchema.safeParse({ plannedSampleSize: 1, mde: null, alpha }).success,
      ).toBe(false);
    }
    expect(
      experimentPlanSchema.safeParse({
        plannedSampleSize: 1,
        mde: { kind: 'absolute', value: 0 },
      }).success,
    ).toBe(false);
  });
});

describe('constants', () => {
  it('002/AC-7.2: SRM threshold is 0.001', () => {
    expect(SRM_P_VALUE_THRESHOLD).toBe(0.001);
  });

  it('002/AC-8.1: CUPED pre-period is 14 days', () => {
    expect(CUPED_PRE_PERIOD_DAYS).toBe(14);
  });
});

describe('variantStatsSchema', () => {
  it('rejects incoherent conversion statistics from the gold', () => {
    expect(variantStatsSchema.safeParse(conversion(10, 11, 11)).success).toBe(false);
    expect(variantStatsSchema.safeParse(conversion(10, 3, 4)).success).toBe(false);
    expect(variantStatsSchema.safeParse(conversion(10, 3, 3)).success).toBe(true);
  });

  it('ratio metrics need ratio statistics', () => {
    const input = {
      ...base,
      metricType: 'ratio',
      stats: { kind: 'mean', n: 10, sumY: 3, sumY2: 3, cuped: null },
    };
    expect(variantStatsSchema.safeParse(input).success).toBe(false);
    expect(variantStatsSchema.safeParse({ ...input, stats: ratioStats }).success).toBe(true);
  });

  it('mean and conversion metrics need mean statistics', () => {
    expect(
      variantStatsSchema.safeParse({ ...base, metricType: 'mean', stats: ratioStats }).success,
    ).toBe(false);
  });
});

describe('srmInputSchema', () => {
  it('002/AC-7.1: SRM input weights sum to 10,000 bps', () => {
    const variants = (a: number, b: number) => ({
      variants: [
        { variantKey: 'one-page', users: 10, weightBps: a },
        { variantKey: 'multi-step', users: 10, weightBps: b },
      ],
    });
    expect(srmInputSchema.safeParse(variants(5_000, 4_000)).success).toBe(false);
    expect(srmInputSchema.safeParse(variants(5_000, 5_000)).success).toBe(true);
  });
});

describe('experimentResultSchema', () => {
  it('002/AC-6.1: control rows carry no effect, intervals are ordered', () => {
    const control = {
      ...result,
      variantKey: 'one-page',
      deltaAbs: null,
      deltaRel: null,
      ciLow: null,
      ciHigh: null,
      pValue: null,
      pValueAdjusted: null,
    };
    expect(experimentResultSchema.safeParse(result).success).toBe(true);
    expect(experimentResultSchema.safeParse(control).success).toBe(true);
    expect(experimentResultSchema.safeParse({ ...result, ciLow: 0.2, ciHigh: 0.1 }).success).toBe(
      false,
    );
    expect(experimentResultSchema.safeParse({ ...result, pValue: 1.2 }).success).toBe(false);
  });
});
