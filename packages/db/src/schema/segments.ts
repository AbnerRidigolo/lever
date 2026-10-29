import type { SegmentRules } from '@lever/schemas';
import { jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { projects } from './projects.js';

export const segments = pgTable(
  'segments',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    /** Validated with `segmentRulesSchema` before every write. */
    rules: jsonb('rules').$type<SegmentRules>().notNull(),
    ...timestamps(),
  },
  (table) => [unique('segments_project_id_key_unique').on(table.projectId, table.key)],
);
