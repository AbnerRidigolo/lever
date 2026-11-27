import { describe, expect, it } from 'vitest';

import {
  MAX_EVENT_AGE_MS,
  MAX_EVENT_FUTURE_SKEW_MS,
  bronzeEventRecordSchema,
  collectorEventSchema,
  collectorExposureEventSchema,
  eventBatchSchema,
  eventNameSchema,
  eventPropertiesSchema,
} from './events.js';
import { exposureEventSchema } from './exposure.js';

const sdk = { name: '@lever/sdk', version: '0.2.0' };
const eventId = '6f1c1f5e-3c0a-4e0e-9a43-1d7a0f3b9c11';

const validTrack = {
  type: 'track',
  eventId,
  name: 'purchase',
  userId: 'user-1',
  timestamp: '2026-11-27T12:00:00Z',
  properties: { total: 10 },
  sdk,
};

const specOneExposure = {
  type: 'exposure',
  experimentKey: 'checkout-flow',
  variantKey: 'one-page',
  userId: 'user-1',
  configVersion: 3,
  timestamp: '2026-11-27T12:00:00Z',
};

function keys(count: number): Record<string, number> {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, i]));
}

describe('event contracts', () => {
  it('002/AC-1.7: accepts snake_case event names and rejects others', () => {
    for (const name of ['purchase', 'add_to_cart']) {
      expect(eventNameSchema.safeParse(name).success).toBe(true);
    }
    for (const name of ['Purchase', '1abc', 'add-to-cart', '', 'a'.repeat(65)]) {
      expect(eventNameSchema.safeParse(name).success).toBe(false);
    }
  });

  it('002/AC-1.7: rejects nested, array and non-finite property values', () => {
    for (const properties of [{ a: { b: 1 } }, { a: [1] }, { a: Number.NaN }, { a: Infinity }]) {
      expect(eventPropertiesSchema.safeParse(properties).success).toBe(false);
    }
    expect(eventPropertiesSchema.safeParse(keys(32)).success).toBe(true);
    expect(eventPropertiesSchema.safeParse(keys(33)).success).toBe(false);
  });

  it('002/AC-1.4: requires a uuid eventId on every collector event', () => {
    const { eventId: _omitted, ...withoutId } = validTrack;
    expect(collectorEventSchema.safeParse(validTrack).success).toBe(true);
    expect(collectorEventSchema.safeParse(withoutId).success).toBe(false);
    expect(collectorEventSchema.safeParse({ ...validTrack, eventId: 'abc' }).success).toBe(false);
  });

  it('002/AC-1.2: extends the spec 001 exposure without changing the hook event', () => {
    expect(exposureEventSchema.safeParse(specOneExposure).success).toBe(true);
    expect(collectorExposureEventSchema.safeParse(specOneExposure).success).toBe(false);
    expect(
      collectorExposureEventSchema.safeParse({ ...specOneExposure, eventId, sdk }).success,
    ).toBe(true);
  });

  it('002/AC-2.2: the batch container never validates individual events', () => {
    expect(eventBatchSchema.parse({ events: [{}, validTrack] }).events).toHaveLength(2);
    expect(collectorEventSchema.safeParse({}).success).toBe(false);
    expect(collectorEventSchema.safeParse(validTrack).success).toBe(true);
  });

  it('002/AC-2.1: limits a batch to 1 to 500 events', () => {
    const batch = (count: number) => ({ events: Array.from({ length: count }, () => validTrack) });
    expect(eventBatchSchema.safeParse(batch(0)).success).toBe(false);
    expect(eventBatchSchema.safeParse(batch(501)).success).toBe(false);
    expect(eventBatchSchema.safeParse(batch(1)).success).toBe(true);
    expect(eventBatchSchema.safeParse(batch(500)).success).toBe(true);
  });

  it('002/AC-2.7: fixes the accepted timestamp window', () => {
    expect(MAX_EVENT_FUTURE_SKEW_MS).toBe(300_000);
    expect(MAX_EVENT_AGE_MS).toBe(604_800_000);
  });

  it('002/AC-2.4: a bronze record carries the environment and key from the server', () => {
    const record = {
      event: validTrack,
      receivedAt: '2026-11-27T12:00:01Z',
      environmentId: '0b7a0c52-6a43-4f3d-8c1e-0f6d1c2b3a44',
      apiKeyId: '9d2f6c1e-7b53-4a8e-b1c4-5e6f7a8b9c0d',
    };
    expect(bronzeEventRecordSchema.safeParse(record).success).toBe(true);
    expect(bronzeEventRecordSchema.safeParse({ ...record, environmentId: 'env' }).success).toBe(
      false,
    );
    expect(bronzeEventRecordSchema.safeParse({ ...record, apiKeyId: 'key' }).success).toBe(false);
  });
});
