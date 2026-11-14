import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedCatalog } from '../prisma/seed/catalog.seed.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { ProductsService } from '../src/modules/products/products.service.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('Admin Categories HTTP API (UC-04.1)', () => {
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;

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

    const adminUser = await t.prisma.user.create({
      data: {
        email: 'admin.cat@example.test',
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
        email: 'customer.cat@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    customerToken = await t.app
      .get(JwtService)
      .signAsync({ sub: customerUser.id, ver: customerUser.authVersion });
  });

  describe('UC-04.1/AC1 Phân quyền và bảo mật', () => {
    it('UC-04.1/AC1 từ chối khách chưa đăng nhập bằng 401', async () => {
      await t.http.get('/api/admin/categories').expect(401);
      await t.http.get('/api/admin/categories/11111111-1111-4111-8111-111111111111').expect(401);
      await t.http
        .patch('/api/admin/categories/11111111-1111-4111-8111-111111111111/visibility')
        .send({ isActive: false, expectedUpdatedAt: '2026-11-10T08:00:00.000Z' })
        .expect(401);
    });

    it('UC-04.1/AC1 từ chối người dùng CUSTOMER bằng 403', async () => {
      await t.http.get('/api/admin/categories').set(customerAuth()).expect(403);
      await t.http
        .get('/api/admin/categories/11111111-1111-4111-8111-111111111111')
        .set(customerAuth())
        .expect(403);
      await t.http
        .patch('/api/admin/categories/11111111-1111-4111-8111-111111111111/visibility')
        .set(customerAuth())
        .send({ isActive: false, expectedUpdatedAt: '2026-11-10T08:00:00.000Z' })
        .expect(403);
    });

    it('UC-04.1/AC1 trả 400 khi id không phải UUID', async () => {
      const res = await t.http.get('/api/admin/categories/not-a-uuid').set(adminAuth()).expect(400);
      expect(res.body.message).toEqual(expect.arrayContaining([expect.stringContaining('UUID')]));
    });

    it('UC-04.1/AC1 trả 404 khi UUID hợp lệ nhưng không tìm thấy danh mục', async () => {
      await t.http
        .get('/api/admin/categories/00000000-0000-4000-8000-000000000000')
        .set(adminAuth())
        .expect(404);
    });

    it('UC-04.1/AC1 trả header Cache-Control: no-store và từ chối trường lạ trong body', async () => {
      const cat = await t.prisma.category.findFirstOrThrow({ where: { slug: 'ao' } });

      const getRes = await t.http.get('/api/admin/categories').set(adminAuth()).expect(200);
      expect(getRes.headers['cache-control']).toBe('no-store');

      const detailRes = await t.http
        .get(`/api/admin/categories/${cat.id}`)
        .set(adminAuth())
        .expect(200);
      expect(detailRes.headers['cache-control']).toBe('no-store');

      // Gửi trường lạ (extraField) phải bị ValidationPipe từ chối 400
      await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({
          isActive: false,
          expectedUpdatedAt: cat.updatedAt.toISOString(),
          extraField: 'not-allowed',
        })
        .expect(400);
    });
  });

  describe('UC-04.1/AC2 Đọc cây và chi tiết danh mục', () => {
    it('UC-04.1/AC2 trả về cả danh mục active và inactive, giữ thứ tự và đếm sản phẩm trực tiếp lẫn cả nhánh', async () => {
      const ao = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao' } });
      const aoThun = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-thun' } });

      // Làm 1 danh mục con inactive trong DB để kiểm chứng admin vẫn thấy
      await t.prisma.category.update({
        where: { id: aoThun.id },
        data: { isActive: false },
      });

      const res = await t.http.get('/api/admin/categories').set(adminAuth()).expect(200);
      const tree = res.body as Array<{
        id: string;
        name: string;
        slug: string;
        isActive: boolean;
        productCount: number;
        subtreeProductCount: number;
        children: Array<{
          id: string;
          name: string;
          slug: string;
          isActive: boolean;
          productCount: number;
        }>;
      }>;

      expect(tree.length).toBeGreaterThan(0);
      const aoNode = tree.find((c) => c.slug === 'ao');
      expect(aoNode).toBeDefined();
      expect(aoNode?.children.length).toBeGreaterThan(0);

      // Danh mục con ao-thun (dù bị ẩn) vẫn xuất hiện trong admin tree
      const childAoThun = aoNode?.children.find((c) => c.slug === 'ao-thun');
      expect(childAoThun).toBeDefined();
      expect(childAoThun?.isActive).toBe(false);

      // Chi tiết danh mục
      const detailRes = await t.http
        .get(`/api/admin/categories/${ao.id}`)
        .set(adminAuth())
        .expect(200);

      expect(detailRes.body).toMatchObject({
        id: ao.id,
        slug: 'ao',
        name: 'Áo',
        isActive: true,
        effectiveActive: true,
        parentHidden: false,
      });
      expect(typeof detailRes.body.productCount).toBe('number');
      expect(typeof detailRes.body.subtreeProductCount).toBe('number');
      expect(detailRes.body.subtreeProductCount).toBeGreaterThanOrEqual(
        detailRes.body.productCount,
      );
    });
  });

  describe('UC-04.1/AC3 CAS, cập nhật đơn điệu và bảo vệ writer Seed', () => {
    it('UC-04.1/AC3 cập nhật thành công khi expectedUpdatedAt khớp, timestamp tăng đơn điệu', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'quan' } });
      const initialIso = cat.updatedAt.toISOString();

      const res = await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: false, expectedUpdatedAt: initialIso })
        .expect(200);

      expect(res.body).toMatchObject({
        id: cat.id,
        isActive: false,
        effectiveActive: false,
        parentHidden: false,
      });
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(initialIso).getTime(),
      );

      // DB đã cập nhật isActive = false
      const updatedCat = await t.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(updatedCat.isActive).toBe(false);
    });

    it('UC-04.1/AC3 ném 409 khi expectedUpdatedAt cũ, BẮT BUỘC kiểm CAS trước no-op', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'quan' } });
      const staleIso = '2020-01-01T00:00:00.000Z';

      // Kể cả khi target isActive trùng với DB hiện tại (true), token cũ vẫn phải 409!
      const res = await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: cat.isActive, expectedUpdatedAt: staleIso })
        .expect(409);

      expect(res.body.message).toContain('Tải lại và xác nhận lại');
    });

    it('UC-04.1/AC3 no-op khi CAS khớp và isActive không đổi: không UPDATE, giữ nguyên updatedAt', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'quan' } });
      const currentIso = cat.updatedAt.toISOString();

      const res = await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: cat.isActive, expectedUpdatedAt: currentIso })
        .expect(200);

      expect(res.body.updatedAt).toBe(currentIso);

      const after = await t.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(after.updatedAt.toISOString()).toBe(currentIso);
    });

    it('UC-04.1/AC3 seed lặp không bật lại danh mục admin đã ẩn và không đổi updatedAt khi metadata không đổi', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-khoac' } });
      const initialIso = cat.updatedAt.toISOString();

      // Admin ẩn danh mục ao-khoac
      await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: false, expectedUpdatedAt: initialIso })
        .expect(200);

      const hiddenCat = await t.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(hiddenCat.isActive).toBe(false);
      const hiddenIso = hiddenCat.updatedAt.toISOString();

      // Chạy lại seedCatalog
      await seedCatalog(t.prisma);

      // Kiểm tra: danh mục vẫn giữ nguyên isActive: false và updatedAt không bị đổi vô cớ!
      const afterSeed = await t.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(afterSeed.isActive).toBe(false);
      expect(afterSeed.updatedAt.toISOString()).toBe(hiddenIso);
    });

    it('UC-04.1/AC3 clock tương lai: updatedAt ở tương lai vẫn tăng đơn điệu +1ms và request token cũ bị 409', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'quan' } });
      const futureDate = new Date(Date.now() + 3600_000); // 1 giờ sau
      await t.prisma
        .$executeRaw`UPDATE categories SET updated_at = ${futureDate} WHERE id = ${cat.id}::uuid`;

      const initialIso = futureDate.toISOString();

      // Admin cập nhật trạng thái với token tương lai
      const res = await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: !cat.isActive, expectedUpdatedAt: initialIso })
        .expect(200);

      const newTimestamp = new Date(res.body.updatedAt).getTime();
      expect(newTimestamp).toBeGreaterThan(futureDate.getTime());
      expect(newTimestamp).toBe(futureDate.getTime() + 1);

      // Request tiếp theo gửi lại token tương lai cũ (initialIso) phải nhận 409
      await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: cat.isActive, expectedUpdatedAt: initialIso })
        .expect(409);
    });

    it('UC-04.1/AC3 hiện tượng ABA: A đổi ẩn rồi hiện lại, B gửi yêu cầu với token ban đầu vẫn bị 409 dù mục tiêu trùng trạng thái', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'quan' } });
      const tokenT0 = cat.updatedAt.toISOString();

      // Admin A ẩn danh mục (T0 -> T1)
      const res1 = await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: false, expectedUpdatedAt: tokenT0 })
        .expect(200);
      const tokenT1 = res1.body.updatedAt;

      // Admin A bật lại danh mục (T1 -> T2, trạng thái trở lại true giống ban đầu - A -> B -> A)
      const res2 = await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: true, expectedUpdatedAt: tokenT1 })
        .expect(200);
      const tokenT2 = res2.body.updatedAt;
      expect(tokenT2).not.toBe(tokenT0);

      // Admin B (vẫn giữ token ban đầu T0) cố gắng thực hiện thay đổi
      // Dù isActive mục tiêu trùng hay khác, do token T0 != T2, phải bị từ chối 409!
      const resB = await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: false, expectedUpdatedAt: tokenT0 })
        .expect(409);
      expect(resB.body.message).toContain('Tải lại và xác nhận lại');

      // Kể cả khi Admin B gửi isActive: true (trùng trạng thái hiện tại), token cũ T0 vẫn phải 409
      await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: true, expectedUpdatedAt: tokenT0 })
        .expect(409);
    });

    it('UC-04.1/AC3 hai admin cập nhật đồng thời với cùng token ban đầu: đúng một request thành công 200, request còn lại 409', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'quan' } });
      const token = cat.updatedAt.toISOString();

      const [req1, req2] = await Promise.all([
        t.http
          .patch(`/api/admin/categories/${cat.id}/visibility`)
          .set(adminAuth())
          .send({ isActive: false, expectedUpdatedAt: token }),
        t.http
          .patch(`/api/admin/categories/${cat.id}/visibility`)
          .set(adminAuth())
          .send({ isActive: false, expectedUpdatedAt: token }),
      ]);

      const statuses = [req1.status, req2.status].sort();
      expect(statuses).toEqual([200, 409]);
    });

    it('UC-04.1/AC3 seed đổi metadata bảo lưu isActive=false của admin và cập nhật đơn điệu khiến token admin cũ 409', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-khoac' } });
      const tokenT0 = cat.updatedAt.toISOString();

      // Admin ẩn danh mục ao-khoac
      const resHide = await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: false, expectedUpdatedAt: tokenT0 })
        .expect(200);
      const tokenT1 = resHide.body.updatedAt;

      // Làm metadata trong DB lệch so với taxonomy trong seed (sortOrder 1 -> 999)
      await t.prisma.category.update({
        where: { id: cat.id },
        data: { sortOrder: 999 },
      });

      // Chạy seedCatalog -> seed cập nhật sortOrder về taxonomy chuẩn và giữ isActive: false
      await seedCatalog(t.prisma);

      const catAfterSeed = await t.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(catAfterSeed.isActive).toBe(false);
      expect(catAfterSeed.sortOrder).not.toBe(999);

      // Yêu cầu của admin dùng token T1 cũ bị 409 vì metadata đã được cập nhật
      await t.http
        .patch(`/api/admin/categories/${cat.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: true, expectedUpdatedAt: tokenT1 })
        .expect(409);
    });
  });

  describe('UC-04.1/AC4 Ngữ nghĩa phân cấp cha–con', () => {
    it('UC-04.1/AC4 ẩn cha làm con có effectiveActive=false và parentHidden=true nhưng KHÔNG đổi cờ DB của con', async () => {
      const parentAo = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao' } });
      const childAoThun = await t.prisma.category.findUniqueOrThrow({
        where: { slug: 'ao-thun' },
      });
      expect(parentAo.isActive).toBe(true);
      expect(childAoThun.isActive).toBe(true);

      // Ẩn cha 'ao'
      await t.http
        .patch(`/api/admin/categories/${parentAo.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: false, expectedUpdatedAt: parentAo.updatedAt.toISOString() })
        .expect(200);

      // Kiểm tra DB của con: cờ isActive VẪN LÀ true
      const childInDb = await t.prisma.category.findUniqueOrThrow({
        where: { id: childAoThun.id },
      });
      expect(childInDb.isActive).toBe(true);

      // Đọc chi tiết con: effectiveActive = false, parentHidden = true
      const childDetail = await t.http
        .get(`/api/admin/categories/${childAoThun.id}`)
        .set(adminAuth())
        .expect(200);

      expect(childDetail.body).toMatchObject({
        id: childAoThun.id,
        isActive: true,
        effectiveActive: false,
        parentHidden: true,
      });
    });

    it('UC-04.1/AC4 bật con khi cha đang ẩn: lưu isActive=true nhưng vẫn báo parentHidden=true', async () => {
      const parentAo = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao' } });
      const childAoThun = await t.prisma.category.findUniqueOrThrow({
        where: { slug: 'ao-thun' },
      });

      // Ẩn cả cha lẫn con trước
      await t.prisma.category.update({
        where: { id: parentAo.id },
        data: { isActive: false },
      });
      await t.prisma.category.update({
        where: { id: childAoThun.id },
        data: { isActive: false },
      });

      const childBefore = await t.prisma.category.findUniqueOrThrow({
        where: { id: childAoThun.id },
      });

      // Bật lại con khi cha đang ẩn
      const res = await t.http
        .patch(`/api/admin/categories/${childAoThun.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: true, expectedUpdatedAt: childBefore.updatedAt.toISOString() })
        .expect(200);

      expect(res.body).toMatchObject({
        id: childAoThun.id,
        isActive: true,
        effectiveActive: false,
        parentHidden: true,
      });

      // DB của con thực sự đã được lưu isActive = true
      const childAfter = await t.prisma.category.findUniqueOrThrow({
        where: { id: childAoThun.id },
      });
      expect(childAfter.isActive).toBe(true);
    });

    it('UC-04.1/AC4 bật lại cha chỉ khôi phục các con có isActive=true, con bị ẩn riêng vẫn ẩn', async () => {
      const parentAo = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao' } });
      const childAoThun = await t.prisma.category.findUniqueOrThrow({
        where: { slug: 'ao-thun' },
      });
      const childAoSomi = await t.prisma.category.findUniqueOrThrow({
        where: { slug: 'ao-so-mi' },
      });

      // Ẩn cha 'ao' và ẩn riêng 'ao-thun', 'ao-so-mi' giữ isActive=true
      await t.prisma.category.update({
        where: { id: parentAo.id },
        data: { isActive: false },
      });
      await t.prisma.category.update({
        where: { id: childAoThun.id },
        data: { isActive: false },
      });
      await t.prisma.category.update({
        where: { id: childAoSomi.id },
        data: { isActive: true },
      });

      const parentBefore = await t.prisma.category.findUniqueOrThrow({
        where: { id: parentAo.id },
      });

      // Bật lại cha 'ao'
      await t.http
        .patch(`/api/admin/categories/${parentAo.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: true, expectedUpdatedAt: parentBefore.updatedAt.toISOString() })
        .expect(200);

      // 'ao-so-mi' (có isActive=true) tự động có effectiveActive=true
      const somiDetail = await t.http
        .get(`/api/admin/categories/${childAoSomi.id}`)
        .set(adminAuth())
        .expect(200);
      expect(somiDetail.body).toMatchObject({
        isActive: true,
        effectiveActive: true,
        parentHidden: false,
      });

      // 'ao-thun' (bị ẩn riêng) vẫn có isActive=false, effectiveActive=false, parentHidden=false
      const thunDetail = await t.http
        .get(`/api/admin/categories/${childAoThun.id}`)
        .set(adminAuth())
        .expect(200);
      expect(thunDetail.body).toMatchObject({
        isActive: false,
        effectiveActive: false,
        parentHidden: false,
      });
    });

    it('UC-04.1/AC4 cập nhật đua đồng thời giữa danh mục cha và con: không deadlock, DB cờ con độc lập và phân cấp phản ánh đúng', async () => {
      const parent = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao' } });
      const child = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-khoac' } });
      const parentToken = parent.updatedAt.toISOString();
      const childToken = child.updatedAt.toISOString();

      // Chạy đồng thời: Ẩn cha và Đổi cờ con
      const [parentRes, childRes] = await Promise.all([
        t.http
          .patch(`/api/admin/categories/${parent.id}/visibility`)
          .set(adminAuth())
          .send({ isActive: false, expectedUpdatedAt: parentToken }),
        t.http
          .patch(`/api/admin/categories/${child.id}/visibility`)
          .set(adminAuth())
          .send({ isActive: true, expectedUpdatedAt: childToken }),
      ]);

      expect(parentRes.status).toBe(200);
      expect(childRes.status).toBe(200);

      // Đọc lại chi tiết con qua API: con có isActive=true trong DB nhưng effectiveActive=false và parentHidden=true vì cha đang ẩn
      const detailRes = await t.http
        .get(`/api/admin/categories/${child.id}`)
        .set(adminAuth())
        .expect(200);

      expect(detailRes.body.isActive).toBe(true);
      expect(detailRes.body.effectiveActive).toBe(false);
      expect(detailRes.body.parentHidden).toBe(true);
    });
  });

  describe('UC-04.1/AC5 Storefront và Cart phản ánh danh mục bị ẩn', () => {
    it('UC-04.1/AC5 storefront loại bỏ danh mục ẩn, và Cart từ chối biến thể thuộc danh mục ẩn', async () => {
      const catAoThun = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-thun' } });

      // Admin ẩn danh mục ao-thun
      await t.http
        .patch(`/api/admin/categories/${catAoThun.id}/visibility`)
        .set(adminAuth())
        .send({ isActive: false, expectedUpdatedAt: catAoThun.updatedAt.toISOString() })
        .expect(200);

      // 1. Storefront tree không chứa ao-thun
      const publicTree = await t.http.get('/api/categories').expect(200);
      const aoRoot = (
        publicTree.body as Array<{ slug: string; children: Array<{ slug: string }> }>
      ).find((c) => c.slug === 'ao');
      expect(aoRoot?.children.some((c) => c.slug === 'ao-thun')).toBe(false);

      // 2. Storefront chi tiết ao-thun trả 404
      await t.http.get('/api/categories/ao-thun').expect(404);

      // 3. Storefront tìm sản phẩm theo categorySlug ao-thun trả 0 kết quả
      const publicProducts = await t.http.get('/api/products?categorySlug=ao-thun').expect(200);
      expect(publicProducts.body.total).toBe(0);

      // 4. Cart service getVariantForCart trả isActive = false cho sản phẩm thuộc danh mục ẩn
      const productsService = t.app.get(ProductsService);
      const productInAoThun = await t.prisma.product.findFirstOrThrow({
        where: { categoryId: catAoThun.id },
        include: { variants: true },
      });
      const cartVariant = await productsService.getVariantForCart(productInAoThun.variants[0]!.id);
      expect(cartVariant).toBeDefined();
      expect(cartVariant?.isActive).toBe(false);
    });
  });

  describe('Đợt 1 Quản trị danh mục: Tạo, Sửa, Phân cấp 2 cấp & Concurrency (Issue #120)', () => {
    it('POST /api/admin/categories từ chối 401/403 với khách hoặc customer', async () => {
      const payload = { id: randomUUID(), name: 'Danh mục mới' };
      await t.http.post('/api/admin/categories').send(payload).expect(401);
      await t.http.post('/api/admin/categories').set(customerAuth()).send(payload).expect(403);
    });

    it('POST /api/admin/categories tạo danh mục mặc định ẩn (isActive=false), tự sinh slug và hỗ trợ idempotent retry', async () => {
      const id = randomUUID();
      const res = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id, name: 'Áo Khoác Đầm Mới', sortOrder: 12 })
        .expect(201);

      expect(res.body).toMatchObject({
        id,
        name: 'Áo Khoác Đầm Mới',
        slug: 'ao-khoac-dam-moi',
        parentId: null,
        sortOrder: 12,
        isActive: false,
        effectiveActive: false,
      });

      // Retry cùng UUID & payload -> trả lại thành công idempotent (không tạo bản ghi thứ 2)
      const retry = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id, name: 'Áo Khoác Đầm Mới', slug: 'ao-khoac-dam-moi', sortOrder: 12 })
        .expect(201);
      expect(retry.body.id).toBe(id);

      // Retry cùng UUID nhưng payload khác -> 409
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id, name: 'Tên Khác', sortOrder: 12 })
        .expect(409);

      // Tạo với slug đã tồn tại nhưng UUID khác -> 409
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: randomUUID(), name: 'Áo Khoác Đầm Mới', slug: 'ao-khoac-dam-moi' })
        .expect(409);
    });

    it('CODEX: POST và PATCH từ chối null cho các trường không nullable (name, sortOrder) bằng HTTP 400', async () => {
      const validId = randomUUID();
      // POST với name: null
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: validId, name: null })
        .expect(400);

      // POST với sortOrder: null
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: validId, name: 'Valid Name', sortOrder: null })
        .expect(400);

      // Tạo một danh mục hợp lệ trước
      const created = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: validId, name: 'Danh Mục Test Null' })
        .expect(201);

      // PATCH với name: null
      await t.http
        .patch(`/api/admin/categories/${validId}`)
        .set(adminAuth())
        .send({ name: null, expectedUpdatedAt: created.body.updatedAt })
        .expect(400);

      // PATCH với sortOrder: null
      await t.http
        .patch(`/api/admin/categories/${validId}`)
        .set(adminAuth())
        .send({ sortOrder: null, expectedUpdatedAt: created.body.updatedAt })
        .expect(400);

      // PATCH với parentId: null là hợp lệ (đưa về root)
      await t.http
        .patch(`/api/admin/categories/${validId}`)
        .set(adminAuth())
        .send({ parentId: null, expectedUpdatedAt: created.body.updatedAt })
        .expect(200);
    });

    it('POST /api/admin/categories chặn tạo con dưới danh mục cấp 2 hoặc danh mục có sản phẩm trực tiếp (422)', async () => {
      const level2 = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-thun' } });
      expect(level2.parentId).not.toBeNull();

      // Cha là cấp 2 -> 422
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: randomUUID(), name: 'Con cấp 3', parentId: level2.id })
        .expect(422);

      // Tạo danh mục gốc rỗng rồi gắn 1 sản phẩm trực tiếp -> không thể thêm con (422)
      const rootId = randomUUID();
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: rootId, name: 'Gốc có sản phẩm' })
        .expect(201);

      await t.prisma.product.create({
        data: {
          name: 'Sản phẩm trực tiếp',
          slug: 'san-pham-truc-tiep-cat-test',
          categoryId: rootId,
          isActive: true,
          priceFrom: 100000,
        },
      });

      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: randomUUID(), name: 'Con của gốc có SP', parentId: rootId })
        .expect(422);
    });

    it('PATCH /api/admin/categories/:id cập nhật tên, thứ tự, đổi cha an toàn, kiểm CAS trước no-op và giữ slug bất biến', async () => {
      const rootAId = randomUUID();
      const rootBId = randomUUID();
      const childId = randomUUID();

      const resA = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: rootAId, name: 'Gốc A Test', sortOrder: 1 })
        .expect(201);
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: rootBId, name: 'Gốc B Test', sortOrder: 2 })
        .expect(201);
      const resChild = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: childId, name: 'Con Test', parentId: rootAId, sortOrder: 3 })
        .expect(201);

      // Gửi slug trong PATCH bị từ chối (400 forbidNonWhitelisted)
      await t.http
        .patch(`/api/admin/categories/${childId}`)
        .set(adminAuth())
        .send({ slug: 'doi-slug', expectedUpdatedAt: resChild.body.updatedAt })
        .expect(400);

      // Self-parent bị 422
      await t.http
        .patch(`/api/admin/categories/${childId}`)
        .set(adminAuth())
        .send({ parentId: childId, expectedUpdatedAt: resChild.body.updatedAt })
        .expect(422);

      // Gốc A đang có con -> không thể chuyển thành con của Gốc B (422)
      await t.http
        .patch(`/api/admin/categories/${rootAId}`)
        .set(adminAuth())
        .send({ parentId: rootBId, expectedUpdatedAt: resA.body.updatedAt })
        .expect(422);

      // No-op với token đúng -> giữ nguyên updatedAt
      const noopRes = await t.http
        .patch(`/api/admin/categories/${childId}`)
        .set(adminAuth())
        .send({ name: 'Con Test', sortOrder: 3, expectedUpdatedAt: resChild.body.updatedAt })
        .expect(200);
      expect(noopRes.body.updatedAt).toBe(resChild.body.updatedAt);

      // Sửa tên, thứ tự, chuyển cha sang Gốc B
      const patchRes = await t.http
        .patch(`/api/admin/categories/${childId}`)
        .set(adminAuth())
        .send({
          name: 'Con Đã Đổi Tên',
          parentId: rootBId,
          sortOrder: 9,
          expectedUpdatedAt: resChild.body.updatedAt,
        })
        .expect(200);
      expect(patchRes.body.name).toBe('Con Đã Đổi Tên');
      expect(patchRes.body.parentId).toBe(rootBId);
      expect(patchRes.body.sortOrder).toBe(9);
      expect(patchRes.body.slug).toBe('con-test');

      // CAS trước no-op: gửi lại expectedUpdatedAt cũ dù payload giống hệt server hiện tại -> vẫn 409
      await t.http
        .patch(`/api/admin/categories/${childId}`)
        .set(adminAuth())
        .send({
          name: 'Con Đã Đổi Tên',
          parentId: rootBId,
          sortOrder: 9,
          expectedUpdatedAt: resChild.body.updatedAt,
        })
        .expect(409);
    });

    it('adminManagedFields bảo vệ name/parentId/sortOrder admin đã sửa qua seedCatalog', async () => {
      const cat = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-khoac' } });
      const patched = await t.http
        .patch(`/api/admin/categories/${cat.id}`)
        .set(adminAuth())
        .send({
          name: 'Áo Khoác Admin Đặt',
          sortOrder: 77,
          expectedUpdatedAt: cat.updatedAt.toISOString(),
        })
        .expect(200);
      expect(patched.body.name).toBe('Áo Khoác Admin Đặt');

      await seedCatalog(t.prisma);

      const afterSeed = await t.prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(afterSeed.name).toBe('Áo Khoác Admin Đặt');
      expect(afterSeed.sortOrder).toBe(77);
      expect(afterSeed.adminManagedFields).toEqual(expect.arrayContaining(['name', 'sortOrder']));
    });

    it('Hai POST đồng thời cùng UUID+payload trả kết quả idempotent không 500; cùng slug khác UUID chỉ 1 thành công và 1 trả 409', async () => {
      const sharedId = randomUUID();
      const [r1, r2] = await Promise.all([
        t.http
          .post('/api/admin/categories')
          .set(adminAuth())
          .send({ id: sharedId, name: 'Đồng Thời Cùng UUID', sortOrder: 1 }),
        t.http
          .post('/api/admin/categories')
          .set(adminAuth())
          .send({ id: sharedId, name: 'Đồng Thời Cùng UUID', sortOrder: 1 }),
      ]);
      expect([r1.status, r2.status]).toEqual([201, 201]);
      expect(r1.body.id).toBe(sharedId);
      expect(r2.body.id).toBe(sharedId);

      const [s1, s2] = await Promise.all([
        t.http
          .post('/api/admin/categories')
          .set(adminAuth())
          .send({ id: randomUUID(), name: 'Trùng Slug Race', slug: 'trung-slug-race' }),
        t.http
          .post('/api/admin/categories')
          .set(adminAuth())
          .send({ id: randomUUID(), name: 'Trùng Slug Race', slug: 'trung-slug-race' }),
      ]);
      const statuses = [s1.status, s2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
    });

    it('Concurrency: khóa theo thứ tự tránh deadlock khi A->B và B->A đồng thời, và chặn cây 3 cấp khi POST con của A đua với PATCH A->B', async () => {
      const idA = randomUUID();
      const idB = randomUUID();
      const aRes = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: idA, name: 'Node A Race' })
        .expect(201);
      const bRes = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: idB, name: 'Node B Race' })
        .expect(201);

      // 1. A->B vs B->A: không deadlock (không 500), tối đa 1 thành công, bên còn lại 422
      const [ab, ba] = await Promise.all([
        t.http
          .patch(`/api/admin/categories/${idA}`)
          .set(adminAuth())
          .send({ parentId: idB, expectedUpdatedAt: aRes.body.updatedAt }),
        t.http
          .patch(`/api/admin/categories/${idB}`)
          .set(adminAuth())
          .send({ parentId: idA, expectedUpdatedAt: bRes.body.updatedAt }),
      ]);
      const cycleStatuses = [ab.status, ba.status].sort((a, b) => a - b);
      expect(cycleStatuses).toEqual([200, 422]);

      // Reset về 2 node gốc độc lập để kiểm POST con của A đua với PATCH A->B
      const idC = randomUUID();
      const idD = randomUUID();
      const cRes = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: idC, name: 'Node C Race' })
        .expect(201);
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: idD, name: 'Node D Race' })
        .expect(201);

      const [addChild, moveC] = await Promise.all([
        t.http
          .post('/api/admin/categories')
          .set(adminAuth())
          .send({ id: randomUUID(), name: 'Child of C', parentId: idC }),
        t.http
          .patch(`/api/admin/categories/${idC}`)
          .set(adminAuth())
          .send({ parentId: idD, expectedUpdatedAt: cRes.body.updatedAt }),
      ]);
      const hierarchyStatuses = [addChild.status, moveC.status].sort((a, b) => a - b);
      expect(hierarchyStatuses).toEqual([201, 422]);
    });

    async function waitForBlockedQueries(
      expectedBlockedCount = 1,
      timeoutMs = 5000,
    ): Promise<void> {
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

    it('Concurrency gate Chiều 1: Thêm danh mục con thắng trước, Import chạy sau bị từ chối (không bao giờ vừa có con vừa có sản phẩm)', async () => {
      const productsService = t.app.get(ProductsService);
      const catAId = randomUUID();
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: catAId, name: 'Gate Cat A', slug: 'gate-cat-a' })
        .expect(201);

      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "categories" WHERE id = ${catAId}::uuid FOR UPDATE`;
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

      const postChildPromise = sendPostAsync('/api/admin/categories', {
        id: randomUUID(),
        name: 'Child Gate A',
        parentId: catAId,
      });

      await waitForBlockedQueries(1);
      releaseGate();

      const childRes = await postChildPromise;
      expect(childRes.status).toBe(201);

      const importRes = await productsService.importProducts([
        {
          sourceKey: 'gate-order-a',
          name: 'SP Gate A',
          categorySlug: 'gate-cat-a',
          images: [],
          variants: [{ sku: 'GATE-SKU-A', listPrice: '150000' }],
        },
      ]);

      expect(importRes[0]?.status).toBe('failed');
      const childCount = await t.prisma.category.count({ where: { parentId: catAId } });
      const prodCount = await t.prisma.product.count({ where: { categoryId: catAId } });
      expect(childCount).toBe(1);
      expect(prodCount).toBe(0);
    });

    it('Concurrency gate Chiều 2: Import thắng trước, Thêm danh mục con chạy sau bị từ chối bằng 422', async () => {
      const productsService = t.app.get(ProductsService);
      const catBId = randomUUID();
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: catBId, name: 'Gate Cat B', slug: 'gate-cat-b' })
        .expect(201);

      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "categories" WHERE id = ${catBId}::uuid FOR UPDATE`;
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

      const importPromise = productsService.importProducts([
        {
          sourceKey: 'gate-order-b',
          name: 'SP Gate B',
          categorySlug: 'gate-cat-b',
          images: [],
          variants: [{ sku: 'GATE-SKU-B', listPrice: '150000' }],
        },
      ]);

      await waitForBlockedQueries(1);
      releaseGate();

      const importRes = await importPromise;
      expect(importRes[0]?.status).toBe('created');

      const childRes = await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: randomUUID(), name: 'Child Gate B', parentId: catBId });

      expect(childRes.status).toBe(422);
      expect(childRes.body.message).toContain(
        'Không thể thêm danh mục con vào danh mục đang có sản phẩm trực tiếp',
      );

      const childCount = await t.prisma.category.count({ where: { parentId: catBId } });
      const prodCount = await t.prisma.product.count({ where: { categoryId: catBId } });
      expect(childCount).toBe(0);
      expect(prodCount).toBe(1);
    });

    it('Concurrency gate: cả hai request xếp hàng sau khóa, gate mở chỉ cho phép duy nhất một bên thành công', async () => {
      const productsService = t.app.get(ProductsService);
      const catCId = randomUUID();
      await t.http
        .post('/api/admin/categories')
        .set(adminAuth())
        .send({ id: catCId, name: 'Gate Cat C', slug: 'gate-cat-c' })
        .expect(201);

      let releaseGate!: () => void;
      const gateEntered = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "categories" WHERE id = ${catCId}::uuid FOR UPDATE`;
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

      const postChildPromise = sendPostAsync('/api/admin/categories', {
        id: randomUUID(),
        name: 'Child Gate C',
        parentId: catCId,
      });
      const importPromise = productsService.importProducts([
        {
          sourceKey: 'gate-order-c',
          name: 'SP Gate C',
          categorySlug: 'gate-cat-c',
          images: [],
          variants: [{ sku: 'GATE-SKU-C', listPrice: '150000' }],
        },
      ]);

      // Xác minh cả hai query đều đã bị chặn trong hàng đợi pg_locks trước khi mở khóa
      await waitForBlockedQueries(2);
      releaseGate();

      const [childRes, importRes] = await Promise.all([postChildPromise, importPromise]);
      const childCount = await t.prisma.category.count({ where: { parentId: catCId } });
      const prodCount = await t.prisma.product.count({ where: { categoryId: catCId } });

      expect(childCount > 0 && prodCount > 0).toBe(false);
      if (childRes.status === 201) {
        expect(importRes[0]?.status).toBe('failed');
      } else {
        expect(childRes.status).toBe(422);
        expect(importRes[0]?.status).toBe('created');
      }
    });

    it('Concurrency gate giữa seedCatalog và Admin PATCH: khóa hàng bảo vệ CAS và adminManagedFields', async () => {
      const catD = await t.prisma.category.findUniqueOrThrow({ where: { slug: 'ao-khoac' } });

      // Chiều 1: Admin PATCH chờ khóa hàng, sau khi unblock cập nhật thành công và seedCatalog không ghi đè
      let releaseGate1!: () => void;
      const gateEntered1 = new Promise<void>((resolve) => {
        const txPromise = t.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "categories" WHERE id = ${catD.id}::uuid FOR UPDATE`;
            resolve();
            await new Promise<void>((r) => {
              releaseGate1 = r;
            });
          },
          { timeout: 15000 },
        );
        void txPromise;
      });
      await gateEntered1;

      const patchPromise = sendPatchAsync(`/api/admin/categories/${catD.id}`, {
        name: 'Áo Khoác Gate Admin',
        sortOrder: 89,
        expectedUpdatedAt: catD.updatedAt.toISOString(),
      });

      await waitForBlockedQueries(1);
      releaseGate1();

      const patched = await patchPromise;
      expect(patched.status).toBe(200);
      expect(patched.body.name).toBe('Áo Khoác Gate Admin');

      // Chạy seedCatalog: bảo vệ trường admin đã đặt
      await seedCatalog(t.prisma);
      const afterSeed = await t.prisma.category.findUniqueOrThrow({ where: { id: catD.id } });
      expect(afterSeed.name).toBe('Áo Khoác Gate Admin');
      expect(afterSeed.sortOrder).toBe(89);
      expect(afterSeed.adminManagedFields).toEqual(expect.arrayContaining(['name', 'sortOrder']));

      // Chiều 2: Khi seed hoặc giao dịch khác đã commit trước (làm thay đổi updatedAt), PATCH giữ token cũ bị từ chối 409
      const freshCat = await t.prisma.category.findUniqueOrThrow({ where: { id: catD.id } });
      const staleToken = freshCat.updatedAt.toISOString();

      // Giả lập giao dịch khác cập nhật bump updatedAt
      await t.prisma.category.update({
        where: { id: catD.id },
        data: { updatedAt: new Date(freshCat.updatedAt.getTime() + 1000) },
      });

      await t.http
        .patch(`/api/admin/categories/${catD.id}`)
        .set(adminAuth())
        .send({
          name: 'Áo Khoác Mới Nữa',
          expectedUpdatedAt: staleToken,
        })
        .expect(409);
    });
  });
});
