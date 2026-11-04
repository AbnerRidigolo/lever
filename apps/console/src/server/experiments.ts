import {
  environments,
  experimentEnvironments,
  experiments,
  experimentVariants,
  segments,
} from '@lever/db';
import {
  experimentDefinitionSchema,
  experimentTransitionSchema,
  experimentVariantsSchema,
  resourceKeySchema,
  type ExperimentStatus,
} from '@lever/schemas';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireRole, type ProjectRef } from './authz';
import type { ServiceContext, Transaction } from './context';
import { DomainError, isUniqueViolation } from './errors';
import { generateSalt } from './flags';
import { runMutation } from './mutation';
import { segmentIdOf } from './segments';

const TRANSITIONS: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  draft: ['running'],
  running: ['paused', 'completed'],
  paused: ['running', 'completed'],
  completed: [],
};

/** Whether a status can move to another (console plan, D8). `completed` is final. */
export function canTransition(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The overall status shown in the console, derived from the environments (console plan, D8). */
export function deriveOverallStatus(statuses: readonly ExperimentStatus[]): ExperimentStatus {
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('paused')) return 'paused';
  if (statuses.includes('completed')) return 'completed';
  return 'draft';
}

export async function listExperiments(ctx: ServiceContext, where: ProjectRef) {
  const access = await requireRole(ctx, where, 'viewer');
  const rows = await ctx.db
    .select()
    .from(experiments)
    .where(eq(experiments.projectId, access.projectId))
    .orderBy(asc(experiments.key));
  const states = await ctx.db
    .select({
      experimentId: experimentEnvironments.experimentId,
      environment: environments.key,
      status: experimentEnvironments.status,
    })
    .from(experimentEnvironments)
    .innerJoin(environments, eq(environments.id, experimentEnvironments.environmentId))
    .where(eq(environments.projectId, access.projectId))
    .orderBy(asc(environments.key));
  return rows.map((experiment) => ({
    ...experiment,
    environments: states.filter((state) => state.experimentId === experiment.id),
  }));
}

export async function getExperiment(ctx: ServiceContext, where: ProjectRef, experimentId: string) {
  const access = await requireRole(ctx, where, 'viewer');
  const [experiment] = await ctx.db
    .select({
      id: experiments.id,
      key: experiments.key,
      hypothesis: experiments.hypothesis,
      status: experiments.status,
      startedAt: experiments.startedAt,
      endedAt: experiments.endedAt,
      segmentKey: segments.key,
    })
    .from(experiments)
    .leftJoin(segments, eq(segments.id, experiments.segmentId))
    .where(and(eq(experiments.id, experimentId), eq(experiments.projectId, access.projectId)));
  if (experiment === undefined) throw new DomainError('not_found', 'Experimento não encontrado');

  const variants = await ctx.db
    .select({
      key: experimentVariants.key,
      weightBps: experimentVariants.weightBps,
      isControl: experimentVariants.isControl,
    })
    .from(experimentVariants)
    .where(eq(experimentVariants.experimentId, experimentId))
    .orderBy(desc(experimentVariants.isControl), asc(experimentVariants.key));
  const states = await ctx.db
    .select({ environment: environments.key, status: experimentEnvironments.status })
    .from(experimentEnvironments)
    .innerJoin(environments, eq(environments.id, experimentEnvironments.environmentId))
    .where(eq(experimentEnvironments.experimentId, experimentId))
    .orderBy(asc(environments.key));
  return { ...experiment, variants, environments: states };
}

/** Creates an experiment in `draft` in both environments (AC-3.1). */
export async function createExperiment(ctx: ServiceContext, where: ProjectRef, input: unknown) {
  const data = experimentDefinitionSchema.parse(input);
  try {
    return await runMutation(ctx, where, 'editor', async (m) => {
      const segmentId = await segmentIdOf(m.tx, m.access.projectId, data.segmentKey);
      const [experiment] = await m.tx
        .insert(experiments)
        .values({
          projectId: m.access.projectId,
          key: data.key,
          hypothesis: data.hypothesis,
          salt: generateSalt(),
          segmentId,
        })
        .returning();
      if (experiment === undefined) throw new Error('experiment was not inserted');

      await m.tx
        .insert(experimentVariants)
        .values(data.variants.map((variant) => ({ experimentId: experiment.id, ...variant })));
      const envs = await m.tx
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.projectId, m.access.projectId));
      await m.tx
        .insert(experimentEnvironments)
        .values(envs.map((env) => ({ experimentId: experiment.id, environmentId: env.id })));

      m.audit({
        action: 'create',
        resourceType: 'experiment',
        resourceId: experiment.id,
        before: null,
        after: data,
      });
      m.publishAll();
      return experiment;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError('conflict', `Já existe um experimento com a chave "${data.key}"`);
    }
    throw error;
  }
}

async function loadForChange(tx: Transaction, projectId: string, experimentId: string) {
  // Locked so a concurrent start cannot slip past the "not running" checks below.
  const [experiment] = await tx
    .select()
    .from(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.projectId, projectId)))
    .for('update');
  if (experiment === undefined) throw new DomainError('not_found', 'Experimento não encontrado');

  const states = await tx
    .select({
      environmentId: experimentEnvironments.environmentId,
      environment: environments.key,
      status: experimentEnvironments.status,
    })
    .from(experimentEnvironments)
    .innerJoin(environments, eq(environments.id, experimentEnvironments.environmentId))
    .where(eq(experimentEnvironments.experimentId, experimentId));
  return { experiment, states };
}

