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

  it('buoc khong hop le tra 409 va khong ghi lich su', async () => {
    const { tx, create } = fakeTx(0);
    await expect(
      new OrdersService({} as never).transition('o1', 'CONFIRMED', tx),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });
});
