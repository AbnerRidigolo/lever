import { z } from 'zod';

/** Upper bound of every basis-point value: 10,000 bps = 100%. */
export const MAX_BASIS_POINTS = 10_000;

export const RESOURCE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Key of a flag, experiment, segment or variant: kebab-case, unique within its parent. */
export const resourceKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(RESOURCE_KEY_PATTERN, 'must be kebab-case (lowercase letters, digits and single dashes)');
export type ResourceKey = z.infer<typeof resourceKeySchema>;

/** Integer between 0 and 10,000 basis points. */
export const basisPointsSchema = z.int().min(0).max(MAX_BASIS_POINTS);
export type BasisPoints = z.infer<typeof basisPointsSchema>;

export const ENVIRONMENT_KEYS = ['development', 'production'] as const;
export const environmentKeySchema = z.enum(ENVIRONMENT_KEYS);
export type EnvironmentKey = z.infer<typeof environmentKeySchema>;

export const PROJECT_ROLES = ['admin', 'editor', 'viewer'] as const;
export const projectRoleSchema = z.enum(PROJECT_ROLES);
export type ProjectRole = z.infer<typeof projectRoleSchema>;

export const uuidSchema = z.uuid();

/** Per-resource salt used by assignment. Generated on creation and never changed. */
export const saltSchema = z.string().min(8).max(128);

/** Monotonic version of an environment configuration. */
export const configVersionSchema = z.int().min(1);
export type ConfigVersion = z.infer<typeof configVersionSchema>;
