import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { expect } from 'vitest';

import { seedShipping } from '../../prisma/seed/shipping.seed.js';
import type { StoredImage } from '../../src/infra/storage/image-storage.js';
import { grantAdminRole } from '../../src/modules/auth/grant-admin-role.js';
import type { TestApp } from './create-test-app.js';
import { resetDatabase } from './db.js';
import type { FakeImageStorage } from './fake-image-storage.js';

export interface Actor {
  id: string;
  email: string;
  auth: { Authorization: string };
}

export interface PlacedItem {
  orderId: string;
  orderItemId: string;
}

export interface ReviewWorld {
  /** Khach mua hang, ho ten 4 tu de kiem ten hien "hai tu cuoi". */
  buyer: Actor;
  /** Khach khac, khong co ho ten: ten hien la phan dau email da che. */
  other: Actor;
  admin: Actor;
  productId: string;
  productSlug: string;
  /** Don COD da xac nhan (PROCESSING), chua giao. */
  placeOrder(quantity?: number): Promise<PlacedItem>;
  markDelivered(orderId: string): Promise<void>;
  /** Don COD cua buyer da giao xong: du dieu kien danh gia. */
  deliveredItem(quantity?: number): Promise<PlacedItem>;
  /** Giao don roi viet danh gia; tra than phan hoi 201. */
  review(body: Record<string, unknown>): Promise<{ id: string; status: string }>;
}

/**
 * Dung the gioi cho bai kiem thu danh gia bang LUONG THAT: gio hang -> bao gia -> don COD -> shop
 * xac nhan -> giao xong. Ban chup san pham cua dong don vi vay giong het production.
 */
export async function setupReviewWorld(t: TestApp): Promise<ReviewWorld> {
  await resetDatabase(t.prisma);
  await t.resetRateLimits();
  const jwt = t.app.get(JwtService);
  const actor = async (email: string, fullName: string | null): Promise<Actor> => {
    const user = await t.prisma.user.create({
      data: { email, fullName, passwordHash: 'not-used', status: 'ACTIVE' },
    });
    const token = await jwt.signAsync({ sub: user.id, ver: 0 });
    return { id: user.id, email, auth: { Authorization: `Bearer ${token}` } };
  };
  const buyer = await actor('buyer@fixture.test', 'Nguyễn Thị Minh Anh');
  const other = await actor('other@fixture.test', null);
  const admin = await actor('admin@fixture.test', 'Quản trị viên');
  expect((await grantAdminRole(t.prisma, admin.email)).outcome).toBe('GRANTED');

  const province = await t.prisma.administrativeArea.create({
    data: { code: 'R01', name: 'Tỉnh thử', level: 'PROVINCE' },
  });
  const commune = await t.prisma.administrativeArea.create({
    data: { code: 'R0101', name: 'Phường thử', level: 'COMMUNE', parentId: province.id },
  });
  const addressId = (
    await t.prisma.address.create({
      data: {
        userId: buyer.id,
        administrativeAreaId: commune.id,
        recipientName: 'Khách đánh giá',
        phone: '0901234567',
        detailAddress: 'Địa chỉ kiểm thử',
        isDefault: true,
      },
    })
  ).id;
  await seedShipping(t.prisma);
  const variant = await t.prisma.productVariant.findFirstOrThrow({
    where: { isActive: true, product: { isActive: true, images: { some: {} } } },
    orderBy: { id: 'asc' },
    select: { id: true, product: { select: { id: true, slug: true } } },
  });
  await t.prisma.productVariant.update({
    where: { id: variant.id },
    data: { listPrice: '200000', salePrice: null },
  });
  await t.prisma.inventory.create({ data: { productVariantId: variant.id, quantityOnHand: 100 } });

  const adminPost = (path: string) =>
    t.http.post(`/api/admin/orders/${path}`).set(admin.auth).send({});

  const placeOrder = async (quantity = 1): Promise<PlacedItem> => {
    await t.http
      .post('/api/cart/items')
      .set(buyer.auth)
      .send({ variantId: variant.id, quantity })
      .expect(201);
    const quote = await t.http
      .post('/api/checkout/preview')
      .set(buyer.auth)
      .send({ addressId })
      .expect(201);
    const order = await t.http
      .post('/api/checkout/orders')
      .set(buyer.auth)
      .send({
        addressId,
        fingerprint: quote.body.fingerprint,
        idempotencyKey: randomUUID(),
        gateway: 'COD',
      })
      .expect(201);
    await adminPost(`${order.body.id}/confirm-cod`).expect(201);
    const item = await t.prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.body.id },
      select: { id: true },
    });
    return { orderId: order.body.id, orderItemId: item.id };
  };
  const markDelivered = async (orderId: string): Promise<void> => {
    await adminPost(`${orderId}/delivered`).expect(201);
  };
  const deliveredItem = async (quantity = 1): Promise<PlacedItem> => {
    const placed = await placeOrder(quantity);
    await markDelivered(placed.orderId);
    return placed;
  };
  const review = async (body: Record<string, unknown>) => {
    const { orderItemId } = await deliveredItem();
    const response = await t.http
      .post('/api/reviews')
      .set(buyer.auth)
      .send({ orderItemId, ...body })
      .expect(201);
    return response.body as { id: string; status: string };
  };

  return {
    buyer,
    other,
    admin,
    productId: variant.product.id,
    productSlug: variant.product.slug,
    placeOrder,
    markDelivered,
    deliveredItem,
    review,
  };
}

/**
 * Gia lap trinh duyet tai mot anh: xin phieu qua API (ghi so anh cho gan, ADR-056) roi dat anh vao
 * kho gia dung khoa trong phieu. Tra khoa de gui kem danh gia.
 */
export async function uploadPhoto(
  t: TestApp,
  storage: FakeImageStorage,
  actor: Actor,
  image: Partial<StoredImage> = {},
): Promise<string> {
  const ticket = await t.http
    .post('/api/uploads/tickets')
    .set(actor.auth)
    .send({ purpose: 'review' })
    .expect(200);
  const key = ticket.body.key as string;
  storage.put(key, image);
  return key;
}
