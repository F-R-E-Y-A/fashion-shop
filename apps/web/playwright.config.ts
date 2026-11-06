import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

/**
 * E2E: trinh duyet that -> web Vite -> API Nest -> Postgres KIEM THU. Chay tay:
 *   npm run test:e2e -w apps/web
 *
 * Cong rieng (API 3101, web 5175) de khong dung may chu dev 3001/5174, va khong tai dung may chu
 * dang chay: may chu dev tro vao CSDL that, con seed E2E xoa sach CSDL ma API dang dung.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
loadEnv({ path: path.join(root, '.env'), quiet: true });

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) throw new Error('Thieu DATABASE_URL_TEST. Chay: npm run db:test:prepare');

const API_PORT = '3101';
const WEB_PORT = 5175;

export default defineConfig({
  testDir: './e2e',
  // Cac bai dung chung mot CSDL va mot bo fixture nen chay lan luot.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: 'vi-VN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Ban build that cua API, NODE_ENV=test: tat worker doi soat 30 giay va tach khoa gioi han toc do.
      command: 'npm run build -w apps/api && node apps/api/dist/main.js',
      cwd: root,
      url: `http://127.0.0.1:${API_PORT}/api/healthz`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { DATABASE_URL: testUrl, NODE_ENV: 'test', PORT: API_PORT, API_PORT },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      cwd: here,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PORT, VITE_API_URL: '/api' },
    },
  ],
});
