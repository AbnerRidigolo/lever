import { index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { environmentKeyEnum, projectRoleEnum } from './enums.js';
import { users } from './users.js';

export const projects = pgTable('projects', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ...timestamps(),
});

export const projectMembers = pgTable(
  'project_members',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: projectRoleEnum('role').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('project_members_project_id_user_id_unique').on(table.projectId, table.userId),
    index('project_members_user_id_idx').on(table.userId),
  ],
);

/** Each project has the `development` and `production` environments (FR-001). */
export const environments = pgTable(
  'environments',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: environmentKeyEnum('key').notNull(),
    ...timestamps(),
  },
  (table) => [unique('environments_project_id_key_unique').on(table.projectId, table.key)],
);
