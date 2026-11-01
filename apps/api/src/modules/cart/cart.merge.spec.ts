import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CartService } from './cart.service.js';
import { cartReadStubs } from './test-support.js';

function fixture() {
  const { products, inventory } = cartReadStubs();
  const transaction = {
    $executeRaw: vi.fn(async () => 1),
    cart: {
      findUnique: vi.fn(async () => ({ id: 'guest', userId: null as string | null })),
      findFirst: vi.fn(async () => ({ id: 'account' })),
      create: vi.fn(async () => ({ id: 'account' })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    cartItem: {
      findMany: vi.fn(async ({ where }: { where: { cartId: string } }) =>
        where.cartId === 'guest'
          ? [{ productVariantId: 'variant', quantity: 2, isSelected: false }]
          : [],
      ),
      findUnique: vi.fn(async () => null as { quantity: number } | null),
      upsert: vi.fn(async () => ({})),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: unknown) => Promise<unknown>) => run(transaction)),
  };
  return {
    transaction,
    prisma,
    service: new CartService(prisma as unknown as PrismaService, products, inventory),
  };
}

describe('PH-02 regression: atomic guest cart merge', () => {
  it('chi dung transaction client va khoa ca hai chu truoc khi doc nguon', async () => {
    const { service, transaction: tx, prisma } = fixture();
    await service.mergeCarts('guest-token', 'user-a');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(
      tx.cart.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(tx.cartItem.upsert).toHaveBeenCalledWith({
      where: { cartId_productVariantId: { cartId: 'account', productVariantId: 'variant' } },
      create: { cartId: 'account', productVariantId: 'variant', quantity: 2, isSelected: false },
      update: { quantity: { increment: 2 } },
    });
    expect(tx.cart.deleteMany).toHaveBeenCalledWith({ where: { id: 'guest', userId: null } });
    expect(tx.cartItem.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      tx.cart.deleteMany.mock.invocationCallOrder[0]!,
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it.each(['user-a', 'user-b'])(
    'token legacy cua %s tra 409 truoc khi tao dich hoac ghi; khong tu xoa gio minh',
    async (owner) => {
      const { service, transaction: tx } = fixture();
      tx.cart.findUnique.mockResolvedValue({ id: 'legacy', userId: owner });
      await expect(service.mergeCarts('legacy-token', 'user-a')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.cart.findFirst).not.toHaveBeenCalled();
      expect(tx.cart.create).not.toHaveBeenCalled();
      expect(tx.cartItem.upsert).not.toHaveBeenCalled();
      expect(tx.cart.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('nguon trung dich bi chan ngay ca khi persistence tra du lieu sai bat bien', async () => {
    const { service, transaction: tx } = fixture();
    tx.cart.findFirst.mockResolvedValue({ id: 'guest' });
    await expect(service.mergeCarts('guest-token', 'user-a')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
    expect(tx.cart.deleteMany).not.toHaveBeenCalled();
  });

  it.each(['', 'invalid token', 'x'.repeat(65)])(
    'token %s sai bi chan truoc transaction',
    async (token) => {
      const { service, prisma } = fixture();
      await expect(service.mergeCarts(token, 'user-a')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('khong co nguon chi doc gio account, khong tao lai guest', async () => {
    const { service, transaction: tx } = fixture();
    tx.cart.findUnique.mockResolvedValue(null as never);
    expect(await service.mergeCarts('consumed-token', 'user-a')).toMatchObject({
      cartId: 'account',
    });
    expect(tx.cart.create).not.toHaveBeenCalled();
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
    expect(tx.cart.deleteMany).not.toHaveBeenCalled();
  });

  it('khong co header merge chi doc gio account', async () => {
    const { service, transaction: tx } = fixture();
    await service.mergeCarts(undefined, 'user-a');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.cart.findUnique).not.toHaveBeenCalled();
  });

  it('loi ghi khong bi nuot va khong xoa nguon; rollback that kiem tren PostgreSQL', async () => {
    const { service, transaction: tx } = fixture();
    const error = new Error('injected persistence failure');
    tx.cartItem.upsert.mockRejectedValue(error);
    await expect(service.mergeCarts('guest-token', 'user-a')).rejects.toBe(error);
    expect(tx.cart.deleteMany).not.toHaveBeenCalled();
  });

  it('so luong cong don vuot PostgreSQL Int tra 409, khong cat bot hoac xoa nguon', async () => {
    const { service, transaction: tx } = fixture();
    tx.cartItem.findUnique.mockResolvedValue({ quantity: 2_147_483_646 });
    await expect(service.mergeCarts('guest-token', 'user-a')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.cartItem.upsert).not.toHaveBeenCalled();
    expect(tx.cart.deleteMany).not.toHaveBeenCalled();
  });

  it.each(['P2002', 'P2034'])(
    'retry %s bat dau transaction moi, khong retry trong transaction hong',
    async (code) => {
      const { service, prisma } = fixture();
      prisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('conflict', { code, clientVersion: 'test' }),
      );
      await service.mergeCarts('guest-token', 'user-a');
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('het ba lan retry thi tra 409, khong lap vo han', async () => {
    const { service, prisma } = fixture();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    await expect(service.mergeCarts('guest-token', 'user-a')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
