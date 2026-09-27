import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '@/core';
import { Empty, ErrorNote, Pager, SkeletonGrid } from '@/ui';

import {
  categoryKeys,
  getCategory,
  listProducts,
  productKeys,
  type ProductSort,
} from '../api/index.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import styles from '../components/Catalog.module.css';
import { CategoryChips } from '../components/CategoryChips.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { SortSelect } from '../components/SortSelect.js';

const sorts: ProductSort[] = ['newest', 'price_asc', 'price_desc'];
export function CategoryPage() {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSort = searchParams.get('sort');
  const sort: ProductSort = sorts.includes(rawSort as ProductSort)
    ? (rawSort as ProductSort)
    : 'newest';
  const rawPage = Number(searchParams.get('page') ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

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
  const params = { categorySlug: slug, sort, page, pageSize: 20 };
  const products = useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => listProducts(params),
    enabled: Boolean(slug),
  });

  if (category.isPending)
    return (
      <div className={styles.container}>
        <SkeletonGrid count={8} />
      </div>
    );
  if (category.isError) {
    const missing = category.error instanceof ApiError && category.error.body.statusCode === 404;
    return (
      <div className={styles.container}>
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
  return (
    <div className={styles.container}>
      <Breadcrumb items={breadcrumb} />
      <h1>{category.data.name.toUpperCase()}</h1>
      {products.data && <p>{products.data.total} sản phẩm</p>}
      {rootCategory && <CategoryChips root={rootCategory} activeSlug={slug} />}
      <div className={styles.sectionHeader}>
        <h2>Sản phẩm trong {category.data.name}</h2>
        <SortSelect value={sort} onChange={(next) => setSearchParams({ sort: next, page: '1' })} />
      </div>
      {products.isPending && <SkeletonGrid count={8} />}
      {products.isError && (
        <ErrorNote
          label={`Không tải được danh mục ${category.data.name}.`}
          onRetry={() => void products.refetch()}
        />
      )}
      {products.data?.items.length === 0 && <Empty label="Chưa có sản phẩm trong danh mục." />}
      {products.data && products.data.items.length > 0 && (
        <>
          <ProductGrid products={products.data.items} showBrand />
          <Pager
            variant="numbered"
            page={products.data.page}
            totalPages={products.data.totalPages}
            total={products.data.total}
            unit="sản phẩm"
            onChange={(next) => {
              setSearchParams({ sort, page: String(next) });
              window.scrollTo({ top: 0 });
            }}
          />
        </>
      )}
    </div>
  );
}
