import type { ListProductsQuery } from '../dto/list-products.query.js';

/**
 * Query nao can duong tim kiem/loc (CatalogSearchService) thay vi duong liet ke co ban.
 * Khong co tham so nao trong danh sach thi giu duong cu, nen moi bai kiem thu HTTP cua liet ke,
 * sap xep, featured va categorySlug chay y nhu truoc. Chon duong o controller chu khong o
 * ProductsService vi constructor cua ProductsService bi dung truc tiep o noi khac (script nap du lieu).
 */
export function usesSearchEngine(query: ListProductsQuery): boolean {
  return (
    query.search !== undefined ||
    query.audience !== undefined ||
    (query.categories?.length ?? 0) > 0 ||
    (query.colors?.length ?? 0) > 0 ||
    (query.sizes?.length ?? 0) > 0 ||
    query.minPrice !== undefined ||
    query.maxPrice !== undefined ||
    query.facets === true ||
    query.sort === 'relevance'
  );
}
