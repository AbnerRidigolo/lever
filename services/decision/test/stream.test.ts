import { flagEnvironments } from '@lever/db';
import { apiErrorSchema } from '@lever/schemas';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  listenForConfigChanges,
  type ConfigChangeListener,
} from '../src/config/config-listener.js';
import { formatStreamEvent } from '../src/routes/stream.js';
import {
  bearer,
  createApiKey,
  createTestApp,
  createTestFlag,
  publishChange,
  seededEnvironmentId,
  silentLogger,
  useTestDb,
} from './helpers.js';
import { openStream, type SseClient } from './sse.js';

const PING_INTERVAL_MS = 200;

const db = useTestDb();
const { app, configStore } = createTestApp(db, { streamPingIntervalMs: PING_INTERVAL_MS });

let listener: ConfigChangeListener;
let baseUrl: string;
let developmentId: string;
let devKey: string;
let flagId: string;
const clients: SseClient[] = [];

beforeAll(async () => {
  developmentId = await seededEnvironmentId(db, 'development');
  flagId = await createTestFlag(db, 'stream-banner');
  devKey = (await createApiKey(db, developmentId, 'development')).key;
  listener = await listenForConfigChanges({
    databaseUrl: inject('databaseUrl'),
    configStore,
    logger: silentLogger,
  });
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  for (const client of clients) client.close();
  await listener.close();
});

async function connect(): Promise<SseClient> {
  const client = await openStream(`${baseUrl}/v1/stream`, bearer(devKey));
  clients.push(client);
  return client;
}

describe('GET /v1/stream', () => {
  it('FR-006: opens a text/event-stream and sends the current config first', async () => {
    const client = await connect();
    expect(client.status).toBe(200);
    expect(client.headers.get('content-type')).toContain('text/event-stream');
    expect(client.headers.get('cache-control')).toContain('no-cache');

    const first = await client.next();
    expect(first.event.event).toBe('config');
    if (first.event.event !== 'config') return;
    expect(first.id).toBe(String(first.event.data.version));
    expect(first.event.data.flags.some((flag) => flag.key === 'new-banner')).toBe(true);
    client.close();
  });

  it('FR-006, AC-5.4 (server side): pushes a new config event in under 5 s after a change', async () => {
    const client = await connect();
    const first = await client.next();
    if (first.event.event !== 'config') throw new Error('expected a config event first');

    const started = Date.now();
    const version = await publishChange(db, developmentId, (tx) =>
      tx
        .update(flagEnvironments)
        .set({ rolloutBps: 5_000 })
        .where(
          and(
            eq(flagEnvironments.flagId, flagId),
            eq(flagEnvironments.environmentId, developmentId),
          ),
        ),
    );

    let received = await client.next();
    while (received.event.event === 'ping') received = await client.next();
    expect(Date.now() - started).toBeLessThan(5_000);
    // The loop above only exits on a config event.
    expect(received.event.data.version).toBe(version);
    expect(received.event.data.flags.find((flag) => flag.key === 'stream-banner')?.rolloutBps).toBe(
      5_000,
    );
    client.close();
  });

  it('FR-006: sends a ping with an empty payload on every interval', async () => {
    const client = await connect();
    await client.next();
    const ping = await client.next(PING_INTERVAL_MS * 5);
    expect(ping.event).toEqual({ event: 'ping', data: {} });
    expect(ping.id).toBeUndefined();
    client.close();
  });

  it('FR-006: rejects a request without API key with a JSON error, not a stream', async () => {
    const response = await fetch(`${baseUrl}/v1/stream`);
    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('unauthorized');
  });

  it('ends open streams when the server shuts down', async () => {
    const { app: closingApp } = createTestApp(db, { streamPingIntervalMs: 60_000 });
    const url = await closingApp.listen({ host: '127.0.0.1', port: 0 });
    const client = await openStream(`${url}/v1/stream`, bearer(devKey));
    clients.push(client);
    await client.next();

    await closingApp.close();
    await client.ended();
  });
});

describe('formatStreamEvent', () => {
  it('writes the SSE wire format, with the version as id of config events', () => {
    expect(formatStreamEvent({ event: 'ping', data: {} })).toBe('event: ping\ndata: {}\n\n');
    expect(
      formatStreamEvent({
        event: 'config',
        data: { version: 3, flags: [], experiments: [], segments: [] },
      }),
    ).toBe(
      'event: config\nid: 3\ndata: {"version":3,"flags":[],"experiments":[],"segments":[]}\n\n',
    );
  });
});
