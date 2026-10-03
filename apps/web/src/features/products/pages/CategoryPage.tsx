import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, pageTitle } from '@/core';
import { Empty, ErrorNote, layout, Pager, SkeletonGrid } from '@/ui';

import {
  categoryKeys,
  getCategory,
  listProducts,
  type ListProductsParams,
  productKeys,
  type ProductSort,
} from '../api/index.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { CategoryChips } from '../components/CategoryChips.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { SortSelect } from '../components/SortSelect.js';
import { FilteredResults, FilterToggle } from '../filters/FilteredResults.js';
import { FilterPanel } from '../filters/FilterPanel.js';
import { useFilterSheet } from '../filters/useFilterSheet.js';
import { countActiveFilters, patchCatalogParams } from '../lib/catalog-params.js';
import { useCatalogUrl } from '../lib/useCatalogUrl.js';

const PAGE_SIZE = 20;
const FILTERS_ID = 'category-filters';

export function CategoryPage() {
  const { slug = '' } = useParams();
  const [params, setParams] = useCatalogUrl();
  const { sheetOpen, openSheet, closeSheet, attachToggle } = useFilterSheet();
  // Trang danh muc khong co cau tim nen khong co "Lien quan nhat".
  const sort: ProductSort = params.sort && params.sort !== 'relevance' ? params.sort : 'newest';

  const category = useQuery({
    queryKey: categoryKeys.detail(slug),
    queryFn: () => getCategory(slug),
    enabled: Boolean(slug),
  });
  const rootSlug = category.data?.breadcrumb[0]?.slug ?? '';
  const root = useQuery({
    queryKey: categoryKeys.detail(rootSlug),
    queryFn: () => getCategory(rootSlug),
    enabled: Boolean(rootSlug) && rootSlug !== slug,
  });
  const listParams = useMemo<ListProductsParams>(
    () => ({
      categorySlug: slug,
      audience: params.audience ?? undefined,
      colors: params.colors.length ? params.colors : undefined,
      sizes: params.sizes.length ? params.sizes : undefined,
      minPrice: params.minPrice ?? undefined,
      maxPrice: params.maxPrice ?? undefined,
      sort,
      page: params.page,
      pageSize: PAGE_SIZE,
      facets: true,
    }),
    [slug, params, sort],
  );
  const products = useQuery({
    queryKey: productKeys.list(listParams),
    queryFn: () => listProducts(listParams),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  });

  if (category.isPending)
    return (
      <div className={layout.container}>
        <SkeletonGrid count={8} />
      </div>
    );
  if (category.isError) {
    const missing = category.error instanceof ApiError && category.error.body.statusCode === 404;
    return (
      <div className={layout.container}>
        {missing ? (
          <>
            <h1>Không tìm thấy danh mục</h1>
            <Link to="/">Về trang chủ</Link>
          </>
        ) : (
          <ErrorNote label="Không tải được danh mục." onRetry={() => void category.refetch()} />
        )}
      </div>
    );
  }

  const rootCategory = rootSlug === slug ? category.data : root.data;
  const breadcrumb = [
    { name: 'Trang chủ', to: '/' },
    ...category.data.breadcrumb.map((item, index, arr) => ({
      name: item.name,
      to: index === arr.length - 1 ? undefined : `/danh-muc/${item.slug}`,
    })),
  ];
  const data = products.data;
  const filterCount = countActiveFilters({ ...params, categories: [] });
  const clearAll = () =>
    setParams(
      patchCatalogParams(params, {
        audience: null,
        colors: [],
        sizes: [],
        minPrice: null,
        maxPrice: null,
      }),
    );

  return (
    <div className={layout.container}>
      <title>{pageTitle(category.data.name)}</title>
      <Breadcrumb items={breadcrumb} />
      <h1>{category.data.name.toUpperCase()}</h1>
      {data && <p>{data.total} sản phẩm</p>}
      {rootCategory && <CategoryChips root={rootCategory} activeSlug={slug} />}
      <FilteredResults
        panel={
          <FilterPanel
            id={FILTERS_ID}
            facets={data?.facets}
            interpretation={undefined}
            params={params}
            total={data?.total}
            sheetOpen={sheetOpen}
            onCloseSheet={closeSheet}
            onChange={setParams}
            onClear={clearAll}
            showCategories={false}
          />
        }
        toggle={
          <FilterToggle
            ref={attachToggle}
            count={filterCount}
            expanded={sheetOpen}
            controls={FILTERS_ID}
            onClick={openSheet}
          />
        }
        sort={
          <SortSelect
            value={sort}
            onChange={(next) => setParams(patchCatalogParams(params, { sort: next }))}
          />
        }
      >
        <h2 className="sr-only">Sản phẩm trong {category.data.name}</h2>
        {products.isPending && <SkeletonGrid count={8} />}
        {products.isError && !data && (
          <ErrorNote
            label={`Không tải được danh mục ${category.data.name}.`}
            onRetry={() => void products.refetch()}
          />
        )}
        {data?.items.length === 0 && (
          <Empty
            label={
              filterCount > 0
                ? 'Không có sản phẩm nào khớp bộ lọc.'
                : 'Chưa có sản phẩm trong danh mục.'
            }
          />
        )}
        {data && data.items.length > 0 && (
          <>
            <ProductGrid products={data.items} showBrand />
            <Pager
              variant="numbered"
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              unit="sản phẩm"
              onChange={(next) => {
                setParams(patchCatalogParams(params, { page: next }));
                window.scrollTo({ top: 0 });
              }}
            />
          </>
        )}
      </FilteredResults>
    </div>
  );
}
