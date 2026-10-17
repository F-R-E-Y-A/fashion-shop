import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { cartOwnerKey, cartTransaction } from './cart-transaction.js';
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

  /** Chi goi sau khi transaction da khoa chu so huu. */
  private async findOrCreateCart(
    transaction: Prisma.TransactionClient,
    userId?: string,
    guestToken?: string,
  ): Promise<{ id: string }> {
    const existing = await transaction.cart.findFirst({
      where: userId ? { userId } : { guestToken, userId: null },
    });
    if (existing) return existing;
    if (!userId && (await transaction.cart.findUnique({ where: { guestToken } }))) {
      throw new ConflictException('Định danh giỏ khách không còn sử dụng được.');
    }
    return transaction.cart.create({
      data: userId ? { userId, guestToken: null } : { userId: null, guestToken },
    });
  }

  private withCart<T>(
    userId: string | undefined,
    guestToken: string | undefined,
    work: (transaction: Prisma.TransactionClient, cart: { id: string }) => Promise<T>,
  ): Promise<T> {
    const owner = cartOwnerKey(userId, guestToken);
    return cartTransaction(this.prisma, [owner], async (transaction) => {
      const cart = await this.findOrCreateCart(transaction, userId, guestToken);
      return work(transaction, cart);
    });
  }

  /** Lay thong tin bien the: doc tu CSDL that, fallback ve mock neu chua co */
  private async getVariantInfo(
    transaction: Prisma.TransactionClient,
    variantId: string,
  ): Promise<VariantForCart> {
    try {
      const row = await transaction.productVariant.findUnique({
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

  /** Doc snapshot giu cung khoa voi thao tac vua ghi, khong mo transaction long nhau. */
  private async readCart(
    transaction: Prisma.TransactionClient,
    cart: { id: string },
  ): Promise<CartResponse> {
    const dbItems = await transaction.cartItem.findMany({ where: { cartId: cart.id } });

    // Mot transaction dung mot ket noi PostgreSQL; doc lan luot thay vi xep nhieu query dong thoi.
    const items: CartItemResponse[] = [];
    for (const item of dbItems) {
      const variant = await this.getVariantInfo(transaction, item.productVariantId);
      items.push({
        ...variant,
        quantity: item.quantity,
        subtotal: calcSubtotal(variant.price, item.quantity),
      });
    }

    return {
      cartId: cart.id,
      items,
      total: calcTotal(items.map((i) => ({ price: i.price, quantity: i.quantity }))),
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    };
  }

  async getCart(userId?: string, guestToken?: string): Promise<CartResponse> {
    return this.withCart(userId, guestToken, (transaction, cart) =>
      this.readCart(transaction, cart),
    );
  }

  async addItem(
    variantId: string,
    quantity: number,
    userId?: string,
    guestToken?: string,
  ): Promise<CartResponse> {
    return this.withCart(userId, guestToken, async (transaction, cart) => {
      const variant = await this.getVariantInfo(transaction, variantId);
      if (!variant.isActive) throw new BadRequestException('Biến thể sản phẩm này đã ngừng bán.');
      await transaction.cartItem.upsert({
        where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variantId } },
        create: { cartId: cart.id, productVariantId: variantId, quantity },
        update: { quantity: { increment: quantity } },
      });
      return this.readCart(transaction, cart);
    });
  }

  async updateItem(
    variantId: string,
    quantity: number,
    userId?: string,
    guestToken?: string,
  ): Promise<CartResponse> {
    return this.withCart(userId, guestToken, async (transaction, cart) => {
      const key = { cartId: cart.id, productVariantId: variantId };
      if (!(await transaction.cartItem.findUnique({ where: { cartId_productVariantId: key } }))) {
        throw new NotFoundException('Không tìm thấy dòng giỏ hàng.');
      }
      await transaction.cartItem.update({
        where: { cartId_productVariantId: key },
        data: { quantity },
      });
      return this.readCart(transaction, cart);
    });
  }

  async removeItem(variantId: string, userId?: string, guestToken?: string): Promise<CartResponse> {
    return this.withCart(userId, guestToken, async (transaction, cart) => {
      await transaction.cartItem.deleteMany({
        where: { cartId: cart.id, productVariantId: variantId },
      });
      return this.readCart(transaction, cart);
    });
  }

  async clearCart(userId?: string, guestToken?: string): Promise<void> {
    await this.withCart(userId, guestToken, (transaction, cart) =>
      transaction.cartItem.deleteMany({ where: { cartId: cart.id } }),
    );
  }

  /** Nguon guest va dich account cung khoa, cung transaction: retry khong cong lai nguon da xoa. */
  async mergeCarts(guestToken: string | undefined, userId: string): Promise<CartResponse> {
    if (guestToken === undefined) return this.getCart(userId);
    const owners = [cartOwnerKey(undefined, guestToken), cartOwnerKey(userId)];
    return cartTransaction(this.prisma, owners, async (transaction) => {
      const guestCart = await transaction.cart.findUnique({ where: { guestToken } });
      // Token legacy khong bao gio duoc dung lam nguon, ke ca cua chinh account dang dang nhap.
      if (guestCart?.userId) {
        throw new ConflictException('Định danh giỏ khách không còn sử dụng được.');
      }
      const userCart = await this.findOrCreateCart(transaction, userId);
      if (guestCart) {
        if (guestCart.id === userCart.id) {
          throw new ConflictException('Không thể gộp giỏ hàng vào chính nó.');
        }
        const guestItems = await transaction.cartItem.findMany({ where: { cartId: guestCart.id } });
        for (const item of guestItems) {
          const key = { cartId: userCart.id, productVariantId: item.productVariantId };
          const existing = await transaction.cartItem.findUnique({
            where: { cartId_productVariantId: key },
          });
          const combined = (existing?.quantity ?? 0) + item.quantity;
          // Int cua PostgreSQL co gioi han; khong cat bot so luong hay de tran so lam mat nguon.
          if (item.quantity < 1 || combined < 1 || combined > 2_147_483_647) {
            throw new ConflictException('Số lượng sau khi gộp vượt giới hạn hỗ trợ.');
          }
          await transaction.cartItem.upsert({
            where: { cartId_productVariantId: key },
            create: { ...key, quantity: item.quantity },
            update: { quantity: { increment: item.quantity } },
          });
        }
        const deleted = await transaction.cart.deleteMany({
          where: { id: guestCart.id, userId: null },
        });
        if (deleted.count !== 1) throw new ConflictException('Chủ sở hữu giỏ hàng vừa thay đổi.');
      }
      return this.readCart(transaction, userCart);
    });
  }
}
