import { Prisma } from '../../../generated/prisma/client.js';
import type { ImportProductRow } from './import.types.js';
import { ImportRowError } from './import-row.error.js';

export function validateRow(row: ImportProductRow): ImportRowError | null {
  if (row.variants.length === 0) {
    return new ImportRowError('NO_VARIANT', 'Sản phẩm phải có ít nhất một biến thể');
  }

  const seen = new Set<string>();
  const seenSkus = new Set<string>();
  for (const [index, variant] of row.variants.entries()) {
    if (seenSkus.has(variant.sku)) {
      return new ImportRowError('SKU_CONFLICT', `Trùng SKU ở biến thể ${index}`);
    }
    seenSkus.add(variant.sku);
    try {
      const list = new Prisma.Decimal(variant.listPrice);
      if (!list.isFinite() || list.lte(0)) throw new Error('listPrice');
      if (variant.salePrice !== undefined) {
        const sale = new Prisma.Decimal(variant.salePrice);
        if (!sale.isFinite() || sale.lte(0) || sale.gte(list)) throw new Error('salePrice');
      }
    } catch {
      return new ImportRowError('INVALID_PRICE', `Giá không hợp lệ ở biến thể ${index}`);
    }

    const colorCode = variant.color?.code ?? 'mac-dinh';
    const sizeCode = variant.sizeCode ?? 'FREE';
    const key = JSON.stringify([colorCode, sizeCode]);
    if (seen.has(key)) {
      return new ImportRowError('DUPLICATE_COLOR_SIZE', `Trùng màu/cỡ ở biến thể ${index}`);
    }
    seen.add(key);
  }
  return null;
}
