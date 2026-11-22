import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Empty, ErrorNote, layout, Pager, SkeletonGrid } from '@/ui';

import { listProducts, productKeys } from '../api/index.js';
import { ProductGrid } from '../components/ProductGrid.js';

/**
 * Trang MAU: goi that vao module mau ben may chu.
 *
 * Khuon de hai ban chep theo. Ba trang thai deu phai co mat: dang tai, loi, khong co du lieu.
 */
export function ProductListPage() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);

  const params = { page, pageSize: 12, search: submitted || undefined };
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => listProducts(params),
    placeholderData: keepPreviousData,
  });

  const visibleData = isError ? undefined : data;

  return (
    <div className={`${layout.container} ${layout.section}`}>
      <h1>Sản phẩm</h1>

      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmitted(search.trim());
        }}
      >
        <input
          type="search"
          value={search}
          placeholder="Tìm theo tên sản phẩm"
          aria-label="Tìm theo tên sản phẩm"
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit">Tìm</button>
      </form>

      {isPending && <SkeletonGrid count={12} />}
      {isError && <ErrorNote error={error} onRetry={() => void refetch()} />}
      {visibleData && visibleData.items.length === 0 && (
        <Empty label="Không có sản phẩm nào khớp." />
      )}

      {visibleData && visibleData.items.length > 0 && (
        <>
          <ProductGrid products={visibleData.items} showBrand />

          <Pager
            page={visibleData.page}
            totalPages={visibleData.totalPages}
            total={visibleData.total}
            onChange={setPage}
            unit="sản phẩm"
          />
        </>
      )}
    </div>
  );
}
