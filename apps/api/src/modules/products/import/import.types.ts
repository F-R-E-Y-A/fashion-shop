export interface ImportProductRow {
  sourceKey: string;
  name: string;
  categorySlug: string;
  brand?: { slug: string; name: string };
  description?: string;
  material?: string;
  careInstructions?: string;
  attributes?: Record<string, unknown>;
  images: { url: string; alt?: string; colorCode?: string }[];
  variants: ImportVariantRow[];
}

export interface ImportVariantRow {
  sku: string;
  color?: { code: string; name: string; hex?: string };
  sizeCode?: string;
  listPrice: string;
  salePrice?: string;
}

export type ImportFailReason =
  | 'NO_VARIANT'
  | 'INVALID_PRICE'
  | 'DUPLICATE_COLOR_SIZE'
  | 'CATEGORY_NOT_FOUND'
  | 'SIZE_NOT_FOUND'
  | 'SKU_CONFLICT';

export type ImportRowResult =
  | { sourceKey: string; status: 'created' | 'updated'; productId: string; slug: string }
  | { sourceKey: string; status: 'failed'; reason: ImportFailReason; detail: string };
