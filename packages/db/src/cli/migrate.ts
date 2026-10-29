import { createDb } from '../client.js';
import { loadDbEnv } from '../env.js';
import { logger } from '../logger.js';
import { MIGRATIONS_FOLDER, runMigrations } from '../migrate.js';

const env = loadDbEnv();
const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 1 });

try {
  logger.info({ migrationsFolder: MIGRATIONS_FOLDER }, 'applying migrations');
  await runMigrations(db);
  logger.info('migrations applied');
} catch (error) {
  logger.error({ err: error }, 'migration failed');
  process.exitCode = 1;
} finally {
  await close();
}
