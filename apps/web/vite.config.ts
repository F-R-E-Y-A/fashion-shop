import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

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
  },
  build: { sourcemap: true },
  test: {
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
