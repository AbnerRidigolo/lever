import { ENVIRONMENT_KEYS } from '@lever/schemas';

import type { Database } from '../client.js';
import {
  auditLog,
  configVersions,
  environments,
  experimentEnvironments,
  experimentMetrics,
  experiments,
  experimentVariants,
  flagEnvironments,
  flags,
  metrics,
  projectMembers,
  projects,
  users,
} from '../schema/index.js';
import {
  checkoutLayoutExperiment,
  checkoutLayoutMetrics,
  checkoutLayoutPlan,
  checkoutLayoutStatusByEnvironment,
  newBannerFlag,
  newBannerSettings,
  SEED_IDS,
  seedAdmin,
  seedMetrics,
  seedProject,
} from './data.js';

export * from './data.js';

function fixedId(ids: Record<string, string>, key: string, what: string): string {
  const id = new Map(Object.entries(ids)).get(key);
  if (id === undefined) {
    throw new Error(`seed: no fixed id for ${what} "${key}"`);
  }
  return id;
}

const variantId = (key: string) => fixedId(SEED_IDS.checkoutLayoutVariants, key, 'variant');
const metricId = (key: string) => fixedId(SEED_IDS.metrics, key, 'metric');
const experimentMetricId = (key: string) =>
  fixedId(SEED_IDS.checkoutLayoutMetrics, key, 'experiment metric');

/**
 * Inserts the demo project, its environments, an admin, the `new-banner` flag and the
 * `checkout-layout` experiment with its sample-size plan, the demo metrics and their
 * attachment to the experiment. Idempotent: rows that already exist are left untouched.
 */
export async function seed(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(users).values(seedAdmin).onConflictDoNothing();
    await tx.insert(projects).values(seedProject).onConflictDoNothing();
    await tx
      .insert(projectMembers)
      .values({
        id: SEED_IDS.adminMembership,
        projectId: seedProject.id,
        userId: seedAdmin.id,
        role: 'admin',
      })
      .onConflictDoNothing();

    await tx
      .insert(environments)
      .values(
        ENVIRONMENT_KEYS.map((key) => ({
          id: SEED_IDS.environments[key],
          projectId: seedProject.id,
          key,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(configVersions)
      .values(
        ENVIRONMENT_KEYS.map((key) => ({
          id: SEED_IDS.configVersions[key],
          environmentId: SEED_IDS.environments[key],
          version: 1,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(flags)
      .values({
        id: newBannerFlag.id,
        projectId: seedProject.id,
        key: newBannerFlag.key,
        type: newBannerFlag.type,
        defaultValue: newBannerFlag.defaultValue,
        salt: newBannerFlag.salt,
      })
      .onConflictDoNothing();

    await tx
      .insert(flagEnvironments)
      .values(
        ENVIRONMENT_KEYS.map((key) => ({
          id: SEED_IDS.newBannerFlagEnvironments[key],
          flagId: newBannerFlag.id,
          environmentId: SEED_IDS.environments[key],
          enabled: newBannerSettings.enabled,
          servedValue: newBannerSettings.servedValue,
          rolloutBps: newBannerSettings.rolloutBps,
          segmentId: null,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(experiments)
      .values({
        id: checkoutLayoutExperiment.id,
        projectId: seedProject.id,
        key: checkoutLayoutExperiment.key,
        hypothesis: checkoutLayoutExperiment.hypothesis,
        status: checkoutLayoutExperiment.status,
        salt: checkoutLayoutExperiment.salt,
        segmentId: null,
        startedAt: checkoutLayoutExperiment.startedAt,
        plannedSampleSize: checkoutLayoutPlan.plannedSampleSize,
        mdeKind: checkoutLayoutPlan.mde?.kind ?? null,
        mde: checkoutLayoutPlan.mde?.value ?? null,
        alpha: checkoutLayoutPlan.alpha,
        power: checkoutLayoutPlan.power,
      })
      .onConflictDoNothing();

    await tx
      .insert(experimentVariants)
      .values(
        checkoutLayoutExperiment.variants.map((variant) => ({
          id: variantId(variant.key),
          experimentId: checkoutLayoutExperiment.id,
          key: variant.key,
          weightBps: variant.weightBps,
          isControl: variant.isControl,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(experimentEnvironments)
      .values(
        ENVIRONMENT_KEYS.map((key) => ({
          id: SEED_IDS.checkoutLayoutEnvironments[key],
          experimentId: checkoutLayoutExperiment.id,
          environmentId: SEED_IDS.environments[key],
          status: checkoutLayoutStatusByEnvironment[key],
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(metrics)
      .values(
        seedMetrics.map((metric) => ({
          id: metricId(metric.key),
          projectId: seedProject.id,
          key: metric.key,
          name: metric.name,
          type: metric.type,
          eventName: metric.eventName,
          valueProperty: metric.type === 'mean' ? metric.valueProperty : null,
          denominatorEventName: metric.type === 'ratio' ? metric.denominatorEventName : null,
          direction: metric.direction,
        })),
      )
      .onConflictDoNothing();

    await tx
      .insert(experimentMetrics)
      .values(
        checkoutLayoutMetrics.map((entry) => ({
          id: experimentMetricId(entry.metricKey),
          experimentId: checkoutLayoutExperiment.id,
          metricId: metricId(entry.metricKey),
          role: entry.role,
        })),
      )
      .onConflictDoNothing();

    // Creation history, as the console would record it (AC-6.1).
    await tx
      .insert(auditLog)
      .values([
        {
          id: SEED_IDS.audit.newBannerCreated,
          projectId: seedProject.id,
          actorId: seedAdmin.id,
          action: 'create',
          resourceType: 'flag',
          resourceId: newBannerFlag.id,
          before: null,
          after: { key: newBannerFlag.key, type: newBannerFlag.type },
        },
        {
          id: SEED_IDS.audit.checkoutLayoutCreated,
          projectId: seedProject.id,
          actorId: seedAdmin.id,
          action: 'create',
          resourceType: 'experiment',
          resourceId: checkoutLayoutExperiment.id,
          before: null,
          after: {
            key: checkoutLayoutExperiment.key,
            variants: checkoutLayoutExperiment.variants,
          },
        },
        ...seedMetrics.map((metric) => ({
          id: fixedId(SEED_IDS.metricAudit, metric.key, 'metric audit'),
          projectId: seedProject.id,
          actorId: seedAdmin.id,
          action: 'create' as const,
          resourceType: 'metric' as const,
          resourceId: metricId(metric.key),
          before: null,
          after: { key: metric.key, type: metric.type },
        })),
      ])
      .onConflictDoNothing();
  });
}
