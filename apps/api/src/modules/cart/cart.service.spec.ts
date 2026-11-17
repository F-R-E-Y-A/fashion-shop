import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { InventoryService } from '../inventory/index.js';
import type { ProductsService } from '../products/index.js';
import { calcSubtotal, calcTotal, CartService } from './cart.service.js';

describe('calcSubtotal', () => {
  it('tinh dung tich gia * so luong', () => {
    expect(calcSubtotal('299000', 3)).toBe('897000.00');
  });

  it('xu ly gia thap phan', () => {
    expect(calcSubtotal('99999.99', 2)).toBe('199999.98');
  });
});

describe('calcTotal', () => {
  it('cong don dung nhieu dong', () => {
    const items = [
      { price: '299000', quantity: 2 },
      { price: '150000', quantity: 1 },
    ];
    expect(calcTotal(items)).toBe('748000.00');
  });

  it('gio trong tra 0', () => {
    expect(calcTotal([])).toBe('0.00');
  });

  it('mot dong so luong lon', () => {
    expect(calcTotal([{ price: '100000', quantity: 10 }])).toBe('1000000.00');
  });

  it('khong bi mat do chinh xac voi so thap phan nho', () => {
    // 0.1 + 0.2 = 0.3 (khong phai 0.30000000000000004 nhu Float)
    const items = [
      { price: '0.10', quantity: 1 },
      { price: '0.20', quantity: 1 },
    ];
    expect(calcTotal(items)).toBe('0.30');
  });
});

describe('CartService.updateItem', () => {
  function setupCartService(existingQty: number, availableQty: number, isActive = true) {
    const mockTx = {
      cart: {
        findFirst: vi.fn().mockResolvedValue({ id: 'cart-1', userId: 'u1' }),
        findUnique: vi.fn().mockResolvedValue({ id: 'cart-1', userId: 'u1' }),
      },
      cartItem: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'item-1',
          cartId: 'cart-1',
          productVariantId: 'var-1',
          quantity: existingQty,
          isSelected: true,
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'item-1',
            cartId: 'cart-1',
            productVariantId: 'var-1',
            quantity: existingQty,
            isSelected: true,
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const mockPrisma = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(mockTx)),
    } as unknown as PrismaService;
    const variant = {
      variantId: 'var-1',
      productId: 'p1',
      productSlug: 'ao-so-mi',
      name: 'Áo sơ mi',
      variantLabel: 'Đen / M',
      sku: 'SKU-1',
      price: '200000.00',
      imageUrl: null,
      isActive,
    };
    const mockProducts = {
      getVariantForCart: vi.fn().mockResolvedValue(variant),
      getVariantsForCart: vi.fn().mockResolvedValue([variant]),
    } as unknown as ProductsService;
    const mockInventory = {
      getAvailableQuantities: vi.fn().mockResolvedValue(new Map([['var-1', availableQty]])),
    } as unknown as InventoryService;

    return {
      mockTx,
      service: new CartService(mockPrisma, mockProducts, mockInventory),
    };
  }

  it('chặn tăng số lượng quá tồn kho khả dụng', async () => {
    const { service, mockTx } = setupCartService(2, 3);
    await expect(service.updateItem('var-1', 5, 'u1')).rejects.toThrow(ConflictException);
    expect(mockTx.cartItem.update).not.toHaveBeenCalled();
  });

  it('vẫn cho phép giảm số lượng ngay cả khi tồn kho đã tụt thấp hơn hiện tại', async () => {
    const { service, mockTx } = setupCartService(5, 2);
    await service.updateItem('var-1', 2, 'u1');
    expect(mockTx.cartItem.update).toHaveBeenCalledWith({
      where: { cartId_productVariantId: { cartId: 'cart-1', productVariantId: 'var-1' } },
      data: { quantity: 2, isSelected: undefined },
    });
  });
});
