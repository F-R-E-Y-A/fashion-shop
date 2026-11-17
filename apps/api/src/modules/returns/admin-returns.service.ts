import { randomUUID } from 'node:crypto';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { type Page, skipOf, toPage } from '../../common/pagination/page.response.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CheckoutService, REFUND_INTENT, type RefundSettled } from '../checkout/index.js';
import type { AdminReturnResponse } from './dto/return.response.js';
import type {
  ApproveReturnRequest,
  ListAdminReturnsQuery,
  RefundReturnRequest,
  RejectReturnRequest,
} from './dto/return-input.dto.js';
import {
  refundAwaitingGateway,
  returnNotFound,
  transferReferenceRequired,
  wrongReturnState,
} from './return-errors.js';
import {
  refundMethodOf,
  refundOf,
  returnInclude,
  type ReturnRow,
  toAdminReturnResponse,
  wipeRefundAccount,
} from './return-rows.js';

const refundKey = (returnId: string) => `return:${returnId}`;

/**
 * Phia ADMIN cua tra hang (UC-14.2, ADR-067): duyet, tu choi, nhan hang (cong kho), hoan tien. Moi
 * buoc doi trang thai bang updateMany co dieu kien duoi khoa don, nen bam hai lan hay hai ADMIN cung
 * bam chi mot lan co tac dung, lan sau 409.
 */
@Injectable()
export class AdminReturnsService implements OnModuleInit {
  private readonly logger = new Logger(AdminReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
  ) {}

  /** Lenh hoan qua cong chot muon (resolveRefund o trang don) van dong duoc yeu cau tra. */
  onModuleInit() {
    this.checkout.onRefundSettled((event, tx) => this.completeFromGateway(event, tx));
  }

