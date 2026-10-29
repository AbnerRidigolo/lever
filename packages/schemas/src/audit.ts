import { z } from 'zod';

export const AUDIT_ACTIONS = ['create', 'update', 'delete'] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

/** Resources whose changes are audited (AC-6.1). */
export const AUDIT_RESOURCE_TYPES = ['flag', 'experiment', 'segment', 'api_key'] as const;
export const auditResourceTypeSchema = z.enum(AUDIT_RESOURCE_TYPES);
export type AuditResourceType = z.infer<typeof auditResourceTypeSchema>;
