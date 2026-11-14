import type { Prisma } from '../../generated/prisma/client.js';
import type { RefundMethod, ReturnLineResponse, ReturnResponse } from './dto/return.response.js';
import type { AdminReturnResponse } from './dto/return.response.js';
import { isShopFault, refundBreakdown, type ReturnReasonCode } from './return-policy.js';

/** Moi cho doc mot yeu cau deu nap cung hinh dang nay, de tien hoan tinh mot cach o moi man. */
export const returnInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  media: { orderBy: { createdAt: 'asc' as const } },
  refunds: { orderBy: { createdAt: 'desc' as const }, take: 1 },
  order: {
    select: {
      id: true,
      orderCode: true,
      userId: true,
      customerEmail: true,
      subtotalAmount: true,
      discountAmount: true,
      shippingFeeAmount: true,
      items: {
        select: { id: true, quantity: true, unitPrice: true, productSnapshot: true },
      },
      payments: {
        where: { status: 'SUCCEEDED' as const },
        select: { id: true, gateway: true },
        take: 1,
      },
    },
  },
} satisfies Prisma.ReturnInclude;

export type ReturnRow = Prisma.ReturnGetPayload<{ include: typeof returnInclude }>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** Ban chup san pham luc mua (JSONB); doc phong thu vi don cu co the thieu truong. */
export function snapshotOf(value: unknown) {
  const snapshot = (value ?? {}) as Record<string, unknown>;
  return {
    name: text(snapshot.name) ?? 'Sản phẩm',
    variantLabel: text(snapshot.variantLabel),
    imageUrl: text(snapshot.imageUrl),
  };
}

export function refundMethodOf(payments: { gateway: string | null }[]): RefundMethod {
  return payments[0]?.gateway === 'COD' ? 'BANK_TRANSFER' : 'GATEWAY';
}

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export function refundOf(row: ReturnRow) {
  return refundBreakdown(
    row.order,
    row.items.map((item) => ({ orderItemId: item.orderItemId, quantity: item.quantity })),
    row.reasonCode as ReturnReasonCode,
  );
}

export function toReturnResponse(row: ReturnRow): ReturnResponse {
  const breakdown = refundOf(row);
  const items: ReturnLineResponse[] = row.items.map((item) => {
    const orderItem = row.order.items.find((line) => line.id === item.orderItemId)!;
    return {
      orderItemId: item.orderItemId,
      ...snapshotOf(orderItem.productSnapshot),
      unitPrice: orderItem.unitPrice.toFixed(2),
      quantity: item.quantity,
      refundAmount: breakdown.items
        .find((line) => line.orderItemId === item.orderItemId)!
        .amount.toFixed(2),
    };
  });
  const reasonCode = row.reasonCode as ReturnReasonCode;
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.order.orderCode,
    status: row.status,
    reasonCode,
    description: row.reason,
    decisionNote: row.decisionNote,
    items,
    media: row.media.map((media) => ({ url: media.url })),
    refundAmount: breakdown.total.toFixed(2),
    refundShipping: breakdown.shipping.toFixed(2),
    refundMethod: refundMethodOf(row.order.payments),
    shopPaysReturnShipping: isShopFault(reasonCode),
    hasRefundAccount: row.refundAccountNumber !== null,
    canCancel: row.status === 'REQUESTED',
    createdAt: row.createdAt.toISOString(),
    decidedAt: iso(row.decidedAt),
    receivedAt: iso(row.receivedAt),
    completedAt: iso(row.completedAt),
  };
}

export function toAdminReturnResponse(row: ReturnRow): AdminReturnResponse {
  const refund = row.refunds[0];
  return {
    ...toReturnResponse(row),
    canCancel: false,
    customerEmail: row.order.customerEmail,
    refundAccount:
      row.refundAccountNumber !== null
        ? {
            bankName: row.refundBankName ?? '',
            accountNumber: row.refundAccountNumber,
            accountHolder: row.refundAccountHolder ?? '',
          }
        : null,
    refund: refund
      ? {
          status: refund.status,
          amount: refund.amount.toFixed(2),
          reference: refund.status === 'SUCCEEDED' ? refund.externalRefundId : null,
        }
      : null,
    paymentGateway: row.order.payments[0]?.gateway ?? null,
  };
}

/** Ba truong tai khoan nhan tien xoa cung luc yeu cau ket thuc (ADR-067 luat 5). */
export const wipeRefundAccount = {
  refundBankName: null,
  refundAccountNumber: null,
  refundAccountHolder: null,
} as const;
