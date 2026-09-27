import { useQuery } from '@tanstack/react-query';

import { Empty, ErrorNote, SkeletonGrid } from '@/ui';

import { listProducts, type ListProductsParams, productKeys } from '../api/index.js';
import { CampaignBand } from '../components/CampaignBand.js';
import styles from '../components/Catalog.module.css';
import { CategoryTiles } from '../components/CategoryTiles.js';
import { HeroSection } from '../components/HeroSection.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { SectionHeader } from '../components/SectionHeader.js';

function HomeRow({ title, params }: { title: string; params: ListProductsParams }) {
  const query = useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => listProducts(params),
  });
  return (
    <section className={`${styles.container} ${styles.section}`}>
      <SectionHeader title={title} to="/san-pham" />
      {query.isPending && <SkeletonGrid count={4} />}
      {query.isError && (
        <ErrorNote label="Không tải được trang chủ." onRetry={() => void query.refetch()} />
      )}
      {query.data?.items.length === 0 && <Empty label="Chưa có sản phẩm để khám phá." />}
      {query.data && query.data.items.length > 0 && <ProductGrid products={query.data.items} />}
    </section>
  );
}

export function HomePage() {
  return (
    <>
      <HeroSection />
      <HomeRow title="HÀNG MỚI VỀ" params={{ sort: 'newest', pageSize: 4 }} />
      <div className={styles.container}>
        <CategoryTiles />
      </div>
      <HomeRow title="NỔI BẬT" params={{ featured: true, pageSize: 4 }} />
      <CampaignBand />
    </>
  );
}
