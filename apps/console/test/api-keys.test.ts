import { apiKeys, auditLog, hashApiKey, isApiKeyFormat } from '@lever/db';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApiKey, listApiKeys, revokeApiKey } from '@/server/api-keys';

import { createTestProject, expectCode, type TestProject, connectTestDb } from './helpers';

const db = connectTestDb();
let project: TestProject;
let ref: { projectId: string };

beforeAll(async () => {
  project = await createTestProject(db);
  ref = { projectId: project.projectId };
});

describe('API keys', () => {
  it('AC-7.3: returns the full key once and stores only its hash', async () => {
    const { id, key } = await createApiKey(project.admin, ref, {
      environment: 'production',
      name: 'loja',
    });
    expect(isApiKeyFormat(key)).toBe(true);
    expect(key.startsWith('lvr_prd_')).toBe(true);

    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    expect(row?.keyHash).toBe(hashApiKey(key));
    expect(JSON.stringify(row)).not.toContain(key);

    const [listed] = await listApiKeys(project.admin, ref);
    expect(JSON.stringify(listed)).not.toContain(key);
    expect(JSON.stringify(listed)).not.toContain(hashApiKey(key));
    expect(listed).toMatchObject({ environment: 'production', prefix: key.slice(0, 12) });
  });

  it('AC-6.1, AC-7.3: the audit entry has neither the key nor the hash', async () => {
    const { id, key } = await createApiKey(project.admin, ref, {
      environment: 'development',
      name: 'sem-segredo',
    });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.resourceId, id));
    expect(entry?.after).toMatchObject({ name: 'sem-segredo', environment: 'development' });
    expect(JSON.stringify(entry)).not.toContain(key);
    expect(JSON.stringify(entry)).not.toContain(hashApiKey(key));
  });

  it('AC-7.3: revoking keeps the row and cannot be repeated', async () => {
    const { id } = await createApiKey(project.admin, ref, {
      environment: 'development',
      name: 'to-revoke',
    });
    await revokeApiKey(project.admin, ref, id);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    expect(row?.revokedAt).toBeInstanceOf(Date);
    await expectCode(revokeApiKey(project.admin, ref, id), 'not_found');
  });

  it('cannot revoke a key of another project', async () => {
    const other = await createTestProject(db);
    const { id } = await createApiKey(
      other.admin,
      { projectId: other.projectId },
      {
        environment: 'development',
        name: 'foreign',
      },
    );
    await expectCode(revokeApiKey(project.admin, ref, id), 'not_found');
  });
});
