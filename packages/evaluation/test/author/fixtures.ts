import type {
  ExperimentConfig,
  ExperimentStatus,
  FlagConfig,
  SegmentConfig,
  UserContext,
} from '@lever/schemas';

export const SAMPLE_SIZE = 100_000;

/** Synthetic user ids, as in AC-2.1 and AC-3.2. */
export function syntheticUsers(count = SAMPLE_SIZE): UserContext[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-user-${index}`,
    attributes: {},
  }));
}

export const NO_SEGMENTS: ReadonlyMap<string, SegmentConfig> = new Map();

type BooleanFlagConfig = Extract<FlagConfig, { type: 'boolean' }>;

export function booleanFlag(overrides: Partial<BooleanFlagConfig> = {}): BooleanFlagConfig {
  return {
    key: 'new-banner',
    type: 'boolean',
    salt: 'salt-new-banner',
    defaultValue: false,
    enabled: true,
    servedValue: true,
    rolloutBps: 10_000,
    segmentKey: null,
    ...overrides,
  };
}

export function experiment(
  overrides: Partial<ExperimentConfig> = {},
  status: ExperimentStatus = 'running',
): ExperimentConfig {
  return {
    key: 'checkout-layout',
    salt: 'salt-checkout-layout',
    status,
    segmentKey: null,
    variants: [
      { key: 'one-page', weightBps: 5_000, isControl: true },
      { key: 'multi-step', weightBps: 5_000, isControl: false },
    ],
    ...overrides,
  };
}

/** `country = BR` and `device in [mobile]`, the example of AC-4.1. */
export const brMobile: SegmentConfig = {
  key: 'br-mobile',
  rules: {
    conditions: [
      { attribute: 'country', operator: 'equals', value: 'BR' },
      { attribute: 'device', operator: 'in', value: ['mobile'] },
    ],
  },
};

export const segmentsWith = (...segments: SegmentConfig[]): ReadonlyMap<string, SegmentConfig> =>
  new Map(segments.map((segment) => [segment.key, segment]));

export function share(count: number, total: number): number {
  return count / total;
}
