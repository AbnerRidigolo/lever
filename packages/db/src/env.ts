import { parseEnv } from '@lever/schemas';
import { z } from 'zod';

export const dbEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .regex(/^postgres(?:ql)?:\/\/\S+$/, 'must be a postgres:// connection string'),
});
export type DbEnv = z.infer<typeof dbEnvSchema>;

export function loadDbEnv(source: Record<string, string | undefined> = process.env): DbEnv {
  return parseEnv(dbEnvSchema, source);
}
