import { randomUUID } from 'node:crypto';

import { generateApiKey } from '@lever/db';
import type { AuthenticatedKey } from '@lever/service-kit';
import { ApiKeyStore } from '@lever/service-kit';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { EventBuffer } from '../src/buffer.js';
import { createMetrics } from '../src/metrics.js';

import { silentLogger, trackEvent } from './helpers.js';

const { key: API_KEY } = generateApiKey('development');
const auth: AuthenticatedKey = {
  apiKeyId: randomUUID(),
  environmentId: randomUUID(),
  projectId: randomUUID(),
};

function appWith(buffer: EventBuffer) {
  const metrics = createMetrics();
  const apiKeys = new ApiKeyStore({
    source: { find: () => Promise.resolve(auth), touch: () => Promise.resolve() },
    logger: silentLogger,
    ttlMs: 60_000,
  });
  const app = buildApp({ logger: silentLogger, apiKeys, queue: buffer, metrics });
  const post = (count: number, extra: Record<string, unknown>[] = []) =>
    app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: { events: [...Array.from({ length: count }, () => trackEvent()), ...extra] },
    });
  return { app, metrics, post };
}

describe('POST /v1/events with a bounded buffer', () => {
  it('002/AC-2.6: a full buffer answers 503 with Retry-After and loses nothing already accepted', async () => {
    const buffer = new EventBuffer({ maxEvents: 10 });
    const { app, post } = appWith(buffer);

    expect((await post(8)).statusCode).toBe(202);
    const refused = await post(3);
    expect(refused.statusCode).toBe(503);
    expect(refused.headers['retry-after']).toBe('5');
    expect(buffer.size()).toBe(8);
    expect(buffer.peek(auth.environmentId, 100)).toHaveLength(8);
    await app.close();
  });

  it('counts accepted and rejected events by type, outcome and reason', async () => {
    const buffer = new EventBuffer({ maxEvents: 100 });
    const { app, metrics, post } = appWith(buffer);

    expect((await post(2, [{}])).statusCode).toBe(202);
    const text = await metrics.registry.getSingleMetricAsString('lever_collector_events_total');
    expect(text).toContain('lever_collector_events_total{type="track",outcome="accepted"} 2');
    expect(text).toContain(
      'lever_collector_events_total{type="unknown",outcome="rejected",reason="invalid_event"} 1',
    );
    await app.close();
  });

  it('does not count events the buffer refused as accepted', async () => {
    const buffer = new EventBuffer({ maxEvents: 1 });
    const { app, metrics, post } = appWith(buffer);
    expect((await post(2)).statusCode).toBe(503);
    const text = await metrics.registry.getSingleMetricAsString('lever_collector_events_total');
    expect(text).not.toContain('outcome="accepted"');
    await app.close();
  });

  it('counts events refused by a full buffer with outcome refused and reason buffer_full', async () => {
    const buffer = new EventBuffer({ maxEvents: 1 });
    const { app, metrics, post } = appWith(buffer);
    expect((await post(2)).statusCode).toBe(503);
    const text = await metrics.registry.getSingleMetricAsString('lever_collector_events_total');
    expect(text).toContain(
      'lever_collector_events_total{type="track",outcome="refused",reason="buffer_full"} 2',
    );
    await app.close();
  });

  it('observes the events per request, including refused batches', async () => {
    const buffer = new EventBuffer({ maxEvents: 4 });
    const { app, metrics, post } = appWith(buffer);
    expect((await post(2, [{}])).statusCode).toBe(202);
    expect((await post(5)).statusCode).toBe(503);
    const text = await metrics.registry.getSingleMetricAsString(
      'lever_collector_request_batch_events',
    );
    expect(text).toContain('lever_collector_request_batch_events_count 2');
    expect(text).toContain('lever_collector_request_batch_events_sum 8');
    await app.close();
  });

  it('labels a timestamp_out_of_range rejection with the parsed event type', async () => {
    const buffer = new EventBuffer({ maxEvents: 100 });
    const { app, metrics, post } = appWith(buffer);
    const stale = trackEvent({ timestamp: new Date(Date.now() - 8 * 86_400_000).toISOString() });
    expect((await post(0, [stale])).statusCode).toBe(202);
    const text = await metrics.registry.getSingleMetricAsString('lever_collector_events_total');
    expect(text).toContain(
      'lever_collector_events_total{type="track",outcome="rejected",reason="timestamp_out_of_range"} 1',
    );
    await app.close();
  });
});
