import { normalizedText, slugToken } from './text.ts';

function skuToken(value: unknown): string | null {
  const text = normalizedText(value);
  if (!text) return null;
  const token = text
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/gu, '')
    .replaceAll('đ', 'd')
    .toUpperCase()
    .replaceAll(/[^A-Z0-9._-]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '');
  return token || null;
}

export function normalizeSku(options: {
  sourceSku: unknown;
  sourceProductId: string;
  colorCode: string | null;
  sizeCode: string | null;
}): { sourceSku: string | null; sku: string | null; usedFallback: boolean } {
  const sourceSku = normalizedText(options.sourceSku);
  const primary = skuToken(sourceSku);
  if (primary) return { sourceSku, sku: `YODY-${primary}`, usedFallback: false };

  const product = skuToken(options.sourceProductId);
  const color = slugToken(options.colorCode)?.toUpperCase() ?? null;
  const size = skuToken(options.sizeCode);
  if (!product || !color || !size) return { sourceSku: null, sku: null, usedFallback: true };
  return { sourceSku: null, sku: `YODY-${product}-${color}-${size}`, usedFallback: true };
}
