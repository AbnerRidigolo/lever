import { beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  createFlag,
  deleteFlag,
  getFlag,
  listFlags,
  updateFlagDefault,
  updateFlagEnvironment,
} from '@/server/flags';
import { createSegment } from '@/server/segments';

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

beforeAll(async () => {
  project = await createTestProject(db);
  ref = { projectId: project.projectId };
});

const onSettings = { enabled: true, servedValue: true, rolloutBps: 1_000, segmentKey: null };

describe('flags', () => {
  it.each([
    { key: 'as-boolean', type: 'boolean', defaultValue: false },
    { key: 'as-string', type: 'string', defaultValue: 'blue' },
    { key: 'as-number', type: 'number', defaultValue: 3 },
    { key: 'as-json', type: 'json', defaultValue: { max: 3 } },
  ])('AC-1.4: creates a $type flag', async (input) => {
    const flag = await createFlag(project.admin, ref, input);
    expect(flag.salt).toMatch(/^[0-9a-f]{32}$/);
    const detail = await getFlag(project.admin, ref, flag.id);
    expect(detail.environments.map((env) => [env.environment, env.enabled])).toEqual([
      ['development', false],
      ['production', false],
    ]);
  });

  it.each([
    { key: 'bad-a', type: 'boolean', defaultValue: 'off' },
    { key: 'bad-b', type: 'number', defaultValue: '3' },
    { key: 'bad-c', type: 'json', defaultValue: 3 },
  ])('AC-1.4: rejects a default value that does not match type $type', async (input) => {
    await expect(createFlag(project.admin, ref, input)).rejects.toBeInstanceOf(ZodError);
  });

  it('AC-1.4: rejects a served value of another type', async () => {
    const flag = await createFlag(project.admin, ref, {
      key: 'typed-served',
      type: 'number',
      defaultValue: 1,
    });
    await expect(
      updateFlagEnvironment(project.admin, ref, flag.id, 'development', {
        ...onSettings,
        servedValue: 'ten',
      }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(updateFlagDefault(project.admin, ref, flag.id, 'ten')).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it('FR-002: keys are unique per project', async () => {
    const input = { key: 'unique-key', type: 'boolean', defaultValue: false };
    await createFlag(project.admin, ref, input);
    await expectCode(createFlag(project.admin, ref, input), 'conflict');

    const other = await createTestProject(db);
    await expect(
      createFlag(other.admin, { projectId: other.projectId }, input),
    ).resolves.toBeDefined();
  });

  it('AC-1.3: a change in development does not touch production settings or version', async () => {
    const flag = await createFlag(project.admin, ref, {
      key: 'per-env',
      type: 'boolean',
      defaultValue: false,
    });
    const devBefore = await latestVersion(db, project.projectId, 'development');
    const prodBefore = await latestVersion(db, project.projectId, 'production');

    await updateFlagEnvironment(project.admin, ref, flag.id, 'development', onSettings);

    const detail = await getFlag(project.admin, ref, flag.id);
    expect(detail.environments).toEqual([
      expect.objectContaining({ environment: 'development', enabled: true, rolloutBps: 1_000 }),
      expect.objectContaining({ environment: 'production', enabled: false, rolloutBps: 10_000 }),
    ]);
    expect(await latestVersion(db, project.projectId, 'development')).toBe(devBefore + 1);
    expect(await latestVersion(db, project.projectId, 'production')).toBe(prodBefore);
  });

  it('FR-002: rejects a rollout out of range', async () => {
    const flag = await createFlag(project.admin, ref, {
      key: 'range',
      type: 'boolean',
      defaultValue: false,
    });
    await expect(
      updateFlagEnvironment(project.admin, ref, flag.id, 'development', {
        ...onSettings,
        rolloutBps: 10_001,
      }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it('AC-4.3: points a flag to a segment of the same project only', async () => {
    const flag = await createFlag(project.admin, ref, {
      key: 'segmented',
      type: 'boolean',
      defaultValue: false,
    });
    await createSegment(project.admin, ref, {
      key: 'br',
      name: 'Brasil',
      rules: { conditions: [{ attribute: 'country', operator: 'equals', value: 'BR' }] },
    });
    await updateFlagEnvironment(project.admin, ref, flag.id, 'production', {
      ...onSettings,
      segmentKey: 'br',
    });
    const detail = await getFlag(project.admin, ref, flag.id);
    expect(detail.environments[1]?.segmentKey).toBe('br');

    await expectCode(
      updateFlagEnvironment(project.admin, ref, flag.id, 'production', {
        ...onSettings,
        segmentKey: 'does-not-exist',
      }),
      'validation_failed',
    );
  });

  it('cannot reach a flag of another project', async () => {
    const other = await createTestProject(db);
    const flag = await createFlag(
      other.admin,
      { projectId: other.projectId },
      {
        key: 'foreign',
        type: 'boolean',
        defaultValue: false,
      },
    );
    await expectCode(deleteFlag(project.admin, ref, flag.id), 'not_found');
  });

  it('deletes a flag and publishes every environment', async () => {
    const flag = await createFlag(project.admin, ref, {
      key: 'to-delete',
      type: 'boolean',
      defaultValue: false,
    });
    const before = await latestVersion(db, project.projectId, 'production');
    await deleteFlag(project.admin, ref, flag.id);
    expect((await listFlags(project.admin, ref)).some((row) => row.key === 'to-delete')).toBe(
      false,
    );
    expect(await latestVersion(db, project.projectId, 'production')).toBe(before + 1);
  });
});
