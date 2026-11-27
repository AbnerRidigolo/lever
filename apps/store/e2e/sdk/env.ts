import { dbEnvSchema } from '@lever/db';
import { parseEnv } from '@lever/schemas';
import { z } from 'zod';

import { STORE_URL } from '../env';

const env = parseEnv(
  z.object({
    DATABASE_URL: dbEnvSchema.shape.DATABASE_URL,
  }),
  process.env,
);

// A database of its own, apart from the console's lever_e2e (store plan, T12).
export const STORE_E2E_DATABASE = 'lever_store_e2e';
const databaseUrl = new URL(env.DATABASE_URL);
databaseUrl.pathname = `/${STORE_E2E_DATABASE}`;

export const SDK_E2E_DATABASE_URL = databaseUrl.toString();
export const ADMIN_DATABASE_URL = env.DATABASE_URL;
export { STORE_URL };
/** Decision service of these tests: 4102, apart from the console E2E's 4100. */
export const DECISION_URL = 'http://localhost:4102';

/**
 * Fictitious development key, valid only in the throwaway lever_store_e2e database that
 * e2e/prepare.ts recreates on every run (only its hash is stored there).
 */
export const E2E_API_KEY = `lvr_dev_${'store-e2e-fictitious-key'.padEnd(43, '0')}`;
