import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { InventoryService } from '../inventory/index.js';
import { ProductsService } from '../products/index.js';
import { cartOwnerKey, cartTransaction, lockCartOwners } from './cart-transaction.js';
import { CartItemResponse, CartResponse } from './dto/cart.response.js';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
  ) {}

  lockForCheckout(userId: string, tx: Prisma.TransactionClient) {
    return lockCartOwners(tx, [cartOwnerKey(userId)]);
  }

  async checkoutSelection(userId: string, tx: Prisma.TransactionClient) {
    await this.lockForCheckout(userId, tx);
    const cart = await this.findOrCreateCart(tx, userId);
    return (await this.readCart(tx, cart)).items.filter((item) => item.isSelected);
  }

  async consumePurchased(
    userId: string,
    items: { variantId: string; quantity: number }[],
    tx: Prisma.TransactionClient,
  ) {
    await this.lockForCheckout(userId, tx);
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (!cart) return;
    for (const item of items) {
      const where = {
        cartId_productVariantId: { cartId: cart.id, productVariantId: item.variantId },
      };
      const current = await tx.cartItem.findUnique({ where });
      if (!current) continue;
      if (current.quantity <= item.quantity) await tx.cartItem.delete({ where });
      else await tx.cartItem.update({ where, data: { quantity: { decrement: item.quantity } } });
    }
  }

  /**
   * Don huy/het han nha hang: chon lai cac mon cua don con trong gio. Luc dang giu, doc gio thay
   * het hang (hang dang giu cho chinh khach) va da bo chon ben vung; khong chon lai thi khach phai
   * tu tick lai moi dat duoc.
   */
  async reselectReleased(userId: string, variantIds: string[], tx: Prisma.TransactionClient) {
    await this.lockForCheckout(userId, tx);
    const cart = await tx.cart.findUnique({ where: { userId } });
    if (!cart || !variantIds.length) return;
    await tx.cartItem.updateMany({
      where: { cartId: cart.id, productVariantId: { in: variantIds } },
      data: { isSelected: true },
    });
  }

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

  /** Doc snapshot giu cung khoa voi thao tac vua ghi, khong mo transaction long nhau. */
  private async readCart(
    transaction: Prisma.TransactionClient,
    cart: { id: string },
  ): Promise<CartResponse> {
    const dbItems = await transaction.cartItem.findMany({ where: { cartId: cart.id } });
    const ids = dbItems.map((item) => item.productVariantId);
    const variants = new Map(
      (await this.products.getVariantsForCart(ids, transaction)).map((v) => [v.variantId, v]),
    );
    const quantities = await this.inventory.getAvailableQuantities(ids, transaction);
    const items: CartItemResponse[] = [];
    for (const item of dbItems) {
      const variant = variants.get(item.productVariantId);
      if (!variant)
        throw new ConflictException('Không đọc được sản phẩm trong giỏ. Vui lòng thử lại.');
      const availableQuantity = quantities.get(item.productVariantId) ?? null;
      const availability = !variant.isActive
        ? 'INACTIVE'
        : availableQuantity === null
          ? 'UNKNOWN'
          : availableQuantity === 0
            ? 'OUT_OF_STOCK'
            : item.quantity > availableQuantity
              ? 'INSUFFICIENT_STOCK'
              : 'AVAILABLE';
      // Het hang/ngung ban bo chon ben vung; co hang lai khong tu dong mua thay khach.
      const unavailable = availability === 'OUT_OF_STOCK' || availability === 'INACTIVE';
      if (unavailable && item.isSelected) {
        await transaction.cartItem.update({ where: { id: item.id }, data: { isSelected: false } });
      }
      items.push({
        ...variant,
        quantity: item.quantity,
        subtotal: calcSubtotal(variant.price, item.quantity),
        availableQuantity,
        availability,
        isSelected: unavailable ? false : item.isSelected,
        canCheckout: availability === 'AVAILABLE',
      });
    }
    const selected = items.filter((item) => item.isSelected && item.canCheckout);
    return {
      cartId: cart.id,
      items,
      total: calcTotal(selected),
      discountAmount: '0.00',
      selectedItemCount: selected.reduce((sum, item) => sum + item.quantity, 0),
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
      const variant = await this.products.getVariantForCart(variantId, transaction);
      if (!variant) throw new NotFoundException('Không tìm thấy biến thể sản phẩm.');
      if (!variant.isActive) throw new BadRequestException('Biến thể sản phẩm này đã ngừng bán.');
      const available = (await this.inventory.getAvailableQuantities([variantId], transaction)).get(
        variantId,
      );
      if (available === 0) throw new ConflictException('Sản phẩm hiện đã hết hàng.');
      const existing = await transaction.cartItem.findUnique({
        where: { cartId_productVariantId: { cartId: cart.id, productVariantId: variantId } },
      });
      if (
        quantity < 1 ||
        !Number.isInteger(quantity) ||
        quantity + (existing?.quantity ?? 0) > 2_147_483_647
      ) {
        throw new BadRequestException('Số lượng vượt giới hạn hỗ trợ.');
      }
      if (
        available !== null &&
        available !== undefined &&
        quantity + (existing?.quantity ?? 0) > available
      ) {
        throw new ConflictException(
          `Chỉ còn ${available} sản phẩm. Vui lòng kiểm tra lại số lượng.`,
        );
      }
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
    quantity: number | undefined,
    userId?: string,
    guestToken?: string,
    isSelected?: boolean,
  ): Promise<CartResponse> {
    if (quantity === undefined && isSelected === undefined)
      throw new BadRequestException('Cần số lượng hoặc trạng thái chọn.');
    return this.withCart(userId, guestToken, async (transaction, cart) => {
      const key = { cartId: cart.id, productVariantId: variantId };
      if (!(await transaction.cartItem.findUnique({ where: { cartId_productVariantId: key } }))) {
        throw new NotFoundException('Không tìm thấy dòng giỏ hàng.');
      }
      await transaction.cartItem.update({
        where: { cartId_productVariantId: key },
        data: { quantity, isSelected },
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
            create: { ...key, quantity: item.quantity, isSelected: item.isSelected },
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
