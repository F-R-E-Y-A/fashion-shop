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
  const seen = new Set<string>();
  return matching.filter((image) => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}
export function colorsWithImages<T extends { code: string }>(
  colors: T[],
  images: ProductImage[],
): T[] {
  return colors.filter((color) => imagesForColor(images, color.code).length > 0);
}
export function isDefaultOnly(values: string[], defaultCode: string): boolean {
  return new Set(values).size === 1 && values[0] === defaultCode;
}
