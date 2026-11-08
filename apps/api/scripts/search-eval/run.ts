import 'reflect-metadata';

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * Danh gia do lien quan cua tim kiem: chi luat (ADR-019) so voi lai luat + ngu nghia (ADR-048), tren
 * CUNG bo cau co nhan san (cases.json) va cung CSDL. In bang Markdown kem lenh, commit, ngay.
 *
 *   npm run search:eval -w apps/api > ../tlcn-docs/minh-chung/danh-gia-tim-kiem-<ngay>.md
 *
 * Can CSDL local co bo san pham da duyet (DATABASE_URL trong .env) va mang de tai mo hinh lan dau.
 * Script tu bat SEARCH_SEMANTIC=local, khong doc gia tri trong .env.
 */
process.env.SEARCH_SEMANTIC = 'local';
// Danh gia chat luong khong de qua han cat ngang; do tre do rieng o duoi.
process.env.SEARCH_SEMANTIC_TIMEOUT_MS = '5000';

interface Case {
  q: string;
  kind: 'y-dinh' | 'luat' | 'am';
  relevant: string[];
}
interface Metrics {
  recall: number;
  mrr: number;
  ndcg: number;
}

const K = 10;
const { cases } = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')) as {
  cases: Case[];
};

const isRelevant = (slug: string, c: Case): boolean => c.relevant.some((p) => slug.startsWith(p));

