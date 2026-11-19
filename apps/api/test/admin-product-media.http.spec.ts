import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { CatalogEventsService } from '../src/modules/products/catalog-events.service.js';
import { type ImportProductRow, ProductsService } from '../src/modules/products/index.js';
import * as statusLock from '../src/modules/products/product-status.js';
import {
  MediaCleanupService,
  PENDING_GRACE_MS,
} from '../src/modules/uploads/media-cleanup.service.js';
import { PRODUCTS } from './fixtures/catalog-products.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';
import { FakeImageStorage } from './helpers/fake-image-storage.js';

describe('UC-04.2 Quản trị Ảnh Sản Phẩm HTTP API (Đợt 3, PostgreSQL + FakeImageStorage)', () => {
  const storage = new FakeImageStorage();
  let t: TestApp;
  let adminId: string;
  let adminToken: string;
  let otherAdminToken: string;
  let customerId: string;
  let customerToken: string;
  let productId: string;
  let productSlug: string;
  let importRow: ImportProductRow;

  const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
  const otherAdminAuth = () => ({ Authorization: `Bearer ${otherAdminToken}` });
  const customerAuth = () => ({ Authorization: `Bearer ${customerToken}` });

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
        email: 'admin.media@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    await grantAdminRole(t.prisma, adminUser.email);
    adminId = adminUser.id;
    adminToken = await jwt.signAsync({ sub: adminUser.id, ver: adminUser.authVersion });

    const otherAdminUser = await t.prisma.user.create({
      data: {
        email: 'admin2.media@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    await grantAdminRole(t.prisma, otherAdminUser.email);
    otherAdminToken = await jwt.signAsync({
      sub: otherAdminUser.id,
      ver: otherAdminUser.authVersion,
    });

    const customerUser = await t.prisma.user.create({
      data: {
        email: 'customer.media@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    customerId = customerUser.id;
    customerToken = await jwt.signAsync({
      sub: customerUser.id,
      ver: customerUser.authVersion,
    });

    const p = await t.prisma.product.findUniqueOrThrow({
      where: { slug: PRODUCTS[0]!.slug },
      include: {
        variants: { include: { size: true, color: true } },
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    productId = p.id;
    productSlug = p.slug;
    const v = p.variants[0]!;
    importRow = {
      sourceKey: 'media-dot3:existing',
      name: p.name,
      categorySlug: 'ao-thun',
      images: p.images.map((img) => ({ url: img.url, alt: img.alt ?? undefined })),
      variants: [
        {
          sku: v.sku,
          sizeCode: v.size.code,
          color: { code: v.color.code, name: v.color.name },
          listPrice: v.listPrice.toString(),
        },
      ],
    };
  });

  async function issueAndUploadProductPhoto(auth = adminAuth()): Promise<string> {
    const res = await t.http
      .post('/api/admin/products/upload-tickets')
      .set(auth)
      .send({})
      .expect(200);
    const key = res.body.key as string;
    storage.put(key);
    return key;
  }

  describe('1. Phân quyền, cấp ticket product và bảo vệ đường khách hàng (AC41, AC42)', () => {
    it('UC-04.2/AC41 guest (401) và CUSTOMER (403) bị chặn ở cả cấp ticket product và PUT images; endpoint khách hàng từ chối purpose "product" bằng 400', async () => {
      await t.http.post('/api/admin/products/upload-tickets').send({}).expect(401);
      await t.http
        .post('/api/admin/products/upload-tickets')
        .set(customerAuth())
        .send({})
        .expect(403);

      await t.http
        .put(`/api/admin/products/${productId}/images`)
        .send({ expectedVersion: 0, items: [] })
        .expect(401);
      await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(customerAuth())
        .send({ expectedVersion: 0, items: [] })
        .expect(403);

      // Endpoint khách hàng /api/uploads/tickets tiếp tục chỉ nhận review và return
      await t.http
        .post('/api/uploads/tickets')
        .set(customerAuth())
        .send({ purpose: 'product' })
        .expect(400);
      await t.http
        .post('/api/uploads/tickets')
        .set(adminAuth())
        .send({ purpose: 'product' })
        .expect(400);

      // review và return vẫn hoạt động bình thường
      const reviewTicket = await t.http
        .post('/api/uploads/tickets')
        .set(customerAuth())
        .send({ purpose: 'review' })
        .expect(200);
      expect(reviewTicket.body.key).toContain(`freya/reviews/${customerId}/`);
    });

    it('UC-04.2/AC42 ADMIN xin ticket product thành công với Cache-Control: no-store và ghi sổ PENDING', async () => {
      const res = await t.http
        .post('/api/admin/products/upload-tickets')
        .set(adminAuth())
        .send({})
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.key).toMatch(new RegExp(`^freya/products/${adminId}/`));
      const row = await t.prisma.mediaUpload.findUnique({
        where: { storageKey: res.body.key },
      });
      expect(row).toMatchObject({
        ownerId: adminId,
        status: 'PENDING',
      });
    });
  });

  describe('2. Lưu nguyên tử bộ ảnh, thứ tự, alt, giới hạn và bảo vệ lỗi (AC42, AC43, AC44, AC45, AC46, AC47)', () => {
    it('UC-04.2/AC42,AC45 thêm ảnh mới, đổi thứ tự, đưa lên đầu làm ảnh đại diện, sửa alt, bảo toàn color của ảnh cũ và phản ánh ngoài storefront', async () => {
      const detailBefore = await t.http
        .get(`/api/admin/products/${productId}`)
        .set(adminAuth())
        .expect(200);
      const existingImgs = detailBefore.body.images as {
        id: string;
        url: string;
        alt: string | null;
        color: { code: string; name: string } | null;
      }[];
      expect(existingImgs.length).toBeGreaterThanOrEqual(2);

      const coloredImg = existingImgs.find((img) => img.color !== null) ?? existingImgs[1]!;
      const newKey = await issueAndUploadProductPhoto();
      const newClientId = randomUUID();
      const events = t.app.get(CatalogEventsService);
      const revBefore = await events.revision();

      // Đưa ảnh mới lên đầu (sortOrder = 0), giữ ảnh có màu ở vị trí 1 với alt mới, gỡ các ảnh cũ khác
      const putRes = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: [
            { id: newClientId, key: newKey, alt: '  Ảnh đại diện mới tải lên  ' },
            { id: coloredImg.id, alt: '  Mô tả màu đã chỉnh  ' },
          ],
        })
        .expect(200);

      expect(putRes.headers['cache-control']).toBe('no-store');
      expect(putRes.body.imagesVersion).toBe(1);
      expect(putRes.body.imagesManagedByAdmin).toBe(true);
      expect(putRes.body.imageUrl).toBe(`https://cdn.test/${newKey}.jpg`);
      expect(putRes.body.images).toEqual([
        {
          id: newClientId,
          url: `https://cdn.test/${newKey}.jpg`,
          alt: 'Ảnh đại diện mới tải lên',
          sortOrder: 0,
          color: null,
        },
        {
          id: coloredImg.id,
          url: coloredImg.url,
          alt: 'Mô tả màu đã chỉnh',
          sortOrder: 1,
          color: coloredImg.color,
        },
      ]);

      // Ticket đã được tiêu thụ (xóa khỏi media_uploads) trong cùng transaction
      expect(await t.prisma.mediaUpload.findUnique({ where: { storageKey: newKey } })).toBeNull();
      expect(await events.revision()).not.toBe(revBefore);

      // Kiểm tra ngoài Storefront: danh sách và chi tiết công khai dùng ảnh đầu mới
      const publicDetail = await t.http.get(`/api/products/${productSlug}`).expect(200);
      expect(publicDetail.body.imageUrl).toBe(`https://cdn.test/${newKey}.jpg`);
      expect(publicDetail.body.images[0]).toMatchObject({
        url: `https://cdn.test/${newKey}.jpg`,
        alt: 'Ảnh đại diện mới tải lên',
      });
      expect(publicDetail.body.images[1]).toMatchObject({
        url: coloredImg.url,
        alt: 'Mô tả màu đã chỉnh',
      });
    });

    it('UC-04.2/AC43 từ chối sai owner, sai purpose (review/return), key chưa tải lên, key hết hạn/đang dọn/đã gắn và lỗi kho (503) với rollback hoàn toàn', async () => {
      const beforeImgs = await t.prisma.productImage.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });

      // 1. Sai owner (ticket của admin khác)
      const otherAdminKey = await issueAndUploadProductPhoto(otherAdminAuth());
      await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: [
            ...beforeImgs.map((i) => ({ id: i.id, alt: i.alt })),
            { id: randomUUID(), key: otherAdminKey, alt: null },
          ],
        })
        .expect(422);

      // 2. Sai purpose (ticket review của chính admin đó)
      const reviewTicketRes = await t.http
        .post('/api/uploads/tickets')
        .set(adminAuth())
        .send({ purpose: 'review' })
        .expect(200);
      const reviewKey = reviewTicketRes.body.key as string;
      storage.put(reviewKey);

      await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: [
            ...beforeImgs.map((i) => ({ id: i.id, alt: i.alt })),
            { id: randomUUID(), key: reviewKey, alt: null },
          ],
        })
        .expect(422);

      // 3. Key đã được dọn / hết hạn (status DELETING hoặc không còn PENDING) همراه với 1 key hợp lệ -> rollback cả hai
      const validKey = await issueAndUploadProductPhoto();
      const staleKey = await issueAndUploadProductPhoto();
      await t.prisma.mediaUpload.update({
        where: { storageKey: staleKey },
        data: { status: 'DELETING', claimedAt: new Date() },
      });

      const rollbackRes = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: [
            { id: randomUUID(), key: validKey, alt: 'Hợp lệ' },
            { id: randomUUID(), key: staleKey, alt: 'Hết hạn' },
          ],
        })
        .expect(422);
      expect(rollbackRes.body.code).toBe('INVALID_MEDIA');

      // Rollback: validKey vẫn còn nguyên trạng thái PENDING trong media_uploads để dùng lại, bộ ảnh cũ không mất
      const validTicketRow = await t.prisma.mediaUpload.findUnique({
        where: { storageKey: validKey },
      });
      expect(validTicketRow?.status).toBe('PENDING');
      expect(
        await t.prisma.productImage.findMany({
          where: { productId },
          orderBy: { sortOrder: 'asc' },
        }),
      ).toEqual(beforeImgs);

      // 4. Lỗi kho (503 UPLOADS_UNAVAILABLE) khi inspect
      storage.failInspect = true;
      const err503 = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: [{ id: randomUUID(), key: validKey, alt: null }],
        })
        .expect(503);
      expect(err503.body.code).toBe('UPLOADS_UNAVAILABLE');
      storage.failInspect = false;
    });

    it('UC-04.2/AC44 giới hạn 8 ảnh khi thêm mới và hỗ trợ bộ ảnh legacy > 8 ảnh', async () => {
      // Tạo bộ ảnh legacy 9 ảnh trực tiếp trong DB
      await t.prisma.productImage.deleteMany({ where: { productId } });
      const legacyCreated = [];
      for (let i = 0; i < 9; i++) {
        legacyCreated.push(
          await t.prisma.productImage.create({
            data: {
              productId,
              sortOrder: i,
              url: `https://picsum.photos/seed/legacy-${i}/600/800`,
              alt: `Ảnh cũ ${i}`,
            },
          }),
        );
      }

      // 1. Có thêm ảnh mới làm tổng > 8 -> chặn 422 IMAGE_LIMIT_EXCEEDED
      const newKey = await issueAndUploadProductPhoto();
      const overLimitRes = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: [
            ...legacyCreated.slice(0, 8).map((img) => ({ id: img.id, alt: img.alt })),
            { id: randomUUID(), key: newKey, alt: 'Ảnh thứ 9 mới' },
          ],
        })
        .expect(422);
      expect(overLimitRes.body.code).toBe('IMAGE_LIMIT_EXCEEDED');

      // 2. Bộ ảnh legacy 9 ảnh vẫn đổi thứ tự và sửa alt được khi không thêm ảnh mới
      const reversedLegacy = [...legacyCreated].reverse();
      const reorderRes = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: reversedLegacy.map((img, idx) => ({
            id: img.id,
            alt: `Legacy đảo ${idx}`,
          })),
        })
        .expect(200);
      expect(reorderRes.body.images).toHaveLength(9);
      expect(reorderRes.body.images[0].id).toBe(reversedLegacy[0]!.id);
      expect(reorderRes.body.imagesVersion).toBe(1);
    });

    it('UC-04.2/AC46 chặn gỡ ảnh cuối khi sản phẩm đang bán (422) và cho phép gỡ khi sản phẩm đã ngừng bán', async () => {
      const failRes = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({ expectedVersion: 0, items: [] })
        .expect(422);
      expect(failRes.body.code).toBe('LAST_IMAGE_OF_ACTIVE_PRODUCT');

      // Ngừng bán sản phẩm trước
      await t.http
        .patch(`/api/admin/products/${productId}/status`)
        .set(adminAuth())
        .send({ adminDisabled: true, expectedVersion: 0 })
        .expect(200);

      const okRes = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({ expectedVersion: 0, items: [] })
        .expect(200);
      expect(okRes.body.images).toEqual([]);
      expect(okRes.body.imageUrl).toBeNull();
    });

    it('UC-04.2/AC47 No-op giữ nguyên imagesVersion, imagesManagedByAdmin, updatedAt và catalog revision; CAS kiểm trước no-op', async () => {
      const pBefore = await t.prisma.product.findUniqueOrThrow({
        where: { id: productId },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      });
      const events = t.app.get(CatalogEventsService);
      const revBefore = await events.revision();

      const noopRes = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: pBefore.images.map((img) => ({ id: img.id, alt: img.alt })),
        })
        .expect(200);

      expect(noopRes.body.imagesVersion).toBe(0);
      expect(noopRes.body.imagesManagedByAdmin).toBe(false);
      const pAfter = await t.prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(pAfter.updatedAt.toISOString()).toBe(pBefore.updatedAt.toISOString());
      expect(await events.revision()).toBe(revBefore);

      // CAS lệch phiên bản vẫn trả 409 kể cả khi payload giống hệt DB
      await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 99,
          items: pBefore.images.map((img) => ({ id: img.id, alt: img.alt })),
        })
        .expect(409);
    });
  });

  describe('3. Tương tranh CAS và Gate đồng thời Import / Admin (AC47, AC48)', () => {
    it('UC-04.2/AC47 hai request sửa ảnh cùng expectedVersion: đúng một thắng (200), một thua (409)', async () => {
      const imgs = await t.prisma.productImage.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });

      const [r1, r2] = await Promise.all([
        t.http
          .put(`/api/admin/products/${productId}/images`)
          .set(adminAuth())
          .send({
            expectedVersion: 0,
            items: imgs.map((img, i) => ({ id: img.id, alt: `Admin A ${i}` })),
          }),
        t.http
          .put(`/api/admin/products/${productId}/images`)
          .set(otherAdminAuth())
          .send({
            expectedVersion: 0,
            items: [...imgs].reverse().map((img, i) => ({ id: img.id, alt: `Admin B ${i}` })),
          }),
      ]);

      expect([r1.status, r2.status].sort((a, b) => a - b)).toEqual([200, 409]);
      const finalProduct = await t.prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(finalProduct.imagesVersion).toBe(1);
      expect(finalProduct.imagesManagedByAdmin).toBe(true);
    });

    it.each(['admin', 'import'] as const)(
      'UC-04.2/AC48 gate khóa hàng thật (%s lấy khóa trước): bảo vệ bộ ảnh admin và mất hiệu lực token cũ khi import thắng trước',
      async (first) => {
        const imgs = await t.prisma.productImage.findMany({
          where: { productId },
          orderBy: { sortOrder: 'asc' },
        });
        const importer = t.app.get(ProductsService);

        let enter!: () => void;
        let release!: () => void;
        const entered = new Promise<void>((resolve) => {
          enter = resolve;
        });
        const resume = new Promise<void>((resolve) => {
          release = resolve;
        });

        const originalLock = statusLock.lockProductStatus;
        let lockCalls = 0;
        const spy = vi
          .spyOn(statusLock, 'lockProductStatus')
          .mockImplementation(async (...args) => {
            const locked = await originalLock(...args);
            if (++lockCalls === 1) {
              enter();
              await resume;
            }
            return locked;
          });

        const runAdmin = () =>
          Promise.resolve(
            t.http
              .put(`/api/admin/products/${productId}/images`)
              .set(adminAuth())
              .send({
                expectedVersion: 0,
                items: [...imgs].reverse().map((img) => ({ id: img.id, alt: 'Admin giữ' })),
              }),
          );

        const runImport = () =>
          importer.importProducts([
            {
              ...importRow,
              images: [
                { url: 'https://picsum.photos/seed/import-new/600/800', alt: 'Ảnh nguồn mới' },
              ],
            },
          ]);

        const firstTask = first === 'admin' ? runAdmin() : runImport();
        await entered;
        const secondTask = first === 'admin' ? runImport() : runAdmin();

        let results: unknown[];
        try {
          try {
            await vi.waitFor(
              async () => {
                const waiting = await t.prisma.$queryRaw<{ count: bigint }[]>`
                  SELECT count(*) FROM pg_stat_activity
                  WHERE datname = current_database()
                    AND wait_event_type = 'Lock'
                    AND query LIKE '%FOR UPDATE%'
                `;
                expect(Number(waiting[0]?.count)).toBeGreaterThan(0);
              },
              { timeout: 5_000 },
            );
          } finally {
            release();
          }
          results = await Promise.all([firstTask, secondTask]);
        } finally {
          spy.mockRestore();
        }

        if (first === 'admin') {
          // Admin lấy khóa trước -> đặt imagesManagedByAdmin = true; Import chạy sau giữ nguyên bộ ảnh admin!
          const adminRes = results[0] as { status: number };
          expect(adminRes.status).toBe(200);
          const dbImgs = await t.prisma.productImage.findMany({
            where: { productId },
            orderBy: { sortOrder: 'asc' },
          });
          expect(dbImgs.map((i) => i.id)).toEqual([...imgs].reverse().map((i) => i.id));
          expect(dbImgs.every((i) => i.alt === 'Admin giữ')).toBe(true);

          // Kể cả khi import tiếp theo có nguồn rỗng images: [], sản phẩm vẫn giữ bộ ảnh admin và còn đang bán
          await importer.importProducts([{ ...importRow, images: [] }]);
          const pAfterEmptyImport = await t.prisma.product.findUniqueOrThrow({
            where: { id: productId },
            include: { images: { orderBy: { sortOrder: 'asc' } } },
          });
          expect(pAfterEmptyImport.isActive).toBe(true);
          expect(pAfterEmptyImport.images).toHaveLength(imgs.length);
        } else {
          // Import lấy khóa trước khi admin chưa quản lý -> import đổi bộ ảnh và tăng imagesVersion lên 1 -> Admin dùng expectedVersion 0 bị chặn 409!
          const adminRes = results[1] as { status: number };
          expect(adminRes.status).toBe(409);
          const pAfterImport = await t.prisma.product.findUniqueOrThrow({
            where: { id: productId },
          });
          expect(pAfterImport.imagesVersion).toBe(1);
          expect(pAfterImport.imagesManagedByAdmin).toBe(false);
        }
      },
    );
  });

  describe('4. Bảo toàn URL snapshot đơn cũ và vòng đời tệp trên kho (AC49)', () => {
    it('UC-04.2/AC49 gỡ ảnh từng gắn không xóa asset khỏi kho và không sửa snapshot đơn cũ; ticket mồ côi chưa gắn vẫn được dọn sau 24h', async () => {
      // 1. Admin tải và gắn 1 ảnh mới vào sản phẩm
      const attachedKey = await issueAndUploadProductPhoto();
      const attachedImgId = randomUUID();
      const existingImgs = await t.prisma.productImage.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });

      const attachRes = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: [
            { id: attachedImgId, key: attachedKey, alt: 'Ảnh chụp vào đơn' },
            ...existingImgs.map((i) => ({ id: i.id, alt: i.alt })),
          ],
        })
        .expect(200);
      const attachedUrl = attachRes.body.imageUrl as string;

      // 2. Tạo một đơn hàng lưu snapshot chứa URL ảnh vừa gắn
      const variant = await t.prisma.productVariant.findFirstOrThrow({ where: { productId } });
      const order = await t.prisma.order.create({
        data: {
          orderCode: 'ORD-MEDIA-SNAPSHOT-01',
          customerEmail: 'customer.media@example.test',
          status: 'CONFIRMED',
          shippingAddressSnapshot: { recipientName: 'Khách test' },
          subtotalAmount: '199000',
          discountAmount: '0',
          shippingFeeAmount: '0',
          totalAmount: '199000',
          items: {
            create: {
              productVariantId: variant.id,
              quantity: 1,
              unitPrice: variant.listPrice,
              productSnapshot: {
                name: 'Áo thun',
                variantLabel: 'M / Đen',
                imageUrl: attachedUrl,
                productSlug,
              },
            },
          },
        },
        include: { items: true },
      });

      // 3. Admin gỡ ảnh đó khỏi sản phẩm, đồng thời xin 1 ticket khác nhưng bỏ dở (không gắn)
      const orphanKey = await issueAndUploadProductPhoto();
      await t.prisma.mediaUpload.update({
        where: { storageKey: orphanKey },
        data: { createdAt: new Date(Date.now() - PENDING_GRACE_MS - 3_600_000) },
      });

      await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 1,
          items: existingImgs.map((i) => ({ id: i.id, alt: i.alt })),
        })
        .expect(200);

      // 4. Chạy worker dọn ảnh mồ côi: chỉ xóa orphanKey chưa gắn, tuyệt đối giữ nguyên attachedKey từng gắn
      const cleanup = t.app.get(MediaCleanupService);
      const sweepResult = await cleanup.sweep(new Date());
      expect(sweepResult).toEqual({ removed: 1, failed: 0 });
      expect(storage.removed).toContain(orphanKey);
      expect(storage.removed).not.toContain(attachedKey);
      expect(storage.images.has(attachedKey)).toBe(true);

      // Snapshot đơn hàng cũ vẫn giữ nguyên URL ảnh
      const savedOrderItem = await t.prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(savedOrderItem.productSnapshot).toMatchObject({
        imageUrl: attachedUrl,
      });
    });

    it('UC-04.2/AC43 (hồi quy P2-3) từ chối ticket product quá hạn (> 1 giờ) ngay cả khi worker chưa dọn và giữ trạng thái PENDING', async () => {
      const beforeImgs = await t.prisma.productImage.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });
      const expiredKey = await issueAndUploadProductPhoto();
      // Lùi thời điểm tạo phiếu về > 1 giờ trước, vẫn trước mốc PENDING_GRACE_MS (24h) của worker
      await t.prisma.mediaUpload.update({
        where: { storageKey: expiredKey },
        data: { createdAt: new Date(Date.now() - 61 * 60_000) },
      });

      const res = await t.http
        .put(`/api/admin/products/${productId}/images`)
        .set(adminAuth())
        .send({
          expectedVersion: 0,
          items: [
            ...beforeImgs.map((i) => ({ id: i.id, alt: i.alt })),
            { id: randomUUID(), key: expiredKey, alt: 'Phiếu hết hạn' },
          ],
        })
        .expect(422);
      expect(res.body.code).toBe('INVALID_MEDIA');

      // Bộ ảnh sản phẩm giữ nguyên và dòng PENDING chưa bị xóa bởi attach
      const afterProduct = await t.prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(afterProduct.imagesVersion).toBe(0);
      const pendingRow = await t.prisma.mediaUpload.findUnique({
        where: { storageKey: expiredKey },
      });
      expect(pendingRow?.status).toBe('PENDING');
    });

    it('UC-04.2/AC43 (hồi quy P2-2) kho ảnh phản hồi chậm (> 5s timeout mặc định của Prisma tx) vẫn lưu thành công', async () => {
      const beforeImgs = await t.prisma.productImage.findMany({
        where: { productId },
        orderBy: { sortOrder: 'asc' },
      });
      const slowKey = await issueAndUploadProductPhoto();
      const originalInspect = storage.inspect.bind(storage);
      const inspectSpy = vi.spyOn(storage, 'inspect').mockImplementation(async (key: string) => {
        await new Promise((resolve) => setTimeout(resolve, 5_500));
        return originalInspect(key);
      });

      try {
        const newId = randomUUID();
        const res = await t.http
          .put(`/api/admin/products/${productId}/images`)
          .set(adminAuth())
          .send({
            expectedVersion: 0,
            items: [
              ...beforeImgs.map((i) => ({ id: i.id, alt: i.alt })),
              { id: newId, key: slowKey, alt: 'Kho chậm 5.5s' },
            ],
          })
          .expect(200);

        expect(res.body.imagesVersion).toBe(1);
        expect(res.body.images).toHaveLength(beforeImgs.length + 1);
      } finally {
        inspectSpy.mockRestore();
      }
    }, 15_000);
  });
});
