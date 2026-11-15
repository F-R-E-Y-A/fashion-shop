import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { InventoryService } from '../inventory/index.js';
import type { ProductsService, VariantForCart } from '../products/index.js';
import { CartService } from './cart.service.js';

// Unit: Prisma gia. Luong that tren PostgreSQL o test/cart.http.spec.ts.
describe('PH-02: doi phan loai trong gio (switchVariant)', () => {
  const variant = (id: string, productId = 'product-a', isActive = true): VariantForCart => ({
    variantId: id,
    productId,
    productSlug: productId,
    name: 'Ao thun',
    variantLabel: id,
    price: '199000',
    imageUrl: null,
    isActive,
  });
  const catalog = new Map<string, VariantForCart>();
  const stock = new Map<string, number | null>();
  const rows = new Map<string, { id: string; quantity: number; isSelected: boolean }>();

  const prisma = {
    cart: {
      findFirst: vi.fn(async () => ({ id: 'cart-1' })),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    cartItem: {
      findUnique: vi.fn(
        async ({ where }: { where: { cartId_productVariantId: { productVariantId: string } } }) => {
          const row = rows.get(where.cartId_productVariantId.productVariantId);
          return row
            ? { ...row, productVariantId: where.cartId_productVariantId.productVariantId }
            : null;
        },
      ),
      findMany: vi.fn(async () =>
        [...rows.entries()].map(([productVariantId, row]) => ({ ...row, productVariantId })),
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { cartId_productVariantId?: { productVariantId: string }; id?: string };
          data: { quantity?: number; isSelected?: boolean; productVariantId?: string };
        }) => {
          const key =
            where.cartId_productVariantId?.productVariantId ??
            [...rows.entries()].find(([, row]) => row.id === where.id)?.[0];
          if (!key) throw new Error('row not found');
          const row = rows.get(key)!;
          const next = {
            ...row,
            quantity: data.quantity ?? row.quantity,
            isSelected: data.isSelected ?? row.isSelected,
          };
          rows.delete(key);
          rows.set(data.productVariantId ?? key, next);
          return next;
        },
      ),
      delete: vi.fn(
        async ({ where }: { where: { cartId_productVariantId: { productVariantId: string } } }) => {
          rows.delete(where.cartId_productVariantId.productVariantId);
        },
      ),
    },
  };
  const database = {
    ...prisma,
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (run: (client: unknown) => Promise<unknown>) => run(database)),
  };
  const products = {
    getVariantForCart: vi.fn(async (id: string) => catalog.get(id) ?? null),
    getVariantsForCart: vi.fn(async (ids: string[]) =>
      ids.map((id) => catalog.get(id)).filter(Boolean),
    ),
  } as unknown as ProductsService;
  const inventory = {
    getAvailableQuantities: vi.fn(
      async (ids: string[]) => new Map(ids.map((id) => [id, stock.has(id) ? stock.get(id)! : 100])),
    ),
  } as unknown as InventoryService;
  const service = new CartService(database as unknown as PrismaService, products, inventory);

  beforeEach(() => {
    vi.clearAllMocks();
    catalog.clear();
    stock.clear();
    rows.clear();
    for (const id of ['den-m', 'den-l', 'trang-m']) catalog.set(id, variant(id));
    catalog.set('quan-m', variant('quan-m', 'product-b'));
    catalog.set('den-xl', variant('den-xl', 'product-a', false));
  });

  it('doi sang co khac: giu so luong, dong moi duoc chon', async () => {
    rows.set('den-m', { id: 'row-1', quantity: 2, isSelected: true });

    const cart = await service.switchVariant('den-m', 'den-l', undefined, 'guest-1');

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({ variantId: 'den-l', quantity: 2, isSelected: true });
  });

  it('dong cu dang bo chon (vd. het hang) thi sau khi doi duoc chon lai', async () => {
    rows.set('den-m', { id: 'row-1', quantity: 1, isSelected: false });

    const cart = await service.switchVariant('den-m', 'den-l', 'user-1');

    expect(cart.items[0]).toMatchObject({ variantId: 'den-l', isSelected: true });
  });

  it('bien the moi da co trong gio thi gop so luong vao dong do', async () => {
    rows.set('den-m', { id: 'row-1', quantity: 2, isSelected: true });
    rows.set('den-l', { id: 'row-2', quantity: 3, isSelected: false });

    const cart = await service.switchVariant('den-m', 'den-l', 'user-1');

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({ variantId: 'den-l', quantity: 5, isSelected: true });
    expect(prisma.cartItem.delete).toHaveBeenCalledTimes(1);
  });

  it('kiem ton tren so luong SAU khi gop: vuot thi 409, gio khong doi', async () => {
    rows.set('den-m', { id: 'row-1', quantity: 2, isSelected: true });
    rows.set('den-l', { id: 'row-2', quantity: 3, isSelected: true });
    stock.set('den-l', 4);

    await expect(service.switchVariant('den-m', 'den-l', 'user-1')).rejects.toThrow(
      ConflictException,
    );
    expect(rows.get('den-m')?.quantity).toBe(2);
    expect(rows.get('den-l')?.quantity).toBe(3);
  });

  it('bien the moi het hang thi 409', async () => {
    rows.set('den-m', { id: 'row-1', quantity: 1, isSelected: true });
    stock.set('trang-m', 0);

    await expect(service.switchVariant('den-m', 'trang-m', 'user-1')).rejects.toThrow(
      'Phân loại này hiện đã hết hàng.',
    );
  });

  it('khong doi sang bien the cua san pham khac', async () => {
    rows.set('den-m', { id: 'row-1', quantity: 1, isSelected: true });

    await expect(service.switchVariant('den-m', 'quan-m', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
  });

  it('khong doi sang bien the da ngung ban', async () => {
    rows.set('den-m', { id: 'row-1', quantity: 1, isSelected: true });

    await expect(service.switchVariant('den-m', 'den-xl', 'user-1')).rejects.toThrow(
      'Biến thể sản phẩm này đã ngừng bán.',
    );
  });

  it('dong cu khong co trong gio thi 404; bien the dich khong ton tai thi 404', async () => {
    await expect(service.switchVariant('den-m', 'den-l', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
    rows.set('den-m', { id: 'row-1', quantity: 1, isSelected: true });
    await expect(service.switchVariant('den-m', 'khong-co', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('doi sang chinh no thi tra gio, khong ghi gi', async () => {
    rows.set('den-m', { id: 'row-1', quantity: 1, isSelected: true });

    const cart = await service.switchVariant('den-m', 'den-m', 'user-1');

    expect(cart.items[0]).toMatchObject({ variantId: 'den-m', quantity: 1 });
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
  });
});
