import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CartService } from './cart.service.js';
import { cartReadStubs } from './test-support.js';

// Unit: Prisma gia, khong ket noi hay thay doi CSDL.
describe('PH-02 regression: Cart ownership (unit)', () => {
  const prisma = {
    cart: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    cartItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    productVariant: { findUnique: vi.fn() },
  };
  const database = {
    ...prisma,
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (run: (client: unknown) => Promise<unknown>) => run(database)),
  };
  const { products, inventory } = cartReadStubs();
  const service = new CartService(database as unknown as PrismaService, products, inventory);
  const uniqueError = () =>
    new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.cart.create.mockReset();
    prisma.cart.findFirst.mockReset();
    prisma.cart.findFirst.mockResolvedValue(null);
    prisma.cart.findUnique.mockResolvedValue(null);
    prisma.cart.create.mockResolvedValue({ id: 'new-cart' });
    prisma.cartItem.findMany.mockResolvedValue([]);
    prisma.productVariant.findUnique.mockResolvedValue(null);
  });

  it('guest tao va doc gio rieng voi userId null', async () => {
    expect((await service.getCart(undefined, 'existing-guest-token')).cartId).toBe('new-cart');
    expect(prisma.cart.findFirst).toHaveBeenCalledWith({
      where: { guestToken: 'existing-guest-token', userId: null },
    });
    expect(prisma.cart.create).toHaveBeenCalledWith({
      data: { userId: null, guestToken: 'existing-guest-token' },
    });
  });

  it('request dau sau login khong sao chep token dang thuoc gio guest', async () => {
    await service.getCart('user-a', 'existing-guest-token');
    expect(prisma.cart.findFirst).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
    expect(prisma.cart.create).toHaveBeenCalledWith({
      data: { userId: 'user-a', guestToken: null },
    });
    expect(prisma.cart.findUnique).not.toHaveBeenCalled();
  });

  it('chu tai khoan van doc duoc gio legacy, khong tach hay xoa token', async () => {
    prisma.cart.findFirst.mockResolvedValue({ id: 'legacy', userId: 'user-a', guestToken: 'old' });
    expect((await service.getCart('user-a', 'other-token')).cartId).toBe('legacy');
    expect(prisma.cart.create).not.toHaveBeenCalled();
    expect(prisma.cart.findFirst).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
  });

  it.each(['read', 'add', 'update', 'remove', 'clear'] as const)(
    'guest khong the %s gio legacy co chu tai khoan; tra 409 truoc khi ghi',
    async (operation) => {
      prisma.cart.findUnique.mockResolvedValue({ id: 'legacy', userId: 'user-b' });
      const calls = {
        read: () => service.getCart(undefined, 'old'),
        add: () => service.addItem('variant', 1, undefined, 'old'),
        update: () => service.updateItem('variant', 2, undefined, 'old'),
        remove: () => service.removeItem('variant', undefined, 'old'),
        clear: () => service.clearCart(undefined, 'old'),
      };
      await expect(calls[operation]()).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.cart.create).not.toHaveBeenCalled();
      expect(prisma.cartItem.findMany).not.toHaveBeenCalled();
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', 'token with spaces', 'a'.repeat(65)])(
    'tu choi guest credential khong hop le %s truoc lookup',
    async (token) => {
      await expect(service.getCart(undefined, token)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cart.findFirst).not.toHaveBeenCalled();
    },
  );

  it('principal hop le bo qua token guest sai dinh dang', async () => {
    await service.getCart('user-a', 'token with spaces');
    expect(prisma.cart.create).toHaveBeenCalledWith({
      data: { userId: 'user-a', guestToken: null },
    });
  });

  it('P2002 tao dong thoi chi doc lai gio guest dung ownership', async () => {
    prisma.cart.create.mockRejectedValue(uniqueError());
    prisma.cart.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'guest-cart' });
    expect((await service.getCart(undefined, 'guest-token')).cartId).toBe('guest-cart');
    expect(prisma.cart.findFirst).toHaveBeenLastCalledWith({
      where: { guestToken: 'guest-token', userId: null },
    });
  });

  it('P2002 khong tim duoc gio dung ownership tra 409, khong tra gio account', async () => {
    prisma.cart.create.mockRejectedValue(uniqueError());
    await expect(service.getCart(undefined, 'guest-token')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.cartItem.findMany).not.toHaveBeenCalled();
  });

  it('P2002 account doc lai bang principal, khong dung token guest', async () => {
    prisma.cart.create.mockRejectedValue(uniqueError());
    prisma.cart.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'account-cart' });
    expect((await service.getCart('user-a', 'old')).cartId).toBe('account-cart');
    expect(prisma.cart.findFirst).toHaveBeenLastCalledWith({ where: { userId: 'user-a' } });
  });

  it('khong che loi CSDL khac thanh ownership conflict', async () => {
    const error = new Error('database unavailable');
    prisma.cart.create.mockRejectedValue(error);
    await expect(service.getCart('user-a')).rejects.toBe(error);
  });
});
