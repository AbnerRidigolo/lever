import { createDb } from '../client.js';
import { loadDbEnv } from '../env.js';
import { logger } from '../logger.js';
import { seed, seedProject } from '../seed/index.js';

const env = loadDbEnv();
const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 1 });

try {
  await seed(db);
  logger.info({ project: seedProject.slug }, 'seed applied');
} catch (error) {
  logger.error({ err: error }, 'seed failed');
  process.exitCode = 1;
} finally {
  await close();
}
