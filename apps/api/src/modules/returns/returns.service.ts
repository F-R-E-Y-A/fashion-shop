import { Injectable } from '@nestjs/common';

import type { PageQuery } from '../../common/pagination/page.query.js';
import { type Page, skipOf, toPage } from '../../common/pagination/page.response.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CheckoutService } from '../checkout/index.js';
import type { OrderDetails } from '../orders/index.js';
import { type ResolvedMedia, UploadsService } from '../uploads/index.js';
import type {
  ReturnBlocker,
  ReturnEligibilityResponse,
  ReturnResponse,
} from './dto/return.response.js';
import type { CreateReturnRequest } from './dto/return-input.dto.js';
import {
  invalidReturnItems,
  photoRequiredError,
  refundAccountRequired,
  returnExists,
  returnNotAllowed,
  returnNotFound,
  returnWindowClosed,
  wrongReturnState,
} from './return-errors.js';
import {
  ACTIVE_RETURN_STATUSES,
  photoRequired,
  RETURN_MEDIA_MAX,
  RETURN_WINDOW_DAYS,
  returnDeadline,
  withinReturnWindow,
} from './return-policy.js';
import {
  refundMethodOf,
  returnInclude,
  snapshotOf,
  toReturnResponse,
  wipeRefundAccount,
} from './return-rows.js';

/** Lan don chuyen DELIVERED moi nhat; lich su nap kem don theo thu tu tang dan. */
function deliveredAtOf(order: OrderDetails): Date | null {
  const delivered = order.statusHistory.filter((row) => row.status === 'DELIVERED');
  return delivered.at(-1)?.createdAt ?? null;
}

/**
 * Phia khach cua tra hang (UC-14.1, ADR-067): xem dieu kien, gui, xem, huy. Moi lan ghi chay duoi
 * khoa don cua checkout (withOrder) nen hai lan bam gui chi tao mot yeu cau.
 */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly uploads: UploadsService,
  ) {}

  async eligibility(orderId: string, userId: string): Promise<ReturnEligibilityResponse> {
    const order = await this.checkout.orders.get(orderId, userId);
    const active = await this.prisma.return.findFirst({
      where: { orderId, status: { in: [...ACTIVE_RETURN_STATUSES] } },
      select: { id: true },
    });
    const deliveredAt = deliveredAtOf(order);
    const paid = order.payments.filter((payment) => payment.status === 'SUCCEEDED');
    const blocker = this.blockerOf(
      order,
      deliveredAt,
      active !== null,
      paid.length > 0,
      new Date(),
    );
    return {
      eligible: blocker === null,
      blocker,
      deadline: deliveredAt ? returnDeadline(deliveredAt).toISOString() : null,
      existingReturnId: active?.id ?? null,
      refundMethod: refundMethodOf(paid),
      uploadsEnabled: this.uploads.enabled,
      windowDays: RETURN_WINDOW_DAYS,
      mediaMax: RETURN_MEDIA_MAX,
      items: order.items.map((item) => ({
        orderItemId: item.id,
        ...snapshotOf(item.productSnapshot),
        unitPrice: item.unitPrice.toFixed(2),
        quantity: item.quantity,
      })),
    };
  }

  async create(
    orderId: string,
    userId: string,
    input: CreateReturnRequest,
  ): Promise<ReturnResponse> {
    const keys = input.mediaKeys ?? [];
    if (photoRequired(input.reasonCode, this.uploads.enabled) && keys.length === 0)
      throw photoRequiredError();
    if (new Set(input.items.map((line) => line.orderItemId)).size !== input.items.length)
      throw invalidReturnItems('Mỗi món chỉ chọn một lần.');
    // Hoi kho anh truoc, ngoai khoa don: N anh kiem song song, khong giu khoa trong luc cho mang.
    const media: ResolvedMedia[] = await this.uploads.resolveMedia(userId, 'return', keys);

    const id = await this.checkout.withOrder(orderId, userId, async (order, tx) => {
      const active = await tx.return.findFirst({
        where: { orderId, status: { in: [...ACTIVE_RETURN_STATUSES] } },
        select: { id: true },
      });
      const deliveredAt = deliveredAtOf(order);
      const paid = order.payments.filter((payment) => payment.status === 'SUCCEEDED');
      const blocker = this.blockerOf(
        order,
        deliveredAt,
        active !== null,
        paid.length > 0,
        new Date(),
      );
      if (blocker === 'RETURN_EXISTS') throw returnExists();
      if (blocker === 'WINDOW_CLOSED') throw returnWindowClosed();
      if (blocker) throw returnNotAllowed();

      for (const line of input.items) {
        const item = order.items.find((row) => row.id === line.orderItemId);
        if (!item) throw invalidReturnItems('Món được chọn không thuộc đơn này.');
        if (line.quantity > item.quantity)
          throw invalidReturnItems(`Chỉ trả được tối đa ${item.quantity} sản phẩm của món này.`);
      }
      const cod = refundMethodOf(paid) === 'BANK_TRANSFER';
      if (cod && !input.refundAccount) throw refundAccountRequired();

      await this.uploads.attach(userId, keys, tx);
      const created = await tx.return.create({
        data: {
          orderId,
          userId,
          reasonCode: input.reasonCode,
          reason: input.description || null,
          ...(cod && input.refundAccount
            ? {
                refundBankName: input.refundAccount.bankName,
                refundAccountNumber: input.refundAccount.accountNumber,
                refundAccountHolder: input.refundAccount.accountHolder,
              }
            : {}),
          items: {
            create: input.items.map((line) => ({
              orderItemId: line.orderItemId,
              quantity: line.quantity,
              resolution: 'REFUND' as const,
            })),
          },
          media: { create: media.map((image) => ({ url: image.url, storageKey: image.key })) },
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(id, userId);
  }

  async list(userId: string, query: PageQuery): Promise<Page<ReturnResponse>> {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.return.findMany({
        where,
        include: returnInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: skipOf(query),
        take: query.pageSize,
      }),
      this.prisma.return.count({ where }),
    ]);
    return toPage(rows.map(toReturnResponse), total, query);
  }

  async get(id: string, userId: string): Promise<ReturnResponse> {
    const row = await this.prisma.return.findFirst({
      where: { id, userId },
      include: returnInclude,
    });
    if (!row) throw returnNotFound();
    return toReturnResponse(row);
  }

  /** Chi huy khi shop chua duyet (UC-14.1/AC8); tai khoan nhan tien xoa cung luc. */
  async cancel(id: string, userId: string): Promise<ReturnResponse> {
    const row = await this.prisma.return.findFirst({
      where: { id, userId },
      select: { orderId: true },
    });
    if (!row) throw returnNotFound();
    await this.checkout.withOrder(row.orderId, userId, async (_order, tx) => {
      const changed = await tx.return.updateMany({
        where: { id, userId, status: 'REQUESTED' },
        data: { status: 'CANCELLED', ...wipeRefundAccount },
      });
      if (changed.count !== 1)
        throw wrongReturnState('Shop đã xử lý yêu cầu này, không huỷ được nữa.');
    });
    return this.get(id, userId);
  }

  private blockerOf(
    order: OrderDetails,
    deliveredAt: Date | null,
    hasActive: boolean,
    paid: boolean,
    now: Date,
  ): ReturnBlocker | null {
    if (order.status !== 'DELIVERED' || !deliveredAt) return 'NOT_DELIVERED';
    if (hasActive) return 'RETURN_EXISTS';
    if (!withinReturnWindow(deliveredAt, now)) return 'WINDOW_CLOSED';
    if (!paid) return 'NOT_PAID';
    return null;
  }
}
