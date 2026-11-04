import {
  environmentConfigSchema,
  type EnvironmentConfig,
  type ExperimentConfig,
  type FlagConfig,
} from '@lever/schemas';

const flags: FlagConfig[] = [
  {
    key: 'new-banner',
    type: 'boolean',
    salt: 'salt-new-banner',
    defaultValue: false,
    enabled: true,
    servedValue: true,
    rolloutBps: 10_000,
    segmentKey: null,
  },
  {
    key: 'headline',
    type: 'string',
    salt: 'salt-headline',
    defaultValue: 'Welcome',
    enabled: true,
    servedValue: 'Hello',
    rolloutBps: 10_000,
    segmentKey: null,
  },
  {
    key: 'max-items',
    type: 'number',
    salt: 'salt-max-items',
    defaultValue: 3,
    enabled: true,
    servedValue: 7,
    rolloutBps: 10_000,
    segmentKey: null,
  },
  {
    key: 'theme',
    type: 'json',
    salt: 'salt-theme',
    defaultValue: { color: 'blue' },
    enabled: true,
    servedValue: { color: 'green' },
    rolloutBps: 10_000,
    segmentKey: 'brazil',
  },
];

function experiment(
  key: string,
  status: ExperimentConfig['status'],
  segmentKey: string | null,
): ExperimentConfig {
  return {
    key,
    salt: `salt-${key}`,
    status,
    segmentKey,
    variants: [
      { key: 'one-page', weightBps: 5_000, isControl: true },
      { key: 'multi-step', weightBps: 5_000, isControl: false },
    ],
  };
}

/** A valid configuration with every flag type, a segment and experiments in several states. */
export function testConfig(
  version = 1,
  overrides: Partial<EnvironmentConfig> = {},
): EnvironmentConfig {
  return environmentConfigSchema.parse({
    version,
    flags,
    experiments: [
      experiment('checkout-layout', 'running', null),
      experiment('br-checkout', 'running', 'brazil'),
      experiment('paused-test', 'paused', null),
    ],
    segments: [
      {
        key: 'brazil',
        rules: { conditions: [{ attribute: 'country', operator: 'equals', value: 'BR' }] },
      },
    ],
    ...overrides,
  });
}

export const brUser = { id: 'user-br-1', attributes: { country: 'BR', device: 'mobile' } };
export const usUser = { id: 'user-us-1', attributes: { country: 'US' } };
