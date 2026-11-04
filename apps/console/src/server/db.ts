import { createDb, type Database } from '@lever/db';

import { consoleEnv } from './env';

let database: Database | undefined;

export function db(): Database {
  database ??= createDb(consoleEnv().DATABASE_URL).db;
  return database;
}
