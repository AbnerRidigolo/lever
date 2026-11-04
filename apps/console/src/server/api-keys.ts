import { apiKeys, environments, generateApiKey } from '@lever/db';
import { createApiKeySchema } from '@lever/schemas';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { requireRole, type ProjectRef } from './authz';
import type { ServiceContext } from './context';
import { DomainError } from './errors';
import { runMutation } from './mutation';

/** Never selects the hash: the console only ever shows the prefix. */
export async function listApiKeys(ctx: ServiceContext, where: ProjectRef) {
  const access = await requireRole(ctx, where, 'admin');
  return ctx.db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.keyPrefix,
      environment: environments.key,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .innerJoin(environments, eq(environments.id, apiKeys.environmentId))
    .where(eq(environments.projectId, access.projectId))
    .orderBy(desc(apiKeys.createdAt));
}

/** Returns the full key, which exists only in this response (AC-7.3). */
export async function createApiKey(ctx: ServiceContext, where: ProjectRef, input: unknown) {
  const data = createApiKeySchema.parse(input);
  return runMutation(ctx, where, 'admin', async (m) => {
    const [environment] = await m.tx
      .select({ id: environments.id })
      .from(environments)
      .where(
        and(eq(environments.projectId, m.access.projectId), eq(environments.key, data.environment)),
      );
    if (environment === undefined) throw new Error('project is missing an environment');

    const generated = generateApiKey(data.environment);
    const [row] = await m.tx
      .insert(apiKeys)
      .values({
        environmentId: environment.id,
        name: data.name,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
      })
      .returning({ id: apiKeys.id });
    if (row === undefined) throw new Error('api key was not inserted');

    m.audit({
      action: 'create',
      resourceType: 'api_key',
      resourceId: row.id,
      before: null,
      after: { name: data.name, prefix: generated.prefix, environment: data.environment },
    });
    return { id: row.id, key: generated.key };
  });
}

export async function revokeApiKey(ctx: ServiceContext, where: ProjectRef, apiKeyId: string) {
  return runMutation(ctx, where, 'admin', async (m) => {
    const [row] = await m.tx
      .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.keyPrefix })
      .from(apiKeys)
      .innerJoin(environments, eq(environments.id, apiKeys.environmentId))
      .where(
        and(
          eq(apiKeys.id, apiKeyId),
          eq(environments.projectId, m.access.projectId),
          isNull(apiKeys.revokedAt),
        ),
      );
    if (row === undefined) throw new DomainError('not_found', 'API key não encontrada');

    const revokedAt = new Date();
    await m.tx.update(apiKeys).set({ revokedAt }).where(eq(apiKeys.id, apiKeyId));
    m.audit({
      action: 'update',
      resourceType: 'api_key',
      resourceId: apiKeyId,
      before: { name: row.name, prefix: row.prefix, revokedAt: null },
      after: { name: row.name, prefix: row.prefix, revokedAt: revokedAt.toISOString() },
    });
  });
}
