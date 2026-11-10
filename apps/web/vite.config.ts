import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const localEnv = loadEnv('development', path.resolve(here, '../..'), '');
const apiPort = process.env.API_PORT || localEnv.API_PORT || '3001';

export default defineConfig({
  plugins: [react()],
  // Doc tep .env o goc kho ma thay vi tep rieng cua thu muc web.
  envDir: path.resolve(here, '../..'),
  resolve: {
    // '@/' tro vao src: import xuyen tang viet '@/core', '@/ui'; trong cung feature thi dung duong tuong doi.
    alias: { '@': path.resolve(here, 'src') },
  },
  server: {
    // 5173 la cong mac dinh cua Vite, tren may nay dang bi du an khac chiem, nen chot 5174.
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true, xfwd: true },
    },
  },
  build: {
    sourcemap: true,
    // Thu vien ben thu ba vao goi rieng, React tach khoi router va query: goi chinh nho di, moi goi
    // duoi 500 kB, va trinh duyet giu dem thu vien khi ma cua hang doi.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[/\\](react|react-dom|scheduler)[/\\]/,
              priority: 2,
            },
            { name: 'vendor', test: /node_modules/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    // Fixture fetch dung URL tuyet doi co dinh, khong phu thuoc .env tunnel cua nguoi chay.
    env: { VITE_API_URL: 'http://localhost:3001/api' },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/index.ts', 'src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
});
