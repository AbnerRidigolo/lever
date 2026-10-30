import { createDb, runMigrations, seed } from '@lever/db';
import { environmentConfigSchema } from '@lever/schemas';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { ApiKeyStore, createDbApiKeySource } from '../src/auth/api-key-store.js';
import {
  listenForConfigChanges,
  type ConfigChangeListener,
} from '../src/config/config-listener.js';
import { ConfigStore } from '../src/config/config-store.js';
import { loadEnvironmentConfig } from '../src/config/load-config.js';
import { withTimeout } from '../src/timeout.js';
import {
  bearer,
  createApiKey,
  fakeEvaluator,
  seededEnvironmentId,
  silentLogger,
} from './helpers.js';
import { POSTGRES_IMAGE } from './postgres-image.js';
import { openStream, type SseClient } from './sse.js';

// This file stops its own Postgres container, so it does not share the suite database.
let container: StartedPostgreSqlContainer;
let database: ReturnType<typeof createDb>;
let listener: ConfigChangeListener;
let app: ReturnType<typeof buildApp>;
let baseUrl: string;
let devKey: string;
let stream: SseClient | undefined;

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();
  database = createDb(databaseUrl, { maxConnections: 2 });
  await runMigrations(database.db);
  await seed(database.db);
  devKey = (
    await createApiKey(
      database.db,
      await seededEnvironmentId(database.db, 'development'),
      'development',
    )
  ).key;

  const configStore = new ConfigStore({
    load: (environmentId) => loadEnvironmentConfig(database.db, environmentId),
    logger: silentLogger,
  });
  const apiKeys = new ApiKeyStore({
    source: createDbApiKeySource(database.db),
    logger: silentLogger,
    // Expires during the test, so the lookup must fall back to the cache.
    ttlMs: 500,
  });
  app = buildApp({
    logger: silentLogger,
    apiKeys,
    configStore,
    evaluator: fakeEvaluator,
    streamPingIntervalMs: 200,
  });
  listener = await listenForConfigChanges({ databaseUrl, configStore, logger: silentLogger });
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  stream?.close();
  await app.close();
  // Postgres is gone: pending queries never finish, so closing must not wait for them.
  await Promise.allSettled([
    withTimeout(listener.close(), 6_000, 'closing the listener'),
    withTimeout(database.close(), 1_000, 'closing the pool'),
  ]);
});

async function getConfig() {
  const response = await fetch(`${baseUrl}/v1/config`, { headers: bearer(devKey) });
  const body: unknown = await response.json();
  return { status: response.status, body };
}

describe('NFR-004: Postgres goes down', () => {
  it('keeps serving the last configuration, the API key and the stream', async () => {
    const before = await getConfig();
    expect(before.status).toBe(200);
    const version = environmentConfigSchema.parse(before.body).version;

    stream = await openStream(`${baseUrl}/v1/stream`, bearer(devKey));
    expect((await stream.next()).event.event).toBe('config');

    await container.stop();
    // Let the cached API key expire, so the next request has to try (and fail) the database.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const after = await getConfig();
    expect(after.status).toBe(200);
    expect(environmentConfigSchema.parse(after.body).version).toBe(version);

    const evaluated = await fetch(`${baseUrl}/v1/evaluate`, {
      method: 'POST',
      headers: { ...bearer(devKey), 'content-type': 'application/json' },
      body: JSON.stringify({ user: { id: 'anon-1', attributes: {} } }),
    });
    expect(evaluated.status).toBe(200);

    // The open stream stays alive.
    const ping = await stream.next(2_000);
    expect(ping.event.event).toBe('ping');

    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
  });
});
