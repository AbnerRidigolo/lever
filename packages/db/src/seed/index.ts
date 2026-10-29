import { ENVIRONMENT_KEYS } from '@lever/schemas';

import type { Database } from '../client.js';
import {
  auditLog,
  configVersions,
  environments,
  experimentEnvironments,
  experiments,
  experimentVariants,
  flagEnvironments,
  flags,
  projectMembers,
  projects,
  users,
} from '../schema/index.js';
import {
  checkoutLayoutExperiment,
  checkoutLayoutStatusByEnvironment,
  newBannerFlag,
  newBannerSettings,
  SEED_IDS,
  seedAdmin,
  seedProject,
} from './data.js';

export * from './data.js';

const variantIds = new Map<string, string>(Object.entries(SEED_IDS.checkoutLayoutVariants));

function variantId(key: string): string {
  const id = variantIds.get(key);
  if (id === undefined) {
    throw new Error(`seed: no fixed id for variant "${key}"`);
  }
  return id;
}

/**
 * Inserts the demo project, its environments, an admin, the `new-banner` flag and the
 * `checkout-layout` experiment. Idempotent: rows that already exist are left untouched.
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
      ])
      .onConflictDoNothing();
  });
}
