import { apiGet } from '@/core';

import type { Product } from './products.api.js';

/** Loai y ma bo hieu truy van doc ra tu cau tim kiem. Khop ChipKind ben may chu (gõ tay theo ND-02). */
export type ChipKind =
  | 'price'
  | 'size'
  | 'audience'
  | 'color'
  | 'category'
  | 'sort'
  | 'style'
  | 'occasion'
  | 'term'
  | 'free';

export interface InterpretationChip {
  kind: ChipKind;
  value: string;
  label: string;
  source: string;
  /** Vi tri cac tu (tach theo khoang trang) da tao ra y nay; dung de bo y khoi cau. */
  tokens: number[];
}

export interface SearchInterpretation {
  categorySlugs: string[];
  audience: 'nam' | 'nu' | null;
  colorFamilies: string[];
  sizes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  sort: 'newest' | 'price_asc' | 'price_desc' | null;
  termGroups: string[][];
  chips: InterpretationChip[];
  ignored: string[];
}

export interface FacetAudience {
  value: 'nam' | 'nu';
  count: number;
}
export interface FacetCategory {
  slug: string;
  name: string;
  parentSlug: string | null;
  count: number;
}
export interface FacetColor {
  family: string;
  label: string;
  hex: string;
  count: number;
}
export interface FacetSize {
  code: string;
  count: number;
}
export interface FacetPrice {
  id: string;
  label: string;
  min: number | null;
  max: number | null;
  count: number;
}
export interface CatalogFacets {
  audience: FacetAudience[];
  categories: FacetCategory[];
  colors: FacetColor[];
  sizes: FacetSize[];
  price: FacetPrice[];
}

export interface SuggestCategory {
  slug: string;
  name: string;
  count: number;
}
export interface SuggestQuery {
  text: string;
  count: number;
}
export interface SuggestResponse {
  interpretation: SearchInterpretation;
  total: number;
  relaxed: string[];
  products: Product[];
  categories: SuggestCategory[];
  queries: SuggestQuery[];
}

/** Goi y cho o tim kiem toan cuc. `signal` huy yeu cau cu khi khach go tiep. */
export const suggest = (q: string, signal?: AbortSignal): Promise<SuggestResponse> =>
  apiGet<SuggestResponse>('/search/suggest', { q }, { signal });
