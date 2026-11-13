import { randomBytes } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { skipOf } from '../../common/pagination/page.response.js';
import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const details = {
  items: { orderBy: { productVariantId: 'asc' as const } },
  payments: {
    orderBy: { createdAt: 'desc' as const },
    // So hoan tien (REFUND:*, REFUND-INTENT:*) de trang don hien so da hoan va lenh dang cho.
    include: {
      transactions: {
        where: { externalTransactionId: { startsWith: 'REFUND' } },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  shipment: true,
};

export interface AdminOrderQuery {
  statuses?: OrderStatus[];
  /** Don can shop ra tay: PAYMENT_REVIEW, lenh hoan chua chot, don huy da thu tien chua hoan. */
  attention?: boolean;
  /** Ma don hoac email khach, khong phan biet hoa thuong. */
  q?: string;
  page: number;
  pageSize: number;
}
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Buoc chuyen hop le cua don. Caller van tu kiem nghiep vu; day la chot cuoi o tang du lieu de
 * khong ai nhay trang thai (vd don da huy thanh CONFIRMED). Tien ve bat thuong o bat ky dau
 * cung vao PAYMENT_REVIEW, nen settlement khong bao gio bi chan va IPN khong phai gui lai mai.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'PAYMENT_REVIEW', 'CANCELLED'],
  // COD: shop goi xac nhan xong thi chot kho va giao (PROCESSING), tien thu sau (ADR-038).
  PENDING_CONFIRMATION: ['CONFIRMED', 'PROCESSING', 'PAYMENT_REVIEW', 'CANCELLED'],
  PAYMENT_REVIEW: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  // CANCELLED: khach tu huy don da tra truoc khi shop xu ly, tien hoan sau do (ADR-038).
  CONFIRMED: ['PROCESSING', 'PAYMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED'],
  // Chua noi hang van chuyen: shop danh dau da giao thang tu PROCESSING; CANCELLED = COD giao that bai.
  PROCESSING: ['SHIPPED', 'DELIVERED', 'PAYMENT_REVIEW', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'PAYMENT_REVIEW', 'CANCELLED'],
  DELIVERED: ['PAYMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED'],
  CANCELLED: ['PAYMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED'],
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
  /** Don tra truoc con han thanh toan: moi khach mot don, tranh tra tien hai lan (ADR-034). */
  pending(userId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).order.findFirst({
      where: { userId, status: 'PENDING_PAYMENT', paymentDueAt: { gt: new Date() } },
      include: details,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Don COD cho shop xac nhan: khong co tien de tra trung, gioi han bang tran so don (ADR-040). */
  pendingCod(userId: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).order.findMany({
      where: { userId, status: 'PENDING_CONFIRMATION' },
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

  /** Danh sach cho quan tri: moi khach, loc trang thai va ma don/email, moi nhat truoc. */
  async adminList(query: AdminOrderQuery) {
    const q = query.q?.trim();
    const attention: Prisma.OrderWhereInput[] = [
      { status: 'PAYMENT_REVIEW' },
      {
        payments: {
          some: {
            transactions: {
              some: { externalTransactionId: { startsWith: 'REFUND-INTENT:' }, status: 'RECEIVED' },
            },
          },
        },
      },
      { status: 'CANCELLED', payments: { some: { status: 'SUCCEEDED' } } },
    ];
    const where: Prisma.OrderWhereInput = {
      ...(query.statuses?.length ? { status: { in: query.statuses } } : {}),
      ...(query.attention ? { AND: [{ OR: attention }] } : {}),
      ...(q
        ? {
            OR: [
              { orderCode: { contains: q, mode: 'insensitive' } },
              { customerEmail: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: details,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total };
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
