import { dbEnvSchema } from '@lever/db';
import { parseEnv } from '@lever/schemas';
import { z } from 'zod';

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const collectorEnvSchema = z.object({
  DATABASE_URL: dbEnvSchema.shape.DATABASE_URL,
  COLLECTOR_HOST: z.string().min(1).default('0.0.0.0'),
  COLLECTOR_PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** How long a validated API key is trusted before it is checked again. */
  API_KEY_CACHE_TTL_MS: positiveInt(30_000),
  /** Lake object storage (SeaweedFS locally); defaults match infra/docker-compose.yml. */
  LAKE_S3_ENDPOINT: z.url().default('http://localhost:8333'),
  LAKE_S3_ACCESS_KEY: z.string().min(1).default('lever-local-access-key'),
  LAKE_S3_SECRET_KEY: z.string().min(1).default('lever-local-secret-key'),
  LAKE_S3_REGION: z.string().min(1).default('us-east-1'),
  LAKE_BUCKET: z.string().min(1).default('lever-lake'),
  /** Flush parameters (collector plan, D5). */
  COLLECTOR_FLUSH_INTERVAL_MS: positiveInt(1000),
  COLLECTOR_FLUSH_MAX_EVENTS: positiveInt(5000),
  COLLECTOR_BUFFER_MAX_EVENTS: positiveInt(100_000),
  COLLECTOR_SHUTDOWN_FLUSH_MS: positiveInt(10_000),
  /** Traces are exported only when this is set. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default('lever-collector'),
});
export type CollectorEnv = z.infer<typeof collectorEnvSchema>;

export function loadCollectorEnv(
  source: Record<string, string | undefined> = process.env,
): CollectorEnv {
  return parseEnv(collectorEnvSchema, source);
}
