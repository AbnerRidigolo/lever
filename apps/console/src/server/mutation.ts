import { auditLog, configVersions, environments } from '@lever/db';
import type { AuditAction, AuditResourceType, ProjectRole } from '@lever/schemas';
import { asc, eq, inArray, max } from 'drizzle-orm';

import { requireRole, type ProjectAccess, type ProjectRef } from './authz';
import type { ServiceContext, Transaction } from './context';

export interface AuditEntry {
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  before: unknown;
  after: unknown;
}

export interface Mutation {
  tx: Transaction;
  access: ProjectAccess;
  /** Records the change in the audit history (AC-6.1). */
  audit(entry: AuditEntry): void;
  /** Publishes a new configuration version of these environments (FR-008). */
  publish(environmentIds: readonly string[]): void;
  /** Publishes a new configuration version of every environment of the project. */
  publishAll(): void;
}

/**
 * Runs one console mutation: role check, the change, the audit entries and the new configuration
 * versions all happen in one transaction, so nothing is written if any step fails (FR-009).
 */
export async function runMutation<T>(
  ctx: ServiceContext,
  where: ProjectRef,
  minimum: ProjectRole,
  change: (mutation: Mutation) => Promise<T>,
): Promise<T> {
  const access = await requireRole(ctx, where, minimum);

  return ctx.db.transaction(async (tx) => {
    const entries: AuditEntry[] = [];
    const toPublish = new Set<string>();
    const publishing = { all: false };

    const result = await change({
      tx,
      access,
      audit: (entry) => {
        entries.push(entry);
      },
      publish: (environmentIds) => {
        for (const environmentId of environmentIds) toPublish.add(environmentId);
      },
      publishAll: () => {
        publishing.all = true;
      },
    });

    if (entries.length > 0) {
      await tx.insert(auditLog).values(
        entries.map((entry) => ({
          projectId: access.projectId,
          actorId: ctx.userId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          before: entry.before,
          after: entry.after,
        })),
      );
    }

    if (publishing.all) {
      const all = await tx
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.projectId, access.projectId));
      for (const environment of all) toPublish.add(environment.id);
    }
    await publishVersions(tx, [...toPublish]);

    return result;
  });
}

/**
 * Inserts the next version of each environment. The environment rows are locked first, in a fixed
 * order, so concurrent mutations queue up instead of colliding on the same version number.
 * NO KEY UPDATE does not conflict with the foreign key locks the mutation may already hold on
 * these rows, which FOR UPDATE would turn into a deadlock.
 */
export async function publishVersions(
  tx: Transaction,
  environmentIds: readonly string[],
): Promise<void> {
  if (environmentIds.length === 0) return;

  const locked = await tx
    .select({ id: environments.id })
    .from(environments)
    .where(inArray(environments.id, [...environmentIds]))
    .orderBy(asc(environments.id))
    .for('no key update');

  for (const { id } of locked) {
    const [latest] = await tx
      .select({ version: max(configVersions.version) })
      .from(configVersions)
      .where(eq(configVersions.environmentId, id));
    await tx
      .insert(configVersions)
      .values({ environmentId: id, version: (latest?.version ?? 0) + 1 });
  }
}
