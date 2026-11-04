import { auditLog, users } from '@lever/db';
import { AUDIT_PAGE_SIZE, auditFilterSchema } from '@lever/schemas';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';

import { requireRole, type ProjectRef } from './authz';
import type { ServiceContext } from './context';

/** Read-only by design: the console has no operation that edits or deletes history (AC-6.2). */
export async function listAuditEntries(ctx: ServiceContext, where: ProjectRef, input: unknown) {
  const access = await requireRole(ctx, where, 'viewer');
  const filter = auditFilterSchema.parse(input);

  const condition = and(
    eq(auditLog.projectId, access.projectId),
    filter.resourceType === undefined ? undefined : eq(auditLog.resourceType, filter.resourceType),
    filter.resourceId === undefined ? undefined : eq(auditLog.resourceId, filter.resourceId),
    filter.actorId === undefined ? undefined : eq(auditLog.actorId, filter.actorId),
    filter.action === undefined ? undefined : eq(auditLog.action, filter.action),
    filter.from === undefined ? undefined : gte(auditLog.createdAt, filter.from),
    filter.to === undefined ? undefined : lte(auditLog.createdAt, filter.to),
  );

  const [total] = await ctx.db.select({ value: count() }).from(auditLog).where(condition);
  const entries = await ctx.db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      actorId: auditLog.actorId,
      actorEmail: users.email,
    })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(condition)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((filter.page - 1) * AUDIT_PAGE_SIZE);

  return { entries, total: total?.value ?? 0, page: filter.page, pageSize: AUDIT_PAGE_SIZE };
}
