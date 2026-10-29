import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbConnection {
  db: Database;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Maximum number of connections in the pool. */
  maxConnections?: number;
}

export function createDb(url: string, options: CreateDbOptions = {}): DbConnection {
  const client = postgres(url, {
    max: options.maxConnections ?? 10,
    // Keep NOTICE messages (e.g. "relation already exists, skipping") out of the logs.
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}
