import { describe, expect, it } from 'vitest';

import {
  EXPERIMENT_STATUSES,
  experimentConfigSchema,
  experimentDefinitionSchema,
  experimentStatusSchema,
  experimentVariantsSchema,
  type ExperimentVariant,
} from './experiment.js';

const fiftyFifty: ExperimentVariant[] = [
  { key: 'one-page', weightBps: 5_000, isControl: true },
  { key: 'multi-step', weightBps: 5_000, isControl: false },
];

function variants(weights: number[], controlIndex = 0): ExperimentVariant[] {
  return weights.map((weightBps, index) => ({
    key: `variant-${index}`,
    weightBps,
    isControl: index === controlIndex,
  }));
}

function messages(input: unknown): string[] {
  const result = experimentVariantsSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('experimentVariantsSchema', () => {
  it('AC-3.1 (contract): accepts a 50/50 split with one control', () => {
    expect(experimentVariantsSchema.safeParse(fiftyFifty).success).toBe(true);
  });

  it('AC-3.1 (contract): accepts 2 to 5 variants', () => {
    expect(experimentVariantsSchema.safeParse(variants([5_000, 5_000])).success).toBe(true);
    expect(experimentVariantsSchema.safeParse(variants([3_334, 3_333, 3_333])).success).toBe(true);
    expect(experimentVariantsSchema.safeParse(variants([2_500, 2_500, 2_500, 2_500])).success).toBe(
      true,
    );
    expect(
      experimentVariantsSchema.safeParse(variants([2_000, 2_000, 2_000, 2_000, 2_000])).success,
    ).toBe(true);
  });

  it('AC-3.1 (contract): rejects fewer than 2 or more than 5 variants', () => {
    expect(experimentVariantsSchema.safeParse(variants([10_000])).success).toBe(false);
    expect(
      experimentVariantsSchema.safeParse(variants([2_000, 2_000, 2_000, 2_000, 1_000, 1_000]))
        .success,
    ).toBe(false);
  });

  it('AC-3.1 (contract): rejects weights that do not sum to 100%', () => {
    expect(messages(variants([5_000, 4_999]))).toContain(
      'variant weights must sum to 10000 bps (got 9999)',
    );
    expect(messages(variants([6_000, 5_000]))).toContain(
      'variant weights must sum to 10000 bps (got 11000)',
    );
  });

  it('AC-3.1 (contract): requires exactly one control', () => {
    expect(messages(variants([5_000, 5_000], -1))).toContain(
      'exactly one variant must be the control (got 0)',
    );
    const twoControls = fiftyFifty.map((variant) => ({ ...variant, isControl: true }));
    expect(messages(twoControls)).toContain('exactly one variant must be the control (got 2)');
  });

  it('AC-3.1 (contract): rejects duplicate variant keys', () => {
    const duplicated = [
      { key: 'same', weightBps: 5_000, isControl: true },
      { key: 'same', weightBps: 5_000, isControl: false },
    ];
    expect(messages(duplicated)).toContain('duplicate variant key "same"');
  });
});

describe('experimentStatusSchema', () => {
  it('AC-3.5 (contract): has exactly the states draft, running, paused and completed', () => {
    expect(EXPERIMENT_STATUSES).toEqual(['draft', 'running', 'paused', 'completed']);
    expect(experimentStatusSchema.safeParse('archived').success).toBe(false);
  });
});

describe('experimentDefinitionSchema', () => {
  it('AC-3.1 (contract): requires key, hypothesis and variants', () => {
    const definition = {
      key: 'checkout-layout',
      hypothesis: 'A multi-step checkout increases conversion.',
      variants: fiftyFifty,
      segmentKey: null,
    };
    expect(experimentDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(experimentDefinitionSchema.safeParse({ ...definition, hypothesis: '   ' }).success).toBe(
      false,
    );
  });
});

describe('experimentConfigSchema', () => {
  it('FR-003: accepts the configuration delivered to SDKs', () => {
    expect(
      experimentConfigSchema.safeParse({
        key: 'checkout-layout',
        salt: 'salt-checkout',
        status: 'running',
        segmentKey: 'br-mobile',
        variants: fiftyFifty,
      }).success,
    ).toBe(true);
  });
});
