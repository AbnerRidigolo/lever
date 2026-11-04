import { randomBytes } from 'node:crypto';

import { environments, flagEnvironments, flags, segments } from '@lever/db';
import {
  environmentKeySchema,
  flagDefinitionSchema,
  flagEnvironmentSettingsSchemaFor,
  flagValueSchemaFor,
  type EnvironmentKey,
} from '@lever/schemas';
import { and, asc, eq } from 'drizzle-orm';

import { requireRole, type ProjectRef } from './authz';
import type { ServiceContext, Transaction } from './context';
import { DomainError, isUniqueViolation } from './errors';
import { runMutation } from './mutation';
import { segmentIdOf } from './segments';

export function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

export async function listFlags(ctx: ServiceContext, where: ProjectRef) {
  const access = await requireRole(ctx, where, 'viewer');
  const rows = await ctx.db
    .select()
    .from(flags)
    .where(eq(flags.projectId, access.projectId))
    .orderBy(asc(flags.key));
  const settings = await ctx.db
    .select({
      flagId: flagEnvironments.flagId,
      environment: environments.key,
      enabled: flagEnvironments.enabled,
      rolloutBps: flagEnvironments.rolloutBps,
    })
    .from(flagEnvironments)
    .innerJoin(environments, eq(environments.id, flagEnvironments.environmentId))
    .where(eq(environments.projectId, access.projectId))
    .orderBy(asc(environments.key));
  return rows.map((flag) => ({
    ...flag,
    environments: settings.filter((setting) => setting.flagId === flag.id),
  }));
}

/** A flag with its settings per environment: the "where it is active" of FR-010. */
export async function getFlag(ctx: ServiceContext, where: ProjectRef, flagId: string) {
  const access = await requireRole(ctx, where, 'viewer');
  const [flag] = await ctx.db
    .select()
    .from(flags)
    .where(and(eq(flags.id, flagId), eq(flags.projectId, access.projectId)));
  if (flag === undefined) throw new DomainError('not_found', 'Flag não encontrada');

  const settings = await ctx.db
    .select({
      environment: environments.key,
      enabled: flagEnvironments.enabled,
      servedValue: flagEnvironments.servedValue,
      rolloutBps: flagEnvironments.rolloutBps,
      segmentKey: segments.key,
    })
    .from(flagEnvironments)
    .innerJoin(environments, eq(environments.id, flagEnvironments.environmentId))
    .leftJoin(segments, eq(segments.id, flagEnvironments.segmentId))
    .where(eq(flagEnvironments.flagId, flagId))
    .orderBy(asc(environments.key));
  return { ...flag, environments: settings };
}

/** Creates a flag, off in both environments, serving its default value to 100% once turned on. */
export async function createFlag(ctx: ServiceContext, where: ProjectRef, input: unknown) {
  const data = flagDefinitionSchema.parse(input);
  try {
    return await runMutation(ctx, where, 'editor', async (m) => {
      const [flag] = await m.tx
        .insert(flags)
        .values({
          projectId: m.access.projectId,
          key: data.key,
          type: data.type,
          defaultValue: data.defaultValue,
          salt: generateSalt(),
        })
        .returning();
      if (flag === undefined) throw new Error('flag was not inserted');

      const envs = await m.tx
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.projectId, m.access.projectId));
      await m.tx.insert(flagEnvironments).values(
        envs.map((env) => ({
          flagId: flag.id,
          environmentId: env.id,
          enabled: false,
          servedValue: data.defaultValue,
          rolloutBps: 10_000,
        })),
      );

      m.audit({
        action: 'create',
        resourceType: 'flag',
        resourceId: flag.id,
        before: null,
        after: data,
      });
      m.publishAll();
      return flag;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError('conflict', `Já existe uma flag com a chave "${data.key}"`);
    }
    throw error;
  }
}

async function flagOfProject(tx: Transaction, projectId: string, flagId: string) {
  const [flag] = await tx
    .select()
    .from(flags)
    .where(and(eq(flags.id, flagId), eq(flags.projectId, projectId)));
  if (flag === undefined) throw new DomainError('not_found', 'Flag não encontrada');
  return flag;
}

/** Changes the default value. Key, type and salt never change (console plan, D9). */
export async function updateFlagDefault(
  ctx: ServiceContext,
  where: ProjectRef,
  flagId: string,
  defaultValue: unknown,
) {
  return runMutation(ctx, where, 'editor', async (m) => {
    const before = await flagOfProject(m.tx, m.access.projectId, flagId);
    const value = flagValueSchemaFor(before.type).parse(defaultValue);
    await m.tx.update(flags).set({ defaultValue: value }).where(eq(flags.id, flagId));
    m.audit({
      action: 'update',
      resourceType: 'flag',
      resourceId: flagId,
      before: { defaultValue: before.defaultValue },
      after: { defaultValue: value },
    });
    m.publishAll();
  });
}

/** Changes a flag in one environment, publishing only that environment (AC-1.3, FR-002). */
export async function updateFlagEnvironment(
  ctx: ServiceContext,
  where: ProjectRef,
  flagId: string,
  environment: EnvironmentKey,
  input: unknown,
) {
  const environmentKey = environmentKeySchema.parse(environment);
  return runMutation(ctx, where, 'editor', async (m) => {
    const flag = await flagOfProject(m.tx, m.access.projectId, flagId);
    const settings = flagEnvironmentSettingsSchemaFor(flag.type).parse(input);

    const [env] = await m.tx
      .select({ id: environments.id })
      .from(environments)
      .where(
        and(eq(environments.projectId, m.access.projectId), eq(environments.key, environmentKey)),
      );
    if (env === undefined) throw new Error('project is missing an environment');

    const [before] = await m.tx
      .select({
        enabled: flagEnvironments.enabled,
        servedValue: flagEnvironments.servedValue,
        rolloutBps: flagEnvironments.rolloutBps,
        segmentKey: segments.key,
      })
      .from(flagEnvironments)
      .leftJoin(segments, eq(segments.id, flagEnvironments.segmentId))
      .where(and(eq(flagEnvironments.flagId, flagId), eq(flagEnvironments.environmentId, env.id)));

    const segmentId = await segmentIdOf(m.tx, m.access.projectId, settings.segmentKey);
    await m.tx
      .insert(flagEnvironments)
      .values({
        flagId,
        environmentId: env.id,
        enabled: settings.enabled,
        servedValue: settings.servedValue,
        rolloutBps: settings.rolloutBps,
        segmentId,
      })
      .onConflictDoUpdate({
        target: [flagEnvironments.flagId, flagEnvironments.environmentId],
        set: {
          enabled: settings.enabled,
          servedValue: settings.servedValue,
          rolloutBps: settings.rolloutBps,
          segmentId,
          updatedAt: new Date(),
        },
      });

    m.audit({
      action: 'update',
      resourceType: 'flag',
      resourceId: flagId,
      before: { environment: environmentKey, ...before },
      after: { environment: environmentKey, ...settings },
    });
    m.publish([env.id]);
  });
}

export async function deleteFlag(ctx: ServiceContext, where: ProjectRef, flagId: string) {
  return runMutation(ctx, where, 'editor', async (m) => {
    const before = await flagOfProject(m.tx, m.access.projectId, flagId);
    await m.tx.delete(flags).where(eq(flags.id, flagId));
    m.audit({
      action: 'delete',
      resourceType: 'flag',
      resourceId: flagId,
      before: { key: before.key, type: before.type, defaultValue: before.defaultValue },
      after: null,
    });
    m.publishAll();
  });
}
