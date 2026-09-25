import type { JsonValue } from './raw-product.ts';

export type NormalizationStatus = 'APPROVED' | 'DUPLICATE' | 'PENDING_REVIEW' | 'REJECTED';

export type ValidationCode =
  | 'DUPLICATE_PRODUCT'
  | 'DUPLICATE_SKU'
  | 'DUPLICATE_VARIANT'
  | 'INVALID_COLOR_CODE'
  | 'INVALID_HEX'
  | 'INVALID_IMAGE'
  | 'INVALID_PRICE'
  | 'MISSING_COLOR'
  | 'MISSING_SIZE'
  | 'MISSING_SKU_COMPONENT'
  | 'MISSING_VARIANT_ID'
  | 'NO_VALID_IMAGE'
  | 'NO_VARIANT'
  | 'UNKNOWN_CATEGORY'
  | 'UNKNOWN_SIZE';

export type WarningCode =
  | 'DUPLICATE_PRODUCT_DEDUPED'
  | 'DUPLICATE_VARIANT_DEDUPED'
  | 'INVALID_HEX'
  | 'INVALID_IMAGE'
  | 'NO_VALID_IMAGE';

export interface ValidationMessage {
  code: ValidationCode | WarningCode;
  path: string;
  message: string;
}

export interface NormalizedBrand {
  slug: string;
  name: string;
}

export interface NormalizedColor {
  code: string;
  name: string;
  hex: string | null;
}

export interface NormalizedImage {
  url: string;
  alt: string;
  colorCode: string | null;
}

export interface NormalizedVariantV2 {
  sourceVariantId: string | null;
  sourceSku: string | null;
  sku: string | null;
  color: NormalizedColor | null;
  sizeCode: string | null;
  listPrice: string | null;
  salePrice: string | null;
}

export interface NormalizedAttributesV2 {
  contractVersion: 2;
  currency: 'VND';
  categorySlug: string | null;
  description: string | null;
  material: string | null;
  careInstructions: string | null;
  sourceCategory: {
    id: number | string | null;
    slug: string | null;
    name: string | null;
  };
  brand: NormalizedBrand | null;
  images: NormalizedImage[];
  variants: NormalizedVariantV2[];
  originalValues: {
    name: JsonValue;
    category: JsonValue;
    material: JsonValue;
    prices: JsonValue[];
    sizes: JsonValue[];
    colors: JsonValue[];
  };
}

export interface NormalizedCandidateOutput {
  rawProductRecord: {
    source: 'YODY';
    sourceProductId: string;
  };
  name: string;
  categoryName: string | null;
  price: string | null;
  attributes: NormalizedAttributesV2;
  imageHash: null;
  normalizationStatus: NormalizationStatus;
  validation: {
    issues: ValidationMessage[];
    warnings: ValidationMessage[];
  };
}

export interface NormalizationSummary {
  source: 'YODY';
  total: number;
  approved: number;
  pendingReview: number;
  duplicate: number;
  rejected: number;
  issueCounts: Record<string, number>;
  warningCounts: Record<string, number>;
}
