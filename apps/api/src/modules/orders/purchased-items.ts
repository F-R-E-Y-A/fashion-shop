import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';

/**
 * Dong don ma khach da mua, doc cho phan he khac (reviews) qua OrdersService. Chi doc: ban chup san
 * pham luc mua, trang thai don va lan chuyen DELIVERED moi nhat.
 */
export interface PurchasedItem {
  orderItemId: string;
  orderId: string;
  orderCode: string;
  orderStatus: OrderStatus;
  userId: string | null;
  productId: string;
  /** Lan don chuyen DELIVERED moi nhat; null neu don chua tung giao xong. */
  deliveredAt: Date | null;
  snapshot: {
    name: string;
    variantLabel: string | null;
    imageUrl: string | null;
    productSlug: string;
  };
}

export const purchasedItemSelect = {
  id: true,
  productSnapshot: true,
  productVariant: { select: { productId: true } },
  order: {
    select: {
      id: true,
      orderCode: true,
      status: true,
      userId: true,
      statusHistory: {
        where: { status: 'DELIVERED' as const },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: { createdAt: true },
      },
    },
  },
} satisfies Prisma.OrderItemSelect;

type PurchasedItemRow = Prisma.OrderItemGetPayload<{ select: typeof purchasedItemSelect }>;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** Ban chup la JSONB ghi luc dat hang; doc phong thu vi don cu co the thieu truong. */
export function toPurchasedItem(row: PurchasedItemRow): PurchasedItem {
  const snapshot = (row.productSnapshot ?? {}) as Record<string, unknown>;
  return {
    orderItemId: row.id,
    orderId: row.order.id,
    orderCode: row.order.orderCode,
    orderStatus: row.order.status,
    userId: row.order.userId,
    productId: row.productVariant.productId,
    deliveredAt: row.order.statusHistory[0]?.createdAt ?? null,
    snapshot: {
      name: text(snapshot.name) ?? 'Sản phẩm',
      variantLabel: text(snapshot.variantLabel),
      imageUrl: text(snapshot.imageUrl),
      productSlug: text(snapshot.productSlug) ?? '',
    },
  };
}
