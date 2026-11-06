// tools/evidence/test-cases.mjs — xuat bang test case (rubric muc Kiem thu) tu chinh ten bai trong ma.
// Moi dong: ma TC, tang, vi tri tep:dong, nhom describe, ten bai. Khong go tay: doi ten bai la bang doi theo.
// Dung: npm run evidence:test-cases -- --title "Dat hang - thanh toan" <tep|thu muc> ... > ../tlcn-docs/minh-chung/test-cases-<ngay>.md
import { cell, listTestFiles, scanTests, stamp } from './lib/scan-tests.mjs';

const args = process.argv.slice(2);
const titleAt = args.indexOf('--title');
const title = titleAt > -1 ? args.splice(titleAt, 2)[1] : 'Bang test case';
if (!args.length) {
  console.error('Dung: node tools/evidence/test-cases.mjs [--title <ten>] <tep|thu muc> ...');
  process.exit(1);
}

const rows = scanTests(listTestFiles(args));
const counts = Object.entries(Object.groupBy(rows, (row) => row.tier));

console.log(`# ${title}\n`);
console.log(
  `${stamp('tools/evidence/test-cases.mjs')} Một dòng là một lời gọi \`it\`/\`test\`; \`.each\` tính một dòng.\n`,
);
console.log('| Tầng | Số bài |\n|---|---:|');
for (const [name, list] of counts) console.log(`| ${name} | ${list.length} |`);
console.log(`| **Tổng** | **${rows.length}** |\n`);
console.log('| Mã | Tầng | Nhóm | Bài kiểm thử | Vị trí |\n|---|---|---|---|---|');
rows.forEach((row, index) =>
  console.log(
    `| TC-${String(index + 1).padStart(3, '0')} | ${row.tier} | ${cell(row.group)} | ${cell(row.name + (row.each ? ' (nhiều ca dữ liệu)' : ''))} | \`${row.at}\` |`,
  ),
);
