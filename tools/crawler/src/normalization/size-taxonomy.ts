import { BASELINE_SIZE_CODES, isBaselineSizeCode } from '../scope/catalog-baseline.ts';

export const CATALOG_CANONICAL_SIZE_CODES = BASELINE_SIZE_CODES;

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
  return canonicalSizeCodes.has(code) && isBaselineSizeCode(code);
}

export function resolveActiveSizeAlias(code: string): string {
  const target = sizeAliasTargets.get(code);
  return target && isCanonicalSizeCode(target) ? target : code;
}
