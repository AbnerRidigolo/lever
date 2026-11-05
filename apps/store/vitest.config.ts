import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // tsconfig keeps JSX for Next.js ("preserve"); the tests compile it with the React runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    env: { STORE_SESSION_SECRET: 'test-only-session-secret-0123456789' },
  },
});
