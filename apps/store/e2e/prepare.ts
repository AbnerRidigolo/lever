import { apiKeys, createDb, hashApiKey, runMigrations, seed } from '@lever/db';
import postgres from 'postgres';

import {
  ADMIN_DATABASE_URL,
  E2E_API_KEY,
  SDK_E2E_DATABASE_URL,
  STORE_E2E_DATABASE,
} from './sdk/env';
import { SEED } from './sdk/seed-ids';

// Recreates the database of the SDK E2E tests: migrations, seed and the store's API key
// (development, where checkout-layout is running). Run by `pnpm test:e2e:sdk`.
const admin = postgres(ADMIN_DATABASE_URL, { max: 1, onnotice: () => undefined });
await admin.unsafe(`DROP DATABASE IF EXISTS ${STORE_E2E_DATABASE} WITH (FORCE)`);
await admin.unsafe(`CREATE DATABASE ${STORE_E2E_DATABASE}`);
await admin.end();

const { db, close } = createDb(SDK_E2E_DATABASE_URL, { maxConnections: 1 });
await runMigrations(db);
await seed(db);
await db.insert(apiKeys).values({
  environmentId: SEED.development,
  name: 'store e2e',
  keyPrefix: E2E_API_KEY.slice(0, 12),
  keyHash: hashApiKey(E2E_API_KEY),
});
await close();
