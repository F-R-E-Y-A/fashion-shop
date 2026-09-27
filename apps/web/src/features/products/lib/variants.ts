import type { ProductImage, ProductVariant } from '../api/index.js';

export function availableSizes(variants: ProductVariant[], colorCode: string | null): Set<string> {
  return new Set(
    variants.filter((v) => colorCode === null || v.colorCode === colorCode).map((v) => v.sizeCode),
  );
}
export function findVariant(
  variants: ProductVariant[],
  colorCode: string | null,
  sizeCode: string | null,
): ProductVariant | undefined {
  return variants.find((v) => v.colorCode === colorCode && v.sizeCode === sizeCode);
}
export function imagesForColor(images: ProductImage[], colorCode: string | null): ProductImage[] {
  const matching = images.filter(
    (image) => image.colorCode === null || image.colorCode === colorCode,
  );
  return matching.length > 0 ? matching : images.slice(0, 1);
}
export function isDefaultOnly(values: string[], defaultCode: string): boolean {
  return new Set(values).size === 1 && values[0] === defaultCode;
}
