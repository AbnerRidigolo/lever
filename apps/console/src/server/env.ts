import { dbEnvSchema } from '@lever/db';
import { parseEnv } from '@lever/schemas';
import { z } from 'zod';

const consoleEnvSchema = z.object({
  DATABASE_URL: dbEnvSchema.shape.DATABASE_URL,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AUTH_SECRET: z.string().min(16),
  EMAIL_SERVER: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  AUTH_GITHUB_ID: z.string().min(1).optional(),
  AUTH_GITHUB_SECRET: z.string().min(1).optional(),
});
export type ConsoleEnv = z.infer<typeof consoleEnvSchema>;

let cached: ConsoleEnv | undefined;

/** Read on first use, because `next build` imports server code without a runtime environment. */
export function consoleEnv(): ConsoleEnv {
  cached ??= parseEnv(consoleEnvSchema, process.env);
  return cached;
}
