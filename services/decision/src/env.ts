import { dbEnvSchema } from '@lever/db';
import { parseEnv } from '@lever/schemas';
import { z } from 'zod';

export const decisionEnvSchema = z.object({
  DATABASE_URL: dbEnvSchema.shape.DATABASE_URL,
  DECISION_HOST: z.string().min(1).default('0.0.0.0'),
  DECISION_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** How long a validated API key is trusted before it is checked again (decision plan, D5). */
  API_KEY_CACHE_TTL_MS: z.coerce.number().int().positive().default(30_000),
  /** Traces are exported only when this is set (decision plan, D8). */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default('lever-decision'),
});
export type DecisionEnv = z.infer<typeof decisionEnvSchema>;

export function loadDecisionEnv(
  source: Record<string, string | undefined> = process.env,
): DecisionEnv {
  return parseEnv(decisionEnvSchema, source);
}
