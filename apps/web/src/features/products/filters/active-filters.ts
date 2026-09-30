import type { CatalogFacets } from '../api/index.js';
import { type CatalogParams, patchCatalogParams } from '../lib/catalog-params.js';

/** Mot bo loc tuong minh dang bat, hien thanh chip "Bo loc"; `next` la trang thai sau khi bo no. */
export interface ActiveFilter {
  key: string;
  label: string;
  next: CatalogParams;
}

const formatMoney = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;

/** Nhan khoang gia: lay nhan cua moc trung khop, khong co thi tu dung tu min/max. */
function priceLabel(params: CatalogParams, facets: CatalogFacets | undefined): string {
  const bucket = facets?.price.find((b) => b.min === params.minPrice && b.max === params.maxPrice);
  if (bucket) return bucket.label;
  if (params.minPrice !== null && params.maxPrice !== null) {
    return `${formatMoney(params.minPrice)} – ${formatMoney(params.maxPrice)}`;
  }
  return params.minPrice !== null
    ? `Từ ${formatMoney(params.minPrice)}`
    : `Dưới ${formatMoney((params.maxPrice ?? 0) + 1)}`;
}

/** Cac bo loc tuong minh (tham so) dang bat, theo thu tu hien thi. Cau tim khong nam trong day. */
export function activeFilters(
  params: CatalogParams,
  facets: CatalogFacets | undefined,
): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  const without = (patch: Partial<CatalogParams>) => patchCatalogParams(params, patch);

  for (const slug of params.categories) {
    const name = facets?.categories.find((c) => c.slug === slug)?.name ?? slug;
    out.push({
      key: `category:${slug}`,
      label: name,
      next: without({ categories: params.categories.filter((c) => c !== slug) }),
    });
  }
  for (const family of params.colors) {
    const label = facets?.colors.find((c) => c.family === family)?.label ?? family;
    out.push({
      key: `color:${family}`,
      label: `Màu ${label.toLowerCase()}`,
      next: without({ colors: params.colors.filter((c) => c !== family) }),
    });
  }
  for (const size of params.sizes) {
    out.push({
      key: `size:${size}`,
      label: `Cỡ ${size}`,
      next: without({ sizes: params.sizes.filter((s) => s !== size) }),
    });
  }
  if (params.audience) {
    out.push({
      key: 'audience',
      label: params.audience === 'nu' ? 'Nữ' : 'Nam',
      next: without({ audience: null }),
    });
  }
  if (params.minPrice !== null || params.maxPrice !== null) {
    out.push({
      key: 'price',
      label: priceLabel(params, facets),
      next: without({ minPrice: null, maxPrice: null }),
    });
  }
  return out;
}