function metrics(top: string[], c: Case, totalRelevant: number): Metrics {
  const rel = top.map((s) => isRelevant(s, c));
  const hits = rel.filter(Boolean).length;
  const first = rel.indexOf(true);
  const dcg = rel.reduce((a, r, i) => a + (r ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(totalRelevant, K) }, (_, i) => 1 / Math.log2(i + 2));
  return {
    recall: hits / Math.min(totalRelevant, K),
    mrr: first < 0 ? 0 : 1 / (first + 1),
    ndcg: dcg / ideal.reduce((a, b) => a + b, 0),
  };
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const f2 = (x: number): string => x.toFixed(2).replace('.', ',');

async function main(): Promise<void> {
  // Nap ban da bien dich (dist/): tsx (esbuild) khong sinh decorator metadata nen DI cua Nest khong
  // tim duoc tham so constructor neu nap thang src/. npm run search:eval build truoc.
  const { AppModule } = await import('../../dist/app.module.js');
  const { CatalogSearchService } =
    await import('../../dist/modules/products/search/catalog-search.service.js');
  const { ListProductsQuery } =
    await import('../../dist/modules/products/dto/list-products.query.js');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const service = app.get(CatalogSearchService, { strict: false });
  const query = (o: Partial<InstanceType<typeof ListProductsQuery>>) =>
    Object.assign(new ListProductsQuery(), { log: false, ...o });

  // Danh sach slug cua catalog de dem so san pham lien quan va kiem tien to trong cases.json.
  const catalog: string[] = [];
  for (let page = 1; ; page++) {
    const r = await service.list(query({ page, pageSize: 60 }), { semantic: false });
    catalog.push(...r.items.map((i) => i.slug));
    if (catalog.length >= r.total) break;
  }
  for (const c of cases) {
    for (const p of c.relevant) {
      if (!catalog.some((s) => s.startsWith(p)))
        throw new Error(`Tien to "${p}" khong khop san pham nao`);
    }
  }

  // Doi mo hinh nap va catalog nhung xong (lan dau tai mo hinh co the mat vai chuc giay).
  const started = Date.now();
  // Cau do co tu tu do: cau chi gom rang buoc (vd. "áo phông" = danh muc) khong bao gio gop hang (AC9).
  while ((await service.list(query({ search: 'áo mặc mùa lạnh' }))).ranking !== 'hybrid') {
    if (Date.now() - started > 300_000) throw new Error('Mo hinh khong san sang sau 5 phut');
    await new Promise((r) => setTimeout(r, 500));
  }
  const warmup = Date.now() - started;

  const rows: string[] = [];
  const byKind = new Map<string, { rules: Metrics[]; hybrid: Metrics[] }>();
  const negatives: string[] = [];
  const latency = { rules: [] as number[], hybrid: [] as number[] };
  for (const c of cases) {
    const run = async (semantic: boolean) => {
      const t = performance.now();
      const r = await service.list(query({ search: c.q, pageSize: K }), { semantic });
      (semantic ? latency.hybrid : latency.rules).push(performance.now() - t);
      return r;
    };
    const rules = await run(false);
    const hybrid = await run(true);
    if (c.kind === 'am') {
      const ok = (n: number) => (n === 0 ? '✓ 0' : `✗ ${n}`);
      negatives.push(`| ${c.q} | ${ok(rules.total)} | ${ok(hybrid.total)} | ${hybrid.ranking} |`);
      continue;
    }
    const total = catalog.filter((s) => isRelevant(s, c)).length;
    const mr = metrics(
      rules.items.map((i) => i.slug),
      c,
      total,
    );
    const mh = metrics(
      hybrid.items.map((i) => i.slug),
      c,
      total,
    );
    const slot = byKind.get(c.kind) ?? { rules: [], hybrid: [] };
    slot.rules.push(mr);
    slot.hybrid.push(mh);
    byKind.set(c.kind, slot);
    rows.push(
      `| ${c.q} | ${c.kind} | ${total} | ${f2(mr.recall)} → ${f2(mh.recall)} | ${f2(mr.mrr)} → ${f2(mh.mrr)} | ${f2(mr.ndcg)} → ${f2(mh.ndcg)} | ${hybrid.ranking}${hybrid.relaxed?.length ? ', đã nới' : ''} |`,
    );
  }
  // Do tre: lap lai ca bo cau ba lan khi cache cau truy van da nong va khi tat ngu nghia.
  for (let rep = 0; rep < 3; rep++) {
    for (const c of cases) {
      for (const semantic of [false, true]) {
        const t = performance.now();
        await service.list(query({ search: c.q, pageSize: K }), { semantic });
        (semantic ? latency.hybrid : latency.rules).push(performance.now() - t);
      }
    }
  }
  await app.close();

  const sha = execSync('git rev-parse --short HEAD').toString().trim();
  const dirty = execSync('git status --porcelain').toString().trim()
    ? ' (cây làm việc có thay đổi chưa commit)'
    : '';
  const model = process.env.SEARCH_EMBED_MODEL ?? 'Xenova/multilingual-e5-small';
  const out: string[] = [];
  out.push('# Đánh giá tìm kiếm: chỉ luật so với lai luật + ngữ nghĩa\n');
  out.push(
    `Xuất bằng \`npm run search:eval -w apps/api\` tại commit \`${sha}\`${dirty}, ngày ${new Date().toISOString().slice(0, 10)}. Mô hình \`${model}\` (q8), ${catalog.length} sản phẩm đang bán, ${cases.length} câu trong \`apps/api/scripts/search-eval/cases.json\` (nhãn gán trước khi chạy). Nạp mô hình và nhúng catalog: ${(warmup / 1000).toFixed(1)} s.\n`,
  );
  out.push(
    `Recall@${K} = số sản phẩm liên quan trong ${K} kết quả đầu / min(số sản phẩm liên quan, ${K}). MRR = 1/hạng của kết quả liên quan đầu tiên. nDCG@${K} nhị phân. Mỗi ô ghi \`chỉ luật → lai\`.\n`,
  );
  out.push(
    '## Tổng theo nhóm câu\n\n| Nhóm | Số câu | Recall@10 | MRR | nDCG@10 |\n|---|---:|---|---|---|',
  );
  for (const [kind, m] of byKind) {
    const avg = (xs: Metrics[], k: keyof Metrics) => f2(mean(xs.map((x) => x[k])));
    out.push(
      `| ${kind} | ${m.rules.length} | ${avg(m.rules, 'recall')} → ${avg(m.hybrid, 'recall')} | ${avg(m.rules, 'mrr')} → ${avg(m.hybrid, 'mrr')} | ${avg(m.rules, 'ndcg')} → ${avg(m.hybrid, 'ndcg')} |`,
    );
  }
  out.push(
    '\n## Câu âm: cửa hàng không bán, đúng là trả 0\n\n| Câu | Chỉ luật | Lai | ranking |\n|---|---|---|---|',
  );
  out.push(...negatives);
  out.push(
    `\n## Độ trễ trong tiến trình (\`CatalogSearchService.list\`, ${latency.rules.length} lượt mỗi cách)\n\n| Cách | p50 | p95 |\n|---|---:|---:|`,
  );
  out.push(
    `| Chỉ luật | ${latency.rules.length && pct(latency.rules, 50).toFixed(1)} ms | ${pct(latency.rules, 95).toFixed(1)} ms |`,
  );
  out.push(
    `| Lai | ${pct(latency.hybrid, 50).toFixed(1)} ms | ${pct(latency.hybrid, 95).toFixed(1)} ms |`,
  );
  out.push(
    '\n## Từng câu\n\n| Câu | Nhóm | Liên quan | Recall@10 | MRR | nDCG@10 | ranking |\n|---|---|---:|---|---|---|---|',
  );
  out.push(...rows);
  process.stdout.write(`${out.join('\n')}\n`);
}

main().catch((error: unknown) => {
  new Logger('search-eval').error(error);
  process.exit(1);
});
