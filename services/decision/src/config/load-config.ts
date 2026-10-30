import {
  configVersions,
  environments,
  experimentEnvironments,
  experiments,
  experimentVariants,
  flagEnvironments,
  flags,
  segments,
  type Database,
} from '@lever/db';
import { environmentConfigSchema, type EnvironmentConfig } from '@lever/schemas';
import { and, asc, desc, eq, max } from 'drizzle-orm';

/**
 * Reads the full configuration of an environment (FR-005) in one read-only snapshot, so the
 * version always matches the data. Returns null when no version has been published yet.
 *
 * - Every flag of the project. A flag without settings in this environment is served off,
 *   with its default value and a 0% rollout.
 * - Every experiment, with its status in this environment (`draft` when it has none), and
 *   its variants with the control first, then by key.
 * - Every segment of the project.
 */
export async function loadEnvironmentConfig(
  db: Database,
  environmentId: string,
): Promise<EnvironmentConfig | null> {
  return db.transaction(
    async (tx) => {
      const [environment] = await tx
        .select({ projectId: environments.projectId })
        .from(environments)
        .where(eq(environments.id, environmentId));
      if (environment === undefined) return null;
      const { projectId } = environment;

      const [latest] = await tx
        .select({ version: max(configVersions.version) })
        .from(configVersions)
        .where(eq(configVersions.environmentId, environmentId));
      if (latest?.version == null) return null;

      const flagRows = await tx
        .select({
          key: flags.key,
          type: flags.type,
          salt: flags.salt,
          defaultValue: flags.defaultValue,
          enabled: flagEnvironments.enabled,
          servedValue: flagEnvironments.servedValue,
          rolloutBps: flagEnvironments.rolloutBps,
          segmentKey: segments.key,
        })
        .from(flags)
        .leftJoin(
          flagEnvironments,
          and(
            eq(flagEnvironments.flagId, flags.id),
            eq(flagEnvironments.environmentId, environmentId),
          ),
        )
        .leftJoin(segments, eq(segments.id, flagEnvironments.segmentId))
        .where(eq(flags.projectId, projectId))
        .orderBy(asc(flags.key));

      const experimentRows = await tx
        .select({
          id: experiments.id,
          key: experiments.key,
          salt: experiments.salt,
          status: experimentEnvironments.status,
          segmentKey: segments.key,
        })
        .from(experiments)
        .leftJoin(
          experimentEnvironments,
          and(
            eq(experimentEnvironments.experimentId, experiments.id),
            eq(experimentEnvironments.environmentId, environmentId),
          ),
        )
        .leftJoin(segments, eq(segments.id, experiments.segmentId))
        .where(eq(experiments.projectId, projectId))
        .orderBy(asc(experiments.key));

      const variantRows = await tx
        .select({
          experimentId: experimentVariants.experimentId,
          key: experimentVariants.key,
          weightBps: experimentVariants.weightBps,
          isControl: experimentVariants.isControl,
        })
        .from(experimentVariants)
        .innerJoin(experiments, eq(experiments.id, experimentVariants.experimentId))
        .where(eq(experiments.projectId, projectId))
        .orderBy(desc(experimentVariants.isControl), asc(experimentVariants.key));

      const segmentRows = await tx
        .select({ key: segments.key, rules: segments.rules })
        .from(segments)
        .where(eq(segments.projectId, projectId))
        .orderBy(asc(segments.key));

      // Validated before it reaches the cache: an invalid row never replaces a valid config.
      return environmentConfigSchema.parse({
        version: latest.version,
        flags: flagRows.map((row) => ({
          key: row.key,
          type: row.type,
          salt: row.salt,
          defaultValue: row.defaultValue,
          enabled: row.enabled ?? false,
          servedValue: row.servedValue ?? row.defaultValue,
          rolloutBps: row.rolloutBps ?? 0,
          segmentKey: row.segmentKey,
        })),
        experiments: experimentRows.map((row) => ({
          key: row.key,
          salt: row.salt,
          status: row.status ?? 'draft',
          segmentKey: row.segmentKey,
          variants: variantRows
            .filter((variant) => variant.experimentId === row.id)
            .map(({ key, weightBps, isControl }) => ({ key, weightBps, isControl })),
        })),
        segments: segmentRows,
      });
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
