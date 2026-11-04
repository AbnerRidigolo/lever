import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import type { Database } from './client.js';

/** `packages/db/migrations`, resolved from both `src/` and `dist/`. */
// Not `new URL(relative, import.meta.url)`: bundlers try to resolve that as an asset.
export const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
