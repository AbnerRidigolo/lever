import { experimentVariantsSchema, flagConfigSchema } from '@lever/schemas';
import { asc, count, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  auditLog,
  environments,
  experimentEnvironments,
  experiments,
  experimentVariants,
  flagEnvironments,
  flags,
  projectMembers,
  projects,
  users,
} from '../src/schema/index.js';
import { SEED_IDS, seed } from '../src/seed/index.js';
import { useTestDb } from './helpers.js';

const db = useTestDb();

beforeAll(async () => {
  await seed(db);
});

describe('seed', () => {
  it('FR-001: creates the demo project with development and production', async () => {
    const [project] = await db.select().from(projects).where(eq(projects.id, SEED_IDS.project));
    expect(project?.slug).toBe('demo-store');

    const envs = await db
      .select({ key: environments.key })
      .from(environments)
      .where(eq(environments.projectId, SEED_IDS.project))
      .orderBy(asc(environments.key));
    expect(envs.map((env) => env.key)).toEqual(['development', 'production']);
  });

  it('creates an admin member with a fictitious email', async () => {
    const rows = await db
      .select({ email: users.email, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, SEED_IDS.project));
    expect(rows).toEqual([{ email: 'admin@lever.local', role: 'admin' }]);
  });

  it('AC-8.2 (data): creates the new-banner boolean flag, off in both environments', async () => {
    const rows = await db
      .select({
        key: flags.key,
        type: flags.type,
        salt: flags.salt,
        defaultValue: flags.defaultValue,
        enabled: flagEnvironments.enabled,
        servedValue: flagEnvironments.servedValue,
        rolloutBps: flagEnvironments.rolloutBps,
      })
      .from(flags)
      .innerJoin(flagEnvironments, eq(flagEnvironments.flagId, flags.id))
      .where(eq(flags.id, SEED_IDS.newBannerFlag));

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const config = flagConfigSchema.parse({ ...row, segmentKey: null });
      expect(config).toMatchObject({
        key: 'new-banner',
        type: 'boolean',
        defaultValue: false,
        enabled: false,
        servedValue: true,
        rolloutBps: 10_000,
      });
    }
  });

  it('AC-8.3 (data): creates the 50/50 checkout-layout experiment with one control', async () => {
    const [experiment] = await db
      .select()
      .from(experiments)
      .where(eq(experiments.id, SEED_IDS.checkoutLayoutExperiment));
    expect(experiment?.key).toBe('checkout-layout');

    const variants = await db
      .select({
        key: experimentVariants.key,
        weightBps: experimentVariants.weightBps,
        isControl: experimentVariants.isControl,
      })
      .from(experimentVariants)
      .where(eq(experimentVariants.experimentId, SEED_IDS.checkoutLayoutExperiment))
      .orderBy(asc(experimentVariants.key));
    expect(experimentVariantsSchema.parse(variants)).toEqual([
      { key: 'multi-step', weightBps: 5_000, isControl: false },
      { key: 'one-page', weightBps: 5_000, isControl: true },
    ]);
  });

  it('runs checkout-layout in development and keeps it as draft in production', async () => {
    const rows = await db
      .select({ env: environments.key, status: experimentEnvironments.status })
      .from(experimentEnvironments)
      .innerJoin(environments, eq(environments.id, experimentEnvironments.environmentId))
      .where(eq(experimentEnvironments.experimentId, SEED_IDS.checkoutLayoutExperiment))
      .orderBy(asc(environments.key));
    expect(rows).toEqual([
      { env: 'development', status: 'running' },
      { env: 'production', status: 'draft' },
    ]);
  });

  it('AC-6.1 (data): records the creation of the seeded flag and experiment', async () => {
    const rows = await db
      .select({ resourceType: auditLog.resourceType, action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.projectId, SEED_IDS.project))
      .orderBy(asc(auditLog.resourceType));
    expect(rows).toEqual([
      { resourceType: 'flag', action: 'create' },
      { resourceType: 'experiment', action: 'create' },
    ]);
  });

  it('is idempotent: running it again creates no duplicates', async () => {
    const tables = [
      users,
      projects,
      projectMembers,
      environments,
      flags,
      flagEnvironments,
      experiments,
      experimentVariants,
      experimentEnvironments,
      auditLog,
    ] as const;
    const countAll = () =>
      Promise.all(tables.map(async (table) => (await db.select({ n: count() }).from(table))[0]?.n));

    const before = await countAll();
    await seed(db);
    expect(await countAll()).toEqual(before);
  });
});
