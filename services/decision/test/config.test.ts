import { environments, flags, projects } from '@lever/db';
import { apiErrorSchema, environmentConfigSchema, type EnvironmentConfig } from '@lever/schemas';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { ConfigStore } from '../src/config/config-store.js';
import {
  bearer,
  createApiKey,
  createTestApp,
  seededEnvironmentId,
  silentLogger,
  useTestDb,
} from './helpers.js';

const db = useTestDb();
const { app } = createTestApp(db);

let devKey: string;
let prodKey: string;

beforeAll(async () => {
  devKey = (await createApiKey(db, await seededEnvironmentId(db, 'development'), 'development'))
    .key;
  prodKey = (await createApiKey(db, await seededEnvironmentId(db, 'production'), 'production')).key;
  await app.ready();
});

async function getConfig(key: string): Promise<EnvironmentConfig> {
  const response = await app.inject({ method: 'GET', url: '/v1/config', headers: bearer(key) });
  expect(response.statusCode).toBe(200);
  return environmentConfigSchema.parse(response.json());
}

describe('GET /v1/config', () => {
  it('FR-005: returns the full seeded configuration of the key environment', async () => {
    const config = await getConfig(devKey);
    expect(config.version).toBeGreaterThanOrEqual(1);
    expect(config.flags.find((flag) => flag.key === 'new-banner')).toMatchObject({
      type: 'boolean',
      defaultValue: false,
      enabled: false,
      servedValue: true,
      rolloutBps: 10_000,
      segmentKey: null,
    });
    expect(config.experiments.find((e) => e.key === 'checkout-layout')).toMatchObject({
      status: 'running',
      // Control first, then by key: the order assignment relies on.
      variants: [
        { key: 'one-page', weightBps: 5_000, isControl: true },
        { key: 'multi-step', weightBps: 5_000, isControl: false },
      ],
    });
  });

  it('AC-1.3 (server side): each key only sees its own environment settings', async () => {
    const development = await getConfig(devKey);
    const production = await getConfig(prodKey);
    const status = (config: EnvironmentConfig) =>
      config.experiments.find((e) => e.key === 'checkout-layout')?.status;
    expect(status(development)).toBe('running');
    expect(status(production)).toBe('draft');
  });

  it('serves a flag without settings in the environment as off, with its default value', async () => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, 'demo-store'));
    if (project === undefined) throw new Error('seed project missing');
    await db.insert(flags).values({
      projectId: project.id,
      key: 'no-settings',
      type: 'string',
      defaultValue: 'classic',
      salt: 'salt-no-settings',
    });

    // A fresh app, so the configuration is loaded again.
    const { app: freshApp } = createTestApp(db);
    const response = await freshApp.inject({
      method: 'GET',
      url: '/v1/config',
      headers: bearer(devKey),
    });
    const config = environmentConfigSchema.parse(response.json());
    expect(config.flags.find((flag) => flag.key === 'no-settings')).toMatchObject({
      enabled: false,
      servedValue: 'classic',
      rolloutBps: 0,
    });
  });

  it('returns 503 when the environment has no published configuration', async () => {
    const [project] = await db
      .insert(projects)
      .values({ name: 'Unpublished', slug: 'unpublished' })
      .returning();
    if (project === undefined) throw new Error('project not inserted');
    const [environment] = await db
      .insert(environments)
      .values({ projectId: project.id, key: 'development' })
      .returning();
    if (environment === undefined) throw new Error('environment not inserted');
    const { key } = await createApiKey(db, environment.id, 'development');

    const response = await app.inject({ method: 'GET', url: '/v1/config', headers: bearer(key) });
    expect(response.statusCode).toBe(503);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('service_unavailable');
  });

  it('FR-005: requires an API key', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/config' });
    expect(response.statusCode).toBe(401);
  });
});

describe('ConfigStore', () => {
  const config = (version: number): EnvironmentConfig => ({
    version,
    flags: [],
    experiments: [],
    segments: [],
  });

  it('loads once even with concurrent requests', async () => {
    let loads = 0;
    const store = new ConfigStore({
      logger: silentLogger,
      load: async () => {
        loads += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return config(1);
      },
    });
    await Promise.all([store.get('env'), store.get('env'), store.get('env')]);
    expect(loads).toBe(1);
  });

  it('NFR-004: keeps the last valid configuration when a refresh fails', async () => {
    let fail = false;
    const store = new ConfigStore({
      logger: silentLogger,
      load: () =>
        fail ? Promise.reject(new Error('connection refused')) : Promise.resolve(config(1)),
    });
    await store.get('env');
    fail = true;
    await store.refresh('env', 2);
    expect((await store.get('env')).version).toBe(1);
  });

  it('never replaces a configuration with an older or equal version', async () => {
    let version = 3;
    const updates: number[] = [];
    const store = new ConfigStore({
      logger: silentLogger,
      load: () => Promise.resolve(config(version)),
    });
    store.subscribe((update) => updates.push(update.config.version));
    await store.get('env');

    version = 2;
    await store.refresh('env');
    await store.refresh('env', 3);
    expect((await store.get('env')).version).toBe(3);

    version = 4;
    await store.refresh('env', 4);
    expect((await store.get('env')).version).toBe(4);
    expect(updates).toEqual([3, 4]);
  });

  it('ignores refreshes of environments it never served', async () => {
    let loads = 0;
    const store = new ConfigStore({
      logger: silentLogger,
      load: () => {
        loads += 1;
        return Promise.resolve(config(1));
      },
    });
    await store.refresh('unknown', 5);
    await store.refreshAll();
    expect(loads).toBe(0);
  });

  it('returns 503 when the first load fails and isolates failing listeners', async () => {
    const failing = new ConfigStore({
      logger: silentLogger,
      load: () => Promise.reject(new Error('connection refused')),
    });
    await expect(failing.get('env')).rejects.toThrow('Configuration is temporarily unavailable');

    const store = new ConfigStore({ logger: silentLogger, load: () => Promise.resolve(config(1)) });
    const received: number[] = [];
    store.subscribe(() => {
      throw new Error('listener bug');
    });
    const unsubscribe = store.subscribe((update) => received.push(update.config.version));
    await store.get('env');
    unsubscribe();
    expect(received).toEqual([1]);
    expect(store.info().get('env')?.version).toBe(1);
  });
});
