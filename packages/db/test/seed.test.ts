import {
  experimentMetricsSchema,
  experimentVariantsSchema,
  flagConfigSchema,
  metricDefinitionSchema,
} from '@lever/schemas';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  auditLog,
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
      .where(
        and(
          eq(auditLog.projectId, SEED_IDS.project),
          inArray(auditLog.resourceType, ['flag', 'experiment']),
        ),
      )
      .orderBy(asc(auditLog.resourceType));
    expect(rows).toEqual([
      { resourceType: 'flag', action: 'create' },
      { resourceType: 'experiment', action: 'create' },
    ]);
  });

  it('002/AC-4.1 (data): creates the demo metrics', async () => {
    const rows = await db
      .select({
        key: metrics.key,
        name: metrics.name,
        type: metrics.type,
        eventName: metrics.eventName,
        valueProperty: metrics.valueProperty,
        denominatorEventName: metrics.denominatorEventName,
        direction: metrics.direction,
      })
      .from(metrics)
      .where(eq(metrics.projectId, SEED_IDS.project))
      .orderBy(asc(metrics.key));

    const parsed = rows.map((row) =>
      metricDefinitionSchema.parse({
        ...row,
        valueProperty: row.valueProperty ?? undefined,
        denominatorEventName: row.denominatorEventName ?? undefined,
      }),
    );
    expect(
      parsed.map((metric) => ({
        key: metric.key,
        type: metric.type,
        eventName: metric.eventName,
        direction: metric.direction,
      })),
    ).toEqual([
      { key: 'add-to-cart-rate', type: 'ratio', eventName: 'add_to_cart', direction: 'increase' },
      {
        key: 'checkout-conversion',
        type: 'conversion',
        eventName: 'purchase',
        direction: 'increase',
      },
      {
        key: 'checkout-error-rate',
        type: 'conversion',
        eventName: 'checkout_error',
        direction: 'decrease',
      },
      { key: 'revenue-per-user', type: 'mean', eventName: 'purchase', direction: 'increase' },
    ]);
    expect(rows.find((row) => row.key === 'revenue-per-user')?.valueProperty).toBe('revenueCents');
    expect(rows.find((row) => row.key === 'add-to-cart-rate')?.denominatorEventName).toBe(
      'product_view',
    );
  });

  it('002/AC-4.2 (data): checkout-layout has one primary metric', async () => {
    const rows = await db
      .select({ metricKey: metrics.key, role: experimentMetrics.role })
      .from(experimentMetrics)
      .innerJoin(metrics, eq(metrics.id, experimentMetrics.metricId))
      .where(eq(experimentMetrics.experimentId, SEED_IDS.checkoutLayoutExperiment))
      .orderBy(asc(metrics.key));

    const entries = experimentMetricsSchema.parse(rows);
    expect(entries).toEqual([
      { metricKey: 'add-to-cart-rate', role: 'secondary' },
      { metricKey: 'checkout-conversion', role: 'primary' },
      { metricKey: 'checkout-error-rate', role: 'guardrail' },
      { metricKey: 'revenue-per-user', role: 'secondary' },
    ]);
  });

  it('002/AC-5.4 (data): checkout-layout plans 14,748 users per variant', async () => {
    const [experiment] = await db
      .select({
        plannedSampleSize: experiments.plannedSampleSize,
        mdeKind: experiments.mdeKind,
        mde: experiments.mde,
        alpha: experiments.alpha,
        power: experiments.power,
      })
      .from(experiments)
      .where(eq(experiments.id, SEED_IDS.checkoutLayoutExperiment));
    expect(experiment).toEqual({
      plannedSampleSize: 14_748,
      mdeKind: 'absolute',
      mde: 0.01,
      alpha: 0.05,
      power: 0.8,
    });
  });

  it('002/AC-4.4 (data): records the creation of each seeded metric', async () => {
    const rows = await db
      .select({ resourceId: auditLog.resourceId, action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.projectId, SEED_IDS.project), eq(auditLog.resourceType, 'metric')));
    expect(rows.map((row) => row.resourceId).sort()).toEqual(
      Object.values(SEED_IDS.metrics).sort(),
    );
    expect(rows.every((row) => row.action === 'create')).toBe(true);
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
      metrics,
      experimentMetrics,
      auditLog,
    ] as const;
    const countAll = () =>
      Promise.all(tables.map(async (table) => (await db.select({ n: count() }).from(table))[0]?.n));

    const before = await countAll();
    await seed(db);
    expect(await countAll()).toEqual(before);
  });
});
