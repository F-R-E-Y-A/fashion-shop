import { Decimal } from 'decimal.js';

/**
 * Luat tra hang ban A (ADR-067). Ham thuan, khong doc DB, de unit test va de giao dien hien dung
 * dieu kien truoc khi khach gui.
 */
export const RETURN_WINDOW_DAYS = 15;
export const RETURN_MEDIA_MAX = 3;
export const RETURN_DESCRIPTION_MAX = 1000;
export const RETURN_NOTE_MAX = 500;

/** Nam ly do theo khao sat cau 8.1; DTO va Prisma khai cung thu tu, return-policy.spec.ts doi chieu. */
export const RETURN_REASONS = [
  'SIZE_MISMATCH',
  'NOT_AS_EXPECTED',
  'DEFECTIVE',
  'WRONG_ITEM',
  'CHANGED_MIND',
] as const;
export type ReturnReasonCode = (typeof RETURN_REASONS)[number];

/** Loi cua shop: bat buoc anh, shop chiu phi gui tra, tra ca don thi hoan ca phi giao goc. */
export const SHOP_FAULT_REASONS: readonly ReturnReasonCode[] = ['DEFECTIVE', 'WRONG_ITEM'];

export const isShopFault = (reason: ReturnReasonCode): boolean =>
  SHOP_FAULT_REASONS.includes(reason);

/** Yeu cau con dang xu ly hoac da xong: chan yeu cau thu hai cho cung don (ADR-067 luat 4). */
export const ACTIVE_RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'RECEIVED', 'COMPLETED'] as const;

const DAY_MS = 86_400_000;

export function returnDeadline(deliveredAt: Date): Date {
  return new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * DAY_MS);
}

/** Dung moc 15 ngay van gui duoc (UC-14.1/AC2). */
export function withinReturnWindow(deliveredAt: Date, now: Date): boolean {
  return now.getTime() <= returnDeadline(deliveredAt).getTime();
}

/** Anh bat buoc khi loi cua shop, tru khi may chu chua bat kho anh: khi do khach mo ta bang chu. */
export function photoRequired(reason: ReturnReasonCode, uploadsEnabled: boolean): boolean {
  return uploadsEnabled && isShopFault(reason);
}

export interface OrderAmounts {
  subtotalAmount: Decimal.Value;
  discountAmount: Decimal.Value;
  shippingFeeAmount: Decimal.Value;
  items: { id: string; quantity: number; unitPrice: Decimal.Value }[];
}

export interface ReturnedLine {
  orderItemId: string;
  quantity: number;
}

/**
 * Tien hoan (UC-14.2/BR1): don gia luc mua x so luong tra, tru phan giam gia chia theo ti le tien
 * hang; phi giao goc chi hoan khi tra CA don vi loi cua shop. Moi dong lam tron 2 so le.
 */
export function refundBreakdown(
  order: OrderAmounts,
  lines: ReturnedLine[],
  reason: ReturnReasonCode,
) {
  const subtotal = new Decimal(order.subtotalAmount);
  const discount = new Decimal(order.discountAmount);
  const items = lines.map((line) => {
    const item = order.items.find((row) => row.id === line.orderItemId);
    if (!item) throw new Error(`Dong don ${line.orderItemId} khong thuoc don`);
    const gross = new Decimal(item.unitPrice).times(line.quantity);
    const share = subtotal.gt(0) ? discount.times(gross).div(subtotal) : new Decimal(0);
    return {
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      amount: gross.minus(share).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    };
  });
  const wholeOrder = order.items.every(
    (item) => lines.find((line) => line.orderItemId === item.id)?.quantity === item.quantity,
  );
  const shipping =
    wholeOrder && isShopFault(reason) ? new Decimal(order.shippingFeeAmount) : new Decimal(0);
  const total = items.reduce((sum, item) => sum.plus(item.amount), shipping);
  return { items, shipping, total };
}
