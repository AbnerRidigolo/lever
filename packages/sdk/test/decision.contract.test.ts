import {
  apiKeys,
  configVersions,
  createDb,
  environments,
  flagEnvironments,
  flags,
  generateApiKey,
  projects,
  runMigrations,
  seed,
  type DbConnection,
} from '@lever/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { and, eq, max } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestClient } from './client-helpers.js';
import { DecisionProcess, freePort } from './decision-process.js';
import { eventually, sleep } from './helpers.js';
import { POSTGRES_IMAGE } from './postgres-image.js';

/**
 * Contract with the real decision service (sdk plan, D12): Postgres from Testcontainers (never a
 * mocked database), migrated and seeded, and `services/decision` built and run in a child process.
 * The SDK uses the fake evaluator, so this file checks the transport, not the reserved logic.
 */
let container: StartedPostgreSqlContainer;
let database: DbConnection;
let decision: DecisionProcess;
let apiKey: string;
let environmentId: string;

const anonymous = { id: 'anon-contract-1', attributes: { country: 'BR', device: 'mobile' } };

beforeAll(async () => {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();
  database = createDb(databaseUrl, { maxConnections: 2 });
  await runMigrations(database.db);
  await seed(database.db);

  const [environment] = await database.db
    .select({ id: environments.id })
    .from(environments)
    .innerJoin(projects, eq(projects.id, environments.projectId))
    .where(and(eq(projects.slug, 'demo-store'), eq(environments.key, 'development')));
  if (environment === undefined) throw new Error('seeded development environment not found');
  environmentId = environment.id;

  const generated = generateApiKey('development');
  await database.db.insert(apiKeys).values({
    environmentId,
    name: 'sdk contract test',
    keyPrefix: generated.prefix,
    keyHash: generated.hash,
  });
  apiKey = generated.key;

  decision = new DecisionProcess(databaseUrl, await freePort());
}, 180_000);

afterAll(async () => {
  await decision.stop();
  await database.close();
  await container.stop();
}, 60_000);

/** Turns `new-banner` on or off in development and publishes a version, as the console does. */
async function setNewBanner(enabled: boolean): Promise<number> {
  return database.db.transaction(async (tx) => {
    const [flag] = await tx.select({ id: flags.id }).from(flags).where(eq(flags.key, 'new-banner'));
    if (flag === undefined) throw new Error('seeded flag new-banner not found');
    await tx
      .update(flagEnvironments)
      .set({ enabled })
      .where(
        and(
          eq(flagEnvironments.flagId, flag.id),
          eq(flagEnvironments.environmentId, environmentId),
        ),
      );
    const [latest] = await tx
      .select({ version: max(configVersions.version) })
      .from(configVersions)
      .where(eq(configVersions.environmentId, environmentId));
    const version = (latest?.version ?? 0) + 1;
    await tx.insert(configVersions).values({ environmentId, version });
    return version;
  });
}

describe('contract with the real decision service (FR-005, FR-006, AC-5.4 to AC-5.6)', () => {
  it('AC-5.5: a client started before the service serves defaults, then connects when it comes up', async () => {
    const { client } = createTestClient(decision.url, { apiKey });
    expect(await client.ready({ timeoutMs: 300 })).toBe('timeout');
    expect(client.getFlag('new-banner', anonymous, true)).toBe(true);
    expect(client.getVariant('checkout-layout', anonymous)).toBeNull();

    await decision.start();
    expect(await client.ready({ timeoutMs: 10_000 })).toBe('ready');
    // Seed: new-banner is off; checkout-layout is running in development (control: one-page).
    expect(client.getFlag('new-banner', anonymous, true)).toBe(false);
    expect(client.getVariant('checkout-layout', anonymous)).toBe('one-page');
    expect(client.getMetrics().connection).toBe('connected');
    await client.close();
  });

  it('AC-5.4 / NFR-003 (database to SDK): a published change reaches the SDK in under 5 s', async () => {
    const { client } = createTestClient(decision.url, { apiKey });
    expect(await client.ready()).toBe('ready');
    const before = client.getMetrics().configVersion;

    const started = Date.now();
    const version = await setNewBanner(true);
    await eventually(
      () => {
        expect(client.getFlag('new-banner', anonymous, false)).toBe(true);
      },
      { timeoutMs: 5_000 },
    );
    const elapsedMs = Date.now() - started;
    expect(elapsedMs).toBeLessThan(5_000);
    expect(client.getMetrics().configVersion).toBe(version);
    expect(version).toBeGreaterThan(before ?? 0);

    await setNewBanner(false);
    await eventually(() => {
      expect(client.getFlag('new-banner', anonymous, true)).toBe(false);
    });
    await client.close();
  });

  it('AC-5.6: keeps the last config while the service is down and reconnects when it is back', async () => {
    const version = await setNewBanner(true);
    const { client } = createTestClient(decision.url, { apiKey });
    await client.ready();
    await eventually(() => {
      expect(client.getMetrics().configVersion).toBe(version);
    });

    await decision.stop();
    await sleep(300);
    expect(client.getFlag('new-banner', anonymous, false)).toBe(true);
    expect(client.getMetrics().connection).not.toBe('connected');

    await decision.start();
    await eventually(
      () => {
        expect(client.getMetrics().connection).toBe('connected');
      },
      { timeoutMs: 10_000 },
    );
    expect(client.getFlag('new-banner', anonymous, false)).toBe(true);
    await client.close();
  });

  it('a revoked or unknown key stops the client without losing the defaults', async () => {
    const { client } = createTestClient(decision.url, {
      apiKey: generateApiKey('development').key,
    });
    await eventually(() => {
      expect(client.getMetrics().connection).toBe('unauthorized');
    });
    expect(client.getFlag('new-banner', anonymous, false)).toBe(false);
    await client.close();
  });
});
