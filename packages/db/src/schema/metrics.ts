import { sql } from 'drizzle-orm';
import { check, pgTable, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { metricDirectionEnum, metricRoleEnum, metricTypeEnum } from './enums.js';
import { experiments } from './experiments.js';
import { projects } from './projects.js';

/** Metric catalog of a project (spec 002, section 7.1). */
export const metrics = pgTable(
  'metrics',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    type: metricTypeEnum('type').notNull(),
    eventName: text('event_name').notNull(),
    /** Event property that is averaged; required by `mean` metrics. */
    valueProperty: text('value_property'),
    /** Event counted in the denominator; required by `ratio` metrics. */
    denominatorEventName: text('denominator_event_name'),
    direction: metricDirectionEnum('direction').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('metrics_project_id_key_unique').on(table.projectId, table.key),
    check(
      'metrics_fields_by_type',
      sql`(${table.type} <> 'mean' OR ${table.valueProperty} IS NOT NULL) AND (${table.type} <> 'ratio' OR ${table.denominatorEventName} IS NOT NULL)`,
    ),
  ],
);

/** Metrics attached to an experiment. Deleting a metric that is attached is blocked (002/AC-4.4). */
export const experimentMetrics = pgTable(
  'experiment_metrics',
  {
    id: id(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    metricId: uuid('metric_id')
      .notNull()
      .references(() => metrics.id, { onDelete: 'restrict' }),
    role: metricRoleEnum('role').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('experiment_metrics_experiment_id_metric_id_unique').on(
      table.experimentId,
      table.metricId,
    ),
    uniqueIndex('experiment_metrics_one_primary_idx')
      .on(table.experimentId)
      .where(sql`${table.role} = 'primary'`),
  ],
);
