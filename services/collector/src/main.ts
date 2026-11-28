import { createDb } from '@lever/db';
import { ApiKeyStore, createDbApiKeySource, createLogger, withTimeout } from '@lever/service-kit';

import { buildApp } from './app.js';
import { EventBuffer } from './buffer.js';
import { loadCollectorEnv } from './env.js';
import { Flusher } from './flusher.js';
import { createMetrics } from './metrics.js';
import { createS3Sink } from './s3-sink.js';

const env = loadCollectorEnv();
const logger = createLogger('lever-collector', env.LOG_LEVEL);
const database = createDb(env.DATABASE_URL);

const apiKeys = new ApiKeyStore({
  source: createDbApiKeySource(database.db),
  logger,
  ttlMs: env.API_KEY_CACHE_TTL_MS,
});

const metrics = createMetrics();
const buffer = new EventBuffer({
  maxEvents: env.COLLECTOR_BUFFER_MAX_EVENTS,
  gauge: metrics.bufferEvents,
});
const sink = createS3Sink({
  endpoint: env.LAKE_S3_ENDPOINT,
  region: env.LAKE_S3_REGION,
  accessKeyId: env.LAKE_S3_ACCESS_KEY,
  secretAccessKey: env.LAKE_S3_SECRET_KEY,
  bucket: env.LAKE_BUCKET,
  forcePathStyle: true,
});
const flusher = new Flusher({
  buffer,
  sink,
  metrics,
  logger,
  intervalMs: env.COLLECTOR_FLUSH_INTERVAL_MS,
  maxEvents: env.COLLECTOR_FLUSH_MAX_EVENTS,
});

const app = buildApp({ logger, apiKeys, queue: buffer, metrics });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  try {
    // Stop accepting first, then give the buffer a bounded time to reach the bronze layer.
    await app.close();
    await flusher.stop(env.COLLECTOR_SHUTDOWN_FLUSH_MS);
    await withTimeout(database.close(), 5_000, 'closing the database pool');
  } catch (error) {
    logger.error({ err: error }, 'error during shutdown');
    process.exitCode = 1;
  }
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));

try {
  await app.listen({ host: env.COLLECTOR_HOST, port: env.COLLECTOR_PORT });
  flusher.start();
} catch (error) {
  logger.fatal({ err: error }, 'failed to start');
  process.exitCode = 1;
  await shutdown('startup-failure');
}
