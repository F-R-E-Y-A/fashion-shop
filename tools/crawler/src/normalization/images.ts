import type {
  NormalizedImage,
  NormalizedVariantV2,
  ValidationMessage,
} from '../contracts/normalized-product.ts';
import type { JsonObject, JsonValue } from '../contracts/raw-product.ts';
import { embeddedDescriptionImages } from './html-description.ts';
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
  descriptionMarkup: unknown[] = [],
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

  if (collected.length === 0) {
    const colors = [...new Set(normalizedVariants.flatMap((variant) => variant.color?.code ?? []))];
    for (const markup of descriptionMarkup) {
      for (const embedded of embeddedDescriptionImages(markup)) {
        const url = canonicalizeImageUrl(
          embedded.src.startsWith('//') ? `https:${embedded.src}` : embedded.src,
        );
        if (!url) continue;
        const pathname = new URL(url).pathname.toLowerCase();
        const matchingColors = colors.filter((code) => {
          const token = code.replace(/^yody-/u, '').toLowerCase();
          return (
            token.length > 0 &&
            new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`, 'u').test(pathname)
          );
        });
        if (matchingColors.length !== 1) continue;
        const color = normalizedVariants.find(
          (variant) => variant.color?.code === matchingColors[0],
        )?.color;
        if (!color) continue;
        collected.push({
          url,
          position: collected.length,
          variantIndex: normalizedVariants.findIndex(
            (variant) => variant.color?.code === color.code,
          ),
          imageIndex: collected.length,
          colorCode: color.code,
          colorName: color.name,
        });
      }
    }
  }

  collected.sort(
    (left, right) =>
      left.variantIndex - right.variantIndex ||
      left.position - right.position ||
      left.imageIndex - right.imageIndex,
  );

  const seen = new Set<string>();
  const images: NormalizedImage[] = [];
  for (const image of collected) {
    const key = `${image.url}\u0000${image.colorCode ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
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
