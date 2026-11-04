import { auditLog, configVersions, flags } from '@lever/db';
import { CONFIG_CHANGES_CHANNEL } from '@lever/schemas';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import { createFlag } from '@/server/flags';
import { runMutation } from '@/server/mutation';

import {
  createTestProject,
  environmentId,
  latestVersion,
  type TestProject,
  connectTestDb,
} from './helpers';

const db = connectTestDb();
let project: TestProject;

beforeAll(async () => {
  project = await createTestProject(db);
});

describe('runMutation', () => {
  it('FR-009: a failure after the change writes nothing, not even the audit entry', async () => {
    const versionBefore = await latestVersion(db, project.projectId, 'development');

    await expect(
      runMutation(project.admin, { projectId: project.projectId }, 'editor', async (m) => {
        const [flag] = await m.tx
          .insert(flags)
          .values({
            projectId: project.projectId,
            key: 'rolled-back',
            type: 'boolean',
            defaultValue: false,
            salt: 'salt-rolled-back',
          })
          .returning();
        m.audit({
          action: 'create',
          resourceType: 'flag',
          resourceId: flag?.id ?? '',
          before: null,
          after: {},
        });
        m.publishAll();
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await db.select().from(flags).where(eq(flags.key, 'rolled-back'))).toEqual([]);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.projectId, project.projectId)),
    ).toEqual([]);
    expect(await latestVersion(db, project.projectId, 'development')).toBe(versionBefore);
  });

  it('FR-009: a failure writing the audit entry undoes the change', async () => {
    await expect(
      runMutation(project.admin, { projectId: project.projectId }, 'editor', async (m) => {
        await m.tx.insert(flags).values({
          projectId: project.projectId,
          key: 'bad-audit',
          type: 'boolean',
          defaultValue: false,
          salt: 'salt-bad-audit',
        });
        m.audit({
          action: 'create',
          resourceType: 'flag',
          resourceId: 'not-a-uuid',
          before: null,
          after: null,
        });
      }),
    ).rejects.toThrow();
    expect(await db.select().from(flags).where(eq(flags.key, 'bad-audit'))).toEqual([]);
  });

  it('concurrent mutations publish consecutive versions without colliding', async () => {
    const before = await latestVersion(db, project.projectId, 'development');
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createFlag(
          project.admin,
          { projectId: project.projectId },
          { key: `concurrent-${index}`, type: 'boolean', defaultValue: false },
        ),
      ),
    );
    expect(await latestVersion(db, project.projectId, 'development')).toBe(before + 8);

    const id = await environmentId(db, project.projectId, 'development');
    const versions = await db
      .select({ version: configVersions.version })
      .from(configVersions)
      .where(eq(configVersions.environmentId, id));
    expect(new Set(versions.map((row) => row.version)).size).toBe(versions.length);
  });

  it('FR-008: a committed mutation notifies the decision service channel', async () => {
    const received: string[] = [];
    const listener = postgres(inject('databaseUrl'), { max: 1 });
    await listener.listen(CONFIG_CHANGES_CHANNEL, (payload) => received.push(payload));

    const id = await environmentId(db, project.projectId, 'production');
    await createFlag(
      project.admin,
      { projectId: project.projectId },
      { key: 'notified', type: 'boolean', defaultValue: false },
    );
    const version = await latestVersion(db, project.projectId, 'production');

    await expect
      .poll(() => received.map((payload) => JSON.parse(payload) as unknown))
      .toContainEqual({ environmentId: id, version });
    await listener.end();
  });
});
