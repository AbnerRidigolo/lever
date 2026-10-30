import {
  apiKeys,
  configVersions,
  createDb,
  environments,
  flagEnvironments,
  flags,
  generateApiKey,
  projects,
  type Database,
} from '@lever/db';
import type { EnvironmentKey } from '@lever/schemas';
import { and, eq, max } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { afterAll, inject } from 'vitest';

import { buildApp, type AppDeps } from '../src/app.js';
import { ApiKeyStore, createDbApiKeySource } from '../src/auth/api-key-store.js';
import { ConfigStore } from '../src/config/config-store.js';
import { loadEnvironmentConfig } from '../src/config/load-config.js';
import type { Evaluator } from '../src/evaluator.js';

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

/**
 * Stand-in for the author evaluator, used only by the tests of the routes: serves the flag
 * value when the flag is on and always picks the control variant. It is not an implementation
 * of the reserved assignment or evaluation logic.
 */
export const fakeEvaluator: Evaluator = {
  evaluateFlag: (flag) => (flag.enabled ? flag.servedValue : flag.defaultValue),
  evaluateExperiment: (experiment) =>
    experiment.variants.find((variant) => variant.isControl)?.key ?? 'control',
};

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
  const deps: AppDeps = {
    logger: silentLogger,
    apiKeys,
    configStore,
    evaluator: fakeEvaluator,
    ...overrides,
  };
  const app = buildApp(deps);
  afterAll(() => app.close());
  return { app, apiKeys: deps.apiKeys, configStore: deps.configStore };
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Changes data and publishes the next configuration version in the same transaction,
 * as the console does. Returns the published version.
 */
export async function publishChange(
  db: Database,
  environmentId: string,
  change: (tx: Transaction) => Promise<unknown>,
): Promise<number> {
  return db.transaction(async (tx) => {
    await change(tx);
    const [latest] = await tx
      .select({ version: max(configVersions.version) })
      .from(configVersions)
      .where(eq(configVersions.environmentId, environmentId));
    const version = (latest?.version ?? 0) + 1;
    await tx.insert(configVersions).values({ environmentId, version });
    return version;
  });
}

/**
 * Creates a boolean flag in the seeded project, off in both environments, so a test file
 * can change it without touching data other files rely on. Returns the flag id.
 */
export async function createTestFlag(db: Database, key: string): Promise<string> {
  const [project] = await db.select().from(projects).where(eq(projects.slug, 'demo-store'));
  if (project === undefined) throw new Error('seed project missing');
  const [flag] = await db
    .insert(flags)
    .values({
      projectId: project.id,
      key,
      type: 'boolean',
      defaultValue: false,
      salt: `salt-${key}`,
    })
    .returning({ id: flags.id });
  if (flag === undefined) throw new Error('flag not inserted');

  const envs = await db
    .select({ id: environments.id })
    .from(environments)
    .where(eq(environments.projectId, project.id));
  await db.insert(flagEnvironments).values(
    envs.map((env) => ({
      flagId: flag.id,
      environmentId: env.id,
      enabled: false,
      servedValue: true,
      rolloutBps: 10_000,
    })),
  );
  return flag.id;
}
