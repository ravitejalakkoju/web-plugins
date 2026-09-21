import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'apps/server/src/db/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/runtime/**/*.ts', 'packages/widget-kit/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['apps/views/**/*.ts', 'apps/views/**/*.tsx', 'examples/**/*.tsx'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Build configs and scripts run in node, wherever they live. Last, so it wins
  // over the browser globals a package otherwise gets.
  {
    files: ['**/*.mjs', '**/*.config.ts', '**/scripts/**'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
