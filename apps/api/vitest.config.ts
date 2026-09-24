import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Hai du an kiem thu trong mot cau hinh:
 *   unit  src/**\/*.spec.ts   Prisma gia, khong can co so du lieu, chay o job quality cua CI
 *   http  test/**\/*.spec.ts  dung ca AppModule, goi qua supertest vao Postgres KIEM THU, chay o job api
 *
 * SWC thay cho trinh bien dich mac dinh vi Nest can decorator METADATA (emitDecoratorMetadata)
 * de tiem phu thuoc; esbuild va oxc khong sinh metadata.
 */
const swcPlugin = swc.vite({
  module: { type: 'es6' },
  jsc: {
    target: 'es2022',
    parser: { syntax: 'typescript', decorators: true },
    transform: { decoratorMetadata: true, legacyDecorator: true },
  },
});

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'http',
          environment: 'node',
          include: ['test/**/*.spec.ts'],
          setupFiles: ['./test/setup-env.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
          // Cac tep test dung chung mot CSDL kiem thu nen chay lan luot, khong song song.
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/main.ts',
        'src/**/*.spec.ts',
        'src/**/index.ts',
        'src/**/*.module.ts',
        'src/**/dto/**',
      ],
    },
  },
});
