import { buildApp } from './app.js';
import { loadDecisionEnv } from './env.js';
import { createLogger } from './logger.js';

const env = loadDecisionEnv();
const logger = createLogger(env.LOG_LEVEL);
const app = buildApp({ logger });

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  try {
    await app.close();
  } catch (error) {
    logger.error({ err: error }, 'error during shutdown');
    process.exitCode = 1;
  }
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));

try {
  await app.listen({ host: env.DECISION_HOST, port: env.DECISION_PORT });
} catch (error) {
  logger.fatal({ err: error }, 'failed to start');
  process.exitCode = 1;
  await app.close();
}
