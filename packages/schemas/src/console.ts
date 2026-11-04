import { z } from 'zod';

import { auditActionSchema, auditResourceTypeSchema } from './audit.js';
import {
  environmentKeySchema,
  projectRoleSchema,
  resourceKeySchema,
  uuidSchema,
} from './common.js';
import { experimentStatusSchema } from './experiment.js';

// Input of the console mutations and filters (console plan, D4).

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: resourceKeySchema,
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const memberInputSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  role: projectRoleSchema,
});
export type MemberInput = z.infer<typeof memberInputSchema>;

export const createApiKeySchema = z.object({
  environment: environmentKeySchema,
  name: z.string().trim().min(1).max(120),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const experimentTransitionSchema = z.object({
  environment: environmentKeySchema,
  to: experimentStatusSchema,
});
export type ExperimentTransitionInput = z.infer<typeof experimentTransitionSchema>;

export const AUDIT_PAGE_SIZE = 50;

/** Filters of the audit history (AC-6.2): by resource, author and period. */
export const auditFilterSchema = z.object({
  resourceType: auditResourceTypeSchema.optional(),
  resourceId: uuidSchema.optional(),
  actorId: uuidSchema.optional(),
  action: auditActionSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AuditFilter = z.infer<typeof auditFilterSchema>;
