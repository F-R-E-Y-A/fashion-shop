import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('GET /api/categories (UC-03.1)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('AC1 trả các danh mục gốc và con theo thứ tự', async () => {
    const res = await t.http.get('/api/categories').expect(200);
    const roots = res.body as Array<{ slug: string; children: Array<{ slug: string }> }>;
    expect(roots.map((root) => root.slug)).toEqual(['ao', 'quan', 'phu-kien']);
    expect(roots[0]?.children.map((child) => child.slug)).toEqual([
      'ao-thun',
      'ao-so-mi',
      'ao-khoac',
    ]);
  });

  it('AC2 chi tiết danh mục lá có breadcrumb gốc trước lá', async () => {
    const res = await t.http.get('/api/categories/ao-thun').expect(200);
    expect(res.body.breadcrumb).toEqual([
      { name: 'Áo', slug: 'ao' },
      { name: 'Áo thun', slug: 'ao-thun' },
    ]);
    expect(res.body.children).toEqual([]);
  });

  it('BR1 không trả danh mục ẩn trong cây hoặc chi tiết', async () => {
    await t.prisma.category.update({ where: { slug: 'ao-thun' }, data: { isActive: false } });
    const tree = await t.http.get('/api/categories').expect(200);
    const root = (tree.body as Array<{ slug: string; children: Array<{ slug: string }> }>).find(
      (item) => item.slug === 'ao',
    );
    expect(root?.children.some((child) => child.slug === 'ao-thun')).toBe(false);
    await t.http.get('/api/categories/ao-thun').expect(404);
  });

  it('BR1 danh mục con của gốc ẩn không mở trực tiếp', async () => {
    await t.prisma.category.update({ where: { slug: 'ao' }, data: { isActive: false } });
    await t.http.get('/api/categories/ao-thun').expect(404);
  });

  it('UC-03.1/AC5 slug không có trả ApiErrorBody', async () => {
    const res = await t.http.get('/api/categories/khong-co').expect(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });
});
