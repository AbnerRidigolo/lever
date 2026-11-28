import { generateApiKey, hashApiKey } from '@lever/db';
import { apiErrorSchema } from '@lever/schemas';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { authOf, requireApiKey } from '../src/api-key-auth.js';
import { ApiKeyStore, type ApiKeySource, type AuthenticatedKey } from '../src/api-key-store.js';
import { registerErrorHandlers } from '../src/errors.js';

const silentLogger: FastifyBaseLogger = Fastify({ logger: false }).log;

const known: AuthenticatedKey = { apiKeyId: 'key-1', environmentId: 'env-1', projectId: 'proj-1' };
const knownToken = generateApiKey('development').key;
const knownHash = hashApiKey(knownToken);

interface FakeSource extends ApiKeySource {
  keys: Map<string, AuthenticatedKey>;
  down: boolean;
  hung: boolean;
  finds: number;
  touches: { apiKeyId: string; usedAt: Date }[];
}

function fakeSource(): FakeSource {
  const source: FakeSource = {
    keys: new Map([[knownHash, known]]),
    down: false,
    hung: false,
    finds: 0,
    touches: [],
    find(keyHash) {
      source.finds += 1;
      if (source.hung) return new Promise(() => undefined);
      if (source.down) return Promise.reject(new Error('connection refused'));
      return Promise.resolve(source.keys.get(keyHash) ?? null);
    },
    touch(apiKeyId, usedAt) {
      source.touches.push({ apiKeyId, usedAt });
      return Promise.resolve();
    },
  };
  return source;
}

/** Lets background revalidations and touches settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('ApiKeyStore', () => {
  it('resolves a known key and caches it', async () => {
    const source = fakeSource();
    const store = new ApiKeyStore({ source, logger: silentLogger, ttlMs: 60_000 });

    expect(await store.resolve(knownHash)).toEqual(known);
    expect(await store.resolve(knownHash)).toEqual(known);
    expect(source.finds).toBe(1);
  });

  it('returns null for an unknown key and does not cache it', async () => {
    const source = fakeSource();
    const store = new ApiKeyStore({ source, logger: silentLogger, ttlMs: 60_000 });

    expect(await store.resolve('unknown')).toBeNull();
    expect(await store.resolve('unknown')).toBeNull();
    expect(source.finds).toBe(2);
  });

  it('serves an expired key from cache while it revalidates, then drops a revoked one', async () => {
    let now = 1_000;
    const source = fakeSource();
    const store = new ApiKeyStore({ source, logger: silentLogger, ttlMs: 1_000, now: () => now });
    await store.resolve(knownHash);

    source.keys.delete(knownHash);
    now += 1_001;
    expect(await store.resolve(knownHash)).toEqual(known);
    await settle();
    expect(await store.resolve(knownHash)).toBeNull();
  });

  it('keeps the cached key when the background revalidation fails', async () => {
    let now = 1_000;
    const source = fakeSource();
    const warn = vi.fn();
    const logger = { ...silentLogger, warn } as FastifyBaseLogger;
    const store = new ApiKeyStore({ source, logger, ttlMs: 1_000, now: () => now });
    await store.resolve(knownHash);

    source.down = true;
    now += 5_000;
    expect(await store.resolve(knownHash)).toEqual(known);
    await settle();
    expect(await store.resolve(knownHash)).toEqual(known);
    expect(warn).toHaveBeenCalled();
  });

  it('starts one revalidation at a time per key', async () => {
    let now = 1_000;
    const source = fakeSource();
    const store = new ApiKeyStore({ source, logger: silentLogger, ttlMs: 1_000, now: () => now });
    await store.resolve(knownHash);

    source.hung = true;
    now += 5_000;
    await store.resolve(knownHash);
    await store.resolve(knownHash);
    expect(source.finds).toBe(2);
  });

  it('fails with service_unavailable when the lookup of an unknown key fails', async () => {
    const source = fakeSource();
    source.down = true;
    const store = new ApiKeyStore({ source, logger: silentLogger, ttlMs: 1_000 });

    await expect(store.resolve('other')).rejects.toMatchObject({
      code: 'service_unavailable',
      message: 'Unable to validate the API key',
    });
  });

  it('gives up on a hung lookup after the lookup timeout', async () => {
    const source = fakeSource();
    source.hung = true;
    const store = new ApiKeyStore({
      source,
      logger: silentLogger,
      ttlMs: 1_000,
      lookupTimeoutMs: 20,
    });

    await expect(store.resolve('other')).rejects.toMatchObject({ code: 'service_unavailable' });
  });

  it('updates last_used_at at most once per interval', async () => {
    let now = Date.parse('2026-10-29T12:00:00.000Z');
    const source = fakeSource();
    const store = new ApiKeyStore({
      source,
      logger: silentLogger,
      ttlMs: 600_000,
      touchIntervalMs: 60_000,
      now: () => now,
    });

    await store.resolve(knownHash);
    now += 30_000;
    await store.resolve(knownHash);
    expect(source.touches).toHaveLength(1);

    now += 31_000;
    await store.resolve(knownHash);
    expect(source.touches).toHaveLength(2);
    expect(source.touches[1]).toEqual({ apiKeyId: 'key-1', usedAt: new Date(now) });
  });

  it('does not fail a request when updating last_used_at fails', async () => {
    const source = fakeSource();
    source.touch = () => Promise.reject(new Error('read-only'));
    const store = new ApiKeyStore({ source, logger: silentLogger, ttlMs: 1_000 });

    expect(await store.resolve(knownHash)).toEqual(known);
    await settle();
  });
});

describe('requireApiKey', () => {
  const app = Fastify({ logger: false });
  const store = new ApiKeyStore({ source: fakeSource(), logger: silentLogger, ttlMs: 60_000 });

  beforeAll(async () => {
    app.decorateRequest('auth', null);
    registerErrorHandlers(app);
    app.get('/protected', { preHandler: requireApiKey(store) }, (request) => authOf(request));
    app.get('/unprotected', (request) => authOf(request));
    await app.ready();
  });

  afterAll(() => app.close());

  it('accepts a valid key and exposes it as request.auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${knownToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(known);
  });

  it.each([
    ['no header', {}],
    ['another scheme', { authorization: `Basic ${'x'.repeat(10)}` }],
    ['a malformed key', { authorization: 'Bearer not-a-key' }],
    ['an unknown key', { authorization: `Bearer ${generateApiKey('development').key}` }],
  ])('rejects %s with 401 in the standard format', async (_case, headers) => {
    const response = await app.inject({ method: 'GET', url: '/protected', headers });
    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('unauthorized');
  });

  it('fails with 500 when a route forgot the preHandler', async () => {
    const response = await app.inject({ method: 'GET', url: '/unprotected' });
    expect(response.statusCode).toBe(500);
  });
});
