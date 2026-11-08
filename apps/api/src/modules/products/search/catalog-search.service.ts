import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { skipOf, toPage } from '../../../common/pagination/page.response.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { InventoryService } from '../../inventory/index.js';
import type { ListProductsQuery } from '../dto/list-products.query.js';
import type { ProductListResponse } from '../dto/product.response.js';
import { withProductStock } from '../stock.js';
import {
  currentPriceFrom,
  DEFAULT_COLOR_CODE,
  preferredFamilyOf,
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
import { SemanticIndexService } from './semantic/semantic-index.service.js';

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
    price: Number(currentPriceFrom(p)),
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

/** Dong catalog cua cac san pham tren trang: chi hoi ton kho cho chung, khong cho ca catalog. */
function pageRows(items: readonly { id: string }[], catalog: Catalog) {
  return items.flatMap((item) => {
    const row = catalog.byId.get(item.id);
    return row ? [row] : [];
  });
}

/**
 * Tuoi toi da cua catalog trong bo nho. catalog_revision_seq (migration ph11_live_revision) la
 * sequence, khong theo transaction: no tang ngay khi cau lenh ghi chay, truoc khi commit. Mot request
 * doc dung luc do se nap ban cu duoi so moi; han nay chan muc cu ay o 30 giay.
 */
export const CATALOG_MAX_AGE_MS = 30_000;

/** Catalog da nap, kem revision doc truoc khi nap va thoi diem bat dau nap. */
interface CachedCatalog {
  revision: string;
  loadedAt: number;
  catalog: Catalog;
}

@Injectable()
export class CatalogSearchService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSearchService.name);
  private cached: CachedCatalog | null = null;
  private loading: { revision: string; promise: Promise<Catalog> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dictionary: SearchDictionaryService,
    private readonly inventory: InventoryService,
    private readonly semantic: SemanticIndexService,
  ) {}

  /** Bat tim kiem ngu nghia thi nap mo hinh va nhung catalog o nen, khong chan khoi dong. */
  onApplicationBootstrap(): void {
    if (!this.semantic.enabled) return;
    void this.catalog()
      .then((catalog) => this.semantic.refresh(catalog.products))
      .catch((error: unknown) => {
        this.logger.warn(`Khong nap duoc catalog de nhung: ${(error as Error).message}`);
      });
  }

  /**
   * options.semantic=false buoc chi xep theo luat: script danh gia (scripts/search-eval) dung de so
   * hai cach tren cung mot tien trinh.
   */
  async list(
    query: ListProductsQuery,
    options: { semantic?: boolean } = {},
  ): Promise<ProductListResponse> {
    const catalog = await this.catalog();
    const sim =
      query.search !== undefined && options.semantic !== false
        ? await this.semantic.scores(query.search, catalog.products)
        : null;
    const result = search(catalog.products, toSearchState(query), await this.dictionary.get(), sim);

    const start = skipOf(query);
    // Dang loc dung mot ho mau thi the dung anh cua mau do (storefront.ts).
    const preferFamily = preferredFamilyOf(query.colors);
    const items = result.items.slice(start, start + query.pageSize).flatMap((p) => {
      const row = catalog.byId.get(p.id);
      return row ? [toProductResponse(row, { preferFamily })] : [];
    });

    const enriched = await withProductStock(items, pageRows(items, catalog), this.inventory);
    const response: ProductListResponse = toPage(enriched, result.total, query);
    if (query.search !== undefined) {
      response.interpretation = describeIntent(result.intent);
      response.relaxed = result.relaxed;
      response.ranking = result.semantic.applied ? 'hybrid' : 'rules';
      if (query.log !== false) this.recordQuery(query.search, result.total);
    }
    if (query.facets === true) response.facets = this.buildFacets(result, catalog);
    return response;
  }

  /** Goi y cho o tim kiem toan cuc. Khong ghi search_query_logs: khach chua gui tim kiem. */
  async suggest(q: string): Promise<SuggestResponse> {
    const catalog = await this.catalog();
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
      products: await withProductStock(products, pageRows(products, catalog), this.inventory),
      categories,
      queries: this.completions(q, catalog.products, dict),
    };
  }

  /**
   * Catalog dung chung cho moi request. Truoc day moi request nap lai toan bo san pham, bien the,
   * anh tu CSDL va chuan hoa lai; trang chu goi 14 request cung luc nen may 0,1 CPU nghen. Gio
   * chi doc mot dong catalog_revision_seq: trung revision va con trong han thi dung lai; request den
   * trong luc dang nap cung revision thi cho chung mot lan nap.
   */
  private async catalog(): Promise<Catalog> {
    const revision = await this.catalogRevision();
    if (revision === null) return this.loadCatalog();
    const cached = this.cached;
    if (cached?.revision === revision && Date.now() - cached.loadedAt < CATALOG_MAX_AGE_MS) {
      return cached.catalog;
    }
    if (this.loading?.revision === revision) return this.loading.promise;

    const loadedAt = Date.now();
    const promise = this.loadCatalog();
    const loading = { revision, promise };
    this.loading = loading;
    try {
      const catalog = await promise;
      this.cached = { revision, loadedAt, catalog };
      return catalog;
    } finally {
      if (this.loading === loading) this.loading = null;
    }
  }

  /** Null khi khong doc duoc sequence: khi do khong cache, nap moi nhu truoc. */
  private async catalogRevision(): Promise<string | null> {
    try {
      const [row] = await this.prisma.$queryRaw<{ value: string }[]>`
        SELECT concat_ws(':', last_value, is_called) AS value FROM public.catalog_revision_seq`;
      return row?.value ?? null;
    } catch (error) {
      this.logger.warn(`Khong doc duoc catalog_revision_seq: ${(error as Error).message}`);
      return null;
    }
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
