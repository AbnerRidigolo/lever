import {
  ANALYSIS_RUN_STATUSES,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  ENVIRONMENT_KEYS,
  EXPERIMENT_STATUSES,
  FLAG_TYPES,
  MDE_KINDS,
  METRIC_DIRECTIONS,
  METRIC_ROLES,
  METRIC_TYPES,
  PROJECT_ROLES,
  RESULT_METHODS,
  STORE_ORDER_STATUSES,
} from '@lever/schemas';
import { pgEnum } from 'drizzle-orm/pg-core';

// Enum values come from @lever/schemas, the source of truth for shared types.
export const projectRoleEnum = pgEnum('project_role', PROJECT_ROLES);
export const environmentKeyEnum = pgEnum('environment_key', ENVIRONMENT_KEYS);
export const flagTypeEnum = pgEnum('flag_type', FLAG_TYPES);
export const experimentStatusEnum = pgEnum('experiment_status', EXPERIMENT_STATUSES);
export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS);
export const auditResourceTypeEnum = pgEnum('audit_resource_type', AUDIT_RESOURCE_TYPES);
export const metricTypeEnum = pgEnum('metric_type', METRIC_TYPES);
export const metricDirectionEnum = pgEnum('metric_direction', METRIC_DIRECTIONS);
export const metricRoleEnum = pgEnum('metric_role', METRIC_ROLES);
export const mdeKindEnum = pgEnum('mde_kind', MDE_KINDS);
export const analysisRunStatusEnum = pgEnum('analysis_run_status', ANALYSIS_RUN_STATUSES);
export const resultMethodEnum = pgEnum('result_method', RESULT_METHODS);
export const storeOrderStatusEnum = pgEnum('store_order_status', STORE_ORDER_STATUSES);
