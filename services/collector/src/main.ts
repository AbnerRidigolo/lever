import { createDb } from '@lever/db';
import { ApiKeyStore, createDbApiKeySource, createLogger, withTimeout } from '@lever/service-kit';

import { buildApp } from './app.js';
import type { RecordQueue } from './buffer.js';
import { loadCollectorEnv } from './env.js';

const env = loadCollectorEnv();
const logger = createLogger('lever-collector', env.LOG_LEVEL);
const database = createDb(env.DATABASE_URL);

const apiKeys = new ApiKeyStore({
  source: createDbApiKeySource(database.db),
  logger,
  ttlMs: env.API_KEY_CACHE_TTL_MS,
});

// TEMPORARY: accepts and drops everything. T4 and T5 replace it with the buffer, the flusher
// and the S3 sink.
const queue: RecordQueue = { offer: () => true };

const app = buildApp({ logger, apiKeys, queue });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  try {
    await app.close();
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
} catch (error) {
  logger.fatal({ err: error }, 'failed to start');
  process.exitCode = 1;
  await shutdown('startup-failure');
}
