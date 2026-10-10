import { useQuery } from '@tanstack/react-query';

import { pageTitle } from '@/core';
import { ErrorNote, layout, SkeletonGrid } from '@/ui';

import { listProducts, type ListProductsParams, productKeys } from '../api/index.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { AudienceDuo } from '../home/AudienceDuo.js';
import { CategoryBento } from '../home/CategoryBento.js';
import { CategoryMarquee } from '../home/CategoryMarquee.js';
import { HeroSearch } from '../home/HeroSearch.js';
import { HomeSectionHeader } from '../home/HomeSectionHeader.js';
import { MaterialStory } from '../home/MaterialStory.js';
import { OccasionTiles } from '../home/OccasionTiles.js';
import { ProductRail } from '../home/ProductRail.js';

const FEATURED: ListProductsParams = { featured: true, pageSize: 8 };
const DESCRIPTION =
  'F.R.E.Y.A. — Kiêu hãnh qua sự hiện diện. Khám phá thời trang nam và nữ, tìm trang phục phù hợp với gu và dịp mặc của bạn.';

/** Khoi "Noi bat": an ca khoi khi chua co san pham nao duoc chon. */
function FeaturedGrid() {
  const query = useQuery({
    queryKey: productKeys.list(FEATURED),
    queryFn: () => listProducts(FEATURED),
  });
  if (query.data && query.data.items.length === 0) return null;
  return (
    <section className={`${layout.container} ${layout.section}`} aria-labelledby="home-feat-title">
      <HomeSectionHeader eyebrow="Được chọn" title="Nổi bật" titleId="home-feat-title" />
      {query.isPending && <SkeletonGrid count={4} />}
      {query.isError && (
        <ErrorNote label="Không tải được mục nổi bật." onRetry={() => void query.refetch()} />
      )}
      {query.data && query.data.items.length > 0 && <ProductGrid products={query.data.items} />}
    </section>
  );
}

export function HomePage() {
  return (
    <>
      <title>{pageTitle()}</title>
      <meta name="description" content={DESCRIPTION} />
      <HeroSearch />
      <CategoryMarquee />
      <CategoryBento />
      <ProductRail />
      <OccasionTiles />
      <AudienceDuo />
      <MaterialStory />
      <FeaturedGrid />
    </>
  );
}
