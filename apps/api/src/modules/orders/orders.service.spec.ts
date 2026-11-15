import { ConflictException, Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it, vi } from 'vitest';

import { type OrderStatus, type Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  attachPostCommitHooks,
  newOrderCode,
  ORDER_TRANSITIONS,
  OrdersService,
  type PostCommitHook,
  registerPostCommitHook,
  runPostCommitHooks,
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

describe('thông báo sau transaction (Review PR 74)', () => {
  it('transition: rollback thì không chạy post-commit hook và không gửi thông báo/mail', async () => {
    const mockNotifications = {
      handleOrderStatusChange: vi.fn().mockResolvedValue(undefined),
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createHistory = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({
      id: 'o1',
      orderCode: 'FR26111300000001',
      customerEmail: 'customer@example.test',
      userId: 'u1',
      totalAmount: { toString: () => '200000' },
      status: 'PROCESSING',
    });

    const tx = {
      order: { updateMany, findUnique },
      orderStatusHistory: { create: createHistory },
    } as unknown as Prisma.TransactionClient;

    const postCommitHooks: PostCommitHook[] = [];
    attachPostCommitHooks(tx, postCommitHooks);

    const service = new OrdersService({} as never, mockNotifications as never);

    await service.transition('o1', 'SHIPPED', tx, 'admin-1');

    // Trong transaction: hook đã gom lại nhưng CHƯA chạy
    expect(mockNotifications.handleOrderStatusChange).not.toHaveBeenCalled();
    expect(postCommitHooks).toHaveLength(1);

    // Giả lập transaction rollback (lỗi ở bước sau): không gọi runPostCommitHooks
    // -> Notifications hoàn toàn không được gọi
    expect(mockNotifications.handleOrderStatusChange).not.toHaveBeenCalled();

    // Giả lập transaction commit thành công: gọi runPostCommitHooks
    await runPostCommitHooks(postCommitHooks);
    expect(mockNotifications.handleOrderStatusChange).toHaveBeenCalledWith(
      {
        id: 'o1',
        orderCode: 'FR26111300000001',
        customerEmail: 'customer@example.test',
        userId: 'u1',
        status: 'SHIPPED',
        totalAmount: '200000',
      },
      'SHIPPED',
      'PROCESSING',
    );
  });

  it('create: rollback thì không gửi thông báo/mail tạo đơn', async () => {
    const mockNotifications = {
      handleOrderStatusChange: vi.fn().mockResolvedValue(undefined),
    };
    const mockCreated = {
      id: 'o2',
      orderCode: 'FR26111300000002',
      customerEmail: 'customer@example.test',
      userId: 'u1',
      status: 'PENDING_PAYMENT',
      totalAmount: { toString: () => '500000' },
    };
    const createOrder = vi.fn().mockResolvedValue(mockCreated);
    const tx = {
      order: { create: createOrder },
    } as unknown as Prisma.TransactionClient;

    const postCommitHooks: PostCommitHook[] = [];
    attachPostCommitHooks(tx, postCommitHooks);

    const service = new OrdersService({} as never, mockNotifications as never);

    await service.create(
      {
        userId: 'u1',
        email: 'customer@example.test',
        key: 'k1',
        fingerprint: 'fp1',
        due: new Date(),
        address: {} as never,
        shippingRateId: 'sr1',
        subtotal: '470000',
        shipping: '30000',
        total: '500000',
        items: [],
      },
      tx,
    );

    // Chưa commit: không gọi thông báo
    expect(mockNotifications.handleOrderStatusChange).not.toHaveBeenCalled();
    expect(postCommitHooks).toHaveLength(1);

    // Giả lập commit
    await runPostCommitHooks(postCommitHooks);
    expect(mockNotifications.handleOrderStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o2', orderCode: 'FR26111300000002' }),
      'PENDING_PAYMENT',
    );
  });

  it('bắt lỗi và log khi gửi thông báo thất bại, không để lỗi lọt ra ngoài', async () => {
    const mockNotifications = {
      handleOrderStatusChange: vi.fn().mockRejectedValue(new Error('SMTP down')),
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createHistory = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({
      id: 'o1',
      orderCode: 'FR26111300000001',
      customerEmail: 'customer@example.test',
      userId: 'u1',
      totalAmount: { toString: () => '200000' },
      status: 'PROCESSING',
    });

    const tx = {
      order: { updateMany, findUnique },
      orderStatusHistory: { create: createHistory },
    } as unknown as Prisma.TransactionClient;

    const postCommitHooks: PostCommitHook[] = [];
    attachPostCommitHooks(tx, postCommitHooks);

    const service = new OrdersService({} as never, mockNotifications as never);
    await service.transition('o1', 'SHIPPED', tx, 'admin-1');

    // Chạy hook không ném lỗi ra ngoài
    await expect(runPostCommitHooks(postCommitHooks)).resolves.not.toThrow();
  });

  it('tách biệt mảng post-commit hook giữa các transaction Proxy của Prisma 7.10 (WeakMap)', async () => {
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: 'postgresql://x:y@127.0.0.1:1/z' }),
    }) as unknown as {
      _createItxClient: (
        tx: { id: string },
        seq: number,
        opts: Record<string, unknown>,
      ) => Prisma.TransactionClient;
    };
    const tx1 = client._createItxClient({ id: 'tx-1' }, 1, {});
    const tx2 = client._createItxClient({ id: 'tx-2' }, 2, {});

    const collector1: PostCommitHook[] = [];
    const collector2: PostCommitHook[] = [];
    attachPostCommitHooks(tx1, collector1);
    attachPostCommitHooks(tx2, collector2);

    const calls: string[] = [];
    registerPostCommitHook(tx1, async () => {
      calls.push('hook-1');
    });
    registerPostCommitHook(tx2, async () => {
      calls.push('hook-2');
    });

    expect(collector1).toHaveLength(1);
    expect(collector2).toHaveLength(1);

    await runPostCommitHooks(collector1);
    expect(calls).toEqual(['hook-1']);

    await runPostCommitHooks(collector2);
    expect(calls).toEqual(['hook-1', 'hook-2']);
  });

  it('log cảnh báo khi registerPostCommitHook được gọi trên transaction chưa gắn mảng hook', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const unattachedTx = {} as Prisma.TransactionClient;

    registerPostCommitHook(unattachedTx, async () => {});

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('registerPostCommitHook được gọi trên transaction chưa gắn'),
    );
    warnSpy.mockRestore();
  });
});
