import type { InventoryService } from '../inventory/index.js';
import type { ProductResponse } from './dto/product.response.js';

export async function withProductStock<T extends ProductResponse>(
  items: T[],
  rows: { id: string; variants: { id: string }[] }[],
  inventory: InventoryService,
): Promise<T[]> {
  const statuses = await inventory.getStockStatuses(
    rows.map((row) => ({
      id: row.id,
      variantIds: row.variants.map((variant) => variant.id),
    })),
  );
  return items.map((item) => ({ ...item, stockStatus: statuses.get(item.id) ?? 'UNKNOWN' }));
}
