import { defineConfig } from 'vitest/config';

// The regular suite. Tests written from the spec for the reserved code run with test:author.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/author/**'],
  },
});
