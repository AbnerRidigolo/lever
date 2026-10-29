import { describe, expect, it } from 'vitest';

import { environmentConfigSchema, type EnvironmentConfig } from './config.js';
import { evaluateRequestSchema, evaluateResponseSchema } from './evaluate.js';
import { exposureEventSchema } from './exposure.js';
import { STREAM_PING_INTERVAL_MS, streamEventSchema } from './stream.js';

const config: EnvironmentConfig = {
  version: 7,
  flags: [
    {
      key: 'new-banner',
      type: 'boolean',
      salt: 'salt-banner',
      defaultValue: false,
      enabled: true,
      servedValue: true,
      rolloutBps: 1_000,
      segmentKey: 'br-mobile',
    },
  ],
  experiments: [
    {
      key: 'checkout-layout',
      salt: 'salt-checkout',
      status: 'running',
      segmentKey: null,
      variants: [
        { key: 'one-page', weightBps: 5_000, isControl: true },
        { key: 'multi-step', weightBps: 5_000, isControl: false },
      ],
    },
  ],
  segments: [
    {
      key: 'br-mobile',
      rules: {
        conditions: [
          { attribute: 'country', operator: 'equals', value: 'BR' },
          { attribute: 'device', operator: 'in', value: ['mobile'] },
        ],
      },
    },
  ],
};

describe('GET /v1/config: environmentConfigSchema', () => {
  it('FR-005 (contract): accepts a full environment configuration', () => {
    expect(environmentConfigSchema.parse(config)).toEqual(config);
  });

  it('FR-005 (contract): rejects duplicate keys in a collection', () => {
    const duplicated = { ...config, flags: [...config.flags, ...config.flags] };
    expect(environmentConfigSchema.safeParse(duplicated).success).toBe(false);
  });

  it('AC-4.3 (contract): rejects a reference to a segment that is not in the configuration', () => {
    expect(environmentConfigSchema.safeParse({ ...config, segments: [] }).success).toBe(false);
  });

  it('requires a positive version', () => {
    expect(environmentConfigSchema.safeParse({ ...config, version: 0 }).success).toBe(false);
  });
});

describe('GET /v1/stream: streamEventSchema', () => {
  it('FR-006 (contract): accepts a config event with the full configuration', () => {
    expect(streamEventSchema.safeParse({ event: 'config', data: config }).success).toBe(true);
  });

  it('FR-006 (contract): accepts a ping event with an empty payload every 15 s', () => {
    expect(streamEventSchema.safeParse({ event: 'ping', data: {} }).success).toBe(true);
    expect(streamEventSchema.safeParse({ event: 'ping', data: { x: 1 } }).success).toBe(false);
    expect(STREAM_PING_INTERVAL_MS).toBe(15_000);
  });

  it('rejects unknown events', () => {
    expect(streamEventSchema.safeParse({ event: 'delete', data: {} }).success).toBe(false);
  });
});

describe('POST /v1/evaluate', () => {
  it('FR-007 (contract): accepts a request with a user and optional key lists', () => {
    expect(
      evaluateRequestSchema.safeParse({ user: { id: 'anon-1', attributes: { country: 'BR' } } })
        .success,
    ).toBe(true);
    expect(
      evaluateRequestSchema.safeParse({
        user: { id: 'anon-1', attributes: {} },
        flags: ['new-banner'],
        experiments: ['checkout-layout'],
      }).success,
    ).toBe(true);
  });

  it('FR-007 (contract): rejects a request without a user', () => {
    expect(evaluateRequestSchema.safeParse({ flags: ['new-banner'] }).success).toBe(false);
  });

  it('FR-007 (contract): accepts the response with flag values, variant keys and version', () => {
    expect(
      evaluateResponseSchema.safeParse({
        flags: { 'new-banner': true, 'hero-copy': 'Hello', limits: { max: 3 } },
        experiments: { 'checkout-layout': 'multi-step' },
        version: 7,
      }).success,
    ).toBe(true);
  });
});

describe('exposureEventSchema', () => {
  const event = {
    type: 'exposure',
    experimentKey: 'checkout-layout',
    variantKey: 'multi-step',
    userId: 'anon-1',
    configVersion: 7,
    timestamp: '2026-10-29T12:00:00.000Z',
  };

  it('AC-5.7 (contract): accepts the exposure event passed to onExposure', () => {
    expect(exposureEventSchema.parse(event)).toEqual(event);
  });

  it('AC-5.7 (contract): requires an ISO 8601 timestamp', () => {
    expect(exposureEventSchema.safeParse({ ...event, timestamp: 'yesterday' }).success).toBe(false);
    expect(exposureEventSchema.safeParse({ ...event, timestamp: 1_761_739_200_000 }).success).toBe(
      false,
    );
  });
});
