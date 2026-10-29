import type { FlagValue } from '@lever/schemas';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { flagTypeEnum } from './enums.js';
import { environments, projects } from './projects.js';
import { segments } from './segments.js';

export const flags = pgTable(
  'flags',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    type: flagTypeEnum('type').notNull(),
    defaultValue: jsonb('default_value').$type<FlagValue>().notNull(),
    /** Generated on creation and never changed. */
    salt: text('salt').notNull(),
    ...timestamps(),
  },
  (table) => [unique('flags_project_id_key_unique').on(table.projectId, table.key)],
);

/** Per-environment settings of a flag (FR-002). */
export const flagEnvironments = pgTable(
  'flag_environments',
  {
    id: id(),
    flagId: uuid('flag_id')
      .notNull()
      .references(() => flags.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    servedValue: jsonb('served_value').$type<FlagValue>().notNull(),
    /** Basis points, 0 to 10,000. */
    rolloutBps: integer('rollout_bps').notNull(),
    segmentId: uuid('segment_id').references(() => segments.id, { onDelete: 'restrict' }),
    ...timestamps(),
  },
  (table) => [
    unique('flag_environments_flag_id_environment_id_unique').on(table.flagId, table.environmentId),
    index('flag_environments_environment_id_idx').on(table.environmentId),
    index('flag_environments_segment_id_idx').on(table.segmentId),
    check('flag_environments_rollout_bps_range', sql`${table.rolloutBps} BETWEEN 0 AND 10000`),
  ],
);
