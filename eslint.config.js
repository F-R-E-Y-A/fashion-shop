// eslint.config.js — MOT cau hinh cho ca kho ma. Luat ranh gioi phan he nam o tools/eslint/boundaries.mjs.
//
// Ba tang luat, tu rong toi hep:
//   1. Chung cho moi tep TS/JS: eslint recommended + typescript-eslint recommended + thu tu import.
//   2. apps/api: controller va DTO khong cham Prisma; common/ va infra/ khong biet toi modules/;
//      phan he chi import phan he khac qua index.js cua ho.
//   3. apps/web: react-hooks; core/ va ui/ khong biet toi features/ va app/; vao core, ui va
//      features chi qua index cua chung; feature dung feature khac cung chi qua index cua ho.
// Prettier dat cuoi de tat moi luat dinh dang trung voi no.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { boundaries } from './tools/eslint/boundaries.mjs';

export default defineConfig([
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/coverage-http/**',
      'apps/api/src/generated/**',
      'tools/eslint/fixtures/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
      local: { rules: { boundaries } },
    },
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ---------------- apps/api ----------------
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'local/boundaries': [
        'error',
        {
          root: 'apps/api/src',
          unitsDir: 'modules',
          gate: 'index',
          allowUnitsFrom: ['app.module.ts', 'main.ts', 'app.setup.ts'],
          forbid: [
            {
              files: ['modules/**/*.controller.ts', 'modules/**/dto/**'],
              targets: ['infra/prisma/**', 'generated/**'],
              message:
                'Controller va DTO khong duoc cham Prisma, phai di qua service (docs/CONTRIBUTING.md luat 3).',
            },
            {
              files: ['common/**', 'infra/**'],
              targets: ['modules/**'],
              message:
                'Ha tang dung chung (common/, infra/) khong duoc biet toi phan he nghiep vu.',
            },
          ],
        },
      ],
    },
  },

  // ---------------- apps/web ----------------
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'local/boundaries': [
        'error',
        {
          root: 'apps/web/src',
          unitsDir: 'features',
          gate: 'index',
          alias: { '@/': '' },
          allowUnitsFrom: ['app/**', 'main.tsx'],
          gated: ['core', 'ui'],
          forbid: [
            {
              files: ['core/**', 'ui/**'],
              targets: ['features/**', 'app/**'],
              message: 'core/ va ui/ la tang dung chung, khong duoc biet toi features/ hay app/.',
            },
          ],
        },
      ],
    },
  },

  // Script cong cu, seed, cau hinh va kiem thu duoc dung console.
  {
    files: [
      'tools/**',
      'apps/api/prisma/**',
      'apps/api/test/**',
      '**/*.config.{ts,js,mjs}',
      '**/*.spec.ts',
      '**/*.test.{ts,tsx}',
    ],
    rules: { 'no-console': 'off' },
  },

  prettier,
]);
