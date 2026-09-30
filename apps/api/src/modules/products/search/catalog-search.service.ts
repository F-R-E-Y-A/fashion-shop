import { Injectable, Logger } from '@nestjs/common';

import { skipOf, toPage } from '../../../common/pagination/page.response.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { ListProductsQuery } from '../dto/list-products.query.js';
import type { ProductListResponse } from '../dto/product.response.js';
import {
  DEFAULT_COLOR_CODE,
  storefrontProductInclude,
  storefrontProductWhere,
  toProductResponse,
} from '../storefront.js';
import type { Audience } from './audience.js';
import {
  type CatalogRow,
  type PreparedProduct,
  prepareProducts,
  search,
  type SearchResult,
  type SearchState,
} from './catalog-engine.js';
import { COLOR_FAMILY_KEYS, FAMILIES } from './color-family.js';
import type { DictEntry } from './dictionary.js';
import type { CatalogFacetsResponse } from './dto/catalog-facets.response.js';
import type { SuggestResponse } from './dto/suggest.response.js';
import { ascii } from './normalize-vi.js';
import { describeIntent } from './parse-query.js';
import { PRICE_BUCKETS } from './price-buckets.js';
import { SearchDictionaryService } from './search-dictionary.service.js';

// Lay het san pham hien thi duoc roi loc trong tien trinh: voi vai tram san pham la du nhanh
// (cong p95 < 150 ms) va cho phep dem facet tren ket qua. Nguong nang cap: ADR-019.
const searchInclude = {
  ...storefrontProductInclude,
  category: { include: { parent: true } },
  variants: {
    ...storefrontProductInclude.variants,
    select: {
      ...storefrontProductInclude.variants.select,
      size: { select: { code: true, sortOrder: true } },
    },
  },
} satisfies Prisma.ProductInclude;

type CatalogProduct = Prisma.ProductGetPayload<{ include: typeof searchInclude }>;

interface CategoryMeta {
  slug: string;
  name: string;
  parentSlug: string | null;
  /** Khoa xep: [thu tu cua danh muc goc, 0 la goc / 1 la con, thu tu cua chinh no]. */
  order: [number, number, number];
}

interface Catalog {
  byId: Map<string, CatalogProduct>;
  products: PreparedProduct[];
  categories: Map<string, CategoryMeta>;
  sizeOrder: Map<string, number>;
}

const DESCRIPTION_LIMIT = 600;
const QUERY_LOG_LIMIT = 120;
const SUGGEST_PRODUCTS = 5;
const SUGGEST_CATEGORIES = 3;
const SUGGEST_QUERIES = 4;

// Tam goc cua cau goi y; ket hop voi "", " nữ", " nam". Chi giu goi y co ket qua khong can noi.
const COMPLETION_ROOTS = [
  'áo sơ mi',
  'áo polo',
  'áo thun',
  'áo khoác',
  'quần tây',
  'quần jeans',
  'quần short',
  'thắt lưng',
];
const COMPLETION_SUFFIXES = ['', ' nữ', ' nam'];

function toCatalogRow(p: CatalogProduct): CatalogRow {
  const parent = p.category.parent;
  const realVariants = p.variants.filter((v) => v.color.code !== DEFAULT_COLOR_CODE);
  return {
    id: p.id,
    name: p.name,
    price: Number(p.priceFrom),
    cat: p.category.slug,
    catName: p.category.name,
    root: parent?.slug ?? p.category.slug,
    rootName: parent?.name ?? p.category.name,
    // Cot duoc bao ve boi CHECK trong migration ph01_search_audience.
    audience: p.audience as Audience | null,
    colors: [...new Set(realVariants.map((v) => v.color.name))],
    sizes: [...new Set(p.variants.map((v) => v.size.code))],
    featured: p.isFeatured,
    description: p.description ? p.description.slice(0, DESCRIPTION_LIMIT) : null,
  };
}

function toSearchState(query: ListProductsQuery): SearchState {
  return {
    q: query.search,
    filters: {
      categories: [
        ...(query.categories ?? []),
        ...(query.categorySlug ? [query.categorySlug] : []),
      ],
      colors: query.colors ?? [],
      sizes: query.sizes ?? [],
      audience: query.audience ?? null,
      minPrice: query.minPrice ?? null,
      maxPrice: query.maxPrice ?? null,
      featured: query.featured === true,
    },
    sort: query.sort ?? null,
  };
}

@Injectable()
export class CatalogSearchService {
  private readonly logger = new Logger(CatalogSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: SearchDictionaryService,
  ) {}

  async list(query: ListProductsQuery): Promise<ProductListResponse> {
    const catalog = await this.loadCatalog();
    const result = search(catalog.products, toSearchState(query), await this.dictionary.get());

    const start = skipOf(query);
    const items = result.items.slice(start, start + query.pageSize).flatMap((p) => {
      const row = catalog.byId.get(p.id);
      return row ? [toProductResponse(row)] : [];
    });

    const response: ProductListResponse = toPage(items, result.total, query);
    if (query.search !== undefined) {
      response.interpretation = describeIntent(result.intent);
      response.relaxed = result.relaxed;
      this.recordQuery(query.search, result.total);
    }
    if (query.facets === true) response.facets = this.buildFacets(result, catalog);
    return response;
  }

