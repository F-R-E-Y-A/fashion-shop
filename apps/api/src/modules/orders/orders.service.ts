import { randomBytes } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const details = {
  items: { orderBy: { productVariantId: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
};
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

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

  async transition(
    id: string,
    status: OrderStatus,
    tx: Prisma.TransactionClient,
    actorUserId?: string,
  ) {
    await tx.order.update({
      where: { id },
      data: { status, statusHistory: { create: { status, actorUserId } } },
    });
  }

  due() {
    return this.prisma.order.findMany({
      where: {
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
