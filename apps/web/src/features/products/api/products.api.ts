import { apiGet, type Page } from '@/core';

/** Kieu du lieu san pham, khop ProductResponse ben may chu. */
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Gia la CHUOI vi ben may chu luu Decimal; dung core/format.formatPrice de hien thi. */
  price: string;
  imageUrl: string | null;
  categoryName: string;
  categorySlug: string;
}

/**
 * Tham so truy van viet bang `type`, KHONG phai `interface`.
 * Ly do: TypeScript chi cho `type` khop voi Record<string, ...> ma apiGet nhan;
 * `interface` se bao loi "Index signature ... is missing". Lam feature khac thi theo dung mau nay.
 */
export type ListProductsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  categorySlug?: string;
};

/**
 * Khoa bo nho dem cua TanStack Query. Gom ca cay khoa cua feature o mot cho
 * de xoa dem dung pham vi, vi du queryClient.invalidateQueries({ queryKey: productKeys.all }).
 */
export const productKeys = {
  all: ['products'] as const,
  list: (params: ListProductsParams) => [...productKeys.all, 'list', params] as const,
  detail: (slug: string) => [...productKeys.all, 'detail', slug] as const,
};

export const listProducts = (params: ListProductsParams): Promise<Page<Product>> =>
  apiGet<Page<Product>>('/products', params);

export const getProductBySlug = (slug: string): Promise<Product> =>
  apiGet<Product>(`/products/${slug}`);
