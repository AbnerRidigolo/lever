import { beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  canTransition,
  createExperiment,
  deleteExperiment,
  deriveOverallStatus,
  getExperiment,
  transitionExperiment,
  updateExperiment,
} from '@/server/experiments';

import {
  createTestProject,
  expectCode,
  latestVersion,
  type TestProject,
  connectTestDb,
} from './helpers';

const db = connectTestDb();
let project: TestProject;
let ref: { projectId: string };
let sequence = 0;

const fiftyFifty = [
  { key: 'one-page', weightBps: 5_000, isControl: true },
  { key: 'multi-step', weightBps: 5_000, isControl: false },
];

beforeAll(async () => {
  project = await createTestProject(db);
  ref = { projectId: project.projectId };
});

function create(variants = fiftyFifty) {
  sequence += 1;
  return createExperiment(project.admin, ref, {
    key: `experiment-${sequence}`,
    hypothesis: 'A hypothesis',
    variants,
    segmentKey: null,
  });
}

const edit = (variants = fiftyFifty) => ({ hypothesis: 'Changed', variants, segmentKey: null });
const seventyThirty = [
  { key: 'one-page', weightBps: 7_000, isControl: true },
  { key: 'multi-step', weightBps: 3_000, isControl: false },
];

describe('experiments', () => {
  it('AC-3.1: creates an experiment in draft in both environments', async () => {
    const experiment = await create();
    const detail = await getExperiment(project.admin, ref, experiment.id);
    expect(detail.status).toBe('draft');
    expect(detail.environments.map((env) => env.status)).toEqual(['draft', 'draft']);
    expect(detail.variants[0]?.isControl).toBe(true);
  });

  it('AC-3.1: rejects weights that do not sum to 100% and a wrong number of variants', async () => {
    await expect(
      create([
        { key: 'a', weightBps: 5_000, isControl: true },
        { key: 'b', weightBps: 4_000, isControl: false },
      ]),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(create([{ key: 'a', weightBps: 10_000, isControl: true }])).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it('AC-3.6: variants and weights cannot change while running, and can after pausing', async () => {
    const experiment = await create();
    await transitionExperiment(project.admin, ref, experiment.id, {
      environment: 'development',
      to: 'running',
    });

    await expectCode(
      updateExperiment(project.admin, ref, experiment.id, edit(seventyThirty)),
      'conflict',
    );
    // The hypothesis alone can still change.
    await updateExperiment(project.admin, ref, experiment.id, edit());

    await transitionExperiment(project.admin, ref, experiment.id, {
      environment: 'development',
      to: 'paused',
    });
    await updateExperiment(project.admin, ref, experiment.id, edit(seventyThirty));

    const detail = await getExperiment(project.admin, ref, experiment.id);
    expect(detail.hypothesis).toBe('Changed');
    expect(detail.variants[0]?.weightBps).toBe(7_000);
  });

  it('AC-3.5: follows the status transitions; completed is final', async () => {
    const experiment = await create();
    const move = (to: string) =>
      transitionExperiment(project.admin, ref, experiment.id, { environment: 'production', to });

    await expectCode(move('paused'), 'conflict');
    await move('running');
    let detail = await getExperiment(project.admin, ref, experiment.id);
    expect(detail.status).toBe('running');
    const { startedAt } = detail;
    expect(startedAt).toBeInstanceOf(Date);

    await move('paused');
    await move('running');
    detail = await getExperiment(project.admin, ref, experiment.id);
    expect(detail.startedAt).toEqual(startedAt);

    await move('completed');
    detail = await getExperiment(project.admin, ref, experiment.id);
    expect(detail.status).toBe('completed');
    expect(detail.endedAt).toBeInstanceOf(Date);

    await expectCode(move('running'), 'conflict');
    await expectCode(updateExperiment(project.admin, ref, experiment.id, edit()), 'conflict');
  });

  it('publishes only the environment of a transition', async () => {
    const experiment = await create();
    const dev = await latestVersion(db, project.projectId, 'development');
    const prod = await latestVersion(db, project.projectId, 'production');
    await transitionExperiment(project.admin, ref, experiment.id, {
      environment: 'development',
      to: 'running',
    });
    expect(await latestVersion(db, project.projectId, 'development')).toBe(dev + 1);
    expect(await latestVersion(db, project.projectId, 'production')).toBe(prod);
  });

  it('cannot delete an experiment while it runs', async () => {
    const experiment = await create();
    await transitionExperiment(project.admin, ref, experiment.id, {
      environment: 'development',
      to: 'running',
    });
    await expectCode(deleteExperiment(project.admin, ref, experiment.id), 'conflict');
    await transitionExperiment(project.admin, ref, experiment.id, {
      environment: 'development',
      to: 'completed',
    });
    await deleteExperiment(project.admin, ref, experiment.id);
    await expectCode(getExperiment(project.admin, ref, experiment.id), 'not_found');
  });
});

describe('status rules', () => {
  it('derives the overall status from the environments', () => {
    expect(deriveOverallStatus(['draft', 'draft'])).toBe('draft');
    expect(deriveOverallStatus(['running', 'draft'])).toBe('running');
    expect(deriveOverallStatus(['paused', 'running'])).toBe('running');
    expect(deriveOverallStatus(['paused', 'completed'])).toBe('paused');
    expect(deriveOverallStatus(['completed', 'draft'])).toBe('completed');
  });

  it('only allows the planned transitions', () => {
    expect(canTransition('draft', 'running')).toBe(true);
    expect(canTransition('draft', 'completed')).toBe(false);
    expect(canTransition('paused', 'running')).toBe(true);
    expect(canTransition('completed', 'running')).toBe(false);
  });
});
