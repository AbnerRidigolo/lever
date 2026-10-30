import { apiKeys, hashApiKey, isApiKeyFormat } from '@lever/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createApiKeyArgsSchema, createApiKeyFor } from '../src/cli/api-keys.js';
import { bearer, createTestApp, useTestDb } from './helpers.js';

const db = useTestDb();
const { app } = createTestApp(db);

describe('api-key:create', () => {
  it('creates a working key for the seeded project and stores only its hash', async () => {
    const created = await createApiKeyFor(
      db,
      createApiKeyArgsSchema.parse({ env: 'development', name: 'cli test' }),
    );
    expect(isApiKeyFormat(created.key)).toBe(true);

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, created.id));
    expect(row).toMatchObject({
      name: 'cli test',
      keyPrefix: created.key.slice(0, 12),
      keyHash: hashApiKey(created.key),
    });
    expect(JSON.stringify(row)).not.toContain(created.key);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/config',
      headers: bearer(created.key),
    });
    expect(response.statusCode).toBe(200);
  });

  it('fails for an unknown project', async () => {
    await expect(
      createApiKeyFor(db, createApiKeyArgsSchema.parse({ env: 'production', project: 'nope' })),
    ).rejects.toThrow('environment "production" of project "nope" not found');
  });

  it('requires a valid environment', () => {
    expect(createApiKeyArgsSchema.safeParse({}).success).toBe(false);
    expect(createApiKeyArgsSchema.safeParse({ env: 'staging' }).success).toBe(false);
  });
});
