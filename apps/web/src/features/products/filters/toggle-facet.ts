import type { Audience, FacetPrice, SearchInterpretation } from '../api/index.js';
import { type CatalogParams, patchCatalogParams } from '../lib/catalog-params.js';
import { removeTokens } from '../lib/remove-tokens.js';

export type FacetDimension = 'audience' | 'category' | 'color' | 'size' | 'price';

const LISTS = { category: 'categories', color: 'colors', size: 'sizes' } as const;
const FROM_QUERY = {
  category: (i: SearchInterpretation) => i.categorySlugs,
  color: (i: SearchInterpretation) => i.colorFamilies,
  size: (i: SearchInterpretation) => i.sizes,
} as const;

/** Cau tim sau khi bo cac y cung loai (va cung gia tri, neu co) do bo hieu truy van sinh ra. */
function withoutChips(
  q: string,
  interpretation: SearchInterpretation | undefined,
  kind: string,
  value?: string,
): string {
  const tokens = (interpretation?.chips ?? [])
    .filter((chip) => chip.kind === kind && (value === undefined || chip.value === value))
    .flatMap((chip) => chip.tokens);
  return removeTokens(q, tokens);
}

/** Mot moc gia dang duoc chon khi minPrice/maxPrice tuong minh trung voi moc. */
export const isPriceSelected = (
  params: Pick<CatalogParams, 'minPrice' | 'maxPrice'>,
  bucket: Pick<FacetPrice, 'min' | 'max'>,
): boolean => params.minPrice === bucket.min && params.maxPrice === bucket.max;

/**
 * Bam mot lua chon trong bo loc. Luat dong bo cau va bo loc: gia tri dang den tu CAU thi bam
 * se xoa y do khoi cau (khong them tham so); gia tri dang la tham so tuong minh thi bo tham so;
 * con lai them tham so. Nhu vay cau va bo loc khong bao gio mau thuan nhau.
 */
export function toggleFacet(
  params: CatalogParams,
  interpretation: SearchInterpretation | undefined,
  dimension: FacetDimension,
  value: string | FacetPrice,
): CatalogParams {
  if (dimension === 'audience') {
    const asked = params.audience ?? interpretation?.audience ?? null;
    if (asked === value) {
      return params.audience === value
        ? patchCatalogParams(params, { audience: null })
        : patchCatalogParams(params, { q: withoutChips(params.q, interpretation, 'audience') });
    }
    return patchCatalogParams(params, {
      audience: value as Audience,
      q: withoutChips(params.q, interpretation, 'audience'),
    });
  }

  if (dimension === 'price') {
    const bucket = value as FacetPrice;
    if (isPriceSelected(params, bucket)) {
      return patchCatalogParams(params, { minPrice: null, maxPrice: null });
    }
    return patchCatalogParams(params, {
      minPrice: bucket.min,
      maxPrice: bucket.max,
      q: withoutChips(params.q, interpretation, 'price'),
    });
  }

  const key = LISTS[dimension];
  const chosen = value as string;
  if (params[key].includes(chosen)) {
    return patchCatalogParams(params, { [key]: params[key].filter((v) => v !== chosen) });
  }
  if (interpretation && FROM_QUERY[dimension](interpretation).includes(chosen)) {
    return patchCatalogParams(params, {
      q: withoutChips(params.q, interpretation, dimension, chosen),
    });
  }
  return patchCatalogParams(params, { [key]: [...params[key], chosen] });
}
