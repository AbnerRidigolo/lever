import { eq, sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { auditLog } from '../src/schema/index.js';
import {
  createTestProject,
  PG_INSUFFICIENT_PRIVILEGE,
  pgErrorCode,
  type TestProject,
  useTestDb,
} from './helpers.js';

const db = useTestDb();

let project: TestProject;
let entryId: string;

beforeAll(async () => {
  project = await createTestProject(db);
  const [entry] = await db
    .insert(auditLog)
    .values({
      projectId: project.projectId,
      actorId: project.userId,
      action: 'update',
      resourceType: 'flag',
      resourceId: project.projectId,
      before: { enabled: false },
      after: { enabled: true },
    })
    .returning();
  if (entry === undefined) throw new Error('audit entry not inserted');
  entryId = entry.id;
});

describe('audit_log', () => {
  it('AC-6.1 (data): stores author, date, action and the before/after diff', async () => {
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.id, entryId));
    expect(entry).toMatchObject({
      actorId: project.userId,
      action: 'update',
      resourceType: 'flag',
      before: { enabled: false },
      after: { enabled: true },
    });
    expect(entry?.createdAt).toBeInstanceOf(Date);
  });

  it('AC-6.2 (database): rejects UPDATE', async () => {
    expect(
      await pgErrorCode(
        db
          .update(auditLog)
          .set({ after: { enabled: false } })
          .where(eq(auditLog.id, entryId)),
      ),
    ).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('AC-6.2 (database): rejects DELETE', async () => {
    expect(await pgErrorCode(db.delete(auditLog).where(eq(auditLog.id, entryId)))).toBe(
      PG_INSUFFICIENT_PRIVILEGE,
    );
  });

  it('AC-6.2 (database): rejects TRUNCATE', async () => {
    expect(await pgErrorCode(db.execute(sql`TRUNCATE audit_log`))).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('AC-6.2 (database): the entry is still there after the rejected changes', async () => {
    const rows = await db.select().from(auditLog).where(eq(auditLog.id, entryId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.after).toEqual({ enabled: true });
  });
});
