// tools/evidence/traceability.mjs — ma tran truy vet tieu chi chap nhan (AC) -> bai kiem thu (rubric TC2.5).
// Nguon AC: dong `- **ACk** (loai[, tay|chua giao]) ...` trong docs/features/*/use-cases*.md, duoi heading `## UC-NN.m`.
// Nguon test: ma `UC-NN.m/ACk` (hoac `UC-NN.m/AC1,AC3`) trong ten `it`/`test`; ma o `describe` khong tinh.
// Dung: npm run evidence:trace -- [--uc UC-03,UC-07] [--check] [thu muc test ...]
//   --uc     chi xet cac nhom/use case co tien to nay (phan cach dau phay)
//   --check  thoat ma 1 neu co AC chua phan loai, AC trong pham vi chua co test, hoac ma trong test khong khop AC nao
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cell, listTestFiles, scanTests, stamp } from './lib/scan-tests.mjs';

const args = process.argv.slice(2);
const take = (flag) => {
  const at = args.indexOf(flag);
  return at > -1 ? args.splice(at, 2)[1] : null;
};
const check = args.includes('--check') && Boolean(args.splice(args.indexOf('--check'), 1));
const scope = (take('--uc') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const testRoots = args.length ? args : ['apps'];
const inScope = (uc) => !scope.length || scope.some((prefix) => `UC-${uc}`.startsWith(prefix));

const KINDS = new Set(['thuận', 'âm', 'biên']);

/** Doc AC tu moi tep use-cases*.md trong docs/features. */
function readSpecs() {
  const root = 'docs/features';
  const files = readdirSync(root)
    .flatMap((feature) => {
      const dir = join(root, feature);
      return existsSync(dir) && !feature.includes('.')
        ? readdirSync(dir)
            .filter((name) => /^use-cases.*\.md$/u.test(name))
            .map((name) => `${root}/${feature}/${name}`)
        : [];
    })
    .sort();
  const acs = [];
  const ucs = new Map();
  for (const file of files) {
    let uc = null;
    let level = 0;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((text, index) => {
        // Heading UC o cap bat ky; heading khac cung cap hoac cao hon thi ket thuc use case do.
        const heading = text.match(/^(#{1,3})\s+UC-(\d{2}\.\d+)\b\s*[·:—-]?\s*(.*)$/u);
        if (heading) {
          level = heading[1].length;
          uc = heading[2];
          if (!ucs.has(uc)) ucs.set(uc, { uc, title: heading[3].trim(), file });
          return;
        }
        const other = text.match(/^(#{1,6})\s/u);
        if (other && other[1].length <= level) uc = null;
        const ac =
          uc && text.match(/^\s*-\s+(?:\[[ xX]\]\s+)?\*\*AC(\d+)\*\*\s*(?:\(([^)]*)\))?\s*(.*)$/u);
        if (!ac) return;
        const tags = (ac[2] ?? '').split(',').map((t) => t.trim());
        acs.push({
          code: `UC-${uc}/AC${ac[1]}`,
          uc,
          kind: tags.find((t) => KINDS.has(t)) ?? null,
          manual: tags.includes('tay'),
          deferred: tags.includes('chưa giao'),
          text: ac[3].replace(/\s+—\s+`.*$/u, '').trim(),
          at: `${file}:${index + 1}`,
        });
      });
  }
  return { acs, ucs };
}

/** Ma AC trong ten mot bai: UC-07.1/AC2 hoac UC-07.1/AC2,AC5. */
function codesIn(name) {
  const codes = [];
  for (const m of name.matchAll(/UC-(\d{2}\.\d+)\/(AC\d+(?:\s*,\s*AC\d+)*)/gu)) {
    for (const ac of m[2].split(',')) codes.push(`UC-${m[1]}/${ac.trim()}`);
  }
  return codes;
}

const { acs, ucs } = readSpecs();
const tests = scanTests(listTestFiles(testRoots)).filter((t) => !t.skipped);
const byCode = new Map(acs.map((ac) => [ac.code, { ...ac, tests: [] }]));
const dangling = [];
for (const test of tests) {
  for (const code of codesIn(test.name)) {
    const entry = byCode.get(code);
    if (entry) entry.tests.push(test);
    else if (inScope(code.slice(3, code.indexOf('/')))) dangling.push({ code, test });
  }
}

const rows = [...byCode.values()].filter((ac) => inScope(ac.uc));
const active = rows.filter((ac) => !ac.deferred);
const automated = active.filter((ac) => ac.tests.length);
const manualOnly = active.filter((ac) => !ac.tests.length && ac.manual);
const missing = active.filter((ac) => !ac.tests.length && !ac.manual);
const untyped = active.filter((ac) => !ac.kind);
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1).replace('.', ',')}%` : '—');

const perUc = Object.entries(Object.groupBy(active, (ac) => ac.uc)).sort(([a], [b]) =>
  a.localeCompare(b, 'en', { numeric: true }),
);
const covered = (list, kind) => list.some((ac) => ac.kind === kind && ac.tests.length);
const ucWith = (kind) => perUc.filter(([, list]) => covered(list, kind)).length;

console.log(`# Ma trận truy vết tiêu chí chấp nhận → bài kiểm thử\n`);
console.log(
  `${stamp('tools/evidence/traceability.mjs')} AC đọc từ \`docs/features/*/use-cases*.md\`; một bài được tính cho AC khi tên \`it\`/\`test\` chứa đúng mã \`UC-NN.m/ACk\`. AC ghi \`chưa giao\` không tính vào mẫu số.\n`,
);
console.log('## Tổng\n\n| Chỉ số | Giá trị |\n|---|---:|');
console.log(`| Use case trong phạm vi | ${perUc.length} |`);
console.log(`| AC trong phạm vi (trừ chưa giao) | ${active.length} |`);
console.log(
  `| AC có ít nhất một bài tự động | ${automated.length} (${pct(automated.length, active.length)}) |`,
);
console.log(`| AC chỉ kiểm thủ công, có kịch bản | ${manualOnly.length} |`);
console.log(`| AC chưa có bài | ${missing.length} |`);
console.log(`| Use case có AC âm được kiểm | ${ucWith('âm')}/${perUc.length} |`);
console.log(`| Use case có AC biên được kiểm | ${ucWith('biên')}/${perUc.length} |`);
console.log(`| AC chưa phân loại thuận/âm/biên | ${untyped.length} |`);
console.log(`| Mã trong tên bài không khớp AC nào | ${dangling.length} |\n`);

console.log(
  '## Theo use case\n\n| Use case | Tên | AC | Tự động | Thủ công | Thiếu | Âm | Biên |\n|---|---|---:|---:|---:|---:|:-:|:-:|',
);
for (const [uc, list] of perUc) {
  const n = (f) => list.filter(f).length;
  console.log(
    `| UC-${uc} | ${cell(ucs.get(uc)?.title ?? '')} | ${list.length} | ${n((a) => a.tests.length)} | ${n((a) => !a.tests.length && a.manual)} | ${n((a) => !a.tests.length && !a.manual)} | ${covered(list, 'âm') ? '✓' : '✗'} | ${covered(list, 'biên') ? '✓' : '✗'} |`,
  );
}

console.log('\n## Chi tiết\n\n| AC | Loại | Tiêu chí | Bài kiểm thử |\n|---|---|---|---|');
for (const ac of rows) {
  const where = ac.tests.length
    ? ac.tests.map((t) => `${t.tier} \`${t.at}\``).join('<br>')
    : ac.deferred
      ? '— chưa giao'
      : ac.manual
        ? 'thủ công (kịch bản trong đặc tả)'
        : '**chưa có**';
  console.log(
    `| ${ac.code} | ${ac.kind ?? '?'}${ac.manual ? ', tay' : ''} | ${cell(ac.text.slice(0, 160))} | ${where} |`,
  );
}

if (dangling.length) {
  console.log('\n## Mã trong tên bài không khớp AC nào\n\n| Mã | Bài |\n|---|---|');
  for (const { code, test } of dangling)
    console.log(`| ${code} | \`${test.at}\` ${cell(test.name)} |`);
}

if (check && (missing.length || untyped.length || dangling.length)) {
  console.error(
    `traceability: ${missing.length} AC chưa có bài, ${untyped.length} AC chưa phân loại, ${dangling.length} mã treo.`,
  );
  process.exit(1);
}
