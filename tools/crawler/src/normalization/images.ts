import type {
  NormalizedImage,
  NormalizedVariantV2,
  ValidationMessage,
} from '../contracts/normalized-product.ts';
import type { JsonObject, JsonValue } from '../contracts/raw-product.ts';
import { normalizedText } from './text.ts';

function asObject(value: JsonValue | undefined): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function canonicalizeImageUrl(value: unknown): string | null {
  const text = normalizedText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const path = url.pathname.toLowerCase();
    if (path.includes('placeholder') || path.includes('no-image') || path.includes('no_image')) {
      return null;
    }
    for (const parameter of ['height', 'width', 'h', 'w']) url.searchParams.delete(parameter);
    url.searchParams.sort();
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeImages(
  productName: string,
  sourceVariants: JsonObject[],
  normalizedVariants: NormalizedVariantV2[],
): { images: NormalizedImage[]; warnings: ValidationMessage[] } {
  const collected: Array<{
    url: string;
    position: number;
    variantIndex: number;
    imageIndex: number;
    colorCode: string | null;
    colorName: string | null;
  }> = [];
  const warnings: ValidationMessage[] = [];

  sourceVariants.forEach((variant, variantIndex) => {
    const sourceImages = Array.isArray(variant.images) ? variant.images : [];
    sourceImages.forEach((value, imageIndex) => {
      const image = asObject(value);
      const url = canonicalizeImageUrl(image?.image_url);
      if (!url) {
        warnings.push({
          code: 'INVALID_IMAGE',
          path: `variants[${variantIndex}].images[${imageIndex}]`,
          message: 'Ignored missing, invalid or placeholder image URL',
        });
        return;
      }
      const sourcePosition = image?.position;
      collected.push({
        url,
        position: typeof sourcePosition === 'number' ? sourcePosition : Number.MAX_SAFE_INTEGER,
        variantIndex,
        imageIndex,
        colorCode: normalizedVariants[variantIndex]?.color?.code ?? null,
        colorName: normalizedVariants[variantIndex]?.color?.name ?? null,
      });
    });
  });

  collected.sort(
    (left, right) =>
      left.variantIndex - right.variantIndex ||
      left.position - right.position ||
      left.imageIndex - right.imageIndex,
  );

  const seen = new Set<string>();
  const images: NormalizedImage[] = [];
  for (const image of collected) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    images.push({
      url: image.url,
      alt: image.colorName ? `${productName} - ${image.colorName}` : productName,
      colorCode: image.colorCode,
    });
  }

  if (images.length === 0) {
    warnings.push({
      code: 'NO_VALID_IMAGE',
      path: 'images',
      message: 'Source product has no valid variant image URL',
    });
  }
  return { images, warnings };
}
