import { describe, expect, it } from 'vitest';

import { ListProductsQuery } from '../dto/list-products.query.js';
import { usesSearchEngine } from './uses-search-engine.js';

const query = (overrides: Partial<ListProductsQuery> = {}): ListProductsQuery =>
  Object.assign(new ListProductsQuery(), overrides);

describe('usesSearchEngine', () => {
  it('UC-03.1 khong co tham so tim kiem hay loc thi giu duong liet ke co ban', () => {
    expect(usesSearchEngine(query())).toBe(false);
    expect(usesSearchEngine(query({ page: 2, pageSize: 20 }))).toBe(false);
    expect(usesSearchEngine(query({ categorySlug: 'ao-thun', featured: true }))).toBe(false);
    expect(usesSearchEngine(query({ sort: 'price_asc' }))).toBe(false);
    expect(usesSearchEngine(query({ sort: 'newest', facets: false }))).toBe(false);
  });

  it.each([
    ['search', { search: 'polo' }],
    ['audience', { audience: 'nu' as const }],
    ['categories', { categories: ['ao'] }],
    ['colors', { colors: ['den'] }],
    ['sizes', { sizes: ['M'] }],
    ['minPrice', { minPrice: 0 }],
    ['maxPrice', { maxPrice: 100000 }],
    ['facets', { facets: true }],
    ['sort=relevance', { sort: 'relevance' as const }],
  ])('UC-03.2 co %s thi di duong tim kiem', (_name, overrides) => {
    expect(usesSearchEngine(query(overrides))).toBe(true);
  });

  it('UC-03.3 mang rong khong keo sang duong tim kiem', () => {
    expect(usesSearchEngine(query({ categories: [], colors: [], sizes: [] }))).toBe(false);
  });
});
