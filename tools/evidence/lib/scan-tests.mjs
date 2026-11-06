// tools/evidence/lib/scan-tests.mjs — doc ten bai kiem thu tu ma nguon, dung chung cho cac cong cu minh chung.
// Khong chay test: chi doc loi goi describe/it/test o dau cau lenh de lay ten, nhom, tang va vi tri tep:dong.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const TEST_FILE = /\.(spec|test|load)\.tsx?$/u;
const SKIP_DIR = new Set(['node_modules', 'dist', 'coverage', 'coverage-http', 'generated']);

/** Liet ke tep kiem thu duoi cac tep/thu muc da cho, duong dan tuong doi dung dau '/', da sap xep. */
export function listTestFiles(paths) {
  return paths
    .flatMap(function walk(path) {
      if (!statSync(path).isDirectory()) return [path];
      return readdirSync(path)
        .filter((name) => !SKIP_DIR.has(name))
        .flatMap((name) => walk(join(path, name)));
    })
    .filter((path) => TEST_FILE.test(path))
    .map((path) => relative('.', path).split(sep).join('/'))
    .sort();
}

/** Tang theo vi tri tep, dung quy uoc o docs/shared/testing.md. */
export function tier(path) {
  if (path.startsWith('apps/web/e2e/')) return 'E2E';
  if (path.includes('/test/load/')) return 'Tải';
  if (path.startsWith('apps/api/test/')) return 'API (HTTP)';
  if (path.startsWith('apps/web/')) return 'Unit (web)';
  return 'Unit (API)';
}

/** Lay chuoi dau tien sau dau ngoac mo: '...', "..." hoac `...` (bo phan ${} cua template). */
function firstString(text) {
  const match = text.match(/^\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/u);
  return match ? match[2].replace(/\$\{[^}]*\}/gu, '…').replace(/\s+/gu, ' ') : null;
}

/**
 * Bo qua mot khoi mo bang open toi dau dong tuong ung, dem long nhau; '=>' khong tinh la dong '<'.
 * Tra ve vi tri ngay sau dau dong, hoac -1 neu khong khop.
 */
function skipBalanced(source, from, open, close) {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === open) depth += 1;
    else if (ch === close && !(close === '>' && source[i - 1] === '=')) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Vi tri ngay sau '(' cua loi goi that: bo qua generic <...> va bang du lieu (...) cua .each. */
function argumentStart(source, index, modifier) {
  let at = index;
  const skipSpace = () => {
    while (/\s/u.test(source[at] ?? '')) at += 1;
  };
  if (modifier === '.each') {
    skipSpace();
    if (source[at] === '<') at = skipBalanced(source, at, '<', '>');
    if (at < 0) return -1;
    skipSpace();
    if (source[at] !== '(') return -1;
    at = skipBalanced(source, at, '(', ')');
    if (at < 0) return -1;
  }
  skipSpace();
  return source[at] === '(' ? at + 1 : -1;
}

const CALL = /\b(describe|it|test)(\.each|\.skip|\.only)?\b/gu;

/**
 * Moi phan tu: { tier, file, line, at, group, name, each, skipped }.
 * Mot dong la mot loi goi it/test; .each tinh mot dong.
 */
export function scanTests(files) {
  const rows = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const lineOf = (index) => source.slice(0, index).split('\n').length;
    const stack = [];
    for (const match of source.matchAll(CALL)) {
      // Chi tinh loi goi o dau cau lenh (sau thut dong), bo qua chu "it"/"test" trong chuoi va bieu thuc.
      const lineStart = source.lastIndexOf('\n', match.index) + 1;
      if (source.slice(lineStart, match.index).trim() !== '') continue;
      const start = argumentStart(source, match.index + match[0].length, match[2]);
      if (start < 0) continue;
      const name = firstString(source.slice(start));
      if (name === null) continue;
      const indent = match.index - lineStart;
      while (stack.length && stack.at(-1).indent >= indent) stack.pop();
      if (match[1] === 'describe') {
        stack.push({ indent, name });
        continue;
      }
      const line = lineOf(match.index);
      rows.push({
        tier: tier(file),
        file,
        line,
        at: `${file}:${line}`,
        group: stack.map((entry) => entry.name).join(' › '),
        name,
        each: match[2] === '.each',
        skipped: match[2] === '.skip',
      });
    }
  }
  return rows;
}

/** Dong ghi lenh, commit va trang thai cay lam viec, de minh chung tu noi duoc no den tu dau. */
export function stamp(script) {
  const git = (...a) => spawnSync('git', a, { encoding: 'utf8' }).stdout.trim();
  const command = process.argv
    .slice(2)
    .map((arg) => (/\s/u.test(arg) ? JSON.stringify(arg) : arg))
    .join(' ');
  const dirty = git('status', '--porcelain') ? ' (cây làm việc có thay đổi chưa commit)' : '';
  return `Xuất bằng \`node ${script} ${command}\` tại commit \`${git('rev-parse', '--short', 'HEAD')}\`${dirty}, ngày ${new Date().toISOString().slice(0, 10)}.`;
}

export const cell = (text) => String(text).replace(/\|/gu, '\\|');
