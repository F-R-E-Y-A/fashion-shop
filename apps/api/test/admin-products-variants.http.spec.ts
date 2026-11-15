import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedCatalog } from '../prisma/seed/catalog.seed.js';
import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { OrdersService } from '../src/modules/orders/index.js';
import { ProductsService } from '../src/modules/products/products.service.js';
import { seedTestCatalogProducts } from './fixtures/catalog-products.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('Admin Product Variants & Pricing HTTP API (Đợt 2)', () => {
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;
  let customerUserId: string;

  const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
  const customerAuth = () => ({ Authorization: `Bearer ${customerToken}` });

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
    await seedCatalog(t.prisma);
    await seedTestCatalogProducts(t.prisma);

    const adminUser = await t.prisma.user.create({
      data: {
        email: 'admin.variants@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    await grantAdminRole(t.prisma, adminUser.email);
    adminToken = await t.app
      .get(JwtService)
      .signAsync({ sub: adminUser.id, ver: adminUser.authVersion });

    const customerUser = await t.prisma.user.create({
      data: {
        email: 'customer.variants@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    customerUserId = customerUser.id;
    customerToken = await t.app
      .get(JwtService)
      .signAsync({ sub: customerUser.id, ver: customerUser.authVersion });
  });

  async function waitForBlockedQueries(expectedBlockedCount = 1, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await t.prisma.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int as count
        FROM pg_locks l
        JOIN pg_stat_activity a ON l.pid = a.pid
        WHERE NOT l.granted AND a.state = 'active'
      `;
      const count = res[0]?.count ?? 0;
      if (count >= expectedBlockedCount) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timeout waiting for ${expectedBlockedCount} blocked queries in pg_locks`);
  }

  async function prepareCheckout(variantId: string) {
    const province = await t.prisma.administrativeArea.create({
      data: { code: `P-${randomUUID().slice(0, 8)}`, name: 'Tỉnh test', level: 'PROVINCE' },
    });
    const commune = await t.prisma.administrativeArea.create({
      data: {
        code: `C-${randomUUID().slice(0, 8)}`,
        name: 'Phường test',
        level: 'COMMUNE',
        parentId: province.id,
      },
    });
    const address = await t.prisma.address.create({
      data: {
        userId: customerUserId,
        administrativeAreaId: commune.id,
        recipientName: 'Khách test',
        phone: '0901234567',
        detailAddress: 'Địa chỉ test',
        isDefault: true,
      },
    });
    await seedShipping(t.prisma);
    await t.prisma.inventory.upsert({
      where: { productVariantId: variantId },
      create: { productVariantId: variantId, quantityOnHand: 20 },
      update: { quantityOnHand: 20 },
    });
    await t.http
      .post('/api/cart/items')
      .set(customerAuth())
      .send({ variantId, quantity: 1 })
      .expect(201);
    return address.id;
  }

  const sendPostAsync = (path: string, body: unknown) =>
    new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      t.http
        .post(path)
        .set(adminAuth())
        .send(body as object)
        .end((err, res) =>
          err
            ? reject(err)
            : resolve(res as unknown as { status: number; body: Record<string, unknown> }),
        );
    });

  const sendPatchAsync = (path: string, body: unknown) =>
    new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      t.http
        .patch(path)
        .set(adminAuth())
        .send(body as object)
        .end((err, res) =>
          err
            ? reject(err)
            : resolve(res as unknown as { status: number; body: Record<string, unknown> }),
        );
    });

  describe('1. Phân quyền và Bảo mật', () => {
    it('từ chối yêu cầu chưa đăng nhập bằng 401', async () => {
      await t.http.get('/api/admin/products/variant-options').expect(401);
      await t.http.post(`/api/admin/products/${randomUUID()}/variants`).send({}).expect(401);
      await t.http
        .patch(`/api/admin/products/${randomUUID()}/variants/${randomUUID()}`)
        .send({})
        .expect(401);
    });

    it('từ chối người dùng CUSTOMER bằng 403', async () => {
      await t.http.get('/api/admin/products/variant-options').set(customerAuth()).expect(403);
      await t.http
        .post(`/api/admin/products/${randomUUID()}/variants`)
        .set(customerAuth())
        .send({})
        .expect(403);
      await t.http
        .patch(`/api/admin/products/${randomUUID()}/variants/${randomUUID()}`)
        .set(customerAuth())
        .send({})
        .expect(403);
    });
  });

  describe('2. Endpoint GET /api/admin/products/variant-options', () => {
    it('trả về danh sách màu và cỡ khả dụng', async () => {
      const res = await t.http
        .get('/api/admin/products/variant-options')
        .set(adminAuth())
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(Array.isArray(res.body.colors)).toBe(true);
      expect(Array.isArray(res.body.sizes)).toBe(true);
      expect(res.body.colors.length).toBeGreaterThan(0);
      expect(res.body.sizes.length).toBeGreaterThan(0);
      expect(res.body.colors[0]).toHaveProperty('code');
      expect(res.body.sizes[0]).toHaveProperty('code');
    });
  });

  describe('3. Endpoint POST /api/admin/products/:id/variants', () => {
    it('thêm biến thể mới thành công, gán isCustom=true, adminManagedFields và cập nhật priceFrom', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });
      const color = await t.prisma.color.findFirstOrThrow({ where: { code: 'den' } });
      const sizeXl = await t.prisma.size.findFirstOrThrow({ where: { code: 'XL' } });

      const newId = randomUUID();
      const newSku = 'ATN-COTTON-DEN-XL-TEST';

      const res = await t.http
        .post(`/api/admin/products/${product.id}/variants`)
        .set(adminAuth())
        .send({
          id: newId,
          colorId: color.id,
          sizeId: sizeXl.id,
          sku: newSku,
          listPrice: '299000.00',
          salePrice: '149000.00',
          isActive: true,
        })
        .expect(201);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({
        id: newId,
        sku: newSku,
        listPrice: '299000',
        salePrice: '149000',
        isActive: true,
        isCustom: true,
        adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
      });

      // Kiểm tra DB
      const variantInDb = await t.prisma.productVariant.findUniqueOrThrow({ where: { id: newId } });
      expect(variantInDb.isCustom).toBe(true);
      expect(variantInDb.adminManagedFields).toEqual(['listPrice', 'salePrice', 'isActive']);

      // priceFrom của sản phẩm cha được tính lại
      const updatedProduct = await t.prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(updatedProduct.priceFrom.toString()).toBe('149000');
    });

    it('idempotency: gửi lại cùng id + cùng payload trả kết quả thành công replay', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
      });
      const color = await t.prisma.color.findFirstOrThrow({ where: { code: 'den' } });
      const sizeXl = await t.prisma.size.findFirstOrThrow({ where: { code: 'XL' } });

      const newId = randomUUID();
      const payload = {
        id: newId,
        colorId: color.id,
        sizeId: sizeXl.id,
        sku: 'ATN-IDEMPOTENT-TEST',
        listPrice: '299000.00',
        salePrice: null,
        isActive: true,
      };

      const res1 = await t.http
        .post(`/api/admin/products/${product.id}/variants`)
        .set(adminAuth())
        .send(payload)
        .expect(201);

      const res2 = await t.http
        .post(`/api/admin/products/${product.id}/variants`)
        .set(adminAuth())
        .send(payload)
        .expect(201);

      expect(res1.body.id).toBe(newId);
      expect(res2.body.id).toBe(newId);
    });

    it('idempotency: cùng id nhưng khác payload trả 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
      });
      const color = await t.prisma.color.findFirstOrThrow({ where: { code: 'den' } });
      const sizeXl = await t.prisma.size.findFirstOrThrow({ where: { code: 'XL' } });

      const newId = randomUUID();
      await t.http
        .post(`/api/admin/products/${product.id}/variants`)
        .set(adminAuth())
        .send({
          id: newId,
          colorId: color.id,
          sizeId: sizeXl.id,
          sku: 'ATN-MISMATCH-1',
          listPrice: '299000.00',
        })
        .expect(201);

      const conflictRes = await t.http
        .post(`/api/admin/products/${product.id}/variants`)
        .set(adminAuth())
        .send({
          id: newId,
          colorId: color.id,
          sizeId: sizeXl.id,
          sku: 'ATN-MISMATCH-DIFFERENT', // khác SKU
          listPrice: '299000.00',
        })
        .expect(409);

      expect(conflictRes.body.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    });

    it('chặn trùng SKU khác id bằng 409 SKU_EXISTS', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });
      const existingSku = product.variants[0]!.sku;
      const color = await t.prisma.color.findFirstOrThrow({ where: { code: 'den' } });
      const sizeXl = await t.prisma.size.findFirstOrThrow({ where: { code: 'XL' } });

      const res = await t.http
        .post(`/api/admin/products/${product.id}/variants`)
        .set(adminAuth())
        .send({
          id: randomUUID(),
          colorId: color.id,
          sizeId: sizeXl.id,
          sku: existingSku, // Trùng SKU
          listPrice: '299000.00',
        })
        .expect(409);

      expect(res.body.code).toBe('SKU_EXISTS');
    });

    it('chặn trùng tổ hợp màu và cỡ bằng 409 COMBINATION_EXISTS', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });
      const v = product.variants[0]!;

      const res = await t.http
        .post(`/api/admin/products/${product.id}/variants`)
        .set(adminAuth())
        .send({
          id: randomUUID(),
          colorId: v.colorId,
          sizeId: v.sizeId,
          sku: 'SKU-NEW-BUT-SAME-COMBO',
          listPrice: '299000.00',
        })
        .expect(409);

      expect(res.body.code).toBe('COMBINATION_EXISTS');
    });
  });

  describe('4. Endpoint PATCH /api/admin/products/:id/variants/:variantId', () => {
    it('sửa giá thành công, tôn trọng CAS token và cập nhật priceFrom', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: { include: { color: true, size: true } } },
      });
      const variant = product.variants[0]!;

      const res = await t.http
        .patch(`/api/admin/products/${product.id}/variants/${variant.id}`)
        .set(adminAuth())
        .send({
          listPrice: '350000.00',
          salePrice: '175000.00',
          expectedUpdatedAt: variant.updatedAt.toISOString(),
        })
        .expect(200);

      expect(res.body.listPrice).toBe('350000');
      expect(res.body.salePrice).toBe('175000');
      expect(res.body.adminManagedFields).toEqual(
        expect.arrayContaining(['listPrice', 'salePrice']),
      );

      const updatedProduct = await t.prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(updatedProduct.priceFrom.toString()).toBe('175000');
    });

    it('xử lý No-op khi dữ liệu không đổi: trả 200, không bump updatedAt', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: { include: { color: true, size: true } } },
      });
      const variant = product.variants[0]!;

      const res = await t.http
        .patch(`/api/admin/products/${product.id}/variants/${variant.id}`)
        .set(adminAuth())
        .send({
          listPrice: variant.listPrice.toString(),
          salePrice: variant.salePrice?.toString() ?? null,
          isActive: variant.isActive,
          expectedUpdatedAt: variant.updatedAt.toISOString(),
        })
        .expect(200);

      expect(res.body.updatedAt).toBe(variant.updatedAt.toISOString());
    });

    it('thất bại CAS nếu expectedUpdatedAt bị lệch -> 409 CONCURRENT_MODIFICATION', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: { include: { color: true, size: true } } },
      });
      const variant = product.variants[0]!;

      const res = await t.http
        .patch(`/api/admin/products/${product.id}/variants/${variant.id}`)
        .set(adminAuth())
        .send({
          listPrice: '320000.00',
          expectedUpdatedAt: '2026-11-10T00:00:00.000Z', // Lệch
        })
        .expect(409);

      expect(res.body.code).toBe('CONCURRENT_MODIFICATION');
    });

    it('chặn tắt biến thể cuối cùng khi sản phẩm đang mở bán bằng 422 LAST_ACTIVE_VARIANT_BLOCKED', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });

      // Tắt hết các biến thể, chỉ giữ lại đúng 1 biến thể active
      const [lastVariant, ...others] = product.variants;
      for (const other of others) {
        await t.prisma.productVariant.update({
          where: { id: other.id },
          data: { isActive: false },
        });
      }

      const variantBefore = await t.prisma.productVariant.findUniqueOrThrow({
        where: { id: lastVariant!.id },
      });

      const res = await t.http
        .patch(`/api/admin/products/${product.id}/variants/${lastVariant!.id}`)
        .set(adminAuth())
        .send({
          isActive: false,
          expectedUpdatedAt: variantBefore.updatedAt.toISOString(),
        })
        .expect(422);

      expect(res.body.code).toBe('LAST_ACTIVE_VARIANT_BLOCKED');
    });

    it('cho phép tắt biến thể cuối cùng nếu sản phẩm đã ngừng bán (adminDisabled=true)', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });

      // Ngừng bán sản phẩm trước
      await t.prisma.product.update({
        where: { id: product.id },
        data: { isActive: false, adminDisabled: true },
      });

      // Tắt các biến thể khác
      const [lastVariant, ...others] = product.variants;
      for (const other of others) {
        await t.prisma.productVariant.update({
          where: { id: other.id },
          data: { isActive: false },
        });
      }

      const variantBefore = await t.prisma.productVariant.findUniqueOrThrow({
        where: { id: lastVariant!.id },
      });

      const res = await t.http
        .patch(`/api/admin/products/${product.id}/variants/${lastVariant!.id}`)
        .set(adminAuth())
        .send({
          isActive: false,
          expectedUpdatedAt: variantBefore.updatedAt.toISOString(),
        })
        .expect(200);

      expect(res.body.isActive).toBe(false);
      // priceFrom vẫn tồn tại hợp lệ theo schema NOT NULL
      const updatedProduct = await t.prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(updatedProduct.priceFrom).toBeDefined();
    });
  });

  describe('5. Bảo vệ Mở bán Sản phẩm tại PATCH /api/admin/products/:id/status', () => {
    it('chặn mở bán sản phẩm khi có 0 biến thể active bằng 422 NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });

      // Tắt sản phẩm và tắt toàn bộ biến thể
      await t.prisma.product.update({
        where: { id: product.id },
        data: { isActive: false, adminDisabled: true },
      });
      await t.prisma.productVariant.updateMany({
        where: { productId: product.id },
        data: { isActive: false },
      });

      const productBefore = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });

      const res = await t.http
        .patch(`/api/admin/products/${product.id}/status`)
        .set(adminAuth())
        .send({
          adminDisabled: false, // Thử mở bán lại
          expectedVersion: productBefore.statusVersion,
        })
        .expect(422);

      expect(res.body.code).toBe('NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT');
    });
  });

  describe('6. Concurrency có Gate (pg_locks)', () => {
    it('Race 1 (Hai POST cùng id/payload đồng thời): gate kiểm chứng chỉ tạo đúng 1 biến thể, cả hai nhận thành công', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
      });
      const color = await t.prisma.color.findFirstOrThrow({ where: { code: 'den' } });
      const sizeXl = await t.prisma.size.findFirstOrThrow({ where: { code: 'XL' } });

      const sharedId = randomUUID();
      const payload = {
        id: sharedId,
        colorId: color.id,
        sizeId: sizeXl.id,
        sku: 'RACE-IDEMPOTENT-SKU',
        listPrice: '280000.00',
        isActive: true,
      };

      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${product.id}::uuid FOR UPDATE`;
            resolve();
            await new Promise<void>((r) => {
              releaseGate = r;
            });
          },
          { timeout: 15000 },
        );
        void txPromise;
      });
      await gateEntered;

      // Cả hai request cùng gửi đến và bị chặn bởi khóa hàng của product
      const p1 = sendPostAsync(`/api/admin/products/${product.id}/variants`, payload);
      const p2 = sendPostAsync(`/api/admin/products/${product.id}/variants`, payload);

      await waitForBlockedQueries(2);
      releaseGate();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect([r1.status, r2.status]).toEqual([201, 201]);
      expect(r1.body.id).toBe(sharedId);
      expect(r2.body.id).toBe(sharedId);

      // Xác minh DB chỉ có đúng 1 bản ghi với SKU này
      const count = await t.prisma.productVariant.count({ where: { id: sharedId } });
      expect(count).toBe(1);
    });

    it('Race 2: Hai Admin sửa cùng biến thể (CAS conflict): đúng 1 admin thành công 200, bên còn lại nhận 409', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: { include: { color: true, size: true } } },
      });
      const variant = product.variants[0]!;

      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${product.id}::uuid FOR UPDATE`;
            resolve();
            await new Promise<void>((r) => {
              releaseGate = r;
            });
          },
          { timeout: 15000 },
        );
        void txPromise;
      });
      await gateEntered;

      const p1 = sendPatchAsync(`/api/admin/products/${product.id}/variants/${variant.id}`, {
        listPrice: '410000.00',
        expectedUpdatedAt: variant.updatedAt.toISOString(),
      });
      const p2 = sendPatchAsync(`/api/admin/products/${product.id}/variants/${variant.id}`, {
        listPrice: '420000.00',
        expectedUpdatedAt: variant.updatedAt.toISOString(),
      });

      await waitForBlockedQueries(2);
      releaseGate();

      const [r1, r2] = await Promise.all([p1, p2]);
      const statuses = [r1.status, r2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);
    });

    it('Race 3a (Thứ tự 1: Mở bán hoàn tất trước, Tắt biến thể cuối sau): Mở bán thành công 200, Tắt biến thể cuối bị chặn 422 LAST_ACTIVE_VARIANT_BLOCKED', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });

      // Để sản phẩm ngừng bán, chỉ còn 1 biến thể active
      await t.prisma.product.update({
        where: { id: product.id },
        data: { isActive: false, adminDisabled: true },
      });
      const [lastVariant, ...others] = product.variants;
      for (const other of others) {
        await t.prisma.productVariant.update({
          where: { id: other.id },
          data: { isActive: false },
        });
      }

      const productBefore = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      const variantBefore = await t.prisma.productVariant.findUniqueOrThrow({
        where: { id: lastVariant!.id },
      });

      // Giữ khóa hàng product để cả 2 request đồng thời cùng xếp hàng chờ trên PostgreSQL
      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${product.id}::uuid FOR UPDATE`;
            resolve();
            await new Promise<void>((r) => {
              releaseGate = r;
            });
          },
          { timeout: 15000 },
        );
        void txPromise;
      });
      await gateEntered;

      // Thứ tự 1: Mở bán vào hàng chờ trước -> thắng khóa -> thành công 200; Tắt biến thể cuối vào sau -> bị chặn 422
      const openReq = sendPatchAsync(`/api/admin/products/${product.id}/status`, {
        adminDisabled: false,
        expectedVersion: productBefore.statusVersion,
      });
      await waitForBlockedQueries(1);

      const disableReq = sendPatchAsync(
        `/api/admin/products/${product.id}/variants/${lastVariant!.id}`,
        { isActive: false, expectedUpdatedAt: variantBefore.updatedAt.toISOString() },
      );
      await waitForBlockedQueries(2);

      releaseGate();

      const [openRes, disableRes] = await Promise.all([openReq, disableReq]);
      expect(openRes.status).toBe(200);
      expect(disableRes.status).toBe(422);
      expect(disableRes.body.code).toBe('LAST_ACTIVE_VARIANT_BLOCKED');

      const finalProduct = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(finalProduct.isActive).toBe(true);
      const activeCount = await t.prisma.productVariant.count({
        where: { productId: product.id, isActive: true },
      });
      expect(activeCount).toBe(1);
    });

    it('Race 3b (Thứ tự 2: Tắt biến thể cuối thắng khóa trước, Mở bán chạy sau): Tắt biến thể cuối thành công 200, Mở bán bị chặn 422 NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });

      await t.prisma.product.update({
        where: { id: product.id },
        data: { isActive: false, adminDisabled: true },
      });
      const [lastVariant, ...others] = product.variants;
      for (const other of others) {
        await t.prisma.productVariant.update({
          where: { id: other.id },
          data: { isActive: false },
        });
      }

      const productBefore = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      const variantBefore = await t.prisma.productVariant.findUniqueOrThrow({
        where: { id: lastVariant!.id },
      });

      // Giữ khóa hàng product để cả 2 request đồng thời cùng xếp hàng chờ trên PostgreSQL
      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${product.id}::uuid FOR UPDATE`;
            resolve();
            await new Promise<void>((r) => {
              releaseGate = r;
            });
          },
          { timeout: 15000 },
        );
        void txPromise;
      });
      await gateEntered;

      // Thứ tự 2: Tắt biến thể cuối vào hàng chờ trước -> thắng khóa -> thành công 200; Mở bán vào sau -> bị chặn 422
      const disableReq = sendPatchAsync(
        `/api/admin/products/${product.id}/variants/${lastVariant!.id}`,
        { isActive: false, expectedUpdatedAt: variantBefore.updatedAt.toISOString() },
      );
      await waitForBlockedQueries(1);

      const openReq = sendPatchAsync(`/api/admin/products/${product.id}/status`, {
        adminDisabled: false,
        expectedVersion: productBefore.statusVersion,
      });
      await waitForBlockedQueries(2);

      releaseGate();

      const [disableRes, openRes] = await Promise.all([disableReq, openReq]);
      expect(disableRes.status).toBe(200);
      expect(openRes.status).toBe(422);
      expect(openRes.body.code).toBe('NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT');

      const finalProduct = await t.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(finalProduct.isActive).toBe(false);
      expect(finalProduct.adminDisabled).toBe(true);
    });

    it('Race 4: Admin sửa giá biến thể vs Import catalog chạy đồng thời: khóa Product -> Variant ngăn chặn deadlock 40P01', async () => {
      const productsService = t.app.get(ProductsService);
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: { include: { color: true, size: true } } },
      });
      const variant = product.variants[0]!;

      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${product.id}::uuid FOR UPDATE`;
            resolve();
            await new Promise<void>((r) => {
              releaseGate = r;
            });
          },
          { timeout: 15000 },
        );
        void txPromise;
      });
      await gateEntered;

      // Admin PATCH biến thể
      const patchPromise = sendPatchAsync(
        `/api/admin/products/${product.id}/variants/${variant.id}`,
        {
          listPrice: '380000.00',
          expectedUpdatedAt: variant.updatedAt.toISOString(),
        },
      );

      // Import Catalog đồng thời
      const importPromise = productsService.importProducts([
        {
          sourceKey: 'import-race-p1',
          name: product.name,
          categorySlug: 'ao-thun',
          images: [],
          variants: [
            {
              sku: variant.sku,
              color: { code: variant.color.code, name: variant.color.name },
              sizeCode: variant.size.code,
              listPrice: '390000.00',
            },
          ],
        },
      ]);

      await waitForBlockedQueries(2);
      releaseGate();

      const [patchRes, importRes] = await Promise.all([patchPromise, importPromise]);
      expect([200, 409]).toContain(patchRes.status);
      expect(importRes[0]?.status).toBe('updated');

      // Không xảy ra lỗi 40P01 deadlock
      const finalVariant = await t.prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      expect(finalVariant.id).toBe(variant.id);
      if (patchRes.status === 200) {
        expect(finalVariant.adminManagedFields).toContain('listPrice');
      }
    });

    it('Race 5: Hai sản phẩm khác nhau tranh chấp cùng một SKU toàn cục (P2002 chuyển thành 409 SKU_EXISTS)', async () => {
      const products = await t.prisma.product.findMany({ take: 2, orderBy: { id: 'asc' } });
      const p1 = products[0]!;
      const p2 = products[1]!;
      const color = await t.prisma.color.create({
        data: { code: 'race-sku-c-' + randomUUID().slice(0, 6), name: 'Race SKU Color' },
      });
      const size = await t.prisma.size.create({
        data: { code: 'R' + randomUUID().slice(0, 4) },
      });

      const sharedSku = 'RACE-GLOBAL-SKU-P2002';
      const body1 = {
        id: randomUUID(),
        colorId: color.id,
        sizeId: size.id,
        sku: sharedSku,
        listPrice: '300000.00',
        isActive: true,
      };
      const body2 = {
        id: randomUUID(),
        colorId: color.id,
        sizeId: size.id,
        sku: sharedSku,
        listPrice: '350000.00',
        isActive: true,
      };

      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "products" WHERE id IN (${p1.id}::uuid, ${p2.id}::uuid) FOR UPDATE`;
            resolve();
            await new Promise<void>((r) => {
              releaseGate = r;
            });
          },
          { timeout: 15000 },
        );
        void txPromise;
      });
      await gateEntered;

      const req1 = sendPostAsync(`/api/admin/products/${p1.id}/variants`, body1);
      const req2 = sendPostAsync(`/api/admin/products/${p2.id}/variants`, body2);

      await waitForBlockedQueries(2);
      releaseGate();

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const conflictRes = res1.status === 409 ? res1 : res2;
      expect(conflictRes.body.code).toBe('SKU_EXISTS');

      const count = await t.prisma.productVariant.count({ where: { sku: sharedSku } });
      expect(count).toBe(1);
    });

    it('Race 6 Kịch bản A: Admin đổi giá trước khi khách đặt đơn -> Checkout phát hiện fingerprint lệch, trả 409 QUOTE_CHANGED', async () => {
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });
      const variant = product.variants[0]!;
      const addressId = await prepareCheckout(variant.id);

      const previewRes = await t.http
        .post('/api/checkout/preview')
        .set(customerAuth())
        .send({ addressId })
        .expect(201);
      const oldFingerprint = previewRes.body.fingerprint;

      const patchRes = await t.http
        .patch(`/api/admin/products/${product.id}/variants/${variant.id}`)
        .set(adminAuth())
        .send({
          listPrice: '350000.00',
          salePrice: null,
          expectedUpdatedAt: variant.updatedAt.toISOString(),
        })
        .expect(200);
      expect(Number(patchRes.body.listPrice)).toBe(350000);

      const orderRes = await t.http.post('/api/checkout/orders').set(customerAuth()).send({
        addressId,
        fingerprint: oldFingerprint,
        idempotencyKey: randomUUID(),
        gateway: 'COD',
      });

      expect(orderRes.status).toBe(409);
      expect(orderRes.body.code).toBe('QUOTE_CHANGED');

      expect(await t.prisma.order.count()).toBe(0);
      expect(await t.prisma.inventoryReservation.count()).toBe(0);
      expect(await t.prisma.payment.count()).toBe(0);
    });

    it('Race 6 Kịch bản B: Admin đổi giá SAU bước kiểm fingerprint -> Checkout không kẹt hold và ghi nhận đúng hành vi hiện tại (tạo đơn theo giá quote đã xác minh trước đó)', async () => {
      const ordersService = t.app.get(OrdersService);
      const product = await t.prisma.product.findFirstOrThrow({
        where: { slug: 'ao-thun-co-tron-basic' },
        include: { variants: true },
      });
      const variant = product.variants[0]!;
      const expectedOldPrice = variant.salePrice
        ? variant.salePrice.toString()
        : variant.listPrice.toString();
      const addressId = await prepareCheckout(variant.id);

      const previewRes = await t.http
        .post('/api/checkout/preview')
        .set(customerAuth())
        .send({ addressId })
        .expect(201);
      const oldFingerprint = previewRes.body.fingerprint;

      // Dừng Checkout ngay sau bước kiểm fingerprint (tại ordersService.create) để Admin đổi giá và commit trước
      let releaseCheckout!: () => void;
      const checkoutPaused = new Promise<void>((r) => {
        const originalCreate = ordersService.create.bind(ordersService);
        const spy = vi.spyOn(ordersService, 'create').mockImplementation(async (...args) => {
          r();
          await new Promise<void>((resume) => {
            releaseCheckout = resume;
          });
          spy.mockRestore();
          return originalCreate(...args);
        });
      });

      const customerOrder = new Promise<{ status: number; body: Record<string, unknown> }>(
        (resolve, reject) => {
          t.http
            .post('/api/checkout/orders')
            .set(customerAuth())
            .send({
              addressId,
              fingerprint: oldFingerprint,
              idempotencyKey: randomUUID(),
              gateway: 'COD',
            })
            .end((err, res) =>
              err
                ? reject(err)
                : resolve(res as unknown as { status: number; body: Record<string, unknown> }),
            );
        },
      );

      await checkoutPaused;

      // Admin đổi giá và commit thành công trong lúc Checkout đang tạm dừng sau bước kiểm fingerprint
      const patchRes = await t.http
        .patch(`/api/admin/products/${product.id}/variants/${variant.id}`)
        .set(adminAuth())
        .send({
          listPrice: '390000.00',
          expectedUpdatedAt: variant.updatedAt.toISOString(),
        });
      expect(patchRes.status).toBe(200);

      releaseCheckout();
      const orderRes = await customerOrder;
      expect(orderRes.status).toBe(201);

      const createdOrder = await t.prisma.order.findFirstOrThrow({ include: { items: true } });
      expect(createdOrder.items[0]?.unitPrice.toString()).toBe(expectedOldPrice);

      const updatedVariant = await t.prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      expect(updatedVariant.listPrice.toString()).toBe('390000');
    });
  });
});
