import { index, jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { auditActionEnum, auditResourceTypeEnum } from './enums.js';
import { projects } from './projects.js';
import { users } from './users.js';

/**
 * Append-only audit history (AC-6.1, AC-6.2, FR-009). A trigger created in migration
 * `0001_audit_log_append_only` rejects UPDATE, DELETE and TRUNCATE.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: auditActionEnum('action').notNull(),
    resourceType: auditResourceTypeEnum('resource_type').notNull(),
    /** Not a foreign key: the history outlives deleted resources. */
    resourceId: uuid('resource_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    ...timestamps(),
  },
  (table) => [
    index('audit_log_resource_idx').on(table.projectId, table.resourceType, table.resourceId),
    index('audit_log_actor_idx').on(table.projectId, table.actorId),
    index('audit_log_created_at_idx').on(table.projectId, table.createdAt),
  ],
);
