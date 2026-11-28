import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { analysisRunStatusEnum, resultMethodEnum } from './enums.js';
import { experiments } from './experiments.js';
import { metrics } from './metrics.js';
import { environments } from './projects.js';

/** One run of the analysis job for an environment (spec 002, section 7.1). */
export const analysisRuns = pgTable(
  'analysis_runs',
  {
    id: id(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: analysisRunStatusEnum('status').notNull(),
    /** Timestamp of the most recent data included in the run. */
    dataThrough: timestamp('data_through', { withTimezone: true }),
    error: text('error'),
    ...timestamps(),
  },
  (table) => [
    index('analysis_runs_environment_id_started_at_idx').on(table.environmentId, table.startedAt),
  ],
);

/** Result of one variant on one metric in one run. Effect fields are null for the control. */
export const experimentResults = pgTable(
  'experiment_results',
  {
    id: id(),
    analysisRunId: uuid('analysis_run_id')
      .notNull()
      .references(() => analysisRuns.id, { onDelete: 'cascade' }),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    metricId: uuid('metric_id')
      .notNull()
      .references(() => metrics.id, { onDelete: 'restrict' }),
    variantKey: text('variant_key').notNull(),
    users: integer('users').notNull(),
    value: doublePrecision('value').notNull(),
    deltaAbs: doublePrecision('delta_abs'),
    deltaRel: doublePrecision('delta_rel'),
    ciLow: doublePrecision('ci_low'),
    ciHigh: doublePrecision('ci_high'),
    pValue: doublePrecision('p_value'),
    pValueAdjusted: doublePrecision('p_value_adjusted'),
    cuped: boolean('cuped').notNull(),
    method: resultMethodEnum('method').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('experiment_results_run_experiment_metric_variant_cuped_unique').on(
      table.analysisRunId,
      table.experimentId,
      table.metricId,
      table.variantKey,
      table.cuped,
    ),
    index('experiment_results_experiment_id_environment_id_idx').on(
      table.experimentId,
      table.environmentId,
    ),
    index('experiment_results_metric_id_idx').on(table.metricId),
  ],
);

/** Sample ratio mismatch check of an experiment in one run. */
export const srmChecks = pgTable(
  'srm_checks',
  {
    id: id(),
    analysisRunId: uuid('analysis_run_id')
      .notNull()
      .references(() => analysisRuns.id, { onDelete: 'cascade' }),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    observed: jsonb('observed').notNull(),
    expected: jsonb('expected').notNull(),
    pValue: doublePrecision('p_value').notNull(),
    excludedUsers: integer('excluded_users').notNull(),
    ...timestamps(),
  },
  (table) => [
    unique('srm_checks_run_experiment_unique').on(table.analysisRunId, table.experimentId),
    index('srm_checks_experiment_id_environment_id_idx').on(
      table.experimentId,
      table.environmentId,
    ),
  ],
);
