import { gunzipSync } from 'node:zlib';

import { createDb, type Database } from '@lever/db';
import { bronzeEventRecordSchema } from '@lever/schemas';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { EventBuffer } from '../src/buffer.js';
import { Flusher } from '../src/flusher.js';
import { createMetrics } from '../src/metrics.js';
import { createS3Sink } from '../src/s3-sink.js';
import {
  bearer,
  createApiKey,
  createDbApiKeys,
  createIngestApp,
  seededEnvironmentId,
  silentLogger,
  trackEvent,
} from './helpers.js';
import {
  TEST_ACCESS_KEY,
  TEST_REGION,
  TEST_SECRET_KEY,
  readObjects,
  retry,
  startSeaweedfs,
  type TestSeaweedfs,
} from './seaweedfs.js';

let storage: TestSeaweedfs;
let database: ReturnType<typeof createDb>;
let db: Database;
let app: FastifyInstance;
let flusher: Flusher;
let buffer: EventBuffer;
let environmentId: string;
let apiKey: string;

beforeAll(async () => {
  storage = await startSeaweedfs();
  database = createDb(inject('databaseUrl'), { maxConnections: 2 });
  db = database.db;
  environmentId = await seededEnvironmentId(db, 'production');
  apiKey = (await createApiKey(db, environmentId, 'production')).key;

  const metrics = createMetrics();
  buffer = new EventBuffer({ maxEvents: 10_000, gauge: metrics.bufferEvents });
  const sink = createS3Sink({
    endpoint: storage.endpoint,
    region: TEST_REGION,
    accessKeyId: TEST_ACCESS_KEY,
    secretAccessKey: TEST_SECRET_KEY,
    bucket: storage.bucket,
    forcePathStyle: true,
  });
  flusher = new Flusher({
    buffer,
    sink,
    metrics,
    logger: silentLogger,
    intervalMs: 200,
    maxEvents: 5000,
    backoff: { initialMs: 200, maxMs: 1000 },
  });
  ({ app } = createIngestApp(createDbApiKeys(db), { queue: buffer, metrics }));
  await app.ready();
  flusher.start();
}, 240_000);

afterAll(async () => {
  await app.close();
  await flusher.stop(5000);
  await database.close();
  await storage.close();
});

async function send(count: number): Promise<string[]> {
  const events = Array.from({ length: count }, () => trackEvent());
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: bearer(apiKey),
    payload: { events },
  });
  expect(response.statusCode).toBe(202);
  expect(response.json<{ accepted: number }>().accepted).toBe(count);
  return events.map((event) => String(event.eventId));
}

describe('no event accepted with 202 is lost', () => {
  it('002/NFR-002: no event accepted with 202 is lost when the storage goes down and comes back', async () => {
    const ids: string[] = [];
    ids.push(...(await send(50)));

    await storage.stop();
    ids.push(...(await send(50)));
    // Let the flusher try, and fail, a few times while the storage is down.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(buffer.size()).toBeGreaterThan(0);

    await storage.start();
    await retry(() => {
      if (buffer.size() > 0) return Promise.reject(new Error(`still ${buffer.size()} buffered`));
      return Promise.resolve();
    }, 90_000);

    const objects = await readObjects(
      storage.client,
      storage.bucket,
      `bronze/events_raw/environment_id=${environmentId}/`,
    );
    const stored = objects.flatMap((object) =>
      gunzipSync(object.body)
        .toString('utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => bronzeEventRecordSchema.parse(JSON.parse(line)).event.eventId),
    );

    expect(stored).toHaveLength(100);
    expect(new Set(stored)).toEqual(new Set(ids));
    // The flusher must never re-write a committed record.
    expect(new Set(stored).size).toBe(stored.length);
  }, 240_000);
});
