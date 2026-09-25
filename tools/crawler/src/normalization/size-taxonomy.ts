/**
 * Crawler-side snapshot of the Catalog size contract.
 * Source of truth: apps/api/prisma/seed/catalog.seed.ts (SIZES).
 */
export const CATALOG_CANONICAL_SIZE_CODES = [
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

const canonicalSizeCodes: ReadonlySet<string> = new Set(CATALOG_CANONICAL_SIZE_CODES);

const sizeAliasTargets: ReadonlyMap<string, string> = new Map([
  ['F', 'FREE'],
  ['FREESIZE', 'FREE'],
  ['FREE SIZE', 'FREE'],
  ['ONE SIZE', 'FREE'],
  ['OS', 'FREE'],
  // TODO(HT-03/Catalog): keep these dormant until Catalog SIZES contains their target codes.
  ['XXL', '2XL'],
  ['XXXL', '3XL'],
  ['XXXXL', '4XL'],
]);

export function isCanonicalSizeCode(code: string): boolean {
  return canonicalSizeCodes.has(code);
}

export function resolveActiveSizeAlias(code: string): string {
  const target = sizeAliasTargets.get(code);
  return target && isCanonicalSizeCode(target) ? target : code;
}
