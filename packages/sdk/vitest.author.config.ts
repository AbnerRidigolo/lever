import { defineConfig } from 'vitest/config';

// Tests that use the author's evaluation (@lever/evaluation). They fail with `not implemented`
// until the author implements it, so they are kept out of `pnpm test` (sdk plan, D13).
export default defineConfig({
  test: {
    include: ['test/author/**/*.author.test.ts'],
    testTimeout: 60_000,
  },
});
