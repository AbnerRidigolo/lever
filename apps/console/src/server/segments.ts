import { environments, experiments, flagEnvironments, flags, segments } from '@lever/db';
import { segmentDefinitionSchema, segmentRulesSchema, uuidSchema } from '@lever/schemas';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireRole, type ProjectRef } from './authz';
import type { ServiceContext, Transaction } from './context';
import { DomainError, isUniqueViolation } from './errors';
import { runMutation } from './mutation';

export async function listSegments(ctx: ServiceContext, where: ProjectRef) {
  const access = await requireRole(ctx, where, 'viewer');
  return ctx.db
    .select()
    .from(segments)
    .where(eq(segments.projectId, access.projectId))
    .orderBy(asc(segments.key));
}

export async function getSegment(ctx: ServiceContext, where: ProjectRef, segmentId: string) {
  const access = await requireRole(ctx, where, 'viewer');
  const [segment] = await ctx.db
    .select()
    .from(segments)
    .where(and(eq(segments.id, segmentId), eq(segments.projectId, access.projectId)));
  if (segment === undefined) throw new DomainError('not_found', 'Segmento não encontrado');
  return segment;
}

/** Flags and experiments that point to a segment. */
export async function segmentUsage(db: Pick<Transaction, 'select'>, segmentId: string) {
  const flagUses = await db
    .select({ key: flags.key, environment: environments.key })
    .from(flagEnvironments)
    .innerJoin(flags, eq(flags.id, flagEnvironments.flagId))
    .innerJoin(environments, eq(environments.id, flagEnvironments.environmentId))
    .where(eq(flagEnvironments.segmentId, segmentId));
  const experimentUses = await db
    .select({ key: experiments.key })
    .from(experiments)
    .where(eq(experiments.segmentId, segmentId));
  return { flags: flagUses, experiments: experimentUses };
}

export async function createSegment(ctx: ServiceContext, where: ProjectRef, input: unknown) {
  const data = segmentDefinitionSchema.parse(input);
  try {
    return await runMutation(ctx, where, 'editor', async (m) => {
      const [segment] = await m.tx
        .insert(segments)
        .values({ projectId: m.access.projectId, ...data })
        .returning();
      if (segment === undefined) throw new Error('segment was not inserted');
      m.audit({
        action: 'create',
        resourceType: 'segment',
        resourceId: segment.id,
        before: null,
        after: data,
      });
      m.publishAll();
      return segment;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError('conflict', `Já existe um segmento com a chave "${data.key}"`);
    }
    throw error;
  }
}

const updateSegmentSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(120),
  rules: segmentRulesSchema,
});

export async function updateSegment(ctx: ServiceContext, where: ProjectRef, input: unknown) {
  const data = updateSegmentSchema.parse(input);
  return runMutation(ctx, where, 'editor', async (m) => {
    const [before] = await m.tx
      .select()
      .from(segments)
      .where(and(eq(segments.id, data.id), eq(segments.projectId, m.access.projectId)));
    if (before === undefined) throw new DomainError('not_found', 'Segmento não encontrado');

    await m.tx
      .update(segments)
      .set({ name: data.name, rules: data.rules })
      .where(eq(segments.id, data.id));
    m.audit({
      action: 'update',
      resourceType: 'segment',
      resourceId: data.id,
      before: { name: before.name, rules: before.rules },
      after: { name: data.name, rules: data.rules },
    });
    m.publishAll();
  });
}

/** A segment in use cannot be deleted (spec 001, section 13); the error says where it is used. */
export async function deleteSegment(ctx: ServiceContext, where: ProjectRef, segmentId: string) {
  return runMutation(ctx, where, 'editor', async (m) => {
    const [before] = await m.tx
      .select()
      .from(segments)
      .where(and(eq(segments.id, segmentId), eq(segments.projectId, m.access.projectId)));
    if (before === undefined) throw new DomainError('not_found', 'Segmento não encontrado');

    const usage = await segmentUsage(m.tx, segmentId);
    const uses = [
      ...usage.flags.map((use) => `flag ${use.key} (${use.environment})`),
      ...usage.experiments.map((use) => `experimento ${use.key}`),
    ];
    if (uses.length > 0) {
      throw new DomainError('conflict', `Segmento em uso: ${uses.join(', ')}`);
    }

    await m.tx.delete(segments).where(eq(segments.id, segmentId));
    m.audit({
      action: 'delete',
      resourceType: 'segment',
      resourceId: segmentId,
      before: { key: before.key, name: before.name, rules: before.rules },
      after: null,
    });
    m.publishAll();
  });
}

/** Resolves a segment key of this project to its id; null stays null. */
export async function segmentIdOf(
  tx: Transaction,
  projectId: string,
  key: string | null,
): Promise<string | null> {
  if (key === null) return null;
  const [segment] = await tx
    .select({ id: segments.id })
    .from(segments)
    .where(and(eq(segments.projectId, projectId), eq(segments.key, key)));
  if (segment === undefined) {
    throw new DomainError('validation_failed', `Segmento "${key}" não existe neste projeto`);
  }
  return segment.id;
}
