import {
  apiKeys,
  createDb,
  environments,
  generateApiKey,
  projects,
  type Database,
} from '@lever/db';
import type { EnvironmentKey } from '@lever/schemas';
import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, inject } from 'vitest';

import { buildApp, type AppDeps } from '../src/app.js';
import { ApiKeyStore, createDbApiKeySource } from '../src/auth/api-key-store.js';
import { ConfigStore } from '../src/config/config-store.js';
import { loadEnvironmentConfig } from '../src/config/load-config.js';

export const silentLogger: FastifyBaseLogger = pino({ level: 'silent' });

/** Connects to the shared test database and closes the pool after the file. */
export function useTestDb(): Database {
  const { db, close } = createDb(inject('databaseUrl'), { maxConnections: 4 });
  afterAll(close);
  return db;
}

/** Ids of the seeded demo project environments. */
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
    .values({
      environmentId,
      name: 'test',
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
    })
    .returning({ id: apiKeys.id });
  if (row === undefined) throw new Error('api key not inserted');
  return { id: row.id, key: generated.key };
}

export function bearer(key: string): { authorization: string } {
  return { authorization: `Bearer ${key}` };
}

/** Polls until the assertion passes or the timeout expires. */
export async function eventually<T>(
  check: () => Promise<T> | T,
  { timeoutMs = 5_000, intervalMs = 25 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

export interface TestApp {
  app: FastifyInstance;
  apiKeys: ApiKeyStore;
  configStore: ConfigStore;
}

/** The real app wired to the test database, as main.ts does. */
export function createTestApp(db: Database, overrides: Partial<AppDeps> = {}): TestApp {
  const apiKeys = new ApiKeyStore({
    source: createDbApiKeySource(db),
    logger: silentLogger,
    ttlMs: 60_000,
  });
  const configStore = new ConfigStore({
    load: (environmentId) => loadEnvironmentConfig(db, environmentId),
    logger: silentLogger,
  });
  const deps: AppDeps = { logger: silentLogger, apiKeys, configStore, ...overrides };
  const app = buildApp(deps);
  afterAll(() => app.close());
  return { app, apiKeys: deps.apiKeys, configStore: deps.configStore };
}
