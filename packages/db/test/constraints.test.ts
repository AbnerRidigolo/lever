import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  environments,
  experiments,
  experimentVariants,
  flagEnvironments,
  flags,
  projectMembers,
  segments,
} from '../src/schema/index.js';
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

async function insertFlag(projectId: string, key: string) {
  const [flag] = await db
    .insert(flags)
    .values({ projectId, key, type: 'boolean', defaultValue: false, salt: `salt-${key}` })
    .returning();
  if (flag === undefined) throw new Error('flag not inserted');
  return flag;
}

async function insertExperiment(projectId: string, key: string) {
  const [experiment] = await db
    .insert(experiments)
    .values({ projectId, key, hypothesis: 'Test hypothesis', salt: `salt-${key}` })
    .returning();
  if (experiment === undefined) throw new Error('experiment not inserted');
  return experiment;
}

describe('projects and environments', () => {
  it('FR-001: rejects a second environment with the same key in a project', async () => {
    expect(
      await pgErrorCode(
        db.insert(environments).values({ projectId: project.projectId, key: 'production' }),
      ),
    ).toBe(PG_UNIQUE_VIOLATION);
  });

  it('rejects the same user twice in a project', async () => {
    await db
      .insert(projectMembers)
      .values({ projectId: project.projectId, userId: project.userId, role: 'editor' });
    expect(
      await pgErrorCode(
        db
          .insert(projectMembers)
          .values({ projectId: project.projectId, userId: project.userId, role: 'viewer' }),
      ),
    ).toBe(PG_UNIQUE_VIOLATION);
  });
});

describe('flags', () => {
  it('FR-002: flag keys are unique per project, not globally', async () => {
    await insertFlag(project.projectId, 'unique-flag');
    expect(await pgErrorCode(insertFlag(project.projectId, 'unique-flag'))).toBe(
      PG_UNIQUE_VIOLATION,
    );
    await expect(insertFlag(otherProject.projectId, 'unique-flag')).resolves.toBeDefined();
  });

  it.each([
    { rolloutBps: -1, key: 'rollout-below-zero' },
    { rolloutBps: 10_001, key: 'rollout-above-max' },
  ])('FR-002: rejects a rollout of $rolloutBps bps', async ({ rolloutBps, key }) => {
    const flag = await insertFlag(project.projectId, key);
    expect(
      await pgErrorCode(
        db.insert(flagEnvironments).values({
          flagId: flag.id,
          environmentId: project.developmentId,
          servedValue: true,
          rolloutBps,
        }),
      ),
    ).toBe(PG_CHECK_VIOLATION);
  });

  it('FR-002: accepts one settings row per environment and rejects a duplicate', async () => {
    const flag = await insertFlag(project.projectId, 'per-environment');
    await db.insert(flagEnvironments).values([
      { flagId: flag.id, environmentId: project.developmentId, servedValue: true, rolloutBps: 0 },
      {
        flagId: flag.id,
        environmentId: project.productionId,
        servedValue: true,
        rolloutBps: 10_000,
      },
    ]);
    expect(
      await pgErrorCode(
        db.insert(flagEnvironments).values({
          flagId: flag.id,
          environmentId: project.productionId,
          servedValue: false,
          rolloutBps: 500,
        }),
      ),
    ).toBe(PG_UNIQUE_VIOLATION);
  });

  it('refreshes updated_at when a row changes', async () => {
    const past = new Date('2026-01-01T00:00:00.000Z');
    const [flag] = await db
      .insert(flags)
      .values({
        projectId: project.projectId,
        key: 'touch-me',
        type: 'boolean',
        defaultValue: false,
        salt: 'salt-touch-me',
        createdAt: past,
        updatedAt: past,
      })
      .returning();
    if (flag === undefined) throw new Error('flag not inserted');

    const [updated] = await db
      .update(flags)
      .set({ defaultValue: true })
      .where(eq(flags.id, flag.id))
      .returning();
    expect(updated?.createdAt).toEqual(past);
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(past.getTime());
  });
});

describe('segments', () => {
  it('rejects deleting a segment that a flag still uses (spec 001, section 13)', async () => {
    const [segment] = await db
      .insert(segments)
      .values({
        projectId: project.projectId,
        key: 'br-mobile',
        name: 'Brazil on mobile',
        rules: { conditions: [{ attribute: 'country', operator: 'equals', value: 'BR' }] },
      })
      .returning();
    if (segment === undefined) throw new Error('segment not inserted');

    const flag = await insertFlag(project.projectId, 'segmented');
    await db.insert(flagEnvironments).values({
      flagId: flag.id,
      environmentId: project.developmentId,
      servedValue: true,
      rolloutBps: 10_000,
      segmentId: segment.id,
    });

    expect(await pgErrorCode(db.delete(segments).where(eq(segments.id, segment.id)))).toBe(
      PG_FOREIGN_KEY_VIOLATION,
    );
  });
});

describe('experiments', () => {
  it('FR-003: experiment keys are unique per project', async () => {
    await insertExperiment(project.projectId, 'unique-experiment');
    expect(await pgErrorCode(insertExperiment(project.projectId, 'unique-experiment'))).toBe(
      PG_UNIQUE_VIOLATION,
    );
  });

  it('FR-003: rejects a second control variant in the same experiment', async () => {
    const experiment = await insertExperiment(project.projectId, 'two-controls');
    await db.insert(experimentVariants).values([
      { experimentId: experiment.id, key: 'control', weightBps: 5_000, isControl: true },
      { experimentId: experiment.id, key: 'treatment', weightBps: 5_000, isControl: false },
    ]);
    expect(
      await pgErrorCode(
        db
          .insert(experimentVariants)
          .values({ experimentId: experiment.id, key: 'other', weightBps: 0, isControl: true }),
      ),
    ).toBe(PG_UNIQUE_VIOLATION);
  });

  it('FR-003: rejects duplicate variant keys and weights out of range', async () => {
    const experiment = await insertExperiment(project.projectId, 'bad-variants');
    await db
      .insert(experimentVariants)
      .values({ experimentId: experiment.id, key: 'a', weightBps: 5_000, isControl: true });
    expect(
      await pgErrorCode(
        db
          .insert(experimentVariants)
          .values({ experimentId: experiment.id, key: 'a', weightBps: 5_000 }),
      ),
    ).toBe(PG_UNIQUE_VIOLATION);
    expect(
      await pgErrorCode(
        db
          .insert(experimentVariants)
          .values({ experimentId: experiment.id, key: 'b', weightBps: 10_001 }),
      ),
    ).toBe(PG_CHECK_VIOLATION);
  });

  it('AC-3.5 (data): new experiments start as draft', async () => {
    const experiment = await insertExperiment(project.projectId, 'starts-as-draft');
    expect(experiment.status).toBe('draft');
  });
});
