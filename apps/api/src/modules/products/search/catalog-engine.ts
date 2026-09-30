import type { Audience } from './audience.js';
import { type ColorFamily, colorFamily } from './color-family.js';
import { DEFAULT_DICTIONARY, type DictEntry } from './dictionary.js';
import { ascii, hasAccent, lower } from './normalize-vi.js';
import {
  type IntentAudience,
  parseQuery,
  type SearchIntent,
  type TermGroup,
} from './parse-query.js';
import { PRICE_BUCKETS } from './price-buckets.js';

/**
 * Bo may loc va xep hang tren danh sach san pham da nap vao bo nho. Ham thuan, khong doc DB:
 * CatalogSearchService nap hang, engine loc, xep, dem facet. Voi vai tram san pham thi nap het roi
 * loc trong tien trinh la du nhanh (do p95 o cong nghiem thu); nguong nang cap ghi o ADR-019.
 */

/** Mot san pham hien thi duoc, da rut gon de tim kiem. */
export interface CatalogRow {
  id: string;
  name: string;
  /** products.price_from. */
  price: number;
  cat: string;
  catName: string;
  root: string;
  rootName: string;
  audience: Audience | null;
  /** Ten mau nguon cua cac bien the dang ban. */
  colors: string[];
  /** Ma co cua cac bien the dang ban. */
  sizes: string[];
  featured: boolean;
  description: string | null;
}

export interface PreparedProduct extends CatalogRow {
  /** Thu tu nap (created_at giam dan roi id): dung de xep "moi nhat" va lam chuan khi hoa. */
  i: number;
  families: ColorFamily[];
  // Bon ban van ban duoc chen dau cach hai dau de khop nguyen tu bang includes(" tu").
  nameLow: string;
  nameAsc: string;
  textLow: string;
  textAsc: string;
  words: string[];
}

