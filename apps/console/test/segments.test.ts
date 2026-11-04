import { beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { createExperiment, getExperiment } from '@/server/experiments';
import { createFlag, updateFlagEnvironment } from '@/server/flags';
import { createSegment, deleteSegment, listSegments, updateSegment } from '@/server/segments';

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

const brMobile = {
  conditions: [
    { attribute: 'country', operator: 'equals', value: 'BR' },
    { attribute: 'device', operator: 'in', value: ['mobile'] },
  ],
};

beforeAll(async () => {
  project = await createTestProject(db);
  ref = { projectId: project.projectId };
});

describe('segments', () => {
  it('AC-4.1: creates a segment with `country = BR` and `device in [mobile]`', async () => {
    await createSegment(project.admin, ref, { key: 'br-mobile', name: 'BR', rules: brMobile });
    const [segment] = await listSegments(project.admin, ref);
    expect(segment?.rules).toEqual(brMobile);
  });

  it('AC-4.2: rejects an unknown operator and a value of the wrong shape', async () => {
    await expect(
      createSegment(project.admin, ref, {
        key: 'bad-operator',
        name: 'x',
        rules: { conditions: [{ attribute: 'a', operator: 'starts_with', value: 'b' }] },
      }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      createSegment(project.admin, ref, {
        key: 'bad-value',
        name: 'x',
        rules: { conditions: [{ attribute: 'a', operator: 'in', value: 'b' }] },
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('rejects a duplicate key and publishes every environment on change', async () => {
    const created = await createSegment(project.admin, ref, {
      key: 'versions',
      name: 'x',
      rules: brMobile,
    });
    await expectCode(
      createSegment(project.admin, ref, { key: 'versions', name: 'x', rules: brMobile }),
      'conflict',
    );

    const dev = await latestVersion(db, project.projectId, 'development');
    const prod = await latestVersion(db, project.projectId, 'production');
    await updateSegment(project.admin, ref, { id: created.id, name: 'y', rules: brMobile });
    expect(await latestVersion(db, project.projectId, 'development')).toBe(dev + 1);
    expect(await latestVersion(db, project.projectId, 'production')).toBe(prod + 1);
  });

  it('AC-4.3: an experiment can point to a segment', async () => {
    await createSegment(project.admin, ref, { key: 'for-experiment', name: 'x', rules: brMobile });
    const experiment = await createExperiment(project.admin, ref, {
      key: 'segmented-experiment',
      hypothesis: 'x',
      variants: [
        { key: 'a', weightBps: 5_000, isControl: true },
        { key: 'b', weightBps: 5_000, isControl: false },
      ],
      segmentKey: 'for-experiment',
    });
    const detail = await getExperiment(project.admin, ref, experiment.id);
    expect(detail.segmentKey).toBe('for-experiment');
  });

  it('refuses to delete a segment in use and says where it is used', async () => {
    const segment = await createSegment(project.admin, ref, {
      key: 'in-use',
      name: 'x',
      rules: brMobile,
    });
    const flag = await createFlag(project.admin, ref, {
      key: 'uses-segment',
      type: 'boolean',
      defaultValue: false,
    });
    await updateFlagEnvironment(project.admin, ref, flag.id, 'development', {
      enabled: true,
      servedValue: true,
      rolloutBps: 10_000,
      segmentKey: 'in-use',
    });

    await expect(deleteSegment(project.admin, ref, segment.id)).rejects.toThrow(
      'flag uses-segment (development)',
    );

    await updateFlagEnvironment(project.admin, ref, flag.id, 'development', {
      enabled: true,
      servedValue: true,
      rolloutBps: 10_000,
      segmentKey: null,
    });
    await deleteSegment(project.admin, ref, segment.id);
    expect((await listSegments(project.admin, ref)).some((row) => row.key === 'in-use')).toBe(
      false,
    );
  });
});
