import type { JsonObject } from '../../contracts/raw-product.ts';
import { foldedText, normalizedText } from '../../normalization/text.ts';
import type { SizeContext } from '../../scope/scope-policy.ts';

export interface YodyScopeHint {
  categoryDisposition: 'KNOWN_OUT_OF_SCOPE' | 'UNKNOWN' | null;
  sizeContext: SizeContext;
  sourceCategoryValue: string;
}

export function yodyScopeHint(category: JsonObject | null): YodyScopeHint {
  const slug = foldedText(category?.slug).replaceAll(/[^a-z0-9]+/gu, '-');
  const name = foldedText(category?.name).replaceAll(/[^a-z0-9]+/gu, '-');
  const value = normalizedText(category?.slug) ?? normalizedText(category?.name) ?? '';
  const haystack = `${slug} ${name}`;
  const knownOutOfScope =
    /\b(?:dam|chan-vay)(?:-|\b)/u.test(haystack) ||
    (/\bao-phao(?:-|\b)/u.test(haystack) && /\btre-em\b/u.test(haystack));
  const sizeContext = /\b(?:tre-em|be-gai|be-trai)\b/u.test(haystack) ? 'CHILD' : 'GENERAL';
  return {
    categoryDisposition: knownOutOfScope ? 'KNOWN_OUT_OF_SCOPE' : category ? 'UNKNOWN' : null,
    sizeContext,
    sourceCategoryValue: value,
  };
}
