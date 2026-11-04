import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    env: { STORE_SESSION_SECRET: 'test-only-session-secret-0123456789' },
  },
});
