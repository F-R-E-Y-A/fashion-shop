import type { JsonObject } from '../contracts/raw-product.ts';
import { foldedText, normalizedText } from './text.ts';

export interface CategoryMapping {
  slug: 'ao-khoac' | 'ao-so-mi' | 'ao-thun' | 'mu' | 'quan-dai' | 'quan-short' | 'that-lung';
  name: 'Áo khoác' | 'Áo sơ mi' | 'Áo thun' | 'Mũ' | 'Quần dài' | 'Quần short' | 'Thắt lưng';
}

const mappings: ReadonlyArray<{ patterns: readonly RegExp[]; target: CategoryMapping }> = [
  {
    patterns: [/\bquan-short\b/u],
    target: { slug: 'quan-short', name: 'Quần short' },
  },
  {
    patterns: [/\bao-so-mi\b/u],
    target: { slug: 'ao-so-mi', name: 'Áo sơ mi' },
  },
  {
    patterns: [/\bao-(?:polo|thun|phong)\b/u],
    target: { slug: 'ao-thun', name: 'Áo thun' },
  },
  {
    patterns: [/\bao-(?:khoac|gio|chong-nang)\b/u],
    target: { slug: 'ao-khoac', name: 'Áo khoác' },
  },
  {
    patterns: [/\bquan-(?:jeans?|kaki|au|tay|jogger|dai)\b/u],
    target: { slug: 'quan-dai', name: 'Quần dài' },
  },
  {
    patterns: [/(?:^|-)mu(?:-|$)/u],
    target: { slug: 'mu', name: 'Mũ' },
  },
  {
    patterns: [/\bthat-lung\b/u],
    target: { slug: 'that-lung', name: 'Thắt lưng' },
  },
];

export function normalizeCategory(category: JsonObject | null): CategoryMapping | null {
  if (!category) return null;
  const slug = foldedText(category.slug).replaceAll(/[^a-z0-9]+/gu, '-');
  const name = foldedText(category.name).replaceAll(/[^a-z0-9]+/gu, '-');
  const haystack = `${slug} ${name}`;
  return (
    mappings.find(({ patterns }) => patterns.some((pattern) => pattern.test(haystack)))?.target ??
    null
  );
}

export function sourceCategory(category: JsonObject | null) {
  const id = category?.id;
  return {
    id: typeof id === 'number' || typeof id === 'string' ? id : null,
    slug: normalizedText(category?.slug),
    name: normalizedText(category?.name),
  };
}
