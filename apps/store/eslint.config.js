// @ts-check
import { createConfig } from '@lever/config/eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  ...createConfig({
    tsconfigRootDir: import.meta.dirname,
    ignores: ['.next/**', 'next-env.d.ts', 'test-results/**', 'playwright-report/**'],
  }),
  {
    // Files the Next.js router requires to have a default export (AGENTS.md).
    files: [
      'src/app/**/{page,layout,error,not-found,loading,global-error}.tsx',
      'playwright.config.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
];

export default config;
