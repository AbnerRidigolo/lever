import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';

import { apiKeys } from '@lever/db';
import { apiErrorSchema, eventBatchResponseSchema, MAX_BATCH_BYTES } from '@lever/schemas';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FakeQueue } from './helpers.js';
import {
  bearer,
  createApiKey,
  createDbApiKeys,
  createIngestApp,
  seededEnvironmentId,
  trackEvent,
  useTestDb,
} from './helpers.js';

const db = useTestDb();
let app: FastifyInstance;
let queue: FakeQueue;
let key: { id: string; key: string };
let environmentId: string;

beforeAll(async () => {
  environmentId = await seededEnvironmentId(db, 'development');
  key = await createApiKey(db, environmentId, 'development');
  ({ app, queue } = createIngestApp(createDbApiKeys(db)));
  await app.ready();
});

afterAll(() => app.close());

const post = (payload: unknown, headers: Record<string, string> = bearer(key.key)) =>
  app.inject({ method: 'POST', url: '/v1/events', headers, payload: payload as object });

describe('POST /v1/events', () => {
  it('002/AC-2.1: a valid batch with a valid key gets 202 and the accepted count', async () => {
    const before = queue.records.length;
    const response = await post({ events: [trackEvent(), trackEvent(), trackEvent()] });
    expect(response.statusCode).toBe(202);
    expect(eventBatchResponseSchema.parse(response.json())).toEqual({ accepted: 3, rejected: [] });
    expect(queue.records.length - before).toBe(3);
  });

  it('002/AC-2.2: invalid events come back with index and code without dropping the batch', async () => {
    const response = await post({ events: [trackEvent(), {}, trackEvent()] });
    expect(response.statusCode).toBe(202);
    expect(eventBatchResponseSchema.parse(response.json())).toEqual({
      accepted: 2,
      rejected: [{ index: 1, code: 'invalid_event', message: expect.any(String) as string }],
    });
  });

  it('002/AC-2.3: missing, malformed or revoked keys get 401 in the standard format', async () => {
    const revoked = await createApiKey(db, environmentId, 'development');
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, revoked.id));
    const before = queue.records.length;

    const cases: Record<string, string>[] = [
      {},
      { authorization: 'Bearer nonsense' },
      bearer(revoked.key),
      { authorization: key.key },
    ];
    for (const headers of cases) {
      const response = await post({ events: [trackEvent()] }, headers);
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('unauthorized');
    }
    expect(queue.records.length).toBe(before);
  });

  it('002/AC-2.4: the environment and key come from the API key, never from the body', async () => {
    const other = randomUUID();
    const before = queue.records.length;
    const response = await post({ events: [trackEvent({ environmentId: other })] });
    expect(response.statusCode).toBe(202);
    const record = queue.records[before];
    expect(record?.environmentId).toBe(environmentId);
    expect(record?.apiKeyId).toBe(key.id);
  });

  it('002/AC-2.7: stamps receivedAt from the server clock and rejects timestamps out of the window', async () => {
    const now = new Date('2026-11-28T12:00:00.000Z');
    const { app: clocked, queue: clockedQueue } = createIngestApp(createDbApiKeys(db), {
      now: () => now,
    });
    await clocked.ready();
    const at = (ms: number): string => new Date(now.getTime() + ms).toISOString();
    const response = await clocked.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(key.key),
      payload: {
        events: [
          trackEvent({ timestamp: at(6 * 60_000) }),
          trackEvent({ timestamp: at(-8 * 86_400_000) }),
          trackEvent({ timestamp: at(4 * 60_000) }),
        ],
      },
    });
    await clocked.close();
    expect(response.statusCode).toBe(202);
    const body = eventBatchResponseSchema.parse(response.json());
    expect(body.accepted).toBe(1);
    expect(body.rejected.map((r) => [r.index, r.code])).toEqual([
      [0, 'timestamp_out_of_range'],
      [1, 'timestamp_out_of_range'],
    ]);
    expect(clockedQueue.records[0]?.receivedAt).toBe(now.toISOString());
  });

  it('malformed bodies get 400, never 500', async () => {
    const bad = (payload: string | object) =>
      app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { ...bearer(key.key), 'content-type': 'application/json' },
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      });
    const events501 = Array.from({ length: 501 }, () => trackEvent());

    for (const payload of [
      '{not json',
      { events: 'x' },
      { events: [] },
      { events: events501 },
      '',
    ]) {
      const response = await bad(payload);
      expect(response.statusCode).toBe(400);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('bad_request');
    }
  });

  it('bodies over 512 KB get 413', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...bearer(key.key), 'content-type': 'application/json' },
      payload: JSON.stringify({ events: [trackEvent({ name: 'x'.repeat(MAX_BATCH_BYTES) })] }),
    });
    expect(response.statusCode).toBe(413);
    expect(apiErrorSchema.parse(response.json()).error.message).toMatch(/.+/);
  });

  it('the same eventId twice is accepted twice (deduplication is in the silver, FR-003)', async () => {
    const event = trackEvent();
    const before = queue.records.length;
    const first = await post({ events: [event] });
    const second = await post({ events: [event, event] });
    expect(eventBatchResponseSchema.parse(first.json()).accepted).toBe(1);
    expect(eventBatchResponseSchema.parse(second.json()).accepted).toBe(2);
    expect(queue.records.length - before).toBe(3);
  });

  it('answers 503 with Retry-After when the queue is full', async () => {
    const { app: full, queue: fullQueue } = createIngestApp(createDbApiKeys(db));
    fullQueue.full = true;
    const response = await full.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer(key.key),
      payload: { events: [trackEvent()] },
    });
    await full.close();
    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('service_unavailable');
  });

  it('logs never carry the user id nor event properties', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = pino({ level: 'trace' }, sink);
    const { app: logged } = createIngestApp(createDbApiKeys(db), { logger });
    await logged.ready();
    const userId = `secret-user-${randomUUID()}`;
    const secret = `secret-value-${randomUUID()}`;
    const payload = {
      events: [trackEvent({ userId, properties: { email: secret } }), { userId, junk: secret }],
    };
    await logged.inject({ method: 'POST', url: '/v1/events', headers: bearer(key.key), payload });
    await logged.inject({
      method: 'POST',
      url: '/v1/events',
      headers: bearer('lv_bad'),
      payload,
    });
    await logged.close();

    expect(lines.length).toBeGreaterThan(0);
    const all = lines.join('\n');
    expect(all).not.toContain(userId);
    expect(all).not.toContain(secret);
    expect(all).not.toContain(key.key);
  });
});
