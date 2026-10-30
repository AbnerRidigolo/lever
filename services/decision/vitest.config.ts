import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Tests for the parts reserved for the author run with `pnpm test:author` (decision plan, D6).
    exclude: ['test/author/**'],
    globalSetup: ['test/global-setup.ts'],
    // All files share one Postgres container and mutate the seeded data.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Reserved for the author or only run as entry points (decision plan, D7).
      exclude: [
        'src/assignment/**',
        'src/evaluation/**',
        'src/main.ts',
        'src/telemetry.ts',
        'src/cli/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
