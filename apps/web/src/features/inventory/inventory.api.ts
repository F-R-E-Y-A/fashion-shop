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
  createdAt: string;
}
export interface InventoryDetail extends InventoryRow {
  asOf: string;
  movements: Page<Movement>;
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
