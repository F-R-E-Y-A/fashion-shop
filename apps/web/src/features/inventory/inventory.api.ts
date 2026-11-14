import { sessionQueryKeys } from '@/core';

export interface InventoryRow {
  id: string;
  sku: string;
  productName: string;
  colorName: string;
  sizeCode: string;
  quantityOnHand: number | null;
  reservedQuantity: number;
  availableQuantity: number | null;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export interface InventoryPage extends Page<InventoryRow> {
  asOf: string;
}
export interface Movement {
  id: string;
  movementType: string;
  quantityDelta: number;
  reason?: string | null;
  createdAt: string;
}
export interface InventoryDetail extends InventoryRow {
  asOf: string;
  movements: Page<Movement>;
}
export interface AdjustStockPayload {
  type: 'RECEIPT' | 'ADJUSTMENT';
  quantity: number;
  reason: string;
  requestKey?: string;
}
export interface AdminLowStockItem {
  id: string;
  sku: string;
  productName: string;
  colorName: string;
  sizeCode: string;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
}
export interface AdminLowStockResponse {
  items: AdminLowStockItem[];
  total: number;
  threshold: number;
  asOf: string;
}
export const inventoryKeys = {
  all: (actor: string) => [...sessionQueryKeys.adminResource('inventory'), actor] as const,
  list: (actor: string, page: number) => [...inventoryKeys.all(actor), 'list', page] as const,
  detail: (actor: string, id: string, page: number) =>
    [...inventoryKeys.all(actor), 'detail', id, page] as const,
};
export const readPage = (value: string | null) => {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 100000 ? page : 1;
};
export const quantity = (value: number | null) =>
  value === null ? 'Chưa có dữ liệu' : value.toLocaleString('vi-VN');
export const movementLabel = (type: string) =>
  ({ RECEIPT: 'Nhập hàng', SALE: 'Bán hàng', RETURN: 'Trả hàng', ADJUSTMENT: 'Điều chỉnh' })[
    type
  ] ?? 'Biến động khác';

/**
 * Idempotency key cho thao tác nhập/điều chỉnh kho: gắn theo actor, variant, loại, số lượng và lý do.
 * Giữ trong sessionStorage 15 phút để nếu mất phản hồi mạng hoặc đóng/mở lại hộp thì thao tác gửi lại
 * vẫn mang đúng key cũ, ngăn chặn server cộng trùng tồn kho.
 */
export function adjustStockKey(
  actorId: string,
  variantId: string,
  type: 'RECEIPT' | 'ADJUSTMENT',
  quantity: number,
  reason: string,
): string {
  const normReason = reason.trim().toLowerCase();
  const storageKey = `freya:inventory:${actorId}:${variantId}:${type}:${quantity}:${normReason}`;
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { key: string; expires: number };
        if (saved.expires > Date.now()) return saved.key;
      }
    } catch {
      /* ignore parse error */
    }
  }
  const key = crypto.randomUUID();
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ key, expires: Date.now() + 15 * 60_000 }),
      );
    } catch {
      /* ignore storage quota/security error */
    }
  }
  return key;
}

/**
 * Xóa key khi thao tác điều chỉnh đã thành công trọn vẹn và UI đã cập nhật.
 */
export function forgetAdjustStock(
  actorId: string,
  variantId: string,
  type: 'RECEIPT' | 'ADJUSTMENT',
  quantity: number,
  reason: string,
): void {
  const normReason = reason.trim().toLowerCase();
  const storageKey = `freya:inventory:${actorId}:${variantId}:${type}:${quantity}:${normReason}`;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }
}
