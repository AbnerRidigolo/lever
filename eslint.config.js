// @ts-check
import { createConfig } from '@lever/config/eslint';

// Lints only the files at the repository root; every package has its own config.
export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['apps/**', 'services/**', 'packages/**', 'ml/**', 'infra/**'],
});
