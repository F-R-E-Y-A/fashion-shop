// tools/evidence/coverage-modules.mjs — do phu dong theo tung module, gop unit va HTTP (rubric TC2.5: "mo-dun cot loi >= 70%").
// Doc lcov.info do Vitest sinh; mot dong duoc tinh la da chay neu bat ky bo nao chay toi no.
// Chay truoc: npm run test:cov -w apps/api; npm run test:http:cov -w apps/api; npm run test:cov -w apps/web
// Dung: npm run evidence:coverage -- [--core products,checkout,payments,orders]
import { existsSync, readFileSync } from 'node:fs';

import { stamp } from './lib/scan-tests.mjs';

const args = process.argv.slice(2);
const coreAt = args.indexOf('--core');
const core = new Set(coreAt > -1 ? args[coreAt + 1].split(',') : []);

const SOURCES = [
  { app: 'api', label: 'Unit', file: 'apps/api/coverage/lcov.info' },
  { app: 'api', label: 'HTTP', file: 'apps/api/coverage-http/lcov.info' },
  { app: 'web', label: 'Unit', file: 'apps/web/coverage/lcov.info' },
];

/** Nhom tep theo module: src/modules/<m> (API), src/features/<f> (web), con lai theo thu muc dau cua src. */
function moduleOf(app, path) {
  const parts = path.split('/');
  const at = parts.indexOf('src');
  const rest = parts.slice(at + 1);
  if (rest[0] === 'modules' || rest[0] === 'features') return `${app}:${rest[1]}`;
  return `${app}:${rest.length > 1 ? rest[0] : '(gốc)'}`;
}

/** Map tep -> Map dong -> so lan chay. */
function readLcov(file) {
  const files = new Map();
  let current = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
    if (line.startsWith('SF:')) {
      current = new Map();
      files.set(line.slice(3).replaceAll('\\', '/'), current);
    } else if (current && line.startsWith('DA:')) {
      const [n, hits] = line.slice(3).split(',').map(Number);
      current.set(n, (current.get(n) ?? 0) + hits);
    }
  }
  return files;
}

const used = SOURCES.filter((s) => existsSync(s.file));
const missingSources = SOURCES.filter((s) => !existsSync(s.file));
if (!used.length) {
  console.error('Chua co lcov.info nao. Chay test:cov / test:http:cov truoc.');
  process.exit(1);
}

// modules: key -> { per label: {found, hit}, union: Map(file -> Map(line -> covered)) }
const modules = new Map();
for (const source of used) {
  for (const [path, lines] of readLcov(source.file)) {
    const key = moduleOf(source.app, path);
    const mod = modules.get(key) ?? { per: {}, union: new Map() };
    modules.set(key, mod);
    const stat = (mod.per[source.label] ??= { found: 0, hit: 0 });
    const union = mod.union.get(path) ?? new Map();
    mod.union.set(path, union);
    for (const [n, hits] of lines) {
      stat.found += 1;
      if (hits > 0) stat.hit += 1;
      union.set(n, Boolean(union.get(n)) || hits > 0);
    }
  }
}

const pct = (hit, found) =>
  found ? `${((hit / found) * 100).toFixed(2).replace('.', ',')}%` : '—';
const labels = [...new Set(used.map((s) => `${s.app}:${s.label}`))];

console.log('# Độ phủ dòng theo module\n');
console.log(
  `${stamp('tools/evidence/coverage-modules.mjs')} Nguồn: ${used.map((s) => `\`${s.file}\``).join(', ')}.${missingSources.length ? ` Thiếu: ${missingSources.map((s) => `\`${s.file}\``).join(', ')}.` : ''} Cột "Gộp" tính một dòng là đã chạy nếu bất kỳ bộ nào chạy tới nó. Số dòng đếm theo lcov của V8.\n`,
);
console.log(
  `| Module | Cốt lõi | ${labels.join(' | ')} | Gộp | Dòng |\n|---|:-:|${labels.map(() => '---:').join('|')}|---:|---:|`,
);
const keys = [...modules.keys()].sort(
  (a, b) =>
    Number(core.has(b.split(':')[1])) - Number(core.has(a.split(':')[1])) || a.localeCompare(b),
);
const totals = { found: 0, hit: 0 };
for (const key of keys) {
  const mod = modules.get(key);
  const [app, name] = key.split(':');
  let found = 0;
  let hit = 0;
  for (const lines of mod.union.values()) {
    for (const ok of lines.values()) {
      found += 1;
      if (ok) hit += 1;
    }
  }
  if (core.has(name)) {
    totals.found += found;
    totals.hit += hit;
  }
  const cols = labels.map((label) => {
    const [a, l] = label.split(':');
    const s = a === app ? mod.per[l] : null;
    return s ? pct(s.hit, s.found) : '';
  });
  console.log(
    `| \`${key}\` | ${core.has(name) ? '✓' : ''} | ${cols.join(' | ')} | **${pct(hit, found)}** | ${found} |`,
  );
}
if (core.size)
  console.log(
    `\n**Gộp các module cốt lõi (${[...core].join(', ')}): ${pct(totals.hit, totals.found)}** trên ${totals.found} dòng.`,
  );
