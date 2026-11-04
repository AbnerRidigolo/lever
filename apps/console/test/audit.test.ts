import { beforeAll, describe, expect, it } from 'vitest';

import { createApiKey, revokeApiKey } from '@/server/api-keys';
import { listAuditEntries } from '@/server/audit';
import { createExperiment, deleteExperiment, updateExperiment } from '@/server/experiments';
import { createFlag, deleteFlag, updateFlagDefault } from '@/server/flags';
import { createSegment, deleteSegment, updateSegment } from '@/server/segments';

import { createTestProject, memberWith, type TestProject, connectTestDb } from './helpers';

const db = connectTestDb();
let project: TestProject;
let ref: { projectId: string };

const rules = { conditions: [{ attribute: 'country', operator: 'equals', value: 'BR' }] };
const variants = [
  { key: 'a', weightBps: 5_000, isControl: true },
  { key: 'b', weightBps: 5_000, isControl: false },
];

beforeAll(async () => {
  project = await createTestProject(db);
  ref = { projectId: project.projectId };
});

describe('audit history', () => {
  it('AC-6.1: every create, update and delete records author, date, action and diff', async () => {
    const ctx = project.admin;
    const flag = await createFlag(ctx, ref, { key: 'f', type: 'boolean', defaultValue: false });
    await updateFlagDefault(ctx, ref, flag.id, true);
    await deleteFlag(ctx, ref, flag.id);

    const segment = await createSegment(ctx, ref, { key: 's', name: 'one', rules });
    await updateSegment(ctx, ref, { id: segment.id, name: 'two', rules });
    await deleteSegment(ctx, ref, segment.id);

    const experiment = await createExperiment(ctx, ref, {
      key: 'e',
      hypothesis: 'h',
      variants,
      segmentKey: null,
    });
    await updateExperiment(ctx, ref, experiment.id, {
      hypothesis: 'h2',
      variants,
      segmentKey: null,
    });
    await deleteExperiment(ctx, ref, experiment.id);

    const key = await createApiKey(ctx, ref, { environment: 'development', name: 'k' });
    await revokeApiKey(ctx, ref, key.id);

    const { entries, total } = await listAuditEntries(ctx, ref, {});
    expect(total).toBe(11);
    expect(entries.every((entry) => entry.actorId === ctx.userId)).toBe(true);
    expect(entries.every((entry) => entry.createdAt instanceof Date)).toBe(true);

    const count = (type: string, action: string) =>
      entries.filter((entry) => entry.resourceType === type && entry.action === action).length;
    for (const type of ['flag', 'segment', 'experiment']) {
      expect([count(type, 'create'), count(type, 'update'), count(type, 'delete')]).toEqual([
        1, 1, 1,
      ]);
    }
    expect(count('api_key', 'create')).toBe(1);
    expect(count('api_key', 'update')).toBe(1);

    const flagUpdate = entries.find(
      (entry) => entry.resourceType === 'flag' && entry.action === 'update',
    );
    expect(flagUpdate?.before).toEqual({ defaultValue: false });
    expect(flagUpdate?.after).toEqual({ defaultValue: true });
  });

  it('AC-6.2: filters by resource, author and period', async () => {
    const editor = await memberWith(project, 'editor');
    const flag = await createFlag(editor, ref, {
      key: 'by-editor',
      type: 'boolean',
      defaultValue: false,
    });

    const byActor = await listAuditEntries(project.admin, ref, { actorId: editor.userId });
    expect(byActor.entries.map((entry) => entry.resourceId)).toEqual([flag.id]);

    const byResource = await listAuditEntries(project.admin, ref, {
      resourceType: 'flag',
      resourceId: flag.id,
    });
    expect(byResource.total).toBe(1);

    const future = await listAuditEntries(project.admin, ref, { from: '2999-01-01' });
    expect(future.total).toBe(0);
    const past = await listAuditEntries(project.admin, ref, { to: '2000-01-01' });
    expect(past.total).toBe(0);
  });

  it('FR-010: shows the history of one flag', async () => {
    const flag = await createFlag(project.admin, ref, {
      key: 'history',
      type: 'boolean',
      defaultValue: false,
    });
    await updateFlagDefault(project.admin, ref, flag.id, true);
    const history = await listAuditEntries(project.admin, ref, { resourceId: flag.id });
    expect(history.entries.map((entry) => entry.action)).toEqual(['update', 'create']);
  });

  it('does not show the history of another project', async () => {
    const other = await createTestProject(db);
    const { total } = await listAuditEntries(other.admin, { projectId: other.projectId }, {});
    expect(total).toBe(0);
  });
});
