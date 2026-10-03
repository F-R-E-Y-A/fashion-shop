import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { pageTitle } from '@/core';
import { ErrorNote, layout, Pager, SkeletonGrid } from '@/ui';

import {
  listProducts,
  type ListProductsParams,
  productKeys,
  type ProductSort,
} from '../api/index.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { SortSelect } from '../components/SortSelect.js';
import { activeFilters } from '../filters/active-filters.js';
import { FilteredResults, FilterToggle } from '../filters/FilteredResults.js';
import { FilterPanel } from '../filters/FilterPanel.js';
import { useFilterSheet } from '../filters/useFilterSheet.js';
import {
  countActiveFilters,
  emptyCatalogParams,
  patchCatalogParams,
} from '../lib/catalog-params.js';
import { useCatalogUrl } from '../lib/useCatalogUrl.js';
import { EmptyResults } from '../search/EmptyResults.js';
import { InterpretationChips } from '../search/InterpretationChips.js';
import { MIN_QUERY_LENGTH } from '../search/search-content.js';
import { SearchForm } from '../search/SearchForm.js';
import styles from './SearchPage.module.css';

const PAGE_SIZE = 20;
const FILTER_CHIP_KINDS = new Set(['category', 'color', 'size', 'audience', 'price']);
const FILTERS_ID = 'search-filters';

export function SearchPage() {
  const [params, setParams] = useCatalogUrl();
  const { sheetOpen, openSheet, closeSheet, attachToggle } = useFilterSheet();
  // May chu tu choi cau duoi 2 ky tu; nguoi dung chua go xong thi khong goi.
  const q = params.q.length >= MIN_QUERY_LENGTH ? params.q : undefined;

  const listParams = useMemo<ListProductsParams>(
    () => ({
      search: q,
      audience: params.audience ?? undefined,
      categories: params.categories.length ? params.categories : undefined,
      colors: params.colors.length ? params.colors : undefined,
      sizes: params.sizes.length ? params.sizes : undefined,
      minPrice: params.minPrice ?? undefined,
      maxPrice: params.maxPrice ?? undefined,
      sort: params.sort === 'relevance' && !q ? undefined : (params.sort ?? undefined),
      page: params.page,
      pageSize: PAGE_SIZE,
      facets: true,
    }),
    [q, params],
  );
  const products = useQuery({
    queryKey: productKeys.list(listParams),
    queryFn: () => listProducts(listParams),
    placeholderData: keepPreviousData,
  });

  const data = products.data;
  const interpretation = data?.interpretation;
  const filters = activeFilters(params, data?.facets);
  const activeCount =
    countActiveFilters(params) +
    (interpretation?.chips.filter((chip) => FILTER_CHIP_KINDS.has(chip.kind)).length ?? 0);
  const sort: ProductSort = params.sort ?? interpretation?.sort ?? (q ? 'relevance' : 'newest');
  const title = q ? `Kết quả cho “${q}”` : filters.length ? 'Sản phẩm đã lọc' : 'Tất cả sản phẩm';
  const terms = interpretation?.termGroups.flat();
  const clearAll = () => setParams(emptyCatalogParams);

  return (
    <div className={`${layout.container} ${styles.page}`}>
      <title>{pageTitle(q ? `Tìm “${q}”` : 'Tìm kiếm')}</title>
      <Breadcrumb items={[{ name: 'Trang chủ', to: '/' }, { name: 'Tìm kiếm' }]} />
      <SearchForm
        q={params.q}
        onSubmit={(next) => setParams(patchCatalogParams(params, { q: next }))}
      />
      {params.q.length === 1 && (
        <p className={styles.hint}>Nhập ít nhất 2 ký tự để tìm theo câu.</p>
      )}
      <div className={styles.head}>
        <h1>{title}</h1>
        <p className={styles.count} aria-live="polite">
          {data ? `${data.total} sản phẩm` : ''}
        </p>
      </div>
      <InterpretationChips
        interpretation={interpretation}
        filters={filters}
        params={params}
        colorHex={(family) => data?.facets?.colors.find((c) => c.family === family)?.hex}
        onChange={setParams}
        onClearAll={clearAll}
      />
      {data?.relaxed && data.relaxed.length > 0 && (
        <p className={styles.relaxed}>
          Không có sản phẩm nào khớp đủ mọi ý của câu. Cửa hàng đã {data.relaxed.join(', ')} và hiện
          các sản phẩm gần nhất.
        </p>
      )}
      <FilteredResults
        panel={
          <FilterPanel
            id={FILTERS_ID}
            facets={data?.facets}
            interpretation={interpretation}
            params={params}
            total={data?.total}
            sheetOpen={sheetOpen}
            onCloseSheet={closeSheet}
            onChange={setParams}
            onClear={clearAll}
          />
        }
        toggle={
          <FilterToggle
            ref={attachToggle}
            count={activeCount}
            expanded={sheetOpen}
            controls={FILTERS_ID}
            onClick={openSheet}
          />
        }
        sort={
          <SortSelect
            value={sort}
            withRelevance={Boolean(q)}
            onChange={(next) => setParams(patchCatalogParams(params, { sort: next }))}
          />
        }
      >
        {products.isPending && <SkeletonGrid count={8} />}
        {products.isError && !data && (
          <ErrorNote label="Không tải được kết quả." onRetry={() => void products.refetch()} />
        )}
        {data?.items.length === 0 && <EmptyResults />}
        {data && data.items.length > 0 && (
          <div className={products.isPlaceholderData ? styles.stale : undefined}>
            <ProductGrid products={data.items} showBrand terms={terms} />
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
          </div>
        )}
      </FilteredResults>
    </div>
  );
}
