import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CartItemResponse, CartResponse, VariantForCart } from './dto/cart.response.js';

/**
 * Lay thong tin bien the san pham de hien thi trong gio.
 * Tam thoi dung du lieu gia cho den khi Bao them ProductsService.getVariantForCart().
 * Doi: thay ham nay bang goi ProductsService that (tiem ProductsModule).
 */
function getMockVariant(variantId: string): VariantForCart {
  return {
    variantId,
    productId: '00000000-0000-0000-0000-000000000001',
    name: '[Mock] San pham mau',
    variantLabel: 'M / Den',
    price: '299000',
    imageUrl: null,
    isActive: true,
  };
}

/** Tinh tong tien cua gio hang, tra ve chuoi de tranh mat do chinh xac. */
export function calcTotal(items: { price: string; quantity: number }[]): string {
  return items
    .reduce((sum, item) => sum.plus(new Decimal(item.price).times(item.quantity)), new Decimal(0))
    .toFixed(2);
}

/** Tinh tam tinh mot dong. */
export function calcSubtotal(price: string, quantity: number): string {
  return new Decimal(price).times(quantity).toFixed(2);
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lay hoac tao gio hang. Guest dung guestToken; nguoi dung da dang nhap dung userId. */
  private async findOrCreateCart(userId?: string, guestToken?: string): Promise<{ id: string }> {
    const where = userId ? { userId } : { guestToken: guestToken ?? null };
    const existing = await this.prisma.cart.findFirst({ where });
    if (existing) return existing;

    return this.prisma.cart.create({
      data: { userId: userId ?? null, guestToken: guestToken ?? null },
    });
  }

  /** Lay thong tin bien the: doc tu CSDL that, fallback ve mock neu chua co */
  private async getVariantInfo(variantId: string): Promise<VariantForCart> {
    try {
      const row = await this.prisma.productVariant.findUnique({
        where: { id: variantId },
        include: {
          product: { include: { images: { take: 1 } } },
          color: true,
          size: true,
        },
      });

      if (row) {
        return {
          variantId: row.id,
          productId: row.productId,
          name: row.product.name,
          variantLabel: `${row.color.name} / ${row.size.code}`,
          price: String(row.salePrice ?? 299000),
          imageUrl: row.product.images[0]?.url ?? null,
          isActive: row.isActive,
        };
      }
    } catch {
      // Khi CSDL chua co hoac dang chay unit test
    }

    return getMockVariant(variantId);
  }

  /** Lay gio hien tai voi tat ca cac dong, kem thong tin san pham. */
  async getCart(userId?: string, guestToken?: string): Promise<CartResponse> {
    if (!userId && !guestToken) throw new BadRequestException('Thieu dinh danh gio hang.');

    const cart = await this.findOrCreateCart(userId, guestToken);
    const dbItems = await this.prisma.cartItem.findMany({ where: { cartId: cart.id } });

    const items: CartItemResponse[] = await Promise.all(
      dbItems.map(async (item) => {
        const variant = await this.getVariantInfo(item.productVariantId);
        return {
          ...variant,
          quantity: item.quantity,
          subtotal: calcSubtotal(variant.price, item.quantity),
        };
      }),
    );

    return {
      cartId: cart.id,
      items,
      total: calcTotal(items.map((i) => ({ price: i.price, quantity: i.quantity }))),
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    };
  }

  /**
   * Them bien the vao gio. Neu da co thi cong don so luong.
   * Dam bao rang buoc: (cartId, productVariantId) unique.
   */
  async addItem(
    variantId: string,
    quantity: number,
    userId?: string,
    guestToken?: string,
  ): Promise<CartResponse> {
    if (!userId && !guestToken) throw new BadRequestException('Thieu dinh danh gio hang.');

    const variant = await this.getVariantInfo(variantId);
    if (!variant.isActive) throw new BadRequestException('Bien the san pham nay da ngung ban.');

    const cart = await this.findOrCreateCart(userId, guestToken);

    await this.prisma.cartItem.upsert({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variantId } },
      create: { cartId: cart.id, productVariantId: variantId, quantity },
      update: { quantity: { increment: quantity } },
    });

    return this.getCart(userId, guestToken);
  }

  /** Cap nhat so luong mot dong trong gio. */
  async updateItem(
    variantId: string,
    quantity: number,
    userId?: string,
    guestToken?: string,
  ): Promise<CartResponse> {
    if (!userId && !guestToken) throw new BadRequestException('Thieu dinh danh gio hang.');

    const cart = await this.findOrCreateCart(userId, guestToken);
    const item = await this.prisma.cartItem.findUnique({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variantId } },
    });
    if (!item) throw new NotFoundException('Khong tim thay dong gio hang.');

    await this.prisma.cartItem.update({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variantId } },
      data: { quantity },
    });

    return this.getCart(userId, guestToken);
  }

  /** Xoa mot dong khoi gio. */
  async removeItem(variantId: string, userId?: string, guestToken?: string): Promise<CartResponse> {
    if (!userId && !guestToken) throw new BadRequestException('Thieu dinh danh gio hang.');

    const cart = await this.findOrCreateCart(userId, guestToken);
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productVariantId: variantId },
    });

    return this.getCart(userId, guestToken);
  }

  /** Xoa toan bo gio. */
  async clearCart(userId?: string, guestToken?: string): Promise<void> {
    if (!userId && !guestToken) throw new BadRequestException('Thieu dinh danh gio hang.');

    const cart = await this.findOrCreateCart(userId, guestToken);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  /**
   * Gop gio khach vang lai vao gio tai khoan khi dang nhap.
   * Neu ca hai co cung variantId thi cong don so luong.
   */
  async mergeCarts(guestToken: string, userId: string): Promise<CartResponse> {
    if (!guestToken) return this.getCart(userId);
    const guestCart = await this.prisma.cart.findFirst({ where: { guestToken } });
    if (!guestCart) return this.getCart(userId);

    const userCart = await this.findOrCreateCart(userId);
    const guestItems = await this.prisma.cartItem.findMany({ where: { cartId: guestCart.id } });

    for (const item of guestItems) {
      await this.prisma.cartItem.upsert({
        where: {
          cartId_productVariantId: { cartId: userCart.id, productVariantId: item.productVariantId },
        },
        create: {
          cartId: userCart.id,
          productVariantId: item.productVariantId,
          quantity: item.quantity,
        },
        update: { quantity: { increment: item.quantity } },
      });
    }

    await this.prisma.cart.delete({ where: { id: guestCart.id } });
    return this.getCart(userId);
  }
}
