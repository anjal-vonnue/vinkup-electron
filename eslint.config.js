import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';
import path from 'node:path';
import globals from 'globals';

const rootDir = import.meta.dirname;

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/build/**', '**/release/**'] },

  // Base, non-type-aware rules for everything — covers eslint.config.js
  // and any config file not explicitly matched below
  js.configs.recommended,

  // Frontend — type-aware, explicit project files, own root
  {
    files: ['frontend/src/**/*.{ts,tsx}', 'frontend/vite.config.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [
          path.join(rootDir, 'frontend/tsconfig.app.json'),
          path.join(rootDir, 'frontend/tsconfig.node.json'),
        ],
        tsconfigRootDir: path.join(rootDir, 'frontend'),
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
    settings: { react: { version: 'detect' } },
  },

  // Backend — type-aware, restricted to src/ only, so prisma.config.ts
  // is never matched here at all (belt-and-suspenders with the
  // tsconfig exclude from step 5)
  {
    files: ['backend/src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [path.join(rootDir, 'backend/tsconfig.json')],
        tsconfigRootDir: path.join(rootDir, 'backend'),
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Desktop (Electron main + preload) — type-aware, own root
  {
    files: ['desktop/src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [path.join(rootDir, 'desktop/tsconfig.json')],
        tsconfigRootDir: path.join(rootDir, 'desktop'),
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Shared types package — type-aware, own root
  {
    files: ['packages/types/src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: [path.join(rootDir, 'packages/types/tsconfig.json')],
        tsconfigRootDir: path.join(rootDir, 'packages/types'),
      },
    },
    rules: {},
  },

  {
    files: ['backend/*.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {},
  },
  {
    files: ['frontend/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {},
  },
  {
    files: ['desktop/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {},
  },

  eslintConfigPrettier
);
