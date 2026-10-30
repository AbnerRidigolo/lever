import { createDb } from '@lever/db';

import { buildApp } from './app.js';
import { ApiKeyStore, createDbApiKeySource } from './auth/api-key-store.js';
import { listenForConfigChanges, type ConfigChangeListener } from './config/config-listener.js';
import { ConfigStore } from './config/config-store.js';
import { loadEnvironmentConfig } from './config/load-config.js';
import { loadDecisionEnv } from './env.js';
import { authorEvaluator } from './evaluator.js';
import { createLogger } from './logger.js';

const env = loadDecisionEnv();
const logger = createLogger(env.LOG_LEVEL);
const database = createDb(env.DATABASE_URL);

const apiKeys = new ApiKeyStore({
  source: createDbApiKeySource(database.db),
  logger,
  ttlMs: env.API_KEY_CACHE_TTL_MS,
});
const configStore = new ConfigStore({
  load: (environmentId) => loadEnvironmentConfig(database.db, environmentId),
  logger,
});
const app = buildApp({ logger, apiKeys, configStore, evaluator: authorEvaluator });
let listener: ConfigChangeListener | undefined;

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  try {
    await app.close();
    await listener?.close();
    await database.close();
  } catch (error) {
    logger.error({ err: error }, 'error during shutdown');
    process.exitCode = 1;
  }
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));

try {
  listener = await listenForConfigChanges({ databaseUrl: env.DATABASE_URL, configStore, logger });
  await app.listen({ host: env.DECISION_HOST, port: env.DECISION_PORT });
} catch (error) {
  logger.fatal({ err: error }, 'failed to start');
  process.exitCode = 1;
  await shutdown('startup-failure');
}
