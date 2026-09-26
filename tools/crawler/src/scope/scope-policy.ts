import type {
  ScopeClassification,
  ScopeReason,
  ScopeReasonCode,
} from '../contracts/normalized-product.ts';
import type { BaselineCategorySlug } from './catalog-baseline.ts';
import { isBaselineCategorySlug, isBaselineSizeCode } from './catalog-baseline.ts';

export type SizeContext = 'CHILD' | 'GENERAL';

export interface ScopePolicyInput {
  categorySlug: BaselineCategorySlug | null;
  categoryDisposition: 'KNOWN_OUT_OF_SCOPE' | 'UNKNOWN' | null;
  sourceCategoryValue: string;
  sizes: Array<{ code: string | null; context: SizeContext }>;
}

const knownOutOfScopeSizes = new Set([
  '2XL',
  '3XL',
  '4XL',
  '5XL',
  '25',
  '26',
  '27',
  '28',
  '33',
  '34',
]);
const childOnlyOutOfScopeSizes = new Set(['4', '6', '8', '10']);

function reason(code: ScopeReasonCode, path: string, value: string): ScopeReason {
  return { code, path, value };
}

function uniqueReasons(reasons: ScopeReason[]): ScopeReason[] {
  const seen = new Set<string>();
  return reasons.filter((entry) => {
    const identity = `${entry.code}:${entry.value}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function classifyCatalogScope(input: ScopePolicyInput): ScopeClassification {
  const reasons: ScopeReason[] = [];
  if (input.categoryDisposition === 'KNOWN_OUT_OF_SCOPE') {
    reasons.push(
      reason('OUT_OF_SCOPE_CATEGORY', 'categorySlug', input.sourceCategoryValue || '(missing)'),
    );
  } else if (!input.categorySlug || !isBaselineCategorySlug(input.categorySlug)) {
    reasons.push(
      reason('UNKNOWN_CATEGORY', 'categorySlug', input.sourceCategoryValue || '(missing)'),
    );
  }

  input.sizes.forEach(({ code, context }, index) => {
    if (!code || isBaselineSizeCode(code)) return;
    if (
      knownOutOfScopeSizes.has(code) ||
      (context === 'CHILD' && childOnlyOutOfScopeSizes.has(code))
    ) {
      reasons.push(reason('OUT_OF_SCOPE_SIZE', `variants[${index}].sizeCode`, code));
    } else {
      reasons.push(reason('UNKNOWN_SIZE', `variants[${index}].sizeCode`, code));
    }
  });

  const unique = uniqueReasons(reasons);
  const status = unique.some((entry) => entry.code.startsWith('OUT_OF_SCOPE_'))
    ? 'OUT_OF_SCOPE'
    : unique.length > 0
      ? 'REVIEW_REQUIRED'
      : 'IN_SCOPE';
  return { status, reasons: unique };
}
