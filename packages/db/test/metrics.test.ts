import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { auditLog, experimentMetrics, experiments, metrics } from '../src/schema/index.js';
import {
  createTestProject,
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
  type TestProject,
  useTestDb,
} from './helpers.js';

const db = useTestDb();

let project: TestProject;
let otherProject: TestProject;

beforeAll(async () => {
  project = await createTestProject(db);
  otherProject = await createTestProject(db);
});

async function insertMetric(
  projectId: string,
  key: string,
  overrides: Partial<typeof metrics.$inferInsert> = {},
) {
  const [metric] = await db
    .insert(metrics)
    .values({
      projectId,
      key,
      name: `Metric ${key}`,
      type: 'conversion',
      eventName: 'purchase',
      direction: 'increase',
      ...overrides,
    })
    .returning();
  if (metric === undefined) throw new Error('metric not inserted');
  return metric;
}

async function insertExperiment(projectId: string, key: string) {
  const [experiment] = await db
    .insert(experiments)
    .values({ projectId, key, hypothesis: 'Test hypothesis', salt: `salt-${key}` })
    .returning();
  if (experiment === undefined) throw new Error('experiment not inserted');
  return experiment;
}

describe('metrics', () => {
  it('002/AC-4.1: metric keys are unique per project', async () => {
    await insertMetric(project.projectId, 'unique-metric');
    expect(await pgErrorCode(insertMetric(project.projectId, 'unique-metric'))).toBe(
      PG_UNIQUE_VIOLATION,
    );
    await expect(insertMetric(otherProject.projectId, 'unique-metric')).resolves.toBeDefined();
  });

  it('002/AC-4.1: a mean metric needs a value property', async () => {
    expect(
      await pgErrorCode(insertMetric(project.projectId, 'mean-no-prop', { type: 'mean' })),
    ).toBe(PG_CHECK_VIOLATION);
    await expect(
      insertMetric(project.projectId, 'mean-ok', { type: 'mean', valueProperty: 'amount' }),
    ).resolves.toBeDefined();
  });

  it('002/AC-4.1: a ratio metric needs a denominator event', async () => {
    expect(
      await pgErrorCode(insertMetric(project.projectId, 'ratio-no-denominator', { type: 'ratio' })),
    ).toBe(PG_CHECK_VIOLATION);
    await expect(
      insertMetric(project.projectId, 'ratio-ok', {
        type: 'ratio',
        denominatorEventName: 'page_view',
      }),
    ).resolves.toBeDefined();
  });
});

describe('experiment metrics', () => {
  it('002/AC-4.2: an experiment has at most one primary metric', async () => {
    const experiment = await insertExperiment(project.projectId, 'primary-exp');
    const first = await insertMetric(project.projectId, 'primary-a');
    const second = await insertMetric(project.projectId, 'primary-b');
    const third = await insertMetric(project.projectId, 'secondary-c');

    await db
      .insert(experimentMetrics)
      .values({ experimentId: experiment.id, metricId: first.id, role: 'primary' });
    expect(
      await pgErrorCode(
        db
          .insert(experimentMetrics)
          .values({ experimentId: experiment.id, metricId: second.id, role: 'primary' }),
      ),
    ).toBe(PG_UNIQUE_VIOLATION);
    await expect(
      db
        .insert(experimentMetrics)
        .values({ experimentId: experiment.id, metricId: third.id, role: 'secondary' }),
    ).resolves.toBeDefined();
  });

  it('002/AC-4.2: a metric is attached to an experiment only once', async () => {
    const experiment = await insertExperiment(project.projectId, 'dup-metric-exp');
    const metric = await insertMetric(project.projectId, 'dup-metric');
    await db
      .insert(experimentMetrics)
      .values({ experimentId: experiment.id, metricId: metric.id, role: 'secondary' });
    expect(
      await pgErrorCode(
        db
          .insert(experimentMetrics)
          .values({ experimentId: experiment.id, metricId: metric.id, role: 'guardrail' }),
      ),
    ).toBe(PG_UNIQUE_VIOLATION);
  });

  it('002/AC-4.4: a metric used by an experiment cannot be deleted', async () => {
    const experiment = await insertExperiment(project.projectId, 'restrict-exp');
    const metric = await insertMetric(project.projectId, 'restrict-metric');
    await db
      .insert(experimentMetrics)
      .values({ experimentId: experiment.id, metricId: metric.id, role: 'primary' });
    expect(await pgErrorCode(db.delete(metrics).where(eq(metrics.id, metric.id)))).toBe(
      PG_FOREIGN_KEY_VIOLATION,
    );
  });

  it('deleting an experiment removes its metric links', async () => {
    const experiment = await insertExperiment(project.projectId, 'cascade-exp');
    const metric = await insertMetric(project.projectId, 'cascade-metric');
    await db
      .insert(experimentMetrics)
      .values({ experimentId: experiment.id, metricId: metric.id, role: 'primary' });
    await db.delete(experiments).where(eq(experiments.id, experiment.id));
    expect(
      await db
        .select()
        .from(experimentMetrics)
        .where(eq(experimentMetrics.experimentId, experiment.id)),
    ).toHaveLength(0);
  });
});

describe('audit log', () => {
  it('002/AC-4.4: audit_log accepts metric changes', async () => {
    const metric = await insertMetric(project.projectId, 'audited-metric');
    await expect(
      db.insert(auditLog).values({
        projectId: project.projectId,
        actorId: project.userId,
        action: 'create',
        resourceType: 'metric',
        resourceId: metric.id,
        after: { key: metric.key },
      }),
    ).resolves.toBeDefined();
  });
});

describe('experiment plan columns', () => {
  it('002/AC-5.4: experiments default alpha 0.05 and power 0.8 and reject alpha 0', async () => {
    const experiment = await insertExperiment(project.projectId, 'plan-defaults');
    expect(experiment.alpha).toBe(0.05);
    expect(experiment.power).toBe(0.8);
    expect(experiment.mde).toBeNull();
    expect(experiment.mdeKind).toBeNull();
    expect(experiment.plannedSampleSize).toBeNull();

    expect(
      await pgErrorCode(
        db.update(experiments).set({ alpha: 0 }).where(eq(experiments.id, experiment.id)),
      ),
    ).toBe(PG_CHECK_VIOLATION);
  });

  it('002/AC-5.4: rejects power outside 0.5 to 0.99', async () => {
    const experiment = await insertExperiment(project.projectId, 'plan-power');
    for (const power of [0.49, 1]) {
      expect(
        await pgErrorCode(
          db.update(experiments).set({ power }).where(eq(experiments.id, experiment.id)),
        ),
      ).toBe(PG_CHECK_VIOLATION);
    }
  });

  it('002/AC-5.1: mde needs a kind, must be positive, and the pair is all or nothing', async () => {
    const experiment = await insertExperiment(project.projectId, 'plan-mde');
    const update = (values: Partial<typeof experiments.$inferInsert>) =>
      db.update(experiments).set(values).where(eq(experiments.id, experiment.id));

    expect(await pgErrorCode(update({ mde: 0.1 }))).toBe(PG_CHECK_VIOLATION);
    expect(await pgErrorCode(update({ mdeKind: 'relative' }))).toBe(PG_CHECK_VIOLATION);
    expect(await pgErrorCode(update({ mde: 0, mdeKind: 'absolute' }))).toBe(PG_CHECK_VIOLATION);
    expect(await pgErrorCode(update({ mde: -0.1, mdeKind: 'absolute' }))).toBe(PG_CHECK_VIOLATION);
    await expect(update({ mde: 0.1, mdeKind: 'relative' })).resolves.toBeDefined();
  });
});
