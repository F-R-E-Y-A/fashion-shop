import { apiGet, type Page, type QueryParams } from '@/core';

import type { CatalogFacets, SearchInterpretation } from './search.api.js';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  listPrice: string | null;
  imageUrl: string | null;
  brandName: string | null;
  categoryName: string;
  categorySlug: string;
  /** Anh thu hai, hien khi re chuot. */
  hoverImageUrl: string | null;
  /** Ma mau (hex) cua toi da 4 ho mau; rong khi san pham khong co mau. */
  colorSwatches: string[];
  colorCount: number;
  stockStatus?: 'IN_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  /** Trung binh sao cua danh gia da duyet; 0 khi chua co. Tuy chon de du lieu mau cu van hop kieu. */
  ratingAverage?: number;
  ratingCount?: number;
}
export interface CategoryCrumb {
  name: string;
  slug: string;
}
export interface ProductColor {
  code: string;
  name: string;
  hex: string | null;
}
export interface ProductImage {
  url: string;
  alt: string | null;
  colorCode: string | null;
}
export interface ProductVariant {
  id: string;
  sku: string;
  colorCode: string;
  sizeCode: string;
  price: string;
  listPrice: string | null;
  availableQuantity?: number | null;
}
export interface ProductDetail extends Product {
  material: string | null;
  careInstructions: string | null;
  breadcrumb: CategoryCrumb[];
  colors: ProductColor[];
  images: ProductImage[];
  variants: ProductVariant[];
}
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  /** Cha bang tong san pham cua no va cac con. */
  productCount: number;
  children: CategoryNode[];
}
export interface CategoryDetail {
  id: string;
  name: string;
  slug: string;
  breadcrumb: CategoryCrumb[];
  children: CategoryCrumb[];
}
export type ProductSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc';
export type Audience = 'nam' | 'nu';
export type ListProductsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  categorySlug?: string;
  /** Nhieu danh muc cung luc (HOAC); danh muc cha keo theo con. */
  categories?: string[];
  audience?: Audience;
  colors?: string[];
  sizes?: string[];
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  featured?: boolean;
  /** Xin so dem cho bo loc. */
  facets?: boolean;
  /** false: khong ghi cau tim vao nhat ky, danh cho the co dinh tren trang chu (khong phai khach tim). */
  log?: boolean;
};
/** Trang san pham; interpretation va relaxed chi co khi co search, facets chi co khi xin. */
export interface ProductPage extends Page<Product> {
  interpretation?: SearchInterpretation;
  relaxed?: string[];
  facets?: CatalogFacets;
}
export const productKeys = {
  all: ['products'] as const,
  list: (params: ListProductsParams) => [...productKeys.all, 'list', params] as const,
  detail: (slug: string) => [...productKeys.all, 'detail', slug] as const,
  related: (slug: string) => [...productKeys.all, 'related', slug] as const,
  suggest: (q: string) => [...productKeys.all, 'suggest', q] as const,
};
export const categoryKeys = {
  all: ['categories'] as const,
  tree: () => [...categoryKeys.all, 'tree'] as const,
  detail: (slug: string) => [...categoryKeys.all, 'detail', slug] as const,
};
/** May chu nhan mang duoi dang chuoi phay: colors=den,trang. */
const toQuery = ({ categories, colors, sizes, ...rest }: ListProductsParams): QueryParams => ({
  ...rest,
  categories: categories?.join(','),
  colors: colors?.join(','),
  sizes: sizes?.join(','),
});
export const listProducts = (params: ListProductsParams): Promise<ProductPage> =>
  apiGet<ProductPage>('/products', toQuery(params));
export const getProductDetail = (slug: string): Promise<ProductDetail> =>
  apiGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`);
export const getRelatedProducts = (slug: string, limit = 4): Promise<Product[]> =>
  apiGet<Product[]>(`/products/${encodeURIComponent(slug)}/related`, { limit });
export const getCategories = (): Promise<CategoryNode[]> => apiGet<CategoryNode[]>('/categories');
export const getCategory = (slug: string): Promise<CategoryDetail> =>
  apiGet<CategoryDetail>(`/categories/${encodeURIComponent(slug)}`);
