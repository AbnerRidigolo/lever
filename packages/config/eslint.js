// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint flat config for every package in the monorepo.
 *
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 */
export function createConfig({ tsconfigRootDir, ignores = [] }) {
  return tseslint.config(
    {
      ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**', ...ignores],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: {
          projectService: { allowDefaultProject: ['*.js'] },
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportDefaultDeclaration',
            message:
              'Use named exports (AGENTS.md). Default exports are only allowed where a tool requires them.',
          },
        ],
      },
    },
    {
      // Tools such as ESLint, Prettier, Vitest and drizzle-kit require a default export.
      files: ['**/*.config.{js,mjs,cjs,ts,mts}'],
      rules: { 'no-restricted-syntax': 'off' },
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  );
}