  /** Goi y cho o tim kiem toan cuc. Khong ghi search_query_logs: khach chua gui tim kiem. */
  async suggest(q: string): Promise<SuggestResponse> {
    const catalog = await this.loadCatalog();
    const dict = await this.dictionary.get();
    const result = search(catalog.products, { q }, dict);

    const products = result.items.slice(0, SUGGEST_PRODUCTS).flatMap((p) => {
      const row = catalog.byId.get(p.id);
      return row ? [toProductResponse(row)] : [];
    });

    const perCategory = new Map<string, number>();
    for (const p of result.items) perCategory.set(p.cat, (perCategory.get(p.cat) ?? 0) + 1);
    const categories = [...perCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, SUGGEST_CATEGORIES)
      .flatMap(([slug, count]) => {
        const meta = catalog.categories.get(slug);
        return meta ? [{ slug, name: meta.name, count }] : [];
      });

    return {
      interpretation: describeIntent(result.intent),
      total: result.total,
      relaxed: result.relaxed,
      products,
      categories,
      queries: this.completions(q, catalog.products, dict),
    };
  }

  private async loadCatalog(): Promise<Catalog> {
    const rows = await this.prisma.product.findMany({
      where: storefrontProductWhere(),
      include: searchInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    const categories = new Map<string, CategoryMeta>();
    const sizeOrder = new Map<string, number>();
    for (const p of rows) {
      const c = p.category;
      const parent = c.parent;
      if (parent && !categories.has(parent.slug)) {
        categories.set(parent.slug, {
          slug: parent.slug,
          name: parent.name,
          parentSlug: null,
          order: [parent.sortOrder, 0, 0],
        });
      }
      if (!categories.has(c.slug)) {
        categories.set(c.slug, {
          slug: c.slug,
          name: c.name,
          parentSlug: parent?.slug ?? null,
          order: parent ? [parent.sortOrder, 1, c.sortOrder] : [c.sortOrder, 0, 0],
        });
      }
      for (const v of p.variants) sizeOrder.set(v.size.code, v.size.sortOrder);
    }

    return {
      byId: new Map(rows.map((r) => [r.id, r])),
      products: prepareProducts(rows.map(toCatalogRow)),
      categories,
      sizeOrder,
    };
  }

  private buildFacets(result: SearchResult, catalog: Catalog): CatalogFacetsResponse {
    const { asked, facets: counts } = result;

    const audience = (['nu', 'nam'] as const)
      .map((value) => ({ value, count: counts.audience.get(value) ?? 0 }))
      .filter((a) => a.count > 0 || asked.audience === a.value);

    const categories = [...catalog.categories.values()]
      .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2])
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        parentSlug: c.parentSlug,
        count: counts.category.get(c.slug) ?? 0,
      }))
      .filter((c) => c.count > 0 || asked.categories.includes(c.slug));

    const colors = COLOR_FAMILY_KEYS.map((family) => ({
      family: family as string,
      label: FAMILIES[family].label as string,
      hex: FAMILIES[family].hex as string,
      count: counts.color.get(family) ?? 0,
    })).filter((c) => c.count > 0 || asked.colors.includes(c.family));

    const sizeCodes = new Set([...counts.size.keys(), ...asked.sizes]);
    const sizes = [...sizeCodes]
      .sort(
        (a, b) =>
          (catalog.sizeOrder.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (catalog.sizeOrder.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b),
      )
      .map((code) => ({ code, count: counts.size.get(code) ?? 0 }))
      .filter((s) => s.count > 0 || asked.sizes.includes(s.code));

    const price = PRICE_BUCKETS.map((b) => ({
      id: b.id,
      label: b.label,
      min: b.min,
      max: b.max,
      count: counts.price.get(b.id) ?? 0,
    })).filter((b) => b.count > 0);

    return { audience, categories, colors, sizes, price };
  }

  private completions(
    q: string,
    products: PreparedProduct[],
    dict: readonly DictEntry[],
  ): Array<{ text: string; count: number }> {
    const typed = ascii(q.trim());
    const out: Array<{ text: string; count: number }> = [];
    for (const root of COMPLETION_ROOTS) {
      for (const suffix of COMPLETION_SUFFIXES) {
        if (out.length >= SUGGEST_QUERIES) return out;
        const text = root + suffix;
        const words = ascii(text).split(' ');
        const startsWithTyped = words.some((_, i) => words.slice(i).join(' ').startsWith(typed));
        if (!startsWithTyped || ascii(text) === typed) continue;
        const r = search(products, { q: text }, dict);
        if (r.total > 0 && r.relaxed.length === 0) out.push({ text, count: r.total });
      }
    }
    return out;
  }

  // Ghi nhat ky tim kiem de biet khach tim gi ma khong ra. Khong cho, loi ghi khong duoc lam hong
  // cau tra loi (UC-03.2, ADR-019).
  private recordQuery(text: string, resultCount: number): void {
    const queryText = text.trim().toLowerCase().slice(0, QUERY_LOG_LIMIT);
    void this.prisma.searchQueryLog
      .create({ data: { queryText, resultCount } })
      .catch((error: unknown) => {
        this.logger.warn(`Khong ghi duoc search_query_logs: ${(error as Error).message}`);
      });
  }
}
