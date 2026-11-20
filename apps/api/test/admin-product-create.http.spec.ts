import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { InventoryService } from '../src/modules/inventory/index.js';
import * as categoryLock from '../src/modules/products/category-visibility.js';
import { ProductsService } from '../src/modules/products/index.js';
import * as statusLock from '../src/modules/products/product-status.js';
import { UPLOAD_TICKET_TTL_MS } from '../src/modules/uploads/uploads.service.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';
import { FakeImageStorage } from './helpers/fake-image-storage.js';

describe('UC-04.2 Tạo sản phẩm mới từ Admin HTTP API (Đợt 4, PostgreSQL + FakeImageStorage)', () => {
  const storage = new FakeImageStorage();
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;
  let leafCategoryId: string;
  let parentCategoryId: string;
  let brandId: string;
  let colorId: string;
  let sizeId: string;

  const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
  const customerAuth = () => ({ Authorization: `Bearer ${customerToken}` });

  async function issueUploadedKey() {
    const res = await t.http
      .post('/api/admin/products/upload-tickets')
      .set(adminAuth())
      .expect(200);
    const key = res.body.key as string;
    storage.put(key, {
      format: 'jpg',
      bytes: 1024,
    });
    return key;
  }

  function makePayload(overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      name: 'Áo khoác dạ dáng dài Đợt 4',
      slug: 'ao-khoac-da-dang-dai-dot-4',
      categoryId: leafCategoryId,
      brandId,
      description: 'Chất liệu dạ ép cao cấp',
      material: 'Dạ lông cừu',
      careInstructions: 'Giặt khô',
      audience: 'nu',
      isFeatured: true,
      variants: [
        {
          id: randomUUID(),
          colorId,
          sizeId,
          sku: 'DOT4-DA-DEN-M',
          listPrice: '1290000',
          salePrice: '990000',
          isActive: true,
        },
      ],
      ...overrides,
    };
  }

  beforeAll(async () => {
    t = await createTestApp({ imageStorage: storage });
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    storage.reset();
    await resetDatabase(t.prisma);
    await t.resetRateLimits();

    const jwt = t.app.get(JwtService);
    const adminUser = await t.prisma.user.create({
      data: {
        email: 'admin.create@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    await grantAdminRole(t.prisma, adminUser.email);
    adminToken = await jwt.signAsync({ sub: adminUser.id, ver: adminUser.authVersion });

    const customerUser = await t.prisma.user.create({
      data: {
        email: 'customer.create@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    customerToken = await jwt.signAsync({ sub: customerUser.id, ver: customerUser.authVersion });

    const [parentCat, leafCat, brand, color, size] = await Promise.all([
      t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao' } }),
      t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-thun' } }),
      t.prisma.brand.findFirstOrThrow(),
      t.prisma.color.findUniqueOrThrow({ where: { code: 'den' } }),
      t.prisma.size.findUniqueOrThrow({ where: { code: 'M' } }),
    ]);
    parentCategoryId = parentCat.id;
    leafCategoryId = leafCat.id;
    brandId = brand.id;
    colorId = color.id;
    sizeId = size.id;
  });

  it('UC-04.2/AC53 kiểm ADMIN trước validation (401/403, no-store) và GET /create-options trả brands, colors, sizes', async () => {
    await t.http.get('/api/admin/products/create-options').expect(401);
    await t.http.get('/api/admin/products/create-options').set(customerAuth()).expect(403);
    await t.http.post('/api/admin/products').send({}).expect(401);
    await t.http.post('/api/admin/products').set(customerAuth()).send({}).expect(403);

    const res = await t.http.get('/api/admin/products/create-options').set(adminAuth()).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.brands.length).toBeGreaterThan(0);
    expect(res.body.colors.length).toBeGreaterThan(0);
    expect(res.body.sizes.length).toBeGreaterThan(0);
  });

  it('UC-04.2/AC54 tạo sản phẩm ẩn mặc định (không cần ảnh ngay), ẩn ngoài storefront và không tự tạo tồn kho', async () => {
    const payload = makePayload();
    const res = await t.http.post('/api/admin/products').set(adminAuth()).send(payload).expect(201);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      id: payload.id,
      slug: payload.slug,
      priceFrom: '990000',
      isActive: false,
      adminDisabled: true,
      isCustom: true,
      statusVersion: 0,
      images: [],
    });
    expect(res.body.createPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.variants[0]).toMatchObject({
      sku: 'DOT4-DA-DEN-M',
      isCustom: true,
      adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
    });

    // Storefront chưa thấy sản phẩm ẩn
    await t.http.get(`/api/products/${payload.slug}`).expect(404);
    const listRes = await t.http.get('/api/products?pageSize=60').expect(200);
    expect(listRes.body.items.some((p: { id: string }) => p.id === payload.id)).toBe(false);

    // Inventory giữ UNKNOWN, không tự ghi bảng inventory
    const variantId = res.body.variants[0].id as string;
    const invRow = await t.prisma.inventory.findUnique({ where: { productVariantId: variantId } });
    expect(invRow).toBeNull();
    const invService = t.app.get(InventoryService);
    const statuses = await invService.getStockStatuses([
      { id: payload.id, variantIds: [variantId] },
    ]);
    expect(statuses.get(payload.id)).toBe('UNKNOWN');
  });

  it('UC-04.2/AC55 gửi lại sau timeout với cùng UUID + payload (có ảnh đã attach và sản phẩm đã bị sửa) vẫn replay thành công; khác payload trả 409', async () => {
    const key = await issueUploadedKey();
    const payload = makePayload({
      images: [{ id: randomUUID(), key, alt: 'Ảnh đầu' }],
    });

    const first = await t.http
      .post('/api/admin/products')
      .set(adminAuth())
      .send(payload)
      .expect(201);

    // Ticket đã được tiêu thụ khỏi media_uploads
    expect(await t.prisma.mediaUpload.findUnique({ where: { storageKey: key } })).toBeNull();

    // Admin khác sửa nội dung sản phẩm vừa tạo trước khi retry timeout tới
    await t.http
      .patch(`/api/admin/products/${payload.id}/content`)
      .set(adminAuth())
      .send({
        name: 'Tên mới đã cập nhật',
        description: 'Mô tả mới',
        material: 'Lụa mới',
        careInstructions: null,
        expectedVersion: 0,
      })
      .expect(200);

    // Gửi lại đúng payload tạo ban đầu -> vẫn replay thành công, không lỗi INVALID_MEDIA
    const replay = await t.http
      .post('/api/admin/products')
      .set(adminAuth())
      .send(payload)
      .expect(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.name).toBe('Tên mới đã cập nhật');
    expect(replay.body.createPayloadHash).toBe(first.body.createPayloadHash);

    // Cùng UUID nhưng khác payload -> 409 IDEMPOTENCY_PAYLOAD_MISMATCH
    const conflict = await t.http
      .post('/api/admin/products')
      .set(adminAuth())
      .send({ ...payload, name: 'Tên hoàn toàn khác' })
      .expect(409);
    expect(conflict.body.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('UC-04.2/AC55 hai request cùng UUID chạy đồng thời với gate khóa thật: chỉ tạo 1 sản phẩm và attach 1 lần', async () => {
    const key = await issueUploadedKey();
    const payload = makePayload({
      images: [{ id: randomUUID(), key, alt: 'Ảnh race' }],
    });

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let markEntered!: () => void;
    const entered = new Promise<void>((r) => {
      markEntered = r;
    });

    const origLock = categoryLock.lockCategory;
    let calls = 0;
    const spy = vi.spyOn(categoryLock, 'lockCategory').mockImplementation(async (...args) => {
      const cat = await origLock(...args);
      if (++calls === 1) {
        markEntered();
        await gate;
      }
      return cat;
    });

    const req1 = Promise.resolve(t.http.post('/api/admin/products').set(adminAuth()).send(payload));
    await entered;
    const req2 = Promise.resolve(t.http.post('/api/admin/products').set(adminAuth()).send(payload));

    let r1: Awaited<typeof req1>;
    let r2: Awaited<typeof req2>;
    try {
      await vi.waitFor(
        async () => {
          const waiting = await t.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
          `;
          expect(Number(waiting[0]?.count)).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      release();
      [r1, r2] = await Promise.all([req1, req2]);
    } finally {
      spy.mockRestore();
    }

    expect(r1!.status).toBe(201);
    expect(r2!.status).toBe(201);
    expect(r1!.body.id).toBe(payload.id);
    expect(r2!.body.id).toBe(payload.id);
    expect(await t.prisma.product.count({ where: { id: payload.id } })).toBe(1);
    expect(await t.prisma.productImage.count({ where: { productId: payload.id } })).toBe(1);
  });

  it('UC-04.2/AC55 hai request cùng UUID nhưng khác payload chạy đồng thời: một tạo, một nhận 409', async () => {
    const payloadA = makePayload({ name: 'Sản phẩm A', slug: 'san-pham-a' });
    const payloadB = { ...payloadA, name: 'Sản phẩm B', slug: 'san-pham-b' };

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let markEntered!: () => void;
    const entered = new Promise<void>((r) => {
      markEntered = r;
    });

    const origLock = categoryLock.lockCategory;
    let calls = 0;
    const spy = vi.spyOn(categoryLock, 'lockCategory').mockImplementation(async (...args) => {
      const cat = await origLock(...args);
      if (++calls === 1) {
        markEntered();
        await gate;
      }
      return cat;
    });

    const req1 = Promise.resolve(
      t.http.post('/api/admin/products').set(adminAuth()).send(payloadA),
    );
    await entered;
    const req2 = Promise.resolve(
      t.http.post('/api/admin/products').set(adminAuth()).send(payloadB),
    );

    let responses: [Awaited<typeof req1>, Awaited<typeof req2>];
    try {
      await vi.waitFor(
        async () => {
          const waiting = await t.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
          `;
          expect(Number(waiting[0]?.count)).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      release();
      responses = await Promise.all([req1, req2]);
    } finally {
      spy.mockRestore();
    }

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const conflictRes = responses.find((r) => r.status === 409)!;
    expect(conflictRes.body.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });

  it('UC-04.2/AC56 từ chối danh mục cha (422 CATEGORY_NOT_LEAF) và đồng bộ khóa khi thêm con đồng thời', async () => {
    await t.http
      .post('/api/admin/products')
      .set(adminAuth())
      .send(makePayload({ categoryId: parentCategoryId }))
      .expect(422);

    // Tạo một danh mục gốc trống rồi đua tạo sản phẩm vào đó vs gắn con vào đó
    const freshCatRes = await t.http
      .post('/api/admin/categories')
      .set(adminAuth())
      .send({ id: randomUUID(), name: 'Danh mục lá mới', slug: 'danh-muc-la-moi' })
      .expect(201);
    const freshCatId = freshCatRes.body.id as string;

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let markEntered!: () => void;
    const entered = new Promise<void>((r) => {
      markEntered = r;
    });

    const origLock = categoryLock.lockCategory;
    let lockedOnce = false;
    const spy = vi.spyOn(categoryLock, 'lockCategory').mockImplementation(async (...args) => {
      const cat = await origLock(...args);
      if (!lockedOnce) {
        lockedOnce = true;
        markEntered();
        await gate;
      }
      return cat;
    });

    const createProdReq = Promise.resolve(
      t.http
        .post('/api/admin/products')
        .set(adminAuth())
        .send(
          makePayload({
            categoryId: freshCatId,
            slug: 'race-leaf-prod',
            variants: [
              { id: randomUUID(), colorId, sizeId, sku: 'RACE-LEAF-1', listPrice: '100000' },
            ],
          }),
        ),
    );
    await entered;
    const addChildReq = Promise.resolve(
      t.http.post('/api/admin/categories').set(adminAuth()).send({
        id: randomUUID(),
        name: 'Danh mục con mới',
        slug: 'danh-muc-con-moi',
        parentId: freshCatId,
      }),
    );

    let prodRes: Awaited<typeof createProdReq>;
    let childRes: Awaited<typeof addChildReq>;
    try {
      await vi.waitFor(
        async () => {
          const waiting = await t.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
          `;
          expect(Number(waiting[0]?.count)).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      release();
      [prodRes, childRes] = await Promise.all([createProdReq, addChildReq]);
    } finally {
      spy.mockRestore();
    }

    // Bên thắng tạo sản phẩm trước -> thêm con bị chặn 422
    expect(prodRes!.status).toBe(201);
    expect(childRes!.status).toBe(422);
    expect(await t.prisma.category.count({ where: { parentId: freshCatId } })).toBe(0);
  });

  it('UC-04.2/AC57 kiểm trùng slug/SKU và từ chối ticket product quá hạn 1 giờ, rollback sạch không tiêu thụ ticket hợp lệ', async () => {
    const expiredKey = await issueUploadedKey();
    const validKey = await issueUploadedKey();

    await t.prisma.mediaUpload.update({
      where: { storageKey: expiredKey },
      data: { createdAt: new Date(Date.now() - UPLOAD_TICKET_TTL_MS - 60_000) },
    });

    const badPayload = makePayload({
      images: [
        { id: randomUUID(), key: validKey, alt: 'Hợp lệ' },
        { id: randomUUID(), key: expiredKey, alt: 'Quá hạn' },
      ],
    });
    const failed = await t.http
      .post('/api/admin/products')
      .set(adminAuth())
      .send(badPayload)
      .expect(422);
    expect(failed.body.code).toBe('INVALID_MEDIA');

    // Rollback sạch: không tạo Product, không tiêu thụ ticket hợp lệ
    expect(await t.prisma.product.findUnique({ where: { id: badPayload.id } })).toBeNull();
    const stillPending = await t.prisma.mediaUpload.findUnique({
      where: { storageKey: validKey },
    });
    expect(stillPending?.status).toBe('PENDING');

    // Tạo thành công bằng validKey, sau đó thử tạo trùng slug / trùng SKU -> 409
    const good = makePayload({
      images: [{ id: randomUUID(), key: validKey, alt: 'Hợp lệ' }],
    });
    await t.http.post('/api/admin/products').set(adminAuth()).send(good).expect(201);

    const dupSlug = await t.http
      .post('/api/admin/products')
      .set(adminAuth())
      .send(
        makePayload({
          slug: good.slug,
          variants: [{ id: randomUUID(), colorId, sizeId, sku: 'KHAC-SKU-1', listPrice: '100000' }],
        }),
      )
      .expect(409);
    expect(dupSlug.body.code).toBe('SLUG_EXISTS');

    const dupSku = await t.http
      .post('/api/admin/products')
      .set(adminAuth())
      .send(makePayload({ slug: 'slug-hoan-toan-moi' }))
      .expect(409);
    expect(dupSku.body.code).toBe('SKU_EXISTS');
  });

  it('UC-04.2/AC58 quy tắc công bố sản phẩm tạo tay: chặn thiếu ảnh, thiếu biến thể active, danh mục lá/cha ẩn; và race với ẩn danh mục', async () => {
    // 1. Tạo sản phẩm không ảnh -> không thể công bố
    const created = await t.http
      .post('/api/admin/products')
      .set(adminAuth())
      .send(makePayload())
      .expect(201);
    const productId = created.body.id as string;

    const noImg = await t.http
      .patch(`/api/admin/products/${productId}/status`)
      .set(adminAuth())
      .send({ adminDisabled: false, expectedVersion: 0 })
      .expect(422);
    expect(noImg.body.code).toBe('NO_IMAGES_FOR_ACTIVE_PRODUCT');

    // 2. Bổ sung 1 ảnh qua API Đợt 3
    const key = await issueUploadedKey();
    await t.http
      .put(`/api/admin/products/${productId}/images`)
      .set(adminAuth())
      .send({ expectedVersion: 0, items: [{ id: randomUUID(), key, alt: 'Ảnh công bố' }] })
      .expect(200);

    // 3. Ẩn danh mục cha -> chặn công bố
    await t.prisma.category.update({ where: { id: parentCategoryId }, data: { isActive: false } });
    const hiddenParent = await t.http
      .patch(`/api/admin/products/${productId}/status`)
      .set(adminAuth())
      .send({ adminDisabled: false, expectedVersion: 0 })
      .expect(422);
    expect(hiddenParent.body.code).toBe('CATEGORY_HIDDEN_FOR_ACTIVE_PRODUCT');

    // 4. Bật lại cha, ẩn danh mục lá -> chặn công bố
    await t.prisma.category.update({ where: { id: parentCategoryId }, data: { isActive: true } });
    await t.prisma.category.update({ where: { id: leafCategoryId }, data: { isActive: false } });
    const hiddenLeaf = await t.http
      .patch(`/api/admin/products/${productId}/status`)
      .set(adminAuth())
      .send({ adminDisabled: false, expectedVersion: 0 })
      .expect(422);
    expect(hiddenLeaf.body.code).toBe('CATEGORY_HIDDEN_FOR_ACTIVE_PRODUCT');

    // 5. Bật lại danh mục lá -> công bố thành công và hiện ngoài storefront
    await t.prisma.category.update({ where: { id: leafCategoryId }, data: { isActive: true } });
    const published = await t.http
      .patch(`/api/admin/products/${productId}/status`)
      .set(adminAuth())
      .send({ adminDisabled: false, expectedVersion: 0 })
      .expect(200);
    expect(published.body).toMatchObject({
      adminDisabled: false,
      isActive: true,
      statusVersion: 1,
    });
    await t.http.get(`/api/products/${created.body.slug}`).expect(200);

    // 6. Race: tắt lại (adminDisabled=true), rồi đua công bố lại vs ẩn danh mục lá
    await t.http
      .patch(`/api/admin/products/${productId}/status`)
      .set(adminAuth())
      .send({ adminDisabled: true, expectedVersion: 1 })
      .expect(200);

    const catBefore = await t.prisma.category.findUniqueOrThrow({ where: { id: leafCategoryId } });
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let markEntered!: () => void;
    const entered = new Promise<void>((r) => {
      markEntered = r;
    });
    const origStatusLock = statusLock.lockProductStatus;
    let lockedStatus = false;
    const spy = vi.spyOn(statusLock, 'lockProductStatus').mockImplementation(async (...args) => {
      const row = await origStatusLock(...args);
      if (!lockedStatus) {
        lockedStatus = true;
        markEntered();
        await gate;
      }
      return row;
    });

    const pubReq = Promise.resolve(
      t.http
        .patch(`/api/admin/products/${productId}/status`)
        .set(adminAuth())
        .send({ adminDisabled: false, expectedVersion: 2 }),
    );
    await entered;
    const hideCatReq = Promise.resolve(
      t.http
        .patch(`/api/admin/categories/${leafCategoryId}/visibility`)
        .set(adminAuth())
        .send({ isActive: false, expectedUpdatedAt: catBefore.updatedAt.toISOString() }),
    );

    let pubRes: Awaited<typeof pubReq>;
    let hideRes: Awaited<typeof hideCatReq>;
    try {
      await vi.waitFor(
        async () => {
          const waiting = await t.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT count(*) FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'
          `;
          expect(Number(waiting[0]?.count)).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      release();
      [pubRes, hideRes] = await Promise.all([pubReq, hideCatReq]);
    } finally {
      spy.mockRestore();
    }

    expect(pubRes!.status).toBe(200);
    expect(hideRes!.status).toBe(200);
    // Dù mở bán thắng khóa trước rồi danh mục mới ẩn sau, storefront vẫn không lộ sản phẩm thuộc danh mục đã ẩn
    await t.http.get(`/api/products/${created.body.slug}`).expect(404);
  });

  it('UC-04.2/AC59 importProducts không được ghi đè sản phẩm tạo tay isCustom = true nếu trùng SKU', async () => {
    const payload = makePayload({ name: 'Áo thủ công giữ nguyên' });
    await t.http.post('/api/admin/products').set(adminAuth()).send(payload).expect(201);

    const importer = t.app.get(ProductsService);
    const [result] = await importer.importProducts([
      {
        sourceKey: 'crawl:collide-custom',
        name: 'Tên từ nguồn crawler',
        categorySlug: 'ao-so-mi',
        images: [{ url: 'https://example.test/from-crawl.jpg' }],
        variants: [
          {
            sku: 'DOT4-DA-DEN-M',
            color: { code: 'den', name: 'Đen' },
            sizeCode: 'M',
            listPrice: '500000',
          },
        ],
      },
    ]);

    expect(result).toMatchObject({
      sourceKey: 'crawl:collide-custom',
      status: 'failed',
      reason: 'SKU_CONFLICT',
    });

    const after = await t.prisma.product.findUniqueOrThrow({ where: { id: payload.id } });
    expect(after.name).toBe('Áo thủ công giữ nguyên');
    expect(after.categoryId).toBe(leafCategoryId);
    expect(after.isActive).toBe(false);
  });
});
