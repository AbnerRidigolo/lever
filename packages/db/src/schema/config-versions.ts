import { sql } from 'drizzle-orm';
import { check, integer, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { environments } from './projects.js';

/** Configuration version of an environment, incremented on every published change. */
export const configVersions = pgTable(
  'config_versions',
  {
    id: id(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (table) => [
    unique('config_versions_environment_id_version_unique').on(table.environmentId, table.version),
    check('config_versions_version_positive', sql`${table.version} >= 1`),
  ],
);
