import { defineConfig } from 'vitest/config';

// Tests of the parts reserved for the author (assignment and evaluation), written from the
// spec. They fail until the author implements src/assignment and src/evaluation, so they are
// kept out of `pnpm test` and run with `pnpm --filter @lever/decision test:author`
// (decision plan, D6).
export default defineConfig({
  test: {
    include: ['test/author/**/*.author.test.ts'],
    testTimeout: 60_000,
  },
});
