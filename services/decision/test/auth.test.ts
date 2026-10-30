import { apiKeys, generateApiKey, hashApiKey } from '@lever/db';
import { apiErrorSchema } from '@lever/schemas';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authOf, requireApiKey } from '../src/auth/api-key-auth.js';
import { ApiKeyStore, createDbApiKeySource, type ApiKeySource } from '../src/auth/api-key-store.js';
import { registerErrorHandlers } from '../src/errors.js';
import {
  bearer,
  createApiKey,
  eventually,
  seededEnvironmentId,
  silentLogger,
  useTestDb,
} from './helpers.js';

const db = useTestDb();
const source = createDbApiKeySource(db);
const store = new ApiKeyStore({ source, logger: silentLogger, ttlMs: 60_000 });
const app = Fastify({ loggerInstance: silentLogger });

let developmentId: string;
let devKey: { id: string; key: string };

beforeAll(async () => {
  developmentId = await seededEnvironmentId(db, 'development');
  devKey = await createApiKey(db, developmentId, 'development');

  app.decorateRequest('auth', null);
  registerErrorHandlers(app);
  app.get('/protected', { preHandler: requireApiKey(store) }, (request) => authOf(request));
  app.get('/unprotected', (request) => authOf(request));
  await app.ready();
});

afterAll(() => app.close());

/** Wraps the real source so a test can make every lookup fail, as if Postgres were down. */
function flakySource(): ApiKeySource & { down: boolean } {
  const flaky = {
    down: false,
    find: (keyHash: string) =>
      flaky.down ? Promise.reject(new Error('connection refused')) : source.find(keyHash),
    touch: (apiKeyId: string, usedAt: Date) =>
      flaky.down ? Promise.reject(new Error('connection refused')) : source.touch(apiKeyId, usedAt),
  };
  return flaky;
}

describe('API key authentication', () => {
  it('FR-005: accepts a valid key and resolves its environment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: bearer(devKey.key),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ apiKeyId: devKey.id, environmentId: developmentId });
  });

  it.each([
    ['no header', {}],
    ['another scheme', { authorization: `Basic ${'x'.repeat(10)}` }],
    ['a malformed key', bearer('not-a-key')],
    ['an unknown key', bearer(generateApiKey('development').key)],
  ])('FR-005: rejects %s with 401 in the standard format', async (_case, headers) => {
    const response = await app.inject({ method: 'GET', url: '/protected', headers });
    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('unauthorized');
  });

  it('AC-7.3 (decision side): rejects a revoked key once its cache entry expires', async () => {
    let now = 1_000_000;
    const shortStore = new ApiKeyStore({
      source,
      logger: silentLogger,
      ttlMs: 1_000,
      now: () => now,
    });
    const revoked = await createApiKey(db, developmentId, 'development');

    expect(await shortStore.resolve(hashApiKey(revoked.key))).not.toBeNull();
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, revoked.id));

    // Still trusted while cached (decision plan, D5)...
    expect(await shortStore.resolve(hashApiKey(revoked.key))).not.toBeNull();
    // ...and rejected after the TTL.
    now += 1_001;
    expect(await shortStore.resolve(hashApiKey(revoked.key))).toBeNull();
  });

  it('updates last_used_at at most once per interval', async () => {
    let now = Date.parse('2026-10-29T12:00:00.000Z');
    const touchStore = new ApiKeyStore({
      source,
      logger: silentLogger,
      ttlMs: 60_000,
      touchIntervalMs: 60_000,
      now: () => now,
    });
    const key = await createApiKey(db, developmentId, 'development');
    const lastUsedAt = async () =>
      (await db.select().from(apiKeys).where(eq(apiKeys.id, key.id)))[0]?.lastUsedAt?.getTime();

    await touchStore.resolve(hashApiKey(key.key));
    await eventually(async () => {
      expect(await lastUsedAt()).toBe(now);
    });

    const first = now;
    now += 30_000;
    await touchStore.resolve(hashApiKey(key.key));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await lastUsedAt()).toBe(first);

    now += 31_000;
    await touchStore.resolve(hashApiKey(key.key));
    await eventually(async () => {
      expect(await lastUsedAt()).toBe(now);
    });
  });

  it('NFR-004: keeps accepting a cached key when Postgres is unreachable', async () => {
    let now = 1_000_000;
    const flaky = flakySource();
    const resilientStore = new ApiKeyStore({
      source: flaky,
      logger: silentLogger,
      ttlMs: 1_000,
      now: () => now,
    });
    const key = await createApiKey(db, developmentId, 'development');
    const resolved = await resilientStore.resolve(hashApiKey(key.key));
    expect(resolved).not.toBeNull();

    flaky.down = true;
    now += 5_000;
    expect(await resilientStore.resolve(hashApiKey(key.key))).toEqual(resolved);
    await expect(
      resilientStore.resolve(hashApiKey(generateApiKey('development').key)),
    ).rejects.toThrow('Unable to validate the API key');
  });

  it('fails with 500 when a route forgot the API key preHandler', async () => {
    const response = await app.inject({ method: 'GET', url: '/unprotected' });
    expect(response.statusCode).toBe(500);
  });
});
