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
    files: ['apps/server/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
