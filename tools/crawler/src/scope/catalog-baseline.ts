export const BASELINE_CATEGORY_SLUGS = [
  'ao-thun',
  'ao-so-mi',
  'ao-khoac',
  'quan-dai',
  'quan-short',
  'mu',
  'that-lung',
] as const;

export type BaselineCategorySlug = (typeof BASELINE_CATEGORY_SLUGS)[number];

export const BASELINE_SIZE_CODES = [
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '29',
  '30',
  '31',
  '32',
  'FREE',
] as const;

const baselineCategories: ReadonlySet<string> = new Set(BASELINE_CATEGORY_SLUGS);
const baselineSizes: ReadonlySet<string> = new Set(BASELINE_SIZE_CODES);

export function isBaselineCategorySlug(value: string): value is BaselineCategorySlug {
  return baselineCategories.has(value);
}

export function isBaselineSizeCode(value: string): boolean {
  return baselineSizes.has(value);
}
