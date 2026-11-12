import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import {
  newOrderCode,
  ORDER_TRANSITIONS,
  OrdersService,
  statusesLeadingTo,
} from './orders.service.js';

describe('newOrderCode', () => {
  it('FR + ngay theo gio VN + 8 ky tu base32 khong nham lan', () => {
    // 2026-10-19T18:30Z la 01:30 ngay 20/10 o Viet Nam.
    const code = newOrderCode(new Date('2026-10-19T18:30:00Z'));
    expect(code).toMatch(/^FR261020[0-9A-HJKMNP-TV-Z]{8}$/u);
  });

  it('khong lap trong mot loat lon', () => {
    const codes = new Set(Array.from({ length: 5000 }, () => newOrderCode()));
    expect(codes.size).toBe(5000);
  });
});

describe('buoc chuyen trang thai don', () => {
  it('chi don cho tra tien hoac cho xac nhan COD moi thanh CONFIRMED', () => {
    expect(statusesLeadingTo('CONFIRMED').sort()).toEqual([
      'PENDING_CONFIRMATION',
      'PENDING_PAYMENT',
    ]);
    expect(ORDER_TRANSITIONS.CANCELLED).not.toContain('CONFIRMED');
    expect(ORDER_TRANSITIONS.REFUNDED).not.toContain('PARTIALLY_REFUNDED');
  });

  it('ADR-038: COD xac nhan thi giao, giao that bai thi huy; don da huy chi di tiep sang hoan tien', () => {
    expect(ORDER_TRANSITIONS.PENDING_CONFIRMATION).toContain('PROCESSING');
    expect(ORDER_TRANSITIONS.PROCESSING).toEqual(
      expect.arrayContaining(['DELIVERED', 'CANCELLED']),
    );
    expect(ORDER_TRANSITIONS.CONFIRMED).toContain('CANCELLED');
    expect(ORDER_TRANSITIONS.CANCELLED.filter((to) => to !== 'PAYMENT_REVIEW').sort()).toEqual([
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ]);
    // Da giao thi khong quay ve huy: hoan sau khi giao thuoc luong doi tra.
    expect(ORDER_TRANSITIONS.DELIVERED).not.toContain('CANCELLED');
  });

  it('tien ve bat thuong o moi trang thai deu vao duoc PAYMENT_REVIEW, settlement khong bi chan', () => {
    const all = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];
    expect(statusesLeadingTo('PAYMENT_REVIEW').sort()).toEqual(
      all.filter((status) => status !== 'PAYMENT_REVIEW').sort(),
    );
  });

  function fakeTx(count: number) {
    const updateMany = vi.fn().mockResolvedValue({ count });
    const create = vi.fn().mockResolvedValue({});
    const tx = { order: { updateMany }, orderStatusHistory: { create } };
    return { tx: tx as unknown as Prisma.TransactionClient, updateMany, create };
  }

  it('update co dieu kien trang thai nguon, ghi lich su kem nguoi thao tac', async () => {
    const { tx, updateMany, create } = fakeTx(1);
    await new OrdersService({} as never).transition('o1', 'SHIPPED', tx, 'admin-1');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['PROCESSING'] } },
      data: { status: 'SHIPPED' },
    });
    expect(create).toHaveBeenCalledWith({
      data: { orderId: 'o1', status: 'SHIPPED', actorUserId: 'admin-1' },
    });
  });

  it('UC-12.1/AC10 buoc khong hop le tra 409 va khong ghi lich su', async () => {
    const { tx, create } = fakeTx(0);
    await expect(
      new OrdersService({} as never).transition('o1', 'CONFIRMED', tx),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('getReviewEligibility & getOrderItemReviewEligibility', () => {
  it('nem NotFoundException khi don khong ton tai hoac khong thuoc chu', async () => {
    const prisma = {
      order: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new OrdersService(prisma as never);
    await expect(service.getReviewEligibility('order-1', 'user-1')).rejects.toThrow(
      'Không tìm thấy đơn hàng.',
    );
  });

  it('tra dung eligibility va hasDeliveredHistory dua vao statusHistory', async () => {
    const prisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'order-1',
          statusHistory: [
            { status: 'CONFIRMED' },
            { status: 'DELIVERED' },
            { status: 'PARTIALLY_REFUNDED' },
          ],
          items: [
            {
              id: 'item-1',
              productVariantId: 'var-1',
              productVariant: { productId: 'prod-1' },
            },
          ],
        }),
      },
    };
    const service = new OrdersService(prisma as never);
    const res = await service.getReviewEligibility('order-1', 'user-1');
    expect(res.hasDeliveredHistory).toBe(true);
    expect(res.items).toEqual([
      {
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
      },
    ]);
  });

  it('hasDeliveredHistory la false khi don chua tung DELIVERED', async () => {
    const prisma = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'order-2',
          statusHistory: [{ status: 'CONFIRMED' }, { status: 'PROCESSING' }],
          items: [],
        }),
      },
    };
    const service = new OrdersService(prisma as never);
    const res = await service.getReviewEligibility('order-2', 'user-1');
    expect(res.hasDeliveredHistory).toBe(false);
  });

  it('getOrderItemReviewEligibility nem NotFoundException khi dong hang khong thuoc chu', async () => {
    const prisma = {
      orderItem: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new OrdersService(prisma as never);
    await expect(service.getOrderItemReviewEligibility('item-x', 'user-1')).rejects.toThrow(
      'Không tìm thấy dòng hàng cần đánh giá.',
    );
  });

  it('getOrderItemReviewEligibility tra thong tin dong hang va DELIVERED', async () => {
    const prisma = {
      orderItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'item-1',
          orderId: 'order-1',
          productVariantId: 'var-1',
          productVariant: { productId: 'prod-1' },
          order: {
            statusHistory: [{ status: 'PROCESSING' }, { status: 'DELIVERED' }],
          },
        }),
      },
    };
    const service = new OrdersService(prisma as never);
    const res = await service.getOrderItemReviewEligibility('item-1', 'user-1');
    expect(res).toEqual({
      orderId: 'order-1',
      orderItemId: 'item-1',
      productVariantId: 'var-1',
      productId: 'prod-1',
      hasDeliveredHistory: true,
    });
  });
});
