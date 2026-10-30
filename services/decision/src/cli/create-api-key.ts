// Usage: pnpm --filter @lever/decision api-key:create -- --env development [--name "..."] [--project demo-store]
import { parseArgs } from 'node:util';

import { createDb, dbEnvSchema } from '@lever/db';
import { parseEnv } from '@lever/schemas';

import { createApiKeyArgsSchema, createApiKeyFor } from './api-keys.js';

const { values } = parseArgs({
  options: {
    env: { type: 'string' },
    name: { type: 'string' },
    project: { type: 'string' },
  },
  strict: true,
});
const args = createApiKeyArgsSchema.parse(values);
const env = parseEnv(dbEnvSchema, process.env);
const { db, close } = createDb(env.DATABASE_URL, { maxConnections: 1 });

try {
  const created = await createApiKeyFor(db, args);
  // The full key is printed once and never stored or logged anywhere else (AC-7.3).
  process.stdout.write(
    [
      `API key created for ${args.project}/${args.env} (${args.name}).`,
      'Copy it now: it will not be shown again.',
      '',
      `  ${created.key}`,
      '',
    ].join('\n'),
  );
} catch (error) {
  process.stderr.write(`Failed to create the API key: ${String(error)}\n`);
  process.exitCode = 1;
} finally {
  await close();
}
