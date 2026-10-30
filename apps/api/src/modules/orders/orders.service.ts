import { randomBytes } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const details = {
  items: { orderBy: { productVariantId: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
};
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Buoc chuyen hop le cua don. Caller van tu kiem nghiep vu; day la chot cuoi o tang du lieu de
 * khong ai nhay trang thai (vd don da huy thanh CONFIRMED). Tien ve bat thuong o bat ky dau
 * cung vao PAYMENT_REVIEW, nen settlement khong bao gio bi chan va IPN khong phai gui lai mai.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'PAYMENT_REVIEW', 'CANCELLED'],
  PENDING_CONFIRMATION: ['CONFIRMED', 'PAYMENT_REVIEW', 'CANCELLED'],
  PAYMENT_REVIEW: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  CONFIRMED: ['PROCESSING', 'PAYMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  PROCESSING: ['SHIPPED', 'PAYMENT_REVIEW'],
  SHIPPED: ['DELIVERED', 'PAYMENT_REVIEW'],
  DELIVERED: ['PAYMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  CANCELLED: ['PAYMENT_REVIEW'],
  PARTIALLY_REFUNDED: ['PAYMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  REFUNDED: ['PAYMENT_REVIEW'],
};

export function statusesLeadingTo(status: OrderStatus): OrderStatus[] {
  return (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter((from) =>
    ORDER_TRANSITIONS[from].includes(status),
  );
}

/** Ma doc duoc qua dien thoai: FR + yymmdd (gio VN) + 8 ky tu base32 Crockford; cot unique chan trung. */
export function newOrderCode(now = new Date()) {
  const day = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(2, 10).replaceAll('-', '');
  const suffix = [...randomBytes(8)].map((byte) => CODE_ALPHABET[byte & 31]).join('');
  return `FR${day}${suffix}`;
}

export type OrderDetails = Prisma.OrderGetPayload<{ include: typeof details }>;

export interface NewOrder {
  userId: string;
  email: string;
  key: string;
  fingerprint: string;
  due: Date;
  address: Prisma.InputJsonObject;
  shippingRateId: string;
  subtotal: string;
  shipping: string;
  total: string;
  items: { variantId: string; quantity: number; price: string; snapshot: Prisma.InputJsonObject }[];
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async get(id: string, userId?: string, tx?: Prisma.TransactionClient) {
    const order = await (tx ?? this.prisma).order.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
      include: details,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return order;
  }

  async lock(id: string, tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${id}`}, 0))`;
  }

  byKey(checkoutKey: string, tx: Prisma.TransactionClient) {
    return tx.order.findUnique({ where: { checkoutKey }, include: details });
  }

  /** Don dang giu hang cua chu (cho tra tien con han hoac cho xac nhan COD); moi khach mot don. */
  pending(userId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).order.findFirst({
      where: {
        userId,
        OR: [
          { status: 'PENDING_PAYMENT', paymentDueAt: { gt: new Date() } },
          { status: 'PENDING_CONFIRMATION' },
        ],
      },
      include: details,
      orderBy: { createdAt: 'desc' },
    });
  }

  list(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: details,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async create(
    input: NewOrder & { status?: 'PENDING_PAYMENT' | 'PENDING_CONFIRMATION' },
    tx: Prisma.TransactionClient,
  ) {
    const status = input.status ?? 'PENDING_PAYMENT';
    return tx.order.create({
      data: {
        userId: input.userId,
        customerEmail: input.email,
        checkoutKey: input.key,
        checkoutFingerprint: input.fingerprint,
        orderCode: newOrderCode(),
        status,
        paymentDueAt: input.due,
        shippingAddressSnapshot: input.address,
        shippingRateId: input.shippingRateId,
        subtotalAmount: input.subtotal,
        discountAmount: '0.00',
        shippingFeeAmount: input.shipping,
        totalAmount: input.total,
        items: {
          create: input.items.map((item) => ({
            productVariantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.price,
            productSnapshot: item.snapshot,
          })),
        },
        statusHistory: { create: { status, actorUserId: input.userId } },
      },
      include: details,
    });
  }

  /** Update co dieu kien trang thai nguon: buoc khong hop le thi 409, khong ghi lich su. */
  async transition(
    id: string,
    status: OrderStatus,
    tx: Prisma.TransactionClient,
    actorUserId?: string,
  ) {
    const changed = await tx.order.updateMany({
      where: { id, status: { in: statusesLeadingTo(status) } },
      data: { status },
    });
    if (changed.count !== 1)
      throw new ConflictException(`Đơn không thể chuyển sang ${status} từ trạng thái hiện tại.`);
    await tx.orderStatusHistory.create({ data: { orderId: id, status, actorUserId } });
  }

  /** `skip`: don worker da xu ly trong tick nay, de don loi khong lap lai trong cung tick. */
  due(skip: string[] = []) {
    return this.prisma.order.findMany({
      where: {
        id: { notIn: skip },
        OR: [
          { status: 'PENDING_PAYMENT', paymentDueAt: { lte: new Date() } },
          { status: 'PENDING_CONFIRMATION', paymentDueAt: { lte: new Date() } },
        ],
      },
      take: 50,
      orderBy: { paymentDueAt: 'asc' },
    });
  }
}
