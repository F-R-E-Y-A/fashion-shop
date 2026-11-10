import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';
import { KeywordEmbedder } from './helpers/keyword-embedder.js';

/**
 * Tim kiem lai luat + ngu nghia qua HTTP (UC-03.2/AC5..AC9, ADR-048), bo nhung gia tat dinh thay
 * mo hinh that. Catalog duoc nhung o nen sau lan nap dau, nen moi bai doi toi khi ranking = hybrid.
 */
describe('GET /api/products?search: gop hang ngu nghia (UC-03.2, ADR-048)', () => {
  let t: TestApp;
  const embedder = new KeywordEmbedder();

  beforeAll(async () => {
    t = await createTestApp({ embedder });
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  const list = (query: Record<string, string | number | boolean>) =>
    t.http.get('/api/products').query({ pageSize: 60, log: false, ...query });

  /** Lan nap dau kich hoat nhung catalog o nen; doi toi khi chi muc san sang. */
  async function untilHybrid(query: Record<string, string>) {
    for (let i = 0; i < 40; i++) {
      const res = await list(query).expect(200);
      if (res.body.ranking === 'hybrid') return res;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('chi muc ngu nghia khong san sang');
  }

  it('UC-03.2/AC5 cau theo y dinh "áo mặc mùa lạnh" dua ao khoac len dau, ranking hybrid', async () => {
    const rules = await list({ search: 'áo mặc mùa lạnh' }).expect(200);
    const res = await untilHybrid({ search: 'áo mặc mùa lạnh' });
    const slugs: string[] = res.body.items.map((i: { slug: string }) => i.slug);
    expect(slugs.slice(0, 2).every((s) => s.startsWith('ao-khoac'))).toBe(true);
    expect(res.body.total).toBe(rules.body.total);
  });

  it('UC-03.2/AC8 hang cua hang khong ban ("váy dự tiệc") van tra rong khi bat ngu nghia', async () => {
    await untilHybrid({ search: 'áo mặc mùa lạnh' });
    const res = await list({ search: 'váy dự tiệc' }).expect(200);
    expect(res.body).toMatchObject({ items: [], total: 0, ranking: 'rules' });
  });

  it('UC-03.2/AC9 sap theo gia thi khong gop hang: ranking rules, gia tang dan', async () => {
    await untilHybrid({ search: 'áo mặc mùa lạnh' });
    const res = await list({ search: 'áo mặc mùa lạnh', sort: 'price_asc' }).expect(200);
    expect(res.body.ranking).toBe('rules');
    const prices = res.body.items.map((i: { price: string }) => Number(i.price));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('UC-03.2/AC7 bo nhung loi thi van 200, xep theo luat, ranking rules', async () => {
    await untilHybrid({ search: 'áo mặc mùa lạnh' });
    embedder.failing = true;
    try {
      const res = await list({ search: 'áo đi biển mùa hè' }).expect(200);
      expect(res.body.ranking).toBe('rules');
      expect(res.body.total).toBeGreaterThan(0);
    } finally {
      embedder.failing = false;
    }
  });
});
