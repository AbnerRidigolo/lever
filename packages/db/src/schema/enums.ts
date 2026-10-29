import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  ENVIRONMENT_KEYS,
  EXPERIMENT_STATUSES,
  FLAG_TYPES,
  PROJECT_ROLES,
} from '@lever/schemas';
import { pgEnum } from 'drizzle-orm/pg-core';

// Enum values come from @lever/schemas, the source of truth for shared types.
export const projectRoleEnum = pgEnum('project_role', PROJECT_ROLES);
export const environmentKeyEnum = pgEnum('environment_key', ENVIRONMENT_KEYS);
export const flagTypeEnum = pgEnum('flag_type', FLAG_TYPES);
export const experimentStatusEnum = pgEnum('experiment_status', EXPERIMENT_STATUSES);
export const auditActionEnum = pgEnum('audit_action', AUDIT_ACTIONS);
export const auditResourceTypeEnum = pgEnum('audit_resource_type', AUDIT_RESOURCE_TYPES);
