import { defineConfig } from 'drizzle-kit';

// Only `drizzle-kit generate` uses this file, and it does not connect to the database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
});
