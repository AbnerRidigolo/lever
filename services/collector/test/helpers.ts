import { randomUUID } from 'node:crypto';

import {
  apiKeys,
  createDb,
  environments,
  generateApiKey,
  projects,
  type Database,
} from '@lever/db';
import type { BronzeEventRecord, EnvironmentKey } from '@lever/schemas';
import { ApiKeyStore, createDbApiKeySource } from '@lever/service-kit';
import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterAll, inject } from 'vitest';

import { buildApp, type AppDeps } from '../src/app.js';
import type { RecordQueue } from '../src/buffer.js';

export const silentLogger: FastifyBaseLogger = pino({ level: 'silent' });

/** Queue double that keeps what it accepted; `full` makes it refuse everything. */
export class FakeQueue implements RecordQueue {
  full = false;
  readonly records: BronzeEventRecord[] = [];

  offer(records: BronzeEventRecord[]): boolean {
    if (this.full) return false;
    this.records.push(...records);
    return true;
  }
}

/** Connects to the shared test database and closes the pool after the file. */
export function useTestDb(): Database {
  const { db, close } = createDb(inject('databaseUrl'), { maxConnections: 4 });
  afterAll(close);
  return db;
}

export async function seededEnvironmentId(db: Database, key: EnvironmentKey): Promise<string> {
  const [row] = await db
    .select({ id: environments.id })
    .from(environments)
    .innerJoin(projects, eq(projects.id, environments.projectId))
    .where(and(eq(projects.slug, 'demo-store'), eq(environments.key, key)));
  if (row === undefined) throw new Error(`seeded environment ${key} not found`);
  return row.id;
}

/** Creates an API key for an environment and returns the full key. */
export async function createApiKey(
  db: Database,
  environmentId: string,
  environment: EnvironmentKey,
): Promise<{ id: string; key: string }> {
  const generated = generateApiKey(environment);
  const [row] = await db
    .insert(apiKeys)
    .values({ environmentId, name: 'test', keyPrefix: generated.prefix, keyHash: generated.hash })
    .returning({ id: apiKeys.id });
  if (row === undefined) throw new Error('api key not inserted');
  return { id: row.id, key: generated.key };
}

export function bearer(key: string): { authorization: string } {
  return { authorization: `Bearer ${key}` };
}

export function createDbApiKeys(db: Database): ApiKeyStore {
  return new ApiKeyStore({
    source: createDbApiKeySource(db),
    logger: silentLogger,
    ttlMs: 60_000,
  });
}

function nullApiKeys(): ApiKeyStore {
  return new ApiKeyStore({
    source: { find: () => Promise.resolve(null), touch: () => Promise.resolve() },
    logger: silentLogger,
    ttlMs: 1000,
  });
}

/** App with no valid API keys and a queue that accepts everything. */
export function createTestApp(): FastifyInstance {
  return buildApp({ logger: silentLogger, apiKeys: nullApiKeys(), queue: new FakeQueue() });
}

/** App for the ingest route: real API keys and an inspectable queue. */
export function createIngestApp(
  apiKeysStore: ApiKeyStore,
  overrides: Partial<AppDeps> = {},
): { app: FastifyInstance; queue: FakeQueue } {
  const queue = new FakeQueue();
  const app = buildApp({ logger: silentLogger, queue, ...overrides, apiKeys: apiKeysStore });
  return { app, queue };
}

/** A valid `track` event stamped now; `overrides` replace or add fields. */
export function trackEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'track',
    eventId: randomUUID(),
    name: 'purchase',
    userId: 'user-1',
    timestamp: new Date().toISOString(),
    properties: { amount: 10 },
    sdk: { name: '@lever/sdk', version: '0.1.0' },
    ...overrides,
  };
}
