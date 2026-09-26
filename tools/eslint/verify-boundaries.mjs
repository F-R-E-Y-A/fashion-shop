// tools/eslint/verify-boundaries.mjs — kiem chinh LUAT RANH GIOI co con chay khong.
//
// Vi sao can: mot luat lint am tham hong thi te hon la khong co luat, vi ca nhom tin rang
// ranh gioi dang duoc giu. Tep trong fixtures/ deu SAI CO Y; script chep chung vao dung vi tri
// trong cay ung dung, chay ESLint that, doi du 5 loai loi, roi xoa di.
// Chay: node tools/eslint/verify-boundaries.mjs   (CI chay o job quality)
import fs from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const repo = path.resolve(here, '../..');

/** Moi muc: tep nguon trong fixtures -> vi tri tam trong cay ung dung, kem cac chuoi loi phai thay. */
const CASES = [
  {
    from: 'api/modules/demo/demo.controller.ts',
    to: 'apps/api/src/modules/__boundary_check__/demo.controller.ts',
    expect: ['khong duoc cham Prisma'],
  },
  {
    from: 'api/modules/demo/demo.service.ts',
    to: 'apps/api/src/modules/__boundary_check__/demo.service.ts',
    expect: ['qua cua index cua ho'],
  },
  {
    from: 'api/common/shared.ts',
    to: 'apps/api/src/common/__boundary_check__.ts',
    expect: ['khong duoc import phan he', 'khong duoc biet toi phan he nghiep vu'],
  },
  {
    from: 'web/features/demo/demo.ts',
    to: 'apps/web/src/features/__boundary_check__/demo.ts',
    expect: ['qua cua index cua ho', 'Vao tang "core" chi qua cua index'],
  },
  {
    from: 'web/core/shared.ts',
    to: 'apps/web/src/core/__boundary_check__.ts',
    expect: ['khong duoc import phan he', 'khong duoc biet toi features/'],
  },
];

const written = [];
try {
  for (const testCase of CASES) {
    const target = path.join(repo, testCase.to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(here, 'fixtures', testCase.from), target);
    written.push(target);
  }

  const eslint = new ESLint({ cwd: repo });
  const results = await eslint.lintFiles(written);

  let failed = 0;
  for (const [index, testCase] of CASES.entries()) {
    const result = results.find((r) => path.resolve(r.filePath) === written[index]);
    const messages = (result?.messages ?? [])
      .filter((m) => m.ruleId === 'local/boundaries')
      .map((m) => m.message);

    for (const expected of testCase.expect) {
      const found = messages.some((m) => m.includes(expected));
      console.log(`${found ? 'dat  ' : 'HONG '} ${testCase.from} -> "${expected}"`);
      if (!found) {
        failed++;
        console.error(`       thuc te: ${messages.join(' | ') || '(khong co loi nao)'}`);
      }
    }
  }

  if (failed > 0) {
    console.error(
      `\n✖ Luat ranh gioi khong con bat duoc ${failed} truong hop. Xem tools/eslint/boundaries.mjs.`,
    );
    process.exit(1);
  }
  console.log('\n✔ Luat ranh gioi bat du moi truong hop trong fixtures.');
} finally {
  for (const file of written) fs.rmSync(file, { force: true });
  fs.rmSync(path.join(repo, 'apps/api/src/modules/__boundary_check__'), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(repo, 'apps/web/src/features/__boundary_check__'), {
    recursive: true,
    force: true,
  });
}
