import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PRODUCTS, skuOf } from '../prisma/seed/catalog.seed.js';
import type { ImportProductRow } from '../src/modules/products/index.js';
import { ProductsService } from '../src/modules/products/index.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

function makeRow(tag: string, overrides: Partial<ImportProductRow> = {}): ImportProductRow {
  return {
    sourceKey: `test:${tag}`,
    name: `Áo thử ${tag}`,
    categorySlug: 'ao-thun',
    images: [{ url: `https://example.test/${tag}.jpg` }],
    variants: [
      {
        sku: `IMPORT-${tag}-DEN-M`,
        color: { code: 'den', name: 'Đen' },
        sizeCode: 'M',
        listPrice: '100000',
      },
    ],
    ...overrides,
  };
}

describe('ProductsService.importProducts — M2', () => {
  let t: TestApp;
  let service: ProductsService;

  beforeAll(async () => {
    t = await createTestApp();
    service = t.app.get(ProductsService);
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('chạy lại cùng SKU: created rồi updated, giữ id và slug', async () => {
    const countBefore = await t.prisma.product.count();
    const first = (await service.importProducts([makeRow('repeat')]))[0];
    if (!first || first.status !== 'created') throw new Error('Import đầu tiên phải tạo');

    const second = (await service.importProducts([makeRow('repeat', { name: 'Tên đã đổi' })]))[0];
    expect(second).toMatchObject({
      status: 'updated',
      productId: first.productId,
      slug: first.slug,
    });
    expect(await t.prisma.product.count()).toBe(countBefore + 1);
    expect((await t.prisma.product.findUnique({ where: { id: first.productId } }))?.name).toBe(
      'Tên đã đổi',
    );
  });

  it('dòng danh mục cha thất bại, hai dòng bên cạnh vẫn vào đúng thứ tự', async () => {
    const result = await service.importProducts([
      makeRow('first'),
      makeRow('bad-category', { categorySlug: 'ao' }),
      makeRow('last'),
    ]);
    expect(result.map((item) => item.status)).toEqual(['created', 'failed', 'created']);
    expect(result[1]).toMatchObject({
      sourceKey: 'test:bad-category',
      reason: 'CATEGORY_NOT_FOUND',
    });
  });

  it('biến thể vắng ở lần nạp sau chỉ bị tắt, không bị xóa', async () => {
    const extra = {
      sku: 'IMPORT-variants-TRANG-M',
      color: { code: 'trang', name: 'Trắng' },
      sizeCode: 'M',
      listPrice: '100000',
    };
    const full = makeRow('variants');
    full.variants.push(extra);
    await service.importProducts([full]);
    await service.importProducts([{ ...full, variants: full.variants.slice(0, 1) }]);
    const old = await t.prisma.productVariant.findUnique({ where: { sku: extra.sku } });
    expect(old).not.toBeNull();
    expect(old?.isActive).toBe(false);
  });

  it('hai SKU thuộc hai sản phẩm khác nhau trả SKU_CONFLICT', async () => {
    const first = PRODUCTS[0];
    const second = PRODUCTS[1];
    const row = makeRow('conflict', {
      variants: [
        {
          sku: skuOf(first, first.colors[0], first.sizes[0]),
          color: { code: 'den', name: 'Đen' },
          sizeCode: 'M',
          listPrice: '100000',
        },
        {
          sku: skuOf(second, second.colors[0], second.sizes[0]),
          color: { code: 'trang', name: 'Trắng' },
          sizeCode: 'M',
          listPrice: '100000',
        },
      ],
    });
    expect((await service.importProducts([row]))[0]).toMatchObject({
      status: 'failed',
      reason: 'SKU_CONFLICT',
    });
  });

  it('cỡ chưa seed trả SIZE_NOT_FOUND', async () => {
    const row = makeRow('size');
    const variant = row.variants[0];
    if (!variant) throw new Error('Fixture thiếu biến thể');
    variant.sizeCode = 'XXXL';
    expect((await service.importProducts([row]))[0]).toMatchObject({
      status: 'failed',
      reason: 'SIZE_NOT_FOUND',
    });
  });

  it('ảnh có colorCode ngoài biến thể thành ảnh chung', async () => {
    const row = makeRow('image', {
      images: [{ url: 'https://example.test/image.jpg', colorCode: 'khong-co' }],
    });
    const result = (await service.importProducts([row]))[0];
    if (!result || result.status !== 'created') throw new Error('Dòng phải được tạo');
    const image = await t.prisma.productImage.findUnique({
      where: { productId_sortOrder: { productId: result.productId, sortOrder: 0 } },
    });
    expect(image?.colorId).toBeNull();
  });

  it('brand và color đã có giữ tên và hex trong DB', async () => {
    const brandBefore = await t.prisma.brand.findUnique({ where: { slug: 'freya-basic' } });
    const colorBefore = await t.prisma.color.findUnique({ where: { code: 'den' } });
    const row = makeRow('names', {
      brand: { slug: 'freya-basic', name: 'Tên không được ghi đè' },
      variants: [
        {
          sku: 'IMPORT-names-DEN-M',
          color: { code: 'den', name: 'Tên mới', hex: '#ABCDEF' },
          sizeCode: 'M',
          listPrice: '100000',
        },
      ],
    });
    expect((await service.importProducts([row]))[0]?.status).toBe('created');
    expect(await t.prisma.brand.findUnique({ where: { slug: 'freya-basic' } })).toMatchObject({
      name: brandBefore?.name,
    });
    expect(await t.prisma.color.findUnique({ where: { code: 'den' } })).toMatchObject({
      name: colorBefore?.name,
      hex: colorBefore?.hex,
    });
  });

  it('nạp lại cập nhật priceFrom và xóa ảnh thừa theo sortOrder', async () => {
    const row = makeRow('reconcile', {
      images: [
        { url: 'https://example.test/old-0.jpg' },
        { url: 'https://example.test/old-1.jpg' },
      ],
      variants: [
        {
          sku: 'IMPORT-reconcile-DEN-M',
          color: { code: 'den', name: 'Đen' },
          sizeCode: 'M',
          listPrice: '200000',
          salePrice: '150000',
        },
      ],
    });
    const created = (await service.importProducts([row]))[0];
    if (!created || created.status !== 'created') throw new Error('Dòng phải được tạo');

    const firstVariant = row.variants[0];
    if (!firstVariant) throw new Error('Fixture thiếu biến thể');
    const updated: ImportProductRow = {
      ...row,
      images: [{ url: 'https://example.test/new-0.jpg' }],
      variants: [{ ...firstVariant, listPrice: '220000', salePrice: undefined }],
    };
    expect((await service.importProducts([updated]))[0]?.status).toBe('updated');
    const product = await t.prisma.product.findUnique({ where: { id: created.productId } });
    const images = await t.prisma.productImage.findMany({
      where: { productId: created.productId },
    });
    expect(Number(product?.priceFrom)).toBe(220000);
    expect(images).toHaveLength(1);
    expect(images[0]?.url).toBe('https://example.test/new-0.jpg');
  });
});
