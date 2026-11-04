import { dbEnvSchema } from '@lever/db';
import { parseEnv } from '@lever/schemas';
import { z } from 'zod';

const env = parseEnv(
  z.object({
    DATABASE_URL: dbEnvSchema.shape.DATABASE_URL,
    MAILPIT_UI_PORT: z.coerce.number().int().default(8025),
  }),
  process.env,
);

// A database of its own, so the E2E tests never touch local development data.
const databaseUrl = new URL(env.DATABASE_URL);
databaseUrl.pathname = '/lever_e2e';

export const E2E_DATABASE_URL = databaseUrl.toString();
export const ADMIN_DATABASE_URL = env.DATABASE_URL;
export const CONSOLE_URL = 'http://localhost:3100';
export const DECISION_URL = 'http://localhost:4100';
export const MAILPIT_URL = `http://localhost:${env.MAILPIT_UI_PORT}`;

export const ADMIN_EMAIL = 'admin@lever.local';
export const EDITOR_EMAIL = 'editor@lever.local';
export const VIEWER_EMAIL = 'viewer@lever.local';
