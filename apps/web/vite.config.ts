import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Doc tep .env o goc kho ma thay vi tep rieng cua rieng thu muc web.
  envDir: path.resolve(here, '../..'),
  server: {
    // 5173 la cong mac dinh cua Vite, tren may nay dang bi du an khac chiem,
    // nen chot 5174. Doi so nay neu may cua ban ban cong.
    port: 5174,
    strictPort: true,
  },
});
