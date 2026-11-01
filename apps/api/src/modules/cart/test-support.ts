import { vi } from 'vitest';

import type { InventoryService } from '../inventory/index.js';
import type { ProductsService, VariantForCart } from '../products/index.js';

/** Chi dung cho bai regression ownership; bai gia/ton su dung Catalog va PostgreSQL that. */
export function cartReadStubs() {
  const variant = (id: string): VariantForCart => ({
    variantId: id,
    productId: 'product',
    productSlug: 'product',
    name: 'Test product',
    variantLabel: 'M',
    price: '199000',
    imageUrl: null,
    isActive: true,
  });
  const products = {
    getVariantForCart: vi.fn(async (id: string) => variant(id)),
    getVariantsForCart: vi.fn(async (ids: string[]) => ids.map(variant)),
  };
  const inventory = {
    getAvailableQuantities: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, 100]))),
  };
  return {
    products: products as unknown as ProductsService,
    inventory: inventory as unknown as InventoryService,
  };
}
