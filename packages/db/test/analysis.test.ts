import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  analysisRuns,
  experimentResults,
  experiments,
  metrics,
  srmChecks,
} from '../src/schema/index.js';
import {
  createTestProject,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
  type TestProject,
  useTestDb,
} from './helpers.js';

const db = useTestDb();

let project: TestProject;
let experimentId: string;
let metricId: string;

beforeAll(async () => {
  project = await createTestProject(db);
  const [experiment] = await db
    .insert(experiments)
    .values({
      projectId: project.projectId,
      key: 'analysis-exp',
      hypothesis: 'Test hypothesis',
      salt: 'salt-analysis',
    })
    .returning();
  const [metric] = await db
    .insert(metrics)
    .values({
      projectId: project.projectId,
      key: 'analysis-metric',
      name: 'Analysis metric',
      type: 'conversion',
      eventName: 'purchase',
      direction: 'increase',
    })
    .returning();
  if (experiment === undefined || metric === undefined) throw new Error('fixture not inserted');
  experimentId = experiment.id;
  metricId = metric.id;
});

async function insertRun() {
  const [run] = await db
    .insert(analysisRuns)
    .values({ environmentId: project.productionId, startedAt: new Date(), status: 'running' })
    .returning();
  if (run === undefined) throw new Error('run not inserted');
  return run;
}

function resultRow(
  analysisRunId: string,
  overrides: Partial<typeof experimentResults.$inferInsert> = {},
) {
  return {
    analysisRunId,
    experimentId,
    environmentId: project.productionId,
    metricId,
    variantKey: 'control',
    users: 1000,
    value: 0.1,
    cuped: false,
    method: 'z_test_proportions' as const,
    ...overrides,
  };
}

describe('experiment results', () => {
  it('002/FR-009: one result row per run, experiment, metric, variant and adjustment', async () => {
    const run = await insertRun();
    await db.insert(experimentResults).values(resultRow(run.id));
    expect(await pgErrorCode(db.insert(experimentResults).values(resultRow(run.id)))).toBe(
      PG_UNIQUE_VIOLATION,
    );
    await expect(
      db.insert(experimentResults).values(resultRow(run.id, { cuped: true })),
    ).resolves.toBeDefined();
  });

  it('002/FR-009: one SRM check per run and experiment', async () => {
    const run = await insertRun();
    const row = {
      analysisRunId: run.id,
      experimentId,
      environmentId: project.productionId,
      observed: { control: 500, treatment: 510 },
      expected: { control: 505, treatment: 505 },
      pValue: 0.8,
      excludedUsers: 0,
    };
    await db.insert(srmChecks).values(row);
    expect(await pgErrorCode(db.insert(srmChecks).values(row))).toBe(PG_UNIQUE_VIOLATION);
  });

  it('deleting an analysis run removes its results and SRM checks', async () => {
    const run = await insertRun();
    await db.insert(experimentResults).values(resultRow(run.id));
    await db.insert(srmChecks).values({
      analysisRunId: run.id,
      experimentId,
      environmentId: project.productionId,
      observed: {},
      expected: {},
      pValue: 0.5,
      excludedUsers: 0,
    });

    await db.delete(analysisRuns).where(eq(analysisRuns.id, run.id));

    expect(
      await db.select().from(experimentResults).where(eq(experimentResults.analysisRunId, run.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(srmChecks).where(eq(srmChecks.analysisRunId, run.id)),
    ).toHaveLength(0);
  });
});
