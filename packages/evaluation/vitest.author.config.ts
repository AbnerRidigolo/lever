import { defineConfig } from 'vitest/config';

// Tests written from the spec for the reserved code (FR-004, AC-2.x, AC-3.2 to 3.5, AC-4.x).
// They fail until the author implements src/assignment.ts and src/evaluation.ts, so they are kept
// out of `pnpm test` and run with `pnpm --filter @lever/evaluation test:author`.
export default defineConfig({
  test: {
    include: ['test/author/**/*.author.test.ts'],
    testTimeout: 60_000,
  },
});
