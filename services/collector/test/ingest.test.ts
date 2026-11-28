import { randomUUID } from 'node:crypto';

import {
  bronzeEventRecordSchema,
  MAX_EVENT_AGE_MS,
  MAX_EVENT_FUTURE_SKEW_MS,
} from '@lever/schemas';
import type { AuthenticatedKey } from '@lever/service-kit';
import { describe, expect, it } from 'vitest';

import { ingestBatch } from '../src/ingest.js';

import { trackEvent } from './helpers.js';

const auth: AuthenticatedKey = {
  apiKeyId: randomUUID(),
  environmentId: randomUUID(),
  projectId: randomUUID(),
};
const NOW = new Date();

const at = (offsetMs: number): string => new Date(NOW.getTime() + offsetMs).toISOString();

describe('ingestBatch', () => {
  it('002/AC-2.1: a valid batch becomes one bronze record per event', () => {
    const { records, rejected } = ingestBatch(
      { events: [trackEvent(), trackEvent(), trackEvent()] },
      auth,
      NOW,
    );
    expect(rejected).toEqual([]);
    expect(records).toHaveLength(3);
    for (const record of records) bronzeEventRecordSchema.parse(record);
  });

  it('002/AC-2.2: invalid events come back with index and code without dropping the batch', () => {
    const { records, rejected } = ingestBatch(
      { events: [trackEvent(), {}, trackEvent()] },
      auth,
      NOW,
    );
    expect(records).toHaveLength(2);
    expect(rejected).toEqual([
      { index: 1, code: 'invalid_event', message: expect.any(String) as string },
    ]);
  });

  it('002/AC-2.4: the environment and key come from the API key, never from the body', () => {
    const { records } = ingestBatch(
      {
        events: [
          trackEvent({ environmentId: randomUUID(), apiKeyId: randomUUID(), receivedAt: 'x' }),
        ],
      },
      auth,
      NOW,
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      environmentId: auth.environmentId,
      apiKeyId: auth.apiKeyId,
    });
    expect(JSON.stringify(records[0]?.event)).not.toContain('environmentId');
  });

  it('002/AC-2.7: stamps receivedAt and rejects timestamps out of the window', () => {
    const { records, rejected } = ingestBatch(
      {
        events: [
          trackEvent({ timestamp: at(MAX_EVENT_FUTURE_SKEW_MS + 60_000) }),
          trackEvent({ timestamp: at(-(MAX_EVENT_AGE_MS + 86_400_000)) }),
          trackEvent({ timestamp: at(240_000) }),
        ],
      },
      auth,
      NOW,
    );
    expect(rejected.map((r) => [r.index, r.code])).toEqual([
      [0, 'timestamp_out_of_range'],
      [1, 'timestamp_out_of_range'],
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]?.receivedAt).toBe(NOW.toISOString());
  });

  it('keeps events exactly on the window edges', () => {
    const { records, rejected } = ingestBatch(
      {
        events: [
          trackEvent({ timestamp: at(MAX_EVENT_FUTURE_SKEW_MS) }),
          trackEvent({ timestamp: at(-MAX_EVENT_AGE_MS) }),
        ],
      },
      auth,
      NOW,
    );
    expect(rejected).toEqual([]);
    expect(records).toHaveLength(2);
  });

  it('rejects the container when it is malformed', () => {
    expect(() => ingestBatch({ events: 'x' }, auth, NOW)).toThrow();
    expect(() => ingestBatch({ events: [] }, auth, NOW)).toThrow();
    expect(() => ingestBatch(null, auth, NOW)).toThrow();
  });
});
