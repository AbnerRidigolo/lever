import { flagEnvironments } from '@lever/db';
import { CONFIG_CHANGES_CHANNEL, environmentConfigSchema } from '@lever/schemas';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import {
  listenForConfigChanges,
  type ConfigChangeListener,
} from '../src/config/config-listener.js';
import {
  bearer,
  createApiKey,
  createTestApp,
  createTestFlag,
  eventually,
  publishChange,
  seededEnvironmentId,
  silentLogger,
  useTestDb,
} from './helpers.js';

const db = useTestDb();
const { app, configStore } = createTestApp(db);

let listener: ConfigChangeListener;
let developmentId: string;
let productionId: string;
let devKey: string;
let prodKey: string;
let flagId: string;

// A flag of its own, so other test files keep seeing the seeded `new-banner` untouched.
const FLAG_KEY = 'propagation-banner';

beforeAll(async () => {
  developmentId = await seededEnvironmentId(db, 'development');
  productionId = await seededEnvironmentId(db, 'production');
  flagId = await createTestFlag(db, FLAG_KEY);
  devKey = (await createApiKey(db, developmentId, 'development')).key;
  prodKey = (await createApiKey(db, productionId, 'production')).key;
  listener = await listenForConfigChanges({
    databaseUrl: inject('databaseUrl'),
    configStore,
    logger: silentLogger,
  });
  await app.ready();
});

afterAll(() => listener.close());

async function bannerOf(key: string) {
  const response = await app.inject({ method: 'GET', url: '/v1/config', headers: bearer(key) });
  const config = environmentConfigSchema.parse(response.json());
  return { version: config.version, flag: config.flags.find((flag) => flag.key === FLAG_KEY) };
}

function setBanner(environmentId: string, enabled: boolean) {
  return publishChange(db, environmentId, async (tx) => {
    await tx
      .update(flagEnvironments)
      .set({ enabled })
      .where(
        and(eq(flagEnvironments.flagId, flagId), eq(flagEnvironments.environmentId, environmentId)),
      );
  });
}

describe('config propagation through LISTEN/NOTIFY', () => {
  it('FR-008, AC-1.1 (server side): turning a flag on reaches /v1/config in under 5 s', async () => {
    const before = await bannerOf(devKey);
    expect(before.flag?.enabled).toBe(false);

    const started = Date.now();
    const version = await setBanner(developmentId, true);

    await eventually(async () => {
      const after = await bannerOf(devKey);
      expect(after.version).toBe(version);
      expect(after.flag?.enabled).toBe(true);
    });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('AC-1.3 (server side): a change in development does not affect production', async () => {
    expect((await bannerOf(prodKey)).flag?.enabled).toBe(false);
  });

  it('AC-1.2 (server side): turning the flag off again is propagated too', async () => {
    const version = await setBanner(developmentId, false);
    await eventually(async () => {
      const after = await bannerOf(devKey);
      expect(after.version).toBe(version);
      expect(after.flag?.enabled).toBe(false);
    });
  });

  it('ignores malformed notifications and keeps listening', async () => {
    await db.execute(sql`SELECT pg_notify(${CONFIG_CHANGES_CHANNEL}, 'not json')`);
    await db.execute(sql`SELECT pg_notify(${CONFIG_CHANGES_CHANNEL}, '{"environmentId":"x"}')`);

    const version = await setBanner(developmentId, true);
    await eventually(async () => {
      expect((await bannerOf(devKey)).version).toBe(version);
    });
  });

  it('ignores notifications for versions it already serves', async () => {
    const current = (await bannerOf(devKey)).version;
    const updates: number[] = [];
    const unsubscribe = configStore.subscribe((update) => updates.push(update.config.version));

    const payload = JSON.stringify({ environmentId: developmentId, version: current });
    await db.execute(sql`SELECT pg_notify(${CONFIG_CHANGES_CHANNEL}, ${payload})`);
    await new Promise((resolve) => setTimeout(resolve, 300));

    unsubscribe();
    expect(updates).toEqual([]);
  });
});
