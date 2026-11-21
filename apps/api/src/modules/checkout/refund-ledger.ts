import { Decimal } from 'decimal.js';

import type { OrderDetails } from '../orders/index.js';

export const REFUND_INTENT = 'REFUND-INTENT:';
/** Lon hon timeout goi Refund API (8 giay) de lenh treo do sap process van chot duoc. */
export const REFUND_IN_FLIGHT_MS = 60_000;

/** Chuan hoa loi ky thuat tu fetch/AbortSignal cua cong thanh toan sang tieng Viet cho admin. */
export function humanizeGatewayError(error: unknown): string {
  const errorName = error instanceof Error ? error.name : '';
  const raw =
    typeof error === 'string' ? error.trim() : error instanceof Error ? error.message.trim() : '';

  if (
    errorName === 'TimeoutError' ||
    /aborted due to timeout|timed?\s*out|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT/iu.test(
      raw,
    )
  ) {
    return 'Hết thời gian chờ phản hồi từ cổng thanh toán.';
  }
  if (
    errorName === 'AbortError' ||
    /operation was aborted|this operation was aborted/iu.test(raw)
  ) {
    return 'Kết nối tới cổng thanh toán bị ngắt trước khi nhận phản hồi.';
  }
  if (/^fetch failed$|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up/iu.test(raw)) {
    return 'Không thể kết nối tới cổng thanh toán.';
  }
  return raw || 'Cổng không phản hồi.';
}

type LedgerRow = {
  id: string;
  externalTransactionId: string;
  status: string;
  payload: unknown;
  createdAt: Date;
};
export type PaymentWithLedger = OrderDetails['payments'][number];

/** So tien cua mot dong REFUND:*; ban ghi truoc so hoan chi co vnp_Amount (don vi x100). */
export function refundedAmountOf(row: Pick<LedgerRow, 'payload'>) {
  const payload = row.payload as { refundedAmount?: string; vnp_Amount?: string } | null;
  return payload?.refundedAmount
    ? new Decimal(payload.refundedAmount)
    : new Decimal(payload?.vnp_Amount ?? '0').div(100);
}

/**
 * Doc so hoan tu cac dong da nap kem don (OrderDetails): da hoan bao nhieu, tung lan hoan, lenh
 * con cho cong. `resolvable` cung dieu kien voi resolveRefund de giao dien khong mo nut se bi 409.
 */
export function refundSummary(transactions: readonly LedgerRow[], now = Date.now()) {
  const done = transactions.filter((row) => row.externalTransactionId.startsWith('REFUND:'));
  const intent = transactions.find(
    (row) => row.externalTransactionId.startsWith(REFUND_INTENT) && row.status === 'RECEIVED',
  );
  const claim = intent?.payload as { amount?: string; lastError?: string } | null | undefined;
  return {
    refunded: done.reduce((sum, row) => sum.plus(refundedAmountOf(row)), new Decimal(0)),
    refunds: done.map((row) => ({
      id: row.id,
      amount: refundedAmountOf(row).toFixed(2),
      at: row.createdAt.toISOString(),
      reason: (row.payload as { reason?: string | null } | null)?.reason ?? null,
    })),
    pending: intent
      ? {
          id: intent.id,
          amount: claim?.amount ?? null,
          createdAt: intent.createdAt.toISOString(),
          lastError: claim?.lastError ? humanizeGatewayError(claim.lastError) : null,
          resolvable: !!claim?.lastError || intent.createdAt.getTime() < now - REFUND_IN_FLIGHT_MS,
        }
      : null,
  };
}