export function prepareProducts(rows: readonly CatalogRow[]): PreparedProduct[] {
  const pad = (s: string): string => ` ${s} `;
  return rows.map((row, i) => {
    const name = row.name.normalize('NFC');
    const audienceWord = row.audience === 'nu' ? 'nữ' : row.audience === 'nam' ? 'nam' : '';
    const text = [
      name,
      row.catName,
      row.rootName,
      audienceWord,
      row.colors.join(' '),
      row.description ?? '',
    ].join(' ');
    const textAsc = ascii(text).replace(/[^a-z0-9]+/g, ' ');
    return {
      ...row,
      i,
      name,
      families: [...new Set(row.colors.map(colorFamily))],
      nameLow: pad(lower(name).replace(/[^\p{L}\p{N}]/gu, ' ')),
      nameAsc: pad(ascii(name).replace(/[^a-z0-9]/g, ' ')),
      textLow: pad(lower(text).replace(/[^\p{L}\p{N}]+/gu, ' ')),
      textAsc: pad(textAsc),
      words: [...new Set(textAsc.split(' ').filter((w) => w.length >= 3))],
    };
  });
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Diem mot tu: 3 neu khop dau mot tu trong ten, 1 neu trong van ban, 0,6 neu go sai mot hai chu. */
export function matchTerm(p: PreparedProduct, term: string): number {
  const accented = hasAccent(term);
  const needle = ` ${accented ? lower(term) : ascii(term)}`;
  if ((accented ? p.nameLow : p.nameAsc).includes(needle)) return 3;
  if ((accented ? p.textLow : p.textAsc).includes(needle)) return 1;
  if (!accented) {
    const a = ascii(term);
    if (a.length >= 4 && !a.includes(' ')) {
      const limit = a.length >= 7 ? 2 : 1;
      for (const w of p.words) {
        if (Math.abs(w.length - a.length) <= limit && levenshtein(a, w) <= limit) return 0.6;
      }
    }
  }
  return 0;
}

export interface EngineFilters {
  /** Slug danh muc; danh muc cha keo theo cac con. */
  categories: string[];
  /** Ho mau. */
  colors: string[];
  sizes: string[];
  audience: IntentAudience | null;
  minPrice: number | null;
  maxPrice: number | null;
  featured: boolean;
}

export const emptyFilters = (): EngineFilters => ({
  categories: [],
  colors: [],
  sizes: [],
  audience: null,
  minPrice: null,
  maxPrice: null,
  featured: false,
});

const uniq = <T>(a: T[]): T[] => [...new Set(a)];

type Skip = 'category' | 'audience' | 'color' | 'size' | 'price' | null;

function passes(p: PreparedProduct, f: EngineFilters, skip: Skip): boolean {
  if (f.featured && !p.featured) return false;
  if (
    skip !== 'category' &&
    f.categories.length &&
    !f.categories.some((c) => p.cat === c || p.root === c)
  ) {
    return false;
  }
  if (skip !== 'audience' && f.audience && p.audience !== f.audience) return false;
  if (skip !== 'color' && f.colors.length && !p.families.some((c) => f.colors.includes(c))) {
    return false;
  }
  if (skip !== 'size' && f.sizes.length && !p.sizes.some((s) => f.sizes.includes(s))) {
    return false;
  }
  if (skip !== 'price') {
    if (f.minPrice !== null && p.price < f.minPrice) return false;
    if (f.maxPrice !== null && p.price > f.maxPrice) return false;
  }
  return true;
}

/** Moi nhom la HOAC giua cac tu, cac nhom la VA. Diem null = khong qua nhom nao do. */
function scoreAll(products: PreparedProduct[], groups: TermGroup[]): Array<number | null> {
  return products.map((p) => {
    let s = 0;
    for (const g of groups) {
      let best = 0;
      for (const t of g.terms) {
        best = Math.max(best, matchTerm(p, t));
        if (best >= 3) break;
      }
      if (!best) return null;
      s += g.kind === 'occasion' ? Math.min(best, 1.5) : best;
    }
    return s + (p.featured ? 0.5 : 0);
  });
}

export interface FacetCounts {
  audience: Map<string, number>;
  /** Ca danh muc con lan danh muc cha. */
  category: Map<string, number>;
  color: Map<string, number>;
  size: Map<string, number>;
  /** Theo id cua PRICE_BUCKETS. */
  price: Map<string, number>;
}

function countFacets(
  products: PreparedProduct[],
  f: EngineFilters,
  scores: Array<number | null>,
): FacetCounts {
  // Moi nhom dem tren cac san pham qua MOI bo loc TRU nhom do, de khach thay "chon them cai nay se con bao nhieu".
  const pick = (skip: Skip): PreparedProduct[] =>
    products.filter((p, i) => scores[i] !== null && passes(p, f, skip));
  const count = (list: PreparedProduct[], keys: (p: PreparedProduct) => string[]) => {
    const m = new Map<string, number>();
    for (const p of list) for (const k of keys(p)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  return {
    audience: count(pick('audience'), (p) => (p.audience ? [p.audience] : [])),
    category: count(pick('category'), (p) => uniq([p.cat, p.root])),
    color: count(pick('color'), (p) => p.families),
    size: count(pick('size'), (p) => p.sizes),
    price: count(pick('price'), (p) =>
      PRICE_BUCKETS.filter(
        (b) => (b.min === null || p.price >= b.min) && (b.max === null || p.price <= b.max),
      ).map((b) => b.id),
    ),
  };
}

export type SortKey = 'relevance' | 'newest' | 'price_asc' | 'price_desc';

interface Hit {
  p: PreparedProduct;
  s: number;
}

// Sap theo gia thi hoa theo thu tu nap (khong theo diem) de khop duong liet ke cu.
const SORTS: Record<SortKey, (a: Hit, b: Hit) => number> = {
  relevance: (a, b) => b.s - a.s || a.p.i - b.p.i,
  newest: (a, b) => a.p.i - b.p.i,
  price_asc: (a, b) => a.p.price - b.p.price || a.p.i - b.p.i,
  price_desc: (a, b) => b.p.price - a.p.price || a.p.i - b.p.i,
};

export interface SearchState {
  q?: string;
  filters?: Partial<EngineFilters>;
  sort?: SortKey | null;
}

export interface SearchResult {
  intent: SearchIntent;
  /** Bo loc khach yeu cau: hop cua cau hoi va tham so tuong minh. */
  asked: EngineFilters;
  /** Bo loc thuc su ap dung, sau khi noi truy van (neu co). */
  applied: EngineFilters;
  groups: TermGroup[];
  /** Nhan cac buoc da noi, theo thu tu; rong neu khong phai noi. */
  relaxed: string[];
  sort: SortKey;
  items: PreparedProduct[];
  total: number;
  facets: FacetCounts;
}

/**
 * Bo loc tuong minh gop voi thuc the hieu tu cau hoi: tap hop thi hop lai; gia tri don thi tuong
 * minh thang cau hoi (audience, minPrice, maxPrice).
 */
export function search(
  products: PreparedProduct[],
  state: SearchState = {},
  dict: readonly DictEntry[] = DEFAULT_DICTIONARY,
): SearchResult {
  const q = state.q ?? '';
  const intent = parseQuery(q, dict);
  const given = state.filters ?? {};
  const ex: EngineFilters = {
    categories: given.categories ?? [],
    colors: given.colors ?? [],
    sizes: given.sizes ?? [],
    audience: given.audience ?? null,
    minPrice: given.minPrice ?? null,
    maxPrice: given.maxPrice ?? null,
    featured: given.featured ?? false,
  };
  const explicitPrice = ex.minPrice !== null || ex.maxPrice !== null;
  const asked: EngineFilters = {
    categories: uniq([...intent.categorySlugs, ...ex.categories]),
    colors: uniq([...intent.colorFamilies, ...ex.colors]),
    sizes: uniq([...intent.sizes, ...ex.sizes]),
    audience: ex.audience ?? intent.audience ?? null,
    minPrice: explicitPrice ? ex.minPrice : intent.minPrice,
    maxPrice: explicitPrice ? ex.maxPrice : intent.maxPrice,
    featured: Boolean(ex.featured),
  };
  const f: EngineFilters = {
    ...asked,
    categories: [...asked.categories],
    colors: [...asked.colors],
    sizes: [...asked.sizes],
  };
  let groups = intent.groups;
  let scores = scoreAll(products, groups);
  const collect = (): Hit[] =>
    products.flatMap((p, i) => {
      const s = scores[i];
      return s !== null && passes(p, f, null) ? [{ p, s }] : [];
    });
  let hits = collect();
  let relaxed: string[] = [];
  let gaveUp = false;
  const constrained = (): boolean =>
    groups.length > 0 ||
    f.categories.length > 0 ||
    f.colors.length > 0 ||
    f.sizes.length > 0 ||
    Boolean(f.audience) ||
    f.minPrice !== null ||
    f.maxPrice !== null ||
    f.featured;

  // Khong co ket qua thi noi dan va noi ro da noi gi. Chi noi khi co cau hoi, khong noi bo loc
  // khach tu bam. Noi toi luc khong con rang buoc nao thi dung: tra rong (UC-03.2/E1, AC3),
  // khong tra ca Catalog.
  if (!hits.length && q.trim()) {
    const steps: Array<[string, () => boolean, () => void]> = [
      [
        'bỏ từ khoá tự do',
        () => groups.some((g) => g.kind === 'free' || g.kind === 'term'),
        () => {
          groups = groups.filter((g) => g.kind !== 'free' && g.kind !== 'term');
        },
      ],
      [
        'bỏ dịp mặc và kiểu dáng',
        () => groups.length > 0,
        () => {
          groups = [];
        },
      ],
      [
        'bỏ màu',
        () => f.colors.length > 0,
        () => {
          f.colors = [];
        },
      ],
      [
        'bỏ cỡ',
        () => f.sizes.length > 0,
        () => {
          f.sizes = [];
        },
      ],
      [
        'bỏ khoảng giá',
        () => f.minPrice !== null || f.maxPrice !== null,
        () => {
          f.minPrice = null;
          f.maxPrice = null;
        },
      ],
    ];
    for (const [label, when, apply] of steps) {
      if (!when()) continue;
      apply();
      relaxed.push(label);
      if (!constrained()) {
        gaveUp = true;
        break;
      }
      scores = scoreAll(products, groups);
      hits = collect();
      if (hits.length) break;
    }
  }
  if (gaveUp) {
    // Tra ve dung cau hoi ban dau: khong ket qua, facet cung dem tren cau ban dau (deu 0).
    hits = [];
    relaxed = [];
    groups = intent.groups;
    Object.assign(f, asked, {
      categories: [...asked.categories],
      colors: [...asked.colors],
      sizes: [...asked.sizes],
    });
    scores = scoreAll(products, groups);
  }

  const sort: SortKey =
    state.sort ?? intent.sort ?? (intent.groups.length ? 'relevance' : 'newest');
  hits.sort(SORTS[sort]);
  return {
    intent,
    asked,
    applied: f,
    groups,
    relaxed,
    sort,
    items: hits.map((h) => h.p),
    total: hits.length,
    facets: countFacets(products, f, scores),
  };
}
