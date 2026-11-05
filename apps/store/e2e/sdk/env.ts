import { dbEnvSchema } from '@lever/db';
import { parseEnv } from '@lever/schemas';
import { z } from 'zod';

import { STORE_URL } from '../env';

const env = parseEnv(
  z.object({
    DATABASE_URL: dbEnvSchema.shape.DATABASE_URL,
    LEVER_E2E_AUTHOR_READY: z.enum(['0', '1']).default('0'),
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

/**
 * The flows whose result depends on the author's evaluation (`@lever/evaluation` still throws
 * `not implemented`) run only with LEVER_E2E_AUTHOR_READY=1.
 */
export const AUTHOR_READY = env.LEVER_E2E_AUTHOR_READY === '1';
export const AUTHOR_PENDING_REASON =
  'needs the author evaluation in @lever/evaluation (still not implemented); ' +
  'run with LEVER_E2E_AUTHOR_READY=1 once it lands';
