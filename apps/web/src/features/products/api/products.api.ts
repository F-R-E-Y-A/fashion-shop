import { apiGet, type Page } from '@/core';

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
  children: CategoryNode[];
}
export interface CategoryDetail {
  id: string;
  name: string;
  slug: string;
  breadcrumb: CategoryCrumb[];
  children: CategoryCrumb[];
}
export type ProductSort = 'newest' | 'price_asc' | 'price_desc';
export type ListProductsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  categorySlug?: string;
  sort?: ProductSort;
  featured?: boolean;
};
export const productKeys = {
  all: ['products'] as const,
  list: (params: ListProductsParams) => [...productKeys.all, 'list', params] as const,
  detail: (slug: string) => [...productKeys.all, 'detail', slug] as const,
  related: (slug: string) => [...productKeys.all, 'related', slug] as const,
};
export const categoryKeys = {
  all: ['categories'] as const,
  tree: () => [...categoryKeys.all, 'tree'] as const,
  detail: (slug: string) => [...categoryKeys.all, 'detail', slug] as const,
};
export const listProducts = (params: ListProductsParams): Promise<Page<Product>> =>
  apiGet<Page<Product>>('/products', params);
export const getProductDetail = (slug: string): Promise<ProductDetail> =>
  apiGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`);
export const getRelatedProducts = (slug: string, limit = 4): Promise<Product[]> =>
  apiGet<Product[]>(`/products/${encodeURIComponent(slug)}/related`, { limit });
export const getCategories = (): Promise<CategoryNode[]> => apiGet<CategoryNode[]>('/categories');
export const getCategory = (slug: string): Promise<CategoryDetail> =>
  apiGet<CategoryDetail>(`/categories/${encodeURIComponent(slug)}`);