  async list(query: ListAdminReturnsQuery): Promise<Page<AdminReturnResponse>> {
    const where: Prisma.ReturnWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.return.findMany({
        where,
        include: returnInclude,
        // Hang cho xu ly: cu nhat truoc (UC-14.2 buoc 1).
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: skipOf(query),
        take: query.pageSize,
      }),
      this.prisma.return.count({ where }),
    ]);
    return toPage(rows.map(toAdminReturnResponse), total, query);
  }

  async detail(id: string): Promise<AdminReturnResponse> {
    return toAdminReturnResponse(await this.load(id));
  }

  async approve(id: string, actor: string, input: ApproveReturnRequest) {
    await this.step(id, async (_row, tx) => {
      const changed = await tx.return.updateMany({
        where: { id, status: 'REQUESTED' },
        data: {
          status: 'APPROVED',
          decidedById: actor,
          decidedAt: new Date(),
          decisionNote: input.note || null,
        },
      });
      if (changed.count !== 1) throw wrongReturnState('Chỉ duyệt yêu cầu đang chờ duyệt.');
    });
    return this.detail(id);
  }

  async reject(id: string, actor: string, input: RejectReturnRequest) {
    await this.step(id, async (_row, tx) => {
      const changed = await tx.return.updateMany({
        where: { id, status: 'REQUESTED' },
        data: {
          status: 'REJECTED',
          decidedById: actor,
          decidedAt: new Date(),
          decisionNote: input.note,
          ...wipeRefundAccount,
        },
      });
      if (changed.count !== 1) throw wrongReturnState('Chỉ từ chối yêu cầu đang chờ duyệt.');
    });
    return this.detail(id);
  }

  /** Hang ve kho: doi trang thai va cong kho trong mot transaction co khoa don (UC-14.2/BR3). */
  async receive(id: string) {
    await this.step(id, async (row, tx) => {
      const changed = await tx.return.updateMany({
        where: { id, status: 'APPROVED' },
        data: { status: 'RECEIVED', receivedAt: new Date() },
      });
      if (changed.count !== 1) throw wrongReturnState('Chỉ nhận hàng cho yêu cầu đã duyệt.');
      const variants = await tx.orderItem.findMany({
        where: { id: { in: row.items.map((item) => item.orderItemId) } },
        select: { id: true, productVariantId: true },
      });
      const items = row.items.map((item) => ({
        variantId: variants.find((line) => line.id === item.orderItemId)!.productVariantId,
        quantity: item.quantity,
      }));
      if (!(await this.checkout.inventory.restockReturned(row.orderId, items, tx)))
        throw wrongReturnState('Hàng của đơn này đã được cộng lại kho trước đó.');
    });
    return this.detail(id);
  }

  /**
   * Hoan tien (UC-14.2 buoc 5). COD: ADMIN da chuyen khoan tay, ghi so va dong yeu cau trong mot
   * transaction. Online: giu mot dong `refunds` (idempotencyKey return:<id>) mang ma lenh hoan dat
   * truoc, roi goi cong NGOAI transaction qua refundPayment; cong tra 00 thi listener dong yeu cau
   * cung transaction voi so hoan. Cong khong ro ket qua: yeu cau giu RECEIVED, ADMIN chot lenh o trang
   * don; bam lai luc lenh da FAILED thi hoan bang ma lenh moi, khong bao gio hai lenh song song.
   */
  async refund(id: string, actor: string, input: RefundReturnRequest) {
    const row = await this.load(id);
    if (row.status !== 'RECEIVED') throw wrongReturnState('Chỉ hoàn tiền khi đã nhận hàng trả về.');
    const payment = row.order.payments[0];
    if (!payment) throw wrongReturnState('Đơn không có thanh toán thành công để hoàn.');
    const breakdown = refundOf(row);
    const amount = breakdown.total.toFixed(2);
    const reason = `Trả hàng ${row.order.orderCode}`;

    if (refundMethodOf(row.order.payments) === 'BANK_TRANSFER') {
      if (!input.transferReference) throw transferReferenceRequired();
      const reference = input.transferReference;
      await this.step(id, async (current, tx) => {
        if (current.status !== 'RECEIVED')
          throw wrongReturnState('Chỉ hoàn tiền khi đã nhận hàng trả về.');
        const receipt = await this.checkout.recordManualRefund(
          payment.id,
          actor,
          { amount, reference, reason },
          tx,
        );
        await tx.refund.create({
          data: {
            returnId: id,
            paymentId: payment.id,
            amount,
            status: 'SUCCEEDED',
            idempotencyKey: refundKey(id),
            externalRefundId: receipt,
            reason,
            items: { create: this.refundItems(current, breakdown.items) },
          },
        });
        if (!(await this.complete(id, tx))) throw wrongReturnState('Yêu cầu đã được hoàn tiền.');
      });
      return this.detail(id);
    }

    const intentId = await this.step(id, async (current, tx) => {
      if (current.status !== 'RECEIVED')
        throw wrongReturnState('Chỉ hoàn tiền khi đã nhận hàng trả về.');
      const nextIntent = `${REFUND_INTENT}${randomUUID()}`;
      const existing = await tx.refund.findUnique({ where: { idempotencyKey: refundKey(id) } });
      if (!existing) {
        await tx.refund.create({
          data: {
            returnId: id,
            paymentId: payment.id,
            amount,
            status: 'PROCESSING',
            idempotencyKey: refundKey(id),
            externalRefundId: nextIntent,
            reason,
            items: { create: this.refundItems(current, breakdown.items) },
          },
        });
        return nextIntent;
      }
      const state = await this.checkout.refundIntentState(payment.id, existing.externalRefundId!);
      if (state === 'RECEIVED') throw refundAwaitingGateway();
      if (state === 'PROCESSED') {
        // Listener luon chay cung transaction voi so hoan, nen nhanh nay chi la luoi an toan.
        this.logger.warn(`Return ${id}: refund intent processed but return still RECEIVED.`);
        await tx.refund.update({ where: { id: existing.id }, data: { status: 'SUCCEEDED' } });
        await this.complete(id, tx);
        return null;
      }
      // MISSING (cong tu choi truoc khi ghi lenh) hoac FAILED (ADMIN da chot that bai): lenh moi.
      await tx.refund.update({
        where: { id: existing.id },
        data: { externalRefundId: nextIntent, status: 'PROCESSING' },
      });
      return nextIntent;
    });
    if (intentId)
      await this.checkout.refundPayment(payment.id, actor, { amount, reason, intentId });
    return this.detail(id);
  }

  /** Chay trong transaction chot lenh hoan cua checkout; bo qua lenh khong thuoc tra hang. */
  private async completeFromGateway(event: RefundSettled, tx: Prisma.TransactionClient) {
    const refund = await tx.refund.findFirst({
      where: { externalRefundId: event.intentId, status: 'PROCESSING' },
    });
    if (!refund) return;
    await tx.refund.update({
      where: { id: refund.id },
      data: { status: 'SUCCEEDED', externalRefundId: event.receipt },
    });
    // Khong nem loi o day: tien da ra khoi cong, so hoan phai duoc ghi du yeu cau dang o dau.
    if (!(await this.complete(refund.returnId, tx)))
      this.logger.error(`Return ${refund.returnId}: refunded by gateway but not in RECEIVED.`);
  }

  private async complete(id: string, tx: Prisma.TransactionClient): Promise<boolean> {
    const changed = await tx.return.updateMany({
      where: { id, status: 'RECEIVED' },
      data: { status: 'COMPLETED', completedAt: new Date(), ...wipeRefundAccount },
    });
    return changed.count === 1;
  }

  private refundItems(
    row: ReturnRow,
    lines: { orderItemId: string; quantity: number; amount: { toFixed(n: number): string } }[],
  ) {
    return lines.map((line) => ({
      returnItemId: row.items.find((item) => item.orderItemId === line.orderItemId)!.id,
      quantity: line.quantity,
      amount: line.amount.toFixed(2),
    }));
  }

  private async load(id: string): Promise<ReturnRow> {
    const row = await this.prisma.return.findUnique({ where: { id }, include: returnInclude });
    if (!row) throw returnNotFound();
    return row;
  }

  /** Doc lai yeu cau DUOI khoa don cua checkout roi moi lam; tra ket qua cua `work`. */
  private async step<T>(
    id: string,
    work: (row: ReturnRow, tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const row = await this.load(id);
    if (!row.order.userId) throw wrongReturnState('Đơn không có chủ sở hữu.');
    return this.checkout.withOrder(row.orderId, row.order.userId, async (_order, tx) => {
      const current = await tx.return.findUniqueOrThrow({ where: { id }, include: returnInclude });
      return work(current, tx);
    });
  }
}
