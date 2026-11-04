import { projectMembers, sessions, users } from '@lever/db';
import type { ProjectRole } from '@lever/schemas';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApiKey, listApiKeys } from '@/server/api-keys';
import { listAuditEntries } from '@/server/audit';
import type { ServiceContext } from '@/server/context';
import { createExperiment } from '@/server/experiments';
import { createFlag, listFlags } from '@/server/flags';
import {
  addMember,
  changeMemberRole,
  listMembers,
  listProjects,
  removeMember,
} from '@/server/projects';
import { createSegment } from '@/server/segments';
import { isRegisteredEmail } from '@/server/sign-in';

import {
  createTestProject,
  createUser,
  expectCode,
  memberWith,
  type TestProject,
  connectTestDb,
} from './helpers';

const db = connectTestDb();
let project: TestProject;
let ref: { projectId: string };
let sequence = 0;

beforeAll(async () => {
  project = await createTestProject(db);
  ref = { projectId: project.projectId };
});

const operations: {
  name: string;
  minimum: ProjectRole;
  run: (ctx: ServiceContext) => Promise<unknown>;
}[] = [
  {
    name: 'create a flag',
    minimum: 'editor',
    run: (ctx) =>
      createFlag(ctx, ref, {
        key: `flag-${(sequence += 1)}`,
        type: 'boolean',
        defaultValue: false,
      }),
  },
  {
    name: 'create a segment',
    minimum: 'editor',
    run: (ctx) =>
      createSegment(ctx, ref, {
        key: `segment-${(sequence += 1)}`,
        name: 'x',
        rules: { conditions: [{ attribute: 'a', operator: 'equals', value: 'b' }] },
      }),
  },
  {
    name: 'create an experiment',
    minimum: 'editor',
    run: (ctx) =>
      createExperiment(ctx, ref, {
        key: `experiment-${(sequence += 1)}`,
        hypothesis: 'x',
        segmentKey: null,
        variants: [
          { key: 'a', weightBps: 5_000, isControl: true },
          { key: 'b', weightBps: 5_000, isControl: false },
        ],
      }),
  },
  {
    name: 'create an API key',
    minimum: 'admin',
    run: (ctx) => createApiKey(ctx, ref, { environment: 'development', name: 'x' }),
  },
  { name: 'list API keys', minimum: 'admin', run: (ctx) => listApiKeys(ctx, ref) },
  {
    name: 'add a member',
    minimum: 'admin',
    run: (ctx) =>
      addMember(ctx, ref, { email: `new-${(sequence += 1)}@example.test`, role: 'viewer' }),
  },
];

const RANK: Record<ProjectRole, number> = { viewer: 0, editor: 1, admin: 2 };

describe('role matrix', () => {
  for (const operation of operations) {
    for (const role of ['viewer', 'editor', 'admin'] as const) {
      const allowed = RANK[role] >= RANK[operation.minimum];
      it(`AC-7.2: ${role} ${allowed ? 'can' : 'cannot'} ${operation.name}`, async () => {
        const member = await memberWith(project, role);
        if (allowed) await expect(operation.run(member)).resolves.toBeDefined();
        else await expectCode(operation.run(member), 'forbidden');
      });
    }
  }

  it('AC-7.2: a viewer can read flags, members and history', async () => {
    const viewer = await memberWith(project, 'viewer');
    await expect(listFlags(viewer, ref)).resolves.toBeDefined();
    await expect(listMembers(viewer, ref)).resolves.toBeDefined();
    await expect(listAuditEntries(viewer, ref, {})).resolves.toBeDefined();
  });

  it('a non-member gets not_found, so the project does not reveal itself', async () => {
    const stranger = await createUser(db);
    await expectCode(listFlags(stranger, ref), 'not_found');
    await expectCode(
      createFlag(stranger, ref, { key: 'nope', type: 'boolean', defaultValue: false }),
      'not_found',
    );
    expect(await listProjects(stranger)).toEqual([]);
  });
});

describe('members', () => {
  it('a project always keeps at least one admin (console plan, D9)', async () => {
    const solo = await createTestProject(db);
    const soloRef = { projectId: solo.projectId };
    await expectCode(
      changeMemberRole(solo.admin, soloRef, solo.admin.userId, 'viewer'),
      'conflict',
    );
    await expectCode(removeMember(solo.admin, soloRef, solo.admin.userId), 'conflict');

    const second = await memberWith(solo, 'admin');
    await removeMember(solo.admin, soloRef, second.userId);
    const rows = await db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, solo.projectId));
    expect(rows).toHaveLength(1);
  });

  it('rejects adding the same email twice', async () => {
    const email = `twice-${(sequence += 1)}@example.test`;
    await addMember(project.admin, ref, { email, role: 'viewer' });
    await expectCode(addMember(project.admin, ref, { email, role: 'editor' }), 'conflict');
  });

  it('removing the last membership of a user ends their sessions immediately', async () => {
    const member = await memberWith(project, 'viewer');
    await db.insert(sessions).values({
      sessionToken: `token-${member.userId}`,
      userId: member.userId,
      expires: new Date('2999-01-01'),
    });
    await removeMember(project.admin, ref, member.userId);
    expect(await db.select().from(sessions).where(eq(sessions.userId, member.userId))).toEqual([]);
  });
});

describe('who can sign in', () => {
  it('AC-7.1 (console plan, D5): only registered emails, ignoring case', async () => {
    const email = `registered-${(sequence += 1)}@example.test`;
    await db.insert(users).values({ email });
    expect(await isRegisteredEmail(db, email.toUpperCase())).toBe(true);
    expect(await isRegisteredEmail(db, 'stranger@example.test')).toBe(false);
    expect(await isRegisteredEmail(db, null)).toBe(false);
  });
});
