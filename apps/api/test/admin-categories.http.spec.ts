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
});
