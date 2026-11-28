import { DEFAULT_ALPHA, DEFAULT_POWER } from '@lever/schemas';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { id, timestamps } from './columns.js';
import { experimentStatusEnum, mdeKindEnum } from './enums.js';
import { environments, projects } from './projects.js';
import { segments } from './segments.js';

export const experiments = pgTable(
  'experiments',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    hypothesis: text('hypothesis').notNull(),
    /** Overall status shown in the console; the status served per environment lives in `experiment_environments`. */
    status: experimentStatusEnum('status').notNull().default('draft'),
    /** Generated on creation and never changed. */
    salt: text('salt').notNull(),
    segmentId: uuid('segment_id').references(() => segments.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Experiment plan (spec 002, section 7.1). `mde` and `mde_kind` are set together or not at all. */
    plannedSampleSize: integer('planned_sample_size'),
    mdeKind: mdeKindEnum('mde_kind'),
    mde: doublePrecision('mde'),
    alpha: doublePrecision('alpha').notNull().default(DEFAULT_ALPHA),
    power: doublePrecision('power').notNull().default(DEFAULT_POWER),
    ...timestamps(),
  },
  (table) => [
    unique('experiments_project_id_key_unique').on(table.projectId, table.key),
    index('experiments_segment_id_idx').on(table.segmentId),
    check(
      'experiments_planned_sample_size_min',
      sql`${table.plannedSampleSize} IS NULL OR ${table.plannedSampleSize} >= 1`,
    ),
    check('experiments_alpha_range', sql`${table.alpha} BETWEEN 0.001 AND 0.2`),
    check('experiments_power_range', sql`${table.power} BETWEEN 0.5 AND 0.99`),
    check('experiments_mde_positive', sql`${table.mde} > 0`),
    check('experiments_mde_with_kind', sql`(${table.mde} IS NULL) = (${table.mdeKind} IS NULL)`),
  ],
);

/**
 * Variants of an experiment. The sum of weights (10,000 bps) and "exactly one control"
 * are validated with `experimentVariantsSchema`; the database guarantees at most one control.
 */
export const experimentVariants = pgTable(
  'experiment_variants',
  {
    id: id(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** Basis points, 0 to 10,000. */
    weightBps: integer('weight_bps').notNull(),
    isControl: boolean('is_control').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    unique('experiment_variants_experiment_id_key_unique').on(table.experimentId, table.key),
    uniqueIndex('experiment_variants_one_control_idx')
      .on(table.experimentId)
      .where(sql`${table.isControl}`),
    check('experiment_variants_weight_bps_range', sql`${table.weightBps} BETWEEN 0 AND 10000`),
  ],
);

/** Status of an experiment in each environment: the one served in `/v1/config`. */
export const experimentEnvironments = pgTable(
  'experiment_environments',
  {
    id: id(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    status: experimentStatusEnum('status').notNull().default('draft'),
    ...timestamps(),
  },
  (table) => [
    unique('experiment_environments_experiment_id_environment_id_unique').on(
      table.experimentId,
      table.environmentId,
    ),
    index('experiment_environments_environment_id_idx').on(table.environmentId),
  ],
);
