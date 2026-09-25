// tools/docs/lint.mjs — kiem luat tai lieu trong AGENTS.md bang may. Chi kiem HINH THUC va LIEN KET,
// noi dung dung hay sai la viec cua nguoi duyet.
// Dung: npm run docs:lint  hoac  node tools/docs/lint.mjs [tep.md | thu muc ...]
//   Khong tham so: moi .md trong docs/ cong AGENTS.md, CLAUDE.md, README.md o goc.
// Ma thoat 0 = dat; 1 = co loi, in "tep: loi" tung dong. Chua gan vao hook hay CI (docs/LOG.md#adr-006).
// Chep va rut gon tu docs-lint cua Automation_Document; bo kiem ma API vi du an nay co Swagger.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const norm = (p) => p.replace(/\\/g, '/');
const rel = (abs) => norm(path.relative(REPO, abs));

const ROOT_RULE_FILES = /^(README|AGENTS|CLAUDE)\.md$/; // luat va trang gioi thieu: chi kiem link
const LINE_LIMIT = 300; // luat 8
// Muc "Tam thoi" trong AGENTS.md: vuot tran nhung chua tach, bao canh bao chu khong bao loi.
const TEMP_OVER_LIMIT = new Set([
  'docs/shared/code-tour.md',
  'docs/features/platform/github-setup.md',
]);
const FM_REQUIRED = ['title', 'updated', 'status', 'owner']; // luat 5

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.toLowerCase().endsWith('.md')) acc.push(full);
  }
  return acc;
}

function frontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const fm = {};
  for (const raw of text.slice(3, end).split('\n')) {
    const m = raw.replace(/\r$/, '').match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

const isLog = (r) => /(^|\/)LOG\.md$/.test(r);
const stripCode = (text) =>
  text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(`{3,})[\s\S]*?\1/g, '')
    .replace(/`[^`\n]*`/g, '');

// Neo <a id="..."> cua mot tep, de kiem link dang LOG.md#adr-004.
const anchorCache = new Map();
function anchorsOf(abs) {
  if (!anchorCache.has(abs)) {
    const text = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    anchorCache.set(abs, new Set([...text.matchAll(/<a\s+id="([^"]+)"/g)].map((m) => m[1])));
  }
  return anchorCache.get(abs);
}

function lint(abs) {
  const r = rel(abs);
  const errors = [];
  const warnings = [];
  const text = fs.readFileSync(abs, 'utf8');
  const ruleFile = ROOT_RULE_FILES.test(r);

  if (!ruleFile) {
    const fm = frontmatter(text);
    if (!fm) errors.push('thieu frontmatter (--- title · updated · status · owner ---)');
    else {
      for (const k of FM_REQUIRED) if (!fm[k]) errors.push(`frontmatter thieu \`${k}\``);
      if (fm.updated && !/^\d{4}-\d{2}-\d{2}$/.test(fm.updated))
        errors.push('`updated` phai dang YYYY-MM-DD');
    }
    if (!isLog(r) && !/\*\*Chức năng:\*\*/.test(text))
      errors.push('thieu dong **Chức năng:** duoi H1 (luat 5)');

    const lines = text.split('\n').length;
    if (!isLog(r) && lines > LINE_LIMIT) {
      const msg = `${lines} dong > ${LINE_LIMIT}, tach trong cung thu muc (luat 8)`;
      (TEMP_OVER_LIMIT.has(r) ? warnings : errors).push(msg);
    }
    if (!isLog(r) && /^#+\s.*Lịch sử (sửa|thay đổi)|^\*?\*?Ngày soạn/im.test(text))
      errors.push(
        'khong dung bang lich su hay "Ngay soan" trong than; lich su o LOG va git (luat 5)',
      );
  }

  // Luat 7: link tuong doi phai toi duoc tep; neo trong LOG.md phai co <a id>.
  for (const m of stripCode(text).matchAll(/\]\(([^)\s]+)\)/g)) {
    const [target, anchor] = m[1].split('#');
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const dest = path.resolve(path.dirname(abs), decodeURI(target));
    if (!fs.existsSync(dest)) errors.push(`link gay: ${m[1]}`);
    else if (anchor && isLog(norm(dest)) && !anchorsOf(dest).has(anchor))
      errors.push(`neo khong co trong ${target}: #${anchor}`);
  }
  return { errors, warnings };
}

// Luat 3: ADR la mot day so chung, hai LOG khong duoc cung cap mot so.
function duplicateAdr(logFiles) {
  const seen = new Map();
  const errors = [];
  for (const f of logFiles)
    for (const id of anchorsOf(f))
      if (/^adr-\d{3}$/.test(id)) {
        if (seen.has(id)) errors.push(`${rel(f)}: ${id} trung voi ${rel(seen.get(id))}`);
        else seen.set(id, f);
      }
  return errors;
}

const args = process.argv.slice(2);
const expand = (a) => {
  const abs = path.resolve(process.cwd(), a);
  return fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? walk(abs) : [abs];
};
const defaults = () => [
  ...walk(path.join(REPO, 'docs')),
  ...['README.md', 'AGENTS.md', 'CLAUDE.md'].map((f) => path.join(REPO, f)),
];
const files = (args.length ? args.flatMap(expand) : defaults()).filter(
  (f) => fs.existsSync(f) && /\.md$/i.test(f),
);

let total = 0;
for (const f of files) {
  const { errors, warnings } = lint(f);
  for (const w of warnings) console.log(`${rel(f)}: canh bao: ${w}`);
  for (const e of errors) console.log(`${rel(f)}: ${e}`);
  total += errors.length;
}
const dup = duplicateAdr(walk(path.join(REPO, 'docs')).filter((f) => isLog(rel(f))));
for (const e of dup) console.log(e);
total += dup.length;

if (total) {
  console.log(`docs-lint: ${total} loi trong ${files.length} tep — xem AGENTS.md`);
  process.exit(1);
}
console.log(`docs-lint: ${files.length} tep dat`);
