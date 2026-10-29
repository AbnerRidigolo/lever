import { z } from 'zod';

import { basisPointsSchema, resourceKeySchema, saltSchema } from './common.js';

export const FLAG_TYPES = ['boolean', 'string', 'number', 'json'] as const;
export const flagTypeSchema = z.enum(FLAG_TYPES);
export type FlagType = z.infer<typeof flagTypeSchema>;

export const MAX_FLAG_STRING_LENGTH = 10_000;

/** Value of a `json` flag: an object or an array. Scalars have their own flag types. */
export const jsonFlagValueSchema = z.union([z.record(z.string(), z.json()), z.array(z.json())]);

/** Schema of a flag value for each flag type (AC-1.4). */
export const flagValueSchemas = {
  boolean: z.boolean(),
  string: z.string().max(MAX_FLAG_STRING_LENGTH),
  number: z.number(),
  json: jsonFlagValueSchema,
} as const satisfies Record<FlagType, z.ZodType>;

export type FlagValueByType = { [T in FlagType]: z.infer<(typeof flagValueSchemas)[T]> };

/** Any flag value. Every typed value is also valid JSON. */
export const flagValueSchema = z.json();
export type FlagValue = z.infer<typeof flagValueSchema>;

export function flagValueSchemaFor<T extends FlagType>(type: T): (typeof flagValueSchemas)[T] {
  return flagValueSchemas[type];
}

function flagDefinitionVariant<T extends FlagType>(type: T) {
  return z.object({
    key: resourceKeySchema,
    type: z.literal(type),
    defaultValue: flagValueSchemas[type],
  });
}

/** Flag as created in the console: the default value must match the type (AC-1.4). */
export const flagDefinitionSchema = z.discriminatedUnion('type', [
  flagDefinitionVariant('boolean'),
  flagDefinitionVariant('string'),
  flagDefinitionVariant('number'),
  flagDefinitionVariant('json'),
]);
export type FlagDefinition = z.infer<typeof flagDefinitionSchema>;

/** Settings of a flag in one environment (FR-002). The served value must match the type. */
export function flagEnvironmentSettingsSchemaFor<T extends FlagType>(type: T) {
  return z.object({
    enabled: z.boolean(),
    servedValue: flagValueSchemas[type],
    rolloutBps: basisPointsSchema,
    segmentKey: resourceKeySchema.nullable(),
  });
}
export type FlagEnvironmentSettings<T extends FlagType = FlagType> = z.infer<
  ReturnType<typeof flagEnvironmentSettingsSchemaFor<T>>
>;

function flagConfigVariant<T extends FlagType>(type: T) {
  return z.object({
    key: resourceKeySchema,
    type: z.literal(type),
    salt: saltSchema,
    defaultValue: flagValueSchemas[type],
    enabled: z.boolean(),
    servedValue: flagValueSchemas[type],
    rolloutBps: basisPointsSchema,
    segmentKey: resourceKeySchema.nullable(),
  });
}

/** Flag as delivered in an environment configuration (`GET /v1/config`). */
export const flagConfigSchema = z.discriminatedUnion('type', [
  flagConfigVariant('boolean'),
  flagConfigVariant('string'),
  flagConfigVariant('number'),
  flagConfigVariant('json'),
]);
export type FlagConfig = z.infer<typeof flagConfigSchema>;