const updateExperimentSchema = z.object({
  hypothesis: z.string().trim().min(1).max(2_000),
  variants: experimentVariantsSchema,
  segmentKey: resourceKeySchema.nullable(),
});

/**
 * Updates an experiment. Variants, weights and segment cannot change while it runs in any
 * environment (AC-3.6), and a completed experiment cannot change at all (console plan, D8).
 */
export async function updateExperiment(
  ctx: ServiceContext,
  where: ProjectRef,
  experimentId: string,
  input: unknown,
) {
  const data = updateExperimentSchema.parse(input);
  return runMutation(ctx, where, 'editor', async (m) => {
    const { experiment, states } = await loadForChange(m.tx, m.access.projectId, experimentId);
    if (experiment.status === 'completed') {
      throw new DomainError('conflict', 'Um experimento concluído não pode ser alterado');
    }

    const beforeVariants = await m.tx
      .select({
        key: experimentVariants.key,
        weightBps: experimentVariants.weightBps,
        isControl: experimentVariants.isControl,
      })
      .from(experimentVariants)
      .where(eq(experimentVariants.experimentId, experimentId))
      .orderBy(asc(experimentVariants.key));
    const sortedNew = [...data.variants].sort((a, b) => a.key.localeCompare(b.key));
    const sortedOld = [...beforeVariants].sort((a, b) => a.key.localeCompare(b.key));
    const variantsChanged = JSON.stringify(sortedNew) !== JSON.stringify(sortedOld);

    const segmentId = await segmentIdOf(m.tx, m.access.projectId, data.segmentKey);
    const segmentChanged = segmentId !== experiment.segmentId;

    if ((variantsChanged || segmentChanged) && states.some((state) => state.status === 'running')) {
      throw new DomainError(
        'conflict',
        'Pause o experimento em todos os ambientes antes de alterar variantes, pesos ou segmento',
      );
    }

    await m.tx
      .update(experiments)
      .set({ hypothesis: data.hypothesis, segmentId })
      .where(eq(experiments.id, experimentId));
    if (variantsChanged) {
      await m.tx
        .delete(experimentVariants)
        .where(eq(experimentVariants.experimentId, experimentId));
      await m.tx
        .insert(experimentVariants)
        .values(data.variants.map((variant) => ({ experimentId, ...variant })));
    }

    m.audit({
      action: 'update',
      resourceType: 'experiment',
      resourceId: experimentId,
      before: {
        hypothesis: experiment.hypothesis,
        segmentId: experiment.segmentId,
        variants: beforeVariants,
      },
      after: { hypothesis: data.hypothesis, segmentId, variants: data.variants },
    });
    m.publishAll();
  });
}

/** Moves an experiment to another status in one environment (AC-3.5, console plan D8). */
export async function transitionExperiment(
  ctx: ServiceContext,
  where: ProjectRef,
  experimentId: string,
  input: unknown,
) {
  const { environment, to } = experimentTransitionSchema.parse(input);
  return runMutation(ctx, where, 'editor', async (m) => {
    const { experiment, states } = await loadForChange(m.tx, m.access.projectId, experimentId);
    const current = states.find((state) => state.environment === environment);
    if (current === undefined) throw new Error('experiment is missing an environment');
    if (!canTransition(current.status, to)) {
      throw new DomainError('conflict', `Não é possível ir de ${current.status} para ${to}`);
    }

    await m.tx
      .update(experimentEnvironments)
      .set({ status: to })
      .where(
        and(
          eq(experimentEnvironments.experimentId, experimentId),
          eq(experimentEnvironments.environmentId, current.environmentId),
        ),
      );

    const overall = deriveOverallStatus(
      states.map((state) => (state.environment === environment ? to : state.status)),
    );
    const now = new Date();
    await m.tx
      .update(experiments)
      .set({
        status: overall,
        startedAt: to === 'running' ? (experiment.startedAt ?? now) : experiment.startedAt,
        endedAt: overall === 'completed' ? now : null,
      })
      .where(eq(experiments.id, experimentId));

    m.audit({
      action: 'update',
      resourceType: 'experiment',
      resourceId: experimentId,
      before: { environment, status: current.status },
      after: { environment, status: to },
    });
    m.publish([current.environmentId]);
  });
}

export async function deleteExperiment(
  ctx: ServiceContext,
  where: ProjectRef,
  experimentId: string,
) {
  return runMutation(ctx, where, 'editor', async (m) => {
    const { experiment, states } = await loadForChange(m.tx, m.access.projectId, experimentId);
    if (states.some((state) => state.status === 'running')) {
      throw new DomainError('conflict', 'Pause o experimento antes de apagá-lo');
    }
    await m.tx.delete(experiments).where(eq(experiments.id, experimentId));
    m.audit({
      action: 'delete',
      resourceType: 'experiment',
      resourceId: experimentId,
      before: { key: experiment.key, hypothesis: experiment.hypothesis },
      after: null,
    });
    m.publishAll();
  });
}
